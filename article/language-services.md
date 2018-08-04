[上一篇文章](https://github.com/Aaaaash/blog/issues/11)简单介绍了 LSP 协议和如何利用 LSP 为 Monaco 编辑器提供语言特性功能，以及如何向 Web 端的在线编辑器适配 LSP 服务。本文将继续深入这一话题，了解面向在线编辑器环境下，利用 LSP 实现这些功能有哪些需要注意的点以及填坑指南。由于笔者水平有限，如有疏漏之处还请指出。

## 从搭建一个简单的 WebSocket 服务器开始

上篇说到，要实现这样一个服务，需要有一层 WebSocket 与客户端相连接做中转层，由于 LSP 服务不涉及其他功能，所以这个服务器只需要有一个简单的 HTTP 服务，能够与客户端连接相互通信即可。

我们使用 [socket.io](https://github.com/socketio/socket.io) 来搭建 WebSocket 服务，代码非常简单

```typescript
import * as http from "http";
import * as io from "socket.io";

const server = http.createServer();

const socket = io(server);

server.listen(PORT, () => {
  logger.info("Language Server start in 9988 port!");
});
```

在客户端同样使用 [socket.io-client](https://github.com/socketio/socket.io-client) 模块来连接这个服务器

```javascript
import io from 'socket.io-client';

const socketOptions = {
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 10000,
  path: '',
  transports: ['websocket'],
};

const ws = io.connect('localhost', socketOptions);
```

需要注意的一点是，我们使用的 `vscode-ws-jsonrpc` 是扩展了原本的`vscode-jsonrpc`，为其添加了 websocket 功能的支持。但它只接受原生 WebSocket 对象作为 listen 方法的参数，两者实现的接口略有不同，我们需要对 socket.io 进行一层包装

```javascript
import { listen } from 'vscode-ws-jsonrpc';
import { createMonacoServices } from 'monaco-languageclient';
const socket = createWebSocket();

//  send 方法包装为 socket.emit
const ioToWebSocket = {
  send: (message) => {
    socket.emit('message', { message })
  },
  onerror: err => socket.on('error', err),
  onclose: socket.onclose,
  close: socket.close,
};

/**
* 原生 websocket 在连接成功后会触发一个 onopen 方法
* 用于连接成功后的回调函数
* 所以在这里我们手动调用 onopen
*/
socket.on('connect', () => {
  ioToWebSocket.onopen()
});

socket.on('message', ({ data }) => {
  ioToWebSocket.onmessage({ data })
});

// 然后将这个 ioToWebSocket 对象传递给 listen 方法作为参数

const services = createMonacoServices(null, { rootUri: `file://xxx` });

listen({
  webSocket: this.ioToWebSocket,
  onConnection: (connection) => {
    // connection 连接成功后返回的一个连接对象，languageServer-client 借助这个 connection 来收发消息
    const client = new BaseLanguageClient({
      name: 'lsp',
      clientOptions: {
        commands: undefined,
        // 表示相应语言的选择器
        documentSelector: ['python'],
        synchronize: {
          configurationSection: 'pyls',
        },
        // 连接成功后的初始化参数，每个语言的 lsp 实现略有不同，可在相应项目的 package.json 中找到。
        // vscode文档中也有介绍 https://code.visualstudio.com/docs/extensions/example-language-server
        initializationOptions: {
          ...initializationOption,
          // 提供 lsp 服务的项目 uri，绝对地址
          workspaceFolders: [`file:///xxx`]
        },
        // 默认错误处理函数
        initializationFailedHandler: (err) => {
          const detail = err instanceof Error ? err.message : ''
        },
        diagnosticCollectionName: language,
      },
      // 服务对象，与客户端的区别在于，这个 services 主要用于绑定一些编辑器的操作命令及消息的转换
      // 而客户端里，这个 services 被叫做 serverOptions ，用于在本地启动 LSP 服务，会根据不同类型的参数以指定的模式启动 LSP
      services,
      connectionProvider: {
        get: (errorHandler, closeHandler) =>
          Promise.resolve(createConnection(connection, errorHandler, closeHandler)),
      },
    });
  }
});
```
其中`createMonacoServices`函数所接受的`rootUri`以及`BaseLanguageClient`的`workSpaceFolders`均为一个标准的 [URI](https://tools.ietf.org/html/rfc3986)，表示需要提供 LSP 服务的项目绝对路径，也可以传输一个相对路径然后在 Server 端做转换处理。
```
foo://example.com:8042/over/there?name=ferret#nose
  \_/   \______________/\_________/ \_________/ \__/
   |           |            |            |        |
scheme     authority       path        query   fragment
   |   _____________________|__
  / \ /                        \
  urn:example:animal:ferret:nose
```

到这一步，客户端已经可以成功的通过 WebSocket 连接到服务器，不出意外的话，客户端会发出第一条 `initialize` 请求。此时我们的服务还没有对请求做处理，所以客户端也不会收到任何回复。

## 在服务器上启动 LSP 服务

前文说到，传统客户端的实现中，`new LanguageClient` 在实例化时需要传入一个 `serverOptions` 的参数用于启动本地的 LSP 程序，以 [vscode-java](https://github.com/redhat-developer/vscode-java) 为例，这个 repo 是一个 vscode 的插件，用于在 vscode 中为 Java 语言提供 LSP 相关功能。

![vscode-java](https://raw.githubusercontent.com/redhat-developer/vscode-java/master/images/vscode-java.0.0.1.gif)

查看其[源码](https://github.com/redhat-developer/vscode-java/blob/69d1b0a78441edc8117c23b9d5d962ed65c19678/src/extension.ts#L79)可以得出，当找到环境变量 `SERVER_PORT` 时，会开启一个 TCP 服务器，等待 vscode-java 底层的 [jdt.ls](https://github.com/eclipse/eclipse.jdt.ls) 作为客户端通过这个端口来建立连接。反之则将 jdt.ls 的启动参数及 JAVA_HOME 作为 serverOptions ，然后由客户端自行启动。

在我们的服务端同样可以用这两种方式来启动 LSP 程序，我们创建一个名为`JavaLanguageServer`的类来管理这个 LSP 连接。这个类需要监听 WebSocket 的消息，在初始化时启动 jdt.ls ，以及在客户端断开连接时杀死进程以确保资源及时回收。还有一点是建议在客户端连接 WebSocket 时携带两个参数`language`和`workspace`，方便服务端区分不同的语言和相应的项目目录，同时类似 jdt.ls 这种服务，在运行时会产生一些元数据，可以通过 workspace 名来指定元数据存放在哪个目录，否则这些数据会直接被保存在当前服务运行的目录下，启动多个项目时会产生错误消息。

```typescript
// 使用 stdio 模式启动 LSP
import * as cp from 'child_process';
import * as io from 'socket.io';

class JavaLanguageServer {
  constructor(
    private socket: io.Socket,
  ) {}
  start() {
    const javahome = 'xxx/bin/java';
    const params = this.prepareParams();

    this.process = cp.spawn(javahome, params);
  }

  // 准备 jdt.ls 启动参数
  prepareParams() {
    const params: string[] = [
      '-Xmx256m',
      '-Xms256m',
      '-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=,quiet=y',
      '-Declipse.application=org.eclipse.jdt.ls.core.id1',
      '-Dosgi.bundles.defaultStartLevel=4',
      '-noverify',
      '-Declipse.product=org.eclipse.jdt.ls.core.product',
      '-jar',
      // serverUri 表示 jdt.ls 构建后的目录
      // 启动服务所需的 jar 包
      `${serverUri}/${launchersFound[0]}`,
      '-configuration',
      // 不同平台的配置文件，可以使用 process.platform 来获取系统信息，指定不同的配置
      `${serverUri}/${JAVA_CONFIG_DIR}`,
      `-data`,
      // 客户端传入的 workspace 参数，用于存放元数据
      workspace,
    ];

    return params;
  }
}

```

服务端 WebSocket 收到客户端的 'connection' 事件后，实例化这个 JavaLanguageServer，将 WebSocket 对象作为参数，之后调用 start 方法就会启动一个 jdt.ls 的子进程。

## 消息处理

在实例对象内部，我们需要监听 WebSocket 的消息，并通过 `childProcess.stdin.write` 传送给 jdt.ls 进程，然后监听 `childProcess.stdout`的 `ondata` 事件接收返回的消息。

但是这里有一个坑，我们知道 TCP 协议传输的是字节流，直接连接 TCP 服务进行通信，在数据量较大时会产生所谓的`粘包`问题，也就是多个消息包粘在一起。如果不经过处理直接把消息发送给客户端的话，编辑器无法识别并处理这些消息。

实际上 TCP 协议中并没有`包`这个概念，所有数据都是以流的形式来传输，而 TCP 协议为了保证可靠传输，减少每次发送数据都要验证的额外开销，使用流的形势传输，并且使用了优化算法(Nagle算法)，会将多次间隔较小/量小的数据合并成一个大的数据块，这样一来减少了发送包的数量，提高了传输效率。而接受方也会引起这个问题，由于接收数据不及时，导致下一段数据被放在系统缓冲区，等待接收进程取出消息，若下一段数据还未被取出就收到了新的消息，那么这两段消息会被`粘`在一起，从而产生粘包现象。在这里我们使用标准输入输出的方式也会有同样的情况，也正是因为 Stdio 基于字节流，数据量较大时没有及时处理数据，缓冲区数据滞留从而引发粘包问题。

并且从理论上来讲，TCP 协议只是传输层协议，也并不存在`粘包`这个概念。我们需要再建立一层应用层协议来自行处理这些问题，这也就是网络编程中常见的所谓`分包`等问题的来源。

传统的`粘包`处理方式有几种，

* 发送方引起粘包现象，用户可以通过编程来避归，TCP提供了强制数据立即传送的指令`push`，接收到该指令后，会将消息立即发送出去，不必等待缓冲区满。
* 接收方引起的粘包，可通过优化程序设计、提高接受优先级等方法，使其及时接受数据。
* 定义应用层协议，发送方将消息尺寸与消息一起发送，接收方负责按照指定长度来接收数据。

对于我们的 LSP 程序来说，第一种方式需要修改 LSP 源码，显然行不通。第二种方式只能减少粘包出现的频率，并不能完全解决问题。第三种方式则最完美，因为 LSP 协议本身就包含了 `Content-Length`，所以我们可以根据这个消息长度来获取消息内容。

服务端我们使用`vscode-jsonrpc`这个包已经解决了这一问题，[查看MessageReader源码](https://github.com/Microsoft/vscode-languageserver-node/blob/5f9c993ff38f5c369949aeb359b3e9b178172dbc/jsonrpc/src/messageReader.ts#L210)可以得知在接收到消息后，将消息写入一个 Buffer 中，然后在这个 Buffer 里寻找消息的 Header，也就是 `Content-Length` 字段。读取到消息长度后，继续在接受到的消息包里截取这个长度的内容，将其组合起来再发送给 callback 函数。

```typescript
private onData(data: Buffer | String): void {
  // 写入 buffer
  this.buffer.append(data);
  while (true) {
    if (this.nextMessageLength === -1) {
      // 读取消息头
      let headers = this.buffer.tryReadHeaders();
      if (!headers) {
        return;
      }
      let contentLength = headers['Content-Length'];
      if (!contentLength) {
        throw new Error('Header must provide a Content-Length property.');
      }
      let length = parseInt(contentLength);
      if (isNaN(length)) {
        throw new Error('Content-Length value must be a number.');
      }
      // 将取到的消息长度赋值给 nextMessageLength
      this.nextMessageLength = length;
      // Take the encoding form the header. For compatibility
      // treat both utf-8 and utf8 as node utf8
    }
    // 根据 nextMessageLength 长度读取消息内容
    var msg = this.buffer.tryReadContent(this.nextMessageLength);
    if (msg === null) {
      /** We haven't recevied the full message yet. */
      this.setPartialMessageTimer();
      return;
    }
    this.clearPartialMessageTimer();
    this.nextMessageLength = -1;
    this.messageToken++;
    var json = JSON.parse(msg);
    this.callback(json);
  }
}
```

这里`tryReadHeader`和`tryReadContent`函数的实现方法不再赘述，有兴趣的可以阅读源码。

`vscode-jsonrpc`包中不但解决了粘包问题，还以不同的连接方式抽象出了几个 Reader 类以供我们使用。

* StreamMessageReader  流的形式，接收 `NodeJS.ReadableStream` 对象为参数
* IPCMessageReader IPC 模式，接收 `Process | ChildProcess` 对象为参数
* SocketMessageReader Socket 模式，接收 `net.Socket` 对象为参数

在这里我们使用`StreamMessageReader`，传入 childProcess.stdout 来读取子进程的可读流消息。

```typescript
// JavaLanguageServer.ts
const messageReader = new StreamMessageReader(this.process.stdout);
this.socket.on('message', (data) => {
  this.process.stdin.write(data.message);
});

messageReader.listen((data) => {
  const jsonrpcData = JSON.stringify(data);
  const length = Buffer.byteLength(jsonrpcData, 'utf-8');
  const headers: string[] = [
    contentLength,
    length.toString(),
    CRLF,
    CRLF,
  ];
  this.socket.send({ data: `${headers.join('')}${jsonrpcData}` });
});
```

这段代码中我们创建了一个 StreamMessageReader 实例，调用 `listen` 方法传入回调函数。在收到完整的消息包后将消息序列化并调用 `Buffer.byteLength` 方法获取序列化后消息的字节数。这里需要非常注意的是，虽然 JSON.stringify 将对象序列化成了字符串，但是不能直接用 `jsonrpcData.length` 作为 Content-Length 消息长度，因为 [LSP 协议规定](https://microsoft.github.io/language-server-protocol/specification)合法的 Content-Length 值应当为内容部分的字节长度，而不是内容部分的字符串数，这两者有[些许差别](http://www.wquanzhan.com/documentation/nodejs/buffer/byte-length)。

> 在纯ASCII码下，字节数=字符串长度=字符个数，因为每个字符就一个字节。
在Unicode下，字节数/2=字符串长度=字符个数，因为每个字符都是2个字节。
在ASCII码与其它双字节字符系统混用时，字节数=ASCII码字符个数+双字节字符个数*2，而此时字符串长度到底怎么统计就不好说了，有的语言如C语言，此时字符串长度=字节数，有的语言如JS，此时字符产长度=字符个数。

使用 `string.length` 把字符数当做字节长度会导致客户端接收消息时产生读取消息出错的问题。

到这里我们的客户端与服务端成功的建立了连接，并在 LSP 的作用下在线编辑器有了基本的代码提示、诊断等功能。

在客户端断开连接后要调用 `process.kill` 方法及时杀死进程，某些情况下可能存在进程没有杀死的情况，建议使用[node-tree-kill](https://github.com/pkrumins/node-tree-kill)来确保进程退出。

## 存在的问题

可以看出向 Web 端在线编辑器提供 LSP 服务是完全可行的，但每次打开一个项目或目录就在服务器启动一个 LSP 实例进程，且单个进程内存占用较大，例如 jdt.ls 启动后平均内存占用在 400m 左右，用户量较多时资源消耗太大，这对相对紧张的服务资源来说是一个非常奢侈的。LSP 协议也不支持多个用户共享同一进程，所以在功能实现和资源占用之间需要权衡一下。但其他语言如 `TypeScirpt`内存消耗只有100m左右，这对服务端来说是完全可以承受的（TypeScript大法好）。

## 容器化的可能性

在这个服务中，我们使用 NodeJs 的 `childProcess` 来启动 LSP 程序，如果单纯的把服务运行在 Docker 中显然不能接受，因为这样的话我们的 Docker 镜像需要包含 NodeJs、Java、Python 等许多语言的运行环境，这将导致生成的镜像非常大，也违背了容器单服务单进程的约定。所以最好的办法是将每个 LSP 程序拆成一个容器，通用服务也作为一个容器运行，使用 docker-compose 来管理多个容器。

## 最后

本文代码托管在 [GitHub](https://github.com/Aaaaash/LanguageServices-WebIDE)，CloudStudio 已经实现 Java、Python 的 LSP 服务，有兴趣可以[戳这里体验](https://studio.coding.net/)。

容器化完成后再来续下一篇...

### 参考链接

* [vscode-language-node](https://github.com/TypeFox/vscode-languageserver-node)

* [typefox.io](https://typefox.io/?s=language-server)

