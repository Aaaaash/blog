> 本系列文章为Monaco-Editor编辑器折腾、踩坑记录，涉及到协同编辑、代码提示、智能感知等功能的实现，不定期更新

## LanguageServerProtocol
[LanguageServerProtocol](https://microsoft.github.io/language-server-protocol/)(以下简称LSP)是由微软提出，并与 Redhat、Codenvy、Sourcegraph 等公司联合推出的开源协议。用于语言服务程序向编辑器、IDE 等工具提供一系列代码提示、定义跳转等功能的通用协议。它将高级语言相关的一些功能特性从传统 IDE 中抽象出一个单独的程序来运行，LSP 定义了一套通用的API，遵循LSP协议实现某个语言的特性功能后，编辑器只需要调用该语言的 LanguageServer ，即可实现代码提示、定义跳转、代码诊断等功能。

传统的IDE或编辑器要实现诸如智能提示、自动补全等功能，需要根据不同的IDE来开发相应语言的特性功能程序，多个 IDE 要想支持多种高级语言，且每个 IDE 的具体实现及 API 可能都大不相同，开发成本非常高。LSP的出现则很好的解决了这个问题，N 个 IDE 和 M 个语言，只需要开发一次相应语言的语言服务器程序即可在每个IDE中使用。

[LanguageServerProtocol起源](https://github.com/Microsoft/language-server-protocol/wiki/Protocol-History)

## 概览
LSP使用[JSON-RPC](http://www.jsonrpc.org/)协议作为 Server/Client 通信的消息格式，且支持 TCP、Stdin/Stdout 进行消息传输，所以它即可以运行在本地客户端，也可以运行在远程服务器上。
截至目前 LSP 版本为3.8，实现了数十个方法(具体没数😆)，部分主流 IDE/编辑器也已经支持了 LSP ，包括 Eclipse、VScode、Sublime Text & Sublime Text 3、Atom 等。

LSP协议基本消息格式由 `header` 与 `content` 组成，中间使用`\r\n`作为分隔符。
```
Content-length: ... \r\n
\r\n
{
	"jsonrpc": "2.0",
	"id": 1,
	"method": "textDocument/didOpen",
	"params": {
		...
	}
}
```
LSP消息大体来说分为三种类型

- 通知 (Notifiction)
- 请求 (Request)
- 日志及错误信 (LogMessage/ShowMessage)

通信是双向的，Client 可以向 Server 发送请求/通知，比如打开文件、修改文档内容等。 Server 也可以向 Client 发送请求/通知，比如动态注册客户端功能。每个请求需要使用 `id` 为唯一标识符，对这个请求的返回值也应当包含这个 id，一般来说 id 为递增的数字。
LSP的工作流程如下：

- Client 发送 `initialize` 请求，包含一些初始化参数。Server 收到请求后开始准备启动语言服务，之后 Server 会发送 `initialized` 通知到客户端，语言服务开始工作。

- 初始化成功后 Server 可能会向 Client 发送一些动态注册功能的请求 `client/registerCapability`。

- 每次打开一个文件， Client 需要向 Server 发送一个 `textDocument/didOpen` 请求，携带文件 [URI](https://tools.ietf.org/html/rfc3986) 参数。同理关闭文件后要发送一个 `textDocument/didClose` 请求。

- 编辑文档时，当输入`.`或按下语法提示快捷键时， Client 发送 `textDocument/completion` 请求来获取智能提示列表。

- 当用户查询某个类/变量/方法的声明时（点击跳转），Client 发送 `textDocument/definition` ，Server 将返回对应的文件 URI 及位置信息。Client 需要实现打开这个新文件的方法。

- 当用户关闭编辑器时，Client 先发送 `shutdown` 请求，Server 收到请求后会立即关闭但并不会退出进程，而是等待 Client 发送 `exit` 通知。

## 如何使 LSP 为 monaco 编辑器提供服务

虽然 monaco 编辑器脱胎于 VScode ，但其只是一个编辑器实现，没有文件树，多标签页支持。同时 VScode 是基于 Electron 的桌面端应用，自带 Nodejs 环境，可以利用 TCP 或 Stdin/Stdout 来开启语言服务，虽然 VScode 团队开源了一些 LSP 相关的库，但由于运行环境的巨大差异，在 Web 端并不能直接应用。

### LanguageClient

要在 VScode 中体验 LSP， 需要先下载安装 [vscode-java](https://github.com/redhat-developer/vscode-java) 插件。这个插件由 redhat-developer 团队开源，使用 TypeScript 及 JavaScript 编写，主要作用是下载和构建 [eclipse.jdt.ls](https://github.com/eclipse/eclipse.jdt.ls) 程序, 以及创建 LanguageClient 使 VScode 能够启动 LSP。 eclipse.jdt.ls 就是 eclipse 开发的 Java 语言服务器 LSP 实现。

LanguageClient 类由 VScode 团队开源的 [vscode-languageclient](https://www.npmjs.com/package/vscode-languageclient) 库提供，它的主要作用是根据传入的配置连接到指定语言的 LSP，并对 LSP 支持的各种方法做一层封装，还包含了本地运行 LSP 程序时对 TCP 消息进行粘包处理的功能。

```typescript
import { LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-language-client';

const clientOptions: LanguageClientOptions = {
  documentSelector: [
    { scheme: 'file', language: 'java' },
    { scheme: 'jdt', language: 'java' },
    { scheme: 'untitled', language: 'java' }
  ],
  synchronize: {
    configurationSection: 'java',
    fileEvents: [
      workspace.createFileSystemWatcher('**/*.java'),
      workspace.createFileSystemWatcher('**/pom.xml'),
      workspace.createFileSystemWatcher('**/*.gradle'),
      workspace.createFileSystemWatcher('**/.project'),
      workspace.createFileSystemWatcher('**/.classpath'),
      workspace.createFileSystemWatcher('**/settings/*.prefs'),
      workspace.createFileSystemWatcher('**/src/**')
    ],
  },
};

const serverOptions: ServerOptions = {
  command: 'java',
  args: [
    // jdt.ls 启动参数
  ],
  options: {
    // 相关配置
  }
}
const client = new LanguageClient({
  'java',
  'Language Support for Java',
  serverOptions,
  clientOptions,
});

client.start();
```

> 这个库源代码实际包含在 [vscode-languageserver-node](https://github.com/Microsoft/vscode-languageserver-node) 中，猜测可能是 VScode 团队实现 Nodejs 的 LSP 客户端/服务端后觉得它可以作为一个通用的客户端实现，所以单独发布到了 npm 上。

### 通信方式

之前说过，LSP 支持 TCP 和 Stdin/out 来和客户端通信。

- 如果是以 TCP 的方式， jdt.ls 启动时需要指定一个 `CLIENT_PORT` 参数表明 TCP 服务的端口，需要注意的是以 TCP 模式启动 jdt.js，LSP 是作为 TCP 客户端，所以需要再开启一个 TCP 服务器，之后 jdt.ls 才会连接到指定端口的服务上进行通信。

- 如果是以 Stdin/Stdout 启动，则只需要使用 Nodejs 的 Childprocess 开启一个子进程，然后利用标准输入输出与 Client 通信。

## Web 端如何实现

浏览器是一个封闭的环境，它只能操作 DOM ，所以要想在浏览器中为 monaco 编辑器提供 LSP 服务，必须要把 LSP 运行在服务器上。

由于 LSP 和 monaco 本身就是同一个团队开发的，所以 jdt.ls 的实现也可以完美兼容 monaco。我们使用 webSocket 与服务端通信，由于浏览器端的限制，我们无法直接使用 vscode-languageclient ，幸好 typefox 团队基于 vscode-languageclient 开发了使用于浏览器端的适配器 [monaco-languageclient](https://github.com/TypeFox/monaco-languageclient)。借助这个库，我们可以使用 webSocket 轻松的连接远端 LSP 服务。

```typescript
import { createMonacoServices } from 'monaco-languageclient';
import { listen, MessageConnection } from 'vscode-ws-jsonrpc';
import * as monaco from 'monaco-editor';

const editor = monaco.editor.create(root, {
  model: monaco.editor.createModel(value, 'java', monaco.Uri.parse(`file://javademo/Hello.java`)),
  theme: 'vs-dark',
});

const url = 'ws://127.0.0.1/java-lsp';
// 创建 services，向编辑器注册一系列命令
const services = createMonacoServices(editor, { rootUri: `file://javademo` });
const webSocket = new WebSocket(url);

// 监听 webSocket 连接，连接成功后创建客户端并启动
listen({
  webSocket,
  onConnection: (connection: MessageConnection) => {
    const languageClient = createLanguageClient(connection);
    const disposable = languageClient.start();
    connection.onClose(() => disposable.dispose());
  }
});

function createLanguageClient(connection: MessageConnection): BaseLanguageClient {
  return new BaseLanguageClient({
    name: "Java LSP client",
    clientOptions: {
      documentSelector: ['java'],
      errorHandler: {
        error: () => ErrorAction.Continue,
        closed: () => CloseAction.DoNotRestart
      }
    },
    services,
    connectionProvider: {
      get: (errorHandler, closeHandler) => {
        return Promise.resolve(createConnection(connection, errorHandler, closeHandler))
      }
    }
  })
}

```

这里我们还使用了一个库 `vscode-ws-jsonrpc`，这也是 typefox 团队根据原 VScode 的 `vscode-jsonrpc` 修改而来。原本的 `vscode-jsonrpc` 并不支持 WebSocket，所以对它进行了扩展以支持浏览器端。

在服务端我们需要用 Nodejs 的 Childprocess 启动 jdt.ls，同时还要再开启一个 webSocket 服务器。监听 websocket 的 onmessage 事件，将 data 通过 stdin 发送给 LSP, 再监听 stdout 的 ondata 事件，将返回结果通过 webSocket 发送到浏览器端。

```typescript
import * as cp from 'child-process';
import * as express from 'express';
import * as glob from 'glob';
import WebSocket from 'ws';

const CONFIG_DIR = process.platform === 'darwin' ? 'config_mac' : process.platform === 'linux' ? 'config_linux' : 'config_win';
const BASE_URI = '/data/eclipse.jdt.ls/server';
type IJavaExecutable = {
  options: any;
  command: string;
  args: Array<string>;
}

const PORT = 9988;
const SERVER_HOME = 'lsp-java-server';
const launchersFound: Array<string> = glob.sync('**/plugins/org.eclipse.equinox.launcher_*.jar', { cwd: `./${SERVER_HOME}` });

if (launchersFound.length === 0 || !launchersFound) {
  throw new Error('**/plugins/org.eclipse.equinox.launcher_*.jar Not Found!');
}

const params: Array<string> = [
  '-Xmx256m',
  '-Xms256m',
  '-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=,quiet=y',
  '-Declipse.application=org.eclipse.jdt.ls.core.id1',
  '-Dosgi.bundles.defaultStartLevel=4',
  '-noverify',
  '-Declipse.product=org.eclipse.jdt.ls.core.product',
  '-jar',
  `${BASE_URI}/${launchersFound[0]}`,
  '-configuration',
  `${BASE_URI}/${CONFIG_DIR}`
];

export function prepareExecutable(): IJavaExecutable {
  let executable = Object.create(null);
  let options = Object.create(null);
  options.env = process.env;
  options.stdio = 'pipe';
  executable.options = options;
  executable.command = 'java';
  executable.args = params;
  return executable;
}


const executable = prepareExecutable();
const app = express();
const server = app.listen(3000);

const ws = new WebSocket.Server({
  noServer: true,
  perMessageDeflate: false
});

server.on('upgrade', (request: http.IncomingMessage, socket: net.Socket, head: Buffer) => {
    const pathname = request.url ? url.parse(request.url).pathname : undefined;
    if (pathname === '/java-lsp') {
        wss.handleUpgrade(request, socket, head, webSocket => {
            const socket: rpc.IWebSocket = {
                send: content => webSocket.send(content, error => {
                    if (error) {
                        throw error;
                    }
                }),
                onMessage: cb => webSocket.on('message', cb),
                onError: cb => webSocket.on('error', cb),
                onClose: cb => webSocket.on('close', cb),
                dispose: () => webSocket.close()
            };
            if (webSocket.readyState === webSocket.OPEN) {
                launch(socket);
            } else {
                webSocket.on('open', () => launch(socket));
            }
        });
    }
});

function launch(socket) {
  const process = cp.spawn(executable.command, executable.args);
  
  sockt.onMessage((data) => {
    process.stdin.write(data)
  });

  process.stdout.on('data', (respose) => {
    socket.send(respose)
  });
}
```

webSocket 服务器实际作为一个中转层，将浏览器与 LSP 连接起来，这样就实现了最基本的语言服务连接。
除此之外，jdt.ls 还支持 maven 项目的原生支持以及 gradle 项目的有限支持（不支持 Android ）项目，客户端还需要实现文件监控功能，当 `pom.xml`、`budile.gradle` 等构建工具相关配置文件发生改变时语言服务会自动下载依赖修改项目配置。

## 总结

本文介绍了 LanguageServerProtocol 的基本概念及编辑器与 LSP 的简单交互流程，了解了 VScode 如何利用 LSP 实现代码提示、智能感知、自动完成等功能，最后在 Web 端实现了编辑器与 LSP 服务的简单连接。LSP 打破了传统 IDE 重复实现多次语言特性功能的尴尬局面，并在 VScode 上做了非常好的实践，文中使用的 `eclipse.jdt.ls` 语言服务器已经在 [Cloud Studio 2.0](https://studio.coding.net/ws/default) 版本正式上线，感兴趣的读者可以点击创建一个 Java 项目试用。

## 参考资料

- [language-server-protocol](https://microsoft.github.io/language-server-protocol/)
- [teaching-the-language-server-protocol-to-microsofts-monaco-editor](https://typefox.io/teaching-the-language-server-protocol-to-microsofts-monaco-editor)
- [eclipse.jdt.ls](https://github.com/eclipse/eclipse.jdt.ls)
