[Visual Studio Code](https://github.com/Microsoft/vscode) 是微软开源的一款轻量级代码编辑器，支持数十种主流语言的语法高亮、智能补全提示及 Git、Docker 集成等特性。因其自身使用 TypeScript 语言及 Electron 平台开发，对 ES/JavaScript/NodeJS 支持度较高，已经逐渐成为前端领域的主流开发工具。

前几篇文章介绍了 LSP 协议及在 Web 端在线编辑器中的集成，可以看到基于 LSP 协议，我们只需要找到对应语言的实现，就可以以非常低的成本在多个编辑器中使用语言服务器，甚至是在 Web 端。

## VSCODE 调试器协议

同样在 VSCODE 中还存在一个 [vscode-debug-protocol](https://github.com/Microsoft/vscode-debugadapter-node/blob/768e505c7d362f733a29c89fa973c6285ce8fb27/protocol/README.md)，这是一个通用的调试协议，允许在 VSCODE 的通用调试器 UI 下集成特定语言的调试器。

![vscode nodejs debugger](https://code.visualstudio.com/assets/docs/nodejs/nodejs-debugging/auto-attach.gif)

和 LSP 一样，vscode-debug-protocol 使用 JSONRPC 来描述请求、响应及事件，协议的具体规范可以在 [debugProtocol.ts](https://github.com/Microsoft/vscode-debugadapter-node/blob/768e505c7d362f733a29c89fa973c6285ce8fb27/protocol/src/debugProtocol.ts) 中找到。

## 调试器协议详解

任然以 Java 语言为例，在 VSCODE 中搜索并安装扩展 `Debugger for Java`, 重载编辑器后即可使用 Java 调试器。

这里再简单介绍一下 Java 调试器的实现原理。

### Java-Debug-Interface

JPDA 定义了一个完整独立的体系，它由三个相对独立的层次共同组成，而且规定了它们三者之间的交互方式，或者说定义了它们通信的接口。这三个层次由低到高分别是 Java 虚拟机工具接口（JVMTI），Java 调试线协议（JDWP）以及 Java 调试接口（JDI）。这三个模块把调试过程分解成几个很自然的概念：调试者（debugger）和被调试者（debuggee），以及他们中间的通信器。被调试者运行于我们想调试的 Java 虚拟机之上，它可以通过 JVMTI 这个标准接口，监控当前虚拟机的信息；调试者定义了用户可使用的调试接口，通过这些接口，用户可以对被调试虚拟机发送调试命令，同时调试者接受并显示调试结果。在调试者和被调试着之间，调试命令和调试结果，都是通过 JDWP 的通讯协议传输的。所有的命令被封装成 JDWP 命令包，通过传输层发送给被调试者，被调试者接收到 JDWP 命令包后，解析这个命令并转化为 JVMTI 的调用，在被调试者上运行。类似的，JVMTI 的运行结果，被格式化成 JDWP 数据包，发送给调试者并返回给 JDI 调用。而调试器开发人员就是通过 JDI 得到数据，发出指令。

JDI（Java Debug Interface）是 JPDA 三层模块中最高层的接口，定义了调试器（Debugger）所需要的一些调试接口。基于这些接口，调试器可以及时地了解目标虚拟机的状态，例如查看目标虚拟机上有哪些类和实例等。另外，调试者还可以控制目标虚拟机的执行，例如挂起和恢复目标虚拟机上的线程，设置断点等。

#### JDI 工作方式

* 调试器通过 Bootstrap 获取唯一的虚拟机管理器
    ```java
    VirtualMachineManager virtualMachineManager = Bootstrap.virtualMachineManager();
    ```
* 虚拟机管理器将在第一次被调用时初始化可用的链接池。默认会采用启动型链接器进行链接。
    ```java
    LaunchingConnector defaultConnector = virtualMachineManager.defaultConnector();
    ```
* 调用链接器的 launch 来启动目标程序，同时完成调试器与目标虚拟机的链接。
    ```java
    VirtualMachine targetVM = defaultConnector.launch(arguments);
    ```

JDI 中 Mirror 接口是将目标虚拟机上的所有数据、类型、域、方法、事件、状态和资源，以及调试器发向目标虚拟机的事件请求等都映射成 Mirror 对象。例如，在目标虚拟机上，已装载的类被映射成 ReferenceType 镜像，对象实例被映射成 ObjectReference 镜像，基本类型的值（如 float 等）被映射成 PrimitiveValue（如 FloatValue 等）。被调试的目标程序的运行状态信息被映射到 StackFrame 镜像中，在调试过程中所触发的事件被映射成 Event 镜像（如 StepEvent 等），调试器发出的事件请求被映射成 EventRequest 镜像（如 StepRequest 等），被调试的目标虚拟机则被映射成 VirtualMachine 镜像。

上面提到虚拟机管理器默认使用启动型链接器进行链接，在 JDI 中共有三种链接器接口，分别是依附型链接器（AttachingConnector）、监听型链接器（ListeningConnector）和启动型链接器（LaunchingConnector）。而根据调试器在链接过程中扮演的角色，又分为主动链接和被动链接，例如由调试器启动目标虚拟机或当目标虚拟机已运行时调试器链接成为主动型，由于篇幅有限这里不再深入展开。

JDI 还包含了一个事件请求和处理模块，共包含了18种事件类型，分别作用于调试过程中的断点、异常、线程改变以及目标虚拟机生命周期等功能。

### 调试器流程

事实上这里的 Java 调试器是作为前几篇文章中提到的 JDT.LS 语言服务的插件。在语言服务器初始化参数中指定调试器的 jar 包绝对路径，LSP 会把调试器注册为一个插件，并且将调试器插件所支持的命令以及请求注册到语言服务的 `workspace/executeCommand` 请求中作为子命令。Java 调试器共支持以下几个子命令用于调试器相关的初始化配置及启动等功能，这些命令由调试器实现，通过 LSP 注册并提供给客户端调用。

```json
// 调试器子命令调用方式
{
  "jsonrpc":"2.0",
  "id":10,
  "method":"workspace/executeCommand",
  "params":{
    "command":"vscode.java.updateDebugSettings",
    "arguments":[
      "{\"showHex\":true,\"showStaticVariables\":true,\"showQualifiedNames\":true,\"maxStringLength\":0,\"enableHotCodeReplace\":true,\"logLevel\":\"FINER\"}"
      ]
  }
}
```

* vscode.java.fetchUsageData  获取调试器默认配置。

* vscode.java.startDebugSession 启动调试器的 TCP 服务，返回端口号。

* vscode.java.resolveClasspath 获取被调试 Java 程序的类路径。

* vscode.java.resolveMainClass 获取被调试 Java 程序的 main 方法所在类，与类路径一同用于初始化调试器配置，最终会在指定的链接器中调用 `.launch` 时作为参数。这个参数在 VSCODE 中也可以由用户指定。

* vscode.java.buildWorkspace 在启动调试之前构建被调试程序。

* vscode.java.updateDebugSettings 更新调试器设置。

调试器启动之前，会先向 LSP 服务发送 `vscode.java.resolveClasspath`、`vscode.java.resolveMainClass`、`vscode.java.buildWorkspace` 等请求来构建被调试程序并获取 `mainClass`、`classPaths` 等必要的参数。

之后客户端发送 `vscode.java.startDebugSession` 命令后会启动 TCPServer 等待客户端连接。

```java
// java-debug JavaDebugServer.java
private JavaDebugServer() {
  try {
    this.serverSocket = new ServerSocket(0, 1);
  } catch (IOException e) {
    logger.log(Level.SEVERE, String.format("Failed to create Java Debug Server: %s", e.toString()), e);
  }
}
```

在客户端也就是 Java 调试器扩展中，
[查看扩展源码](https://github.com/Microsoft/vscode-java-debug/blob/90ea267a547f525e5ffe169efce9a6fa534acaf3/src/configurationProvider.ts#L34)可以看到这段逻辑包含在 `JavaDebugConfigurationProvider` 中，这个类负责给 VSCODE 的 `debugServices` 提供上面提到的参数。当扩展被激活时，会调用 `registerDebugConfigurationProvider` 函数来注册这个类。

```typescript
// vscode-java-debug   extension.ts
vscode.debug.registerDebugConfigurationProvider("java", new JavaDebugConfigurationProvider());
```

VSCODE 则会调用其中的 `resolveDebugConfiguration` 方法借助 LSP 获取调试器初始配置。

```typescript
// vscode  debugConfigurationManager.ts
public resolveConfigurationByProviders(folderUri: uri | undefined, type: string | undefined, debugConfiguration: IConfig): TPromise<IConfig> {
  // pipe the config through the promises sequentially. append at the end the '*' types
  const providers = this.providers.filter(p => p.type === type && p.resolveDebugConfiguration)
    .concat(this.providers.filter(p => p.type === '*' && p.resolveDebugConfiguration));

  return providers.reduce((promise, provider) => {
    return promise.then(config => {
      if (config) {
        return provider.resolveDebugConfiguration(folderUri, config);
      } else {
        return Promise.resolve(config);
      }
    });
  }, TPromise.as(debugConfiguration));
}
```

此时点击 VSCODE 界面上点击启动调试，便会尝试连接调试器的 TCPServer。

```typescript
// vscode rawDebugSession.ts
startSession(): TPromise<void> {
  return new TPromise<void>((c, e) => {
    this.socket = net.createConnection(this.port, this.host, () => {
      this.connect(this.socket, <any>this.socket);
      c(null);
    });
    this.socket.on('error', (err: any) => {
      e(err);
    });
    this.socket.on('close', () => this._onExit.fire(0));
  });
}
```

由于调试器并不知道客户端什么时候准备启动调试，所以需要等待连接成功后客户单发送 `initialize` 请求来表示自己已经准备开始调试。

```javascript
// initialize 请求
{
  "command":"initialize",
  "seq":1,
  "arguments":{
    "clientID":"coding",
    "clientName":"Cloud Studio",
    "adapterID":"java",
    "locale":"zh-cn",
    "linesStartAt1":true,
    "columnsStartAt1":true,
    "pathFormat":"path",
    "supportsVariableType":true,
    "supportsVariablePaging":true,
    "supportsRunInTerminalRequest":true
  },
  "type":"request"
}
```

请求成功后，客户端再发送 `launch` 请求，包含了以上获取到的 `classaPaths` 以及 `mainClass` 等参数，这时调试器真正开始启动被调试程序。这里 `launch` 对应了 JDI 链接器中的启动型号链接器，表示由调试器来启动目标虚拟机（vm）。

```javascript
// lanunch 请求
{
  command: "launch",
  seq: 2,
  type: "response",
  arguments: {
    args: "",
    classPaths: [],
    mainClass: "net.coding.demo.Application",
    modulePaths: [],
    request: "launch",
    type: "java",
  }
}
```

```java
// java-debug AdvancedLaunchingConnector.java

// constructLaunchCommand 构建被调试程序启动参数
String[] cmds = constructLaunchCommand(connectionArgs, address);
Process process = Runtime.getRuntime().exec(cmds, envVars, workingDir);

VirtualMachineImpl vm;

try {
    vm = (VirtualMachineImpl) listenConnector.accept(args);
} catch (IOException | IllegalConnectorArgumentsException e) {
    process.destroy();
    throw new VMStartException(String.format("VM did not connect within given time: %d ms", ACCEPT_TIMEOUT), process);
}

// 调用 setLaunchedProcess 将被调试程序的进程赋值给目标虚拟机，目标虚拟机监听此进程的运行信息
vm.setLaunchedProcess(process);
```

此时被调试程序已经正式启动，客户端可以根据协议规范来进行调试相关操作。

## Web 端实现

同样的，由于平台差异，在 Web 端无法直接监听调试器端口来进行通信，我们还需要一层 WebSocket 来转发调试器与客户端的消息。

具体来说，服务端需要启动一个 WebSocket 服务，当调试器启动 TCPServer 时，客户端携带调试端口连接到服务器，服务器再作为 TCPClient 连接到调试器，然后将客户端（网页端）的请求转发到给调试器服务。

服务端实现非常简单，只需要在接收到客户端请求后按照协议规范拼接好带有 `Content-Length` 字段的协议字符串发送给提调试器。同样收到调试器回复或事件消息时再发送给客户端即可。

这里重点介绍一下客户端如何监听 WebSocket 消息并转化为事件机制。因为前几篇文章中提到的 LSP 相关操作本身就封装在 Monaco 编辑器中，所以实现起来相对比较简单，只要调用 `monaco-languageClient` 中的相关方法，编辑器就会自动发送 LSP 请求及识别回复，除了一些超出编辑器本身的操作，都由编辑器自行完成。

而调试器界面是在编辑器之外的，Monaco 编辑器也并没有自带调试器UI，所以这部分工作需要我们自己完成。

具体来说我们需要一个简单的通用调试器UI，可以照 VSCODE 界面来抄（反正都是现成的。。

之后还需要一个 WebSocket 客户端来与服务器通信，使用与服务端配套的 `socket.io-client` 来实现这个客户端，上面提到，客户端需要将请求以及接收到的回复/事件转化为事件订阅机制，因为这样更方便与 UI 同步。

我们使用 React + Redux 实现客户端界面，同时使用 Redux-Saga 作为异步方案来实现 WebSocket 的事件转化机制。这里不详细介绍 Redux-Saga 的用法，有兴趣的可以自行查看[官方文档](https://redux-saga.js.org/);

首先将 WebSocket 封装为一个单例模式，这样方便给 Saga 作为 API 来调用且避免被多次实例化。

```javascript
class WebSocketApi {
  constructor() {
    this._instance = null;
    // 请求时携带的唯一自增 ID
    this.sequence = 1;
    // 缓存请求的回调函数
    this.pendingRequests = new Map();
    // 缓存事件的处理函数（由 Saga 在注册时提供，这里实现应为一个 generator 函数）
    this.eventCallback = new Map();
  }

  static getInstance() {
    if (!this._instance) {
      this._instance = new WebSocketApi();
    }
    return this._instance;
  }
}
```

然后需要有一个供 Saga 调用发送请求的方法 sendRequest，在调试协议中每个请求都会有相应的回复，所以我们还需要把这个请求 ID 缓存起来，并提供一个接收到回复的处理函数。(这个回复的处理函数由 WebSocketApi 自行实现，给 Saga 调用再封装为 Promise 的形式)

```javascript
// 供 Saga 调用 这一层实现代码比较简单，就不再多说了。
sendRequest = (command, args) => {
  return new Promise((resolve, reject) => {
    this.internalSend(command, args, (response) => {
      if (response.success) {
        resolve(response);
      } else {
        reject(response);
      }
    });
  });
}

internalSend = (command, args, cb) => {
  const request = {
    command,
    seq: this.sequence++,
  };
  if (args && Object.keys(args).length > 0) {
    request.arguments = args;
  }

  this._internalSend('request', request);

  if (cb) {
    // store callback for this request
    this.pendingRequests.set(request.seq, cb);
  }
}

_internalSend = (type, message) => {
  message.type = type;
  if (this.ws) {
    this.ws.send(JSON.stringify(message));
  }
}
```

接下来是接收到调试器事件的机制，这里的事件是指前文中提到的 JDI 中的事件模块，调试器会把这些事件发送给客户端。

```javascript
connect = (port) => {
  this.ws = createWebSocket(port);

  this.ws.on('message', this.handleMessage);
  return new Promise((resolve, reject) => {
    this.ws.on('connect', () => resolve(true));
  });
}

handleMessage = (data) => {
  const message = JSON.parse(data);

  switch (message.type) {
    case 'event':
        this.onDapEvent(message);
        break;
  }
}

onDapEvent = (event) => {
  const eventCb = this.eventCallback.get(event.event);
  if (eventCb) {
    try {
      store.runSaga(eventCb, event);
    } catch (e) {
      console.log(e.message);
    }
  }
}
```

可以看到上面代码中接收到事件类型的消息时，从 `eventCallback` 中获取到 Saga 提供的事件处理函数，而使用 `store.runSaga` 来调用。这是因为这些事件处理函数都是 Saga 或者说 generator 函数的形式存在的，而这里的 store.runSaga 实际上就是 redux-saga 中的 `sagaMiddleware.run` 函数。我们知道 Saga 本身应该是由 redux 的 action 来驱动的，而我们想接收到调试器的事件时来运行 Saga ，所以借助 sagaMiddleware.run 来实现了 Saga 的外部调用。

我们可以这样注册这些外部调用的 Saga

```javascript
// 发送 startDebugSession 并成功返回后连接 WebSocket
const success = yield call(webSocketApi.connect, port);

if (success) {
  // 发送初始化配置
  yield put(debugInitialize(initializeParams));
  // 调用注册 saga 事件
  yield fork(registerEventCallback);
}

// 注册事件
function* registerEventCallback() {
  try {
    webSocketApi.registerEventCallback('initialized', initializedEventSaga);
    webSocketApi.registerEventCallback('stopped', stoppedEventSaga);
    webSocketApi.registerEventCallback('output', outputEventSaga);
    webSocketApi.registerEventCallback('thread', threadEventSaga);
    webSocketApi.registerEventCallback('continued', continuedEventSaga);
  }
}

// stopped 事件的 saga 实现
function* stoppedEventSaga(params) {
  try {
    const { body } = params;

    // set button state.
    yield put(setStoppedStatus(true));
    // set stoppedThread
    yield put(setStoppedThread(body.threadId));
    // set stoppedDetails
    yield put(updateStoppedDetails(body));

    yield put(fetchThreads());
    const stackParams = {
      threadId: body.threadId,
      startFrame: 0,
      levels: 20,
    };
    const response = yield call(webSocketApi.sendRequest, 'stackTrace', stackParams);

    if (response.success) {
      const {
        body: { stackFrames },
      } = response;
      for (const sf of stackFrames) {
        yield put(updateStackFreams(body.threadId, sf));
      }

      if (stackFrames.length > 0) {
        // The request returns the variable scopes for a given stackframe ID.
        yield put(fetchVariableScopesByFrameID(stackFrames[0].id));
      }
      // @TODO UI change
    }
  } catch (e) {
    //
  }
}
```

通过这种机制，我们可以在接收到指定事件之后借助 redux-saga 强大的异步任务调度能力来执行相应的逻辑，同时还可以调用同步的 action 来对 UI以及编辑器 做相应的更新。

## 最后

调试是日常开发中非常重要的一部分，了解常用编辑器/IDE 的调试原理有助于我们更好的使用调试功能
。这篇文章内容较长，首先介绍了 VSCODE 中调试协议的概念，进而以 Java 为例解析了 VSCODE 中是如何启动调试器，以及简单介绍了一下 Java 调试器的实现原理。最后介绍了在线编辑器调试实现的思路，同时借助 redux-saga 实现了一个简单的事件机制来实现 WebSocket 消息的转化处理。

## 相关参考链接

* [howto-launch-and-debug-in-vscode-using](http://pydev.blogspot.com/2018/05/howto-launch-and-debug-in-vscode-using.html?m=1)
* [深入 Java 调试体系](https://www.ibm.com/developerworks/cn/java/j-lo-jpda4/index.html)
* [vscode-debug-protocol](https://github.com/Microsoft/vscode-debugadapter-node/blob/768e505c7d362f733a29c89fa973c6285ce8fb27/protocol/src/debugProtocol.ts)
* [vscode-debugging-api](https://code.visualstudio.com/docs/extensionAPI/api-debugging)
* [java-debug](https://github.com/Microsoft/java-debug)
* [vscode](https://github.com/Microsoft/vscode)
