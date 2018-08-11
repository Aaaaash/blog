[Visual Studio Code](https://github.com/Microsoft/vscode) 是微软开源的一款轻量级代码编辑器，支持数十种主流语言的语法高亮、智能补全提示及 Git、Docker 集成等特性。因其自身使用 TypeScript 语言及 Electron 平台开发，对 ES/JavaScript/NodeJS 支持度较高，已经逐渐成为前端领域的主流开发工具。

前几篇文章介绍了 LSP 协议及在 Web 端在线编辑器中的集成，可以看到基于 LSP 协议，我们只需要找到对应语言的实现，就可以以非常低的成本在多个编辑器中使用语言服务器，甚至是在 Web 端。

## VSCODE 调试器协议

同样在 VSCODE 中还存在一个 [vscode-debug-protocol](https://github.com/Microsoft/vscode-debugadapter-node/blob/768e505c7d362f733a29c89fa973c6285ce8fb27/protocol/README.md)，这是一个通用的调试协议，允许在 VSCODE 的通用调试器 UI 下集成特定语言的调试器。

![vscode nodejs debugger](https://code.visualstudio.com/assets/docs/nodejs/nodejs-debugging/auto-attach.gif)

和 LSP 一样，vscode-debug-protocol 使用 JSONRPC 来描述请求、响应及事件，协议的具体规范可以在 [debugProtocol.ts](https://github.com/Microsoft/vscode-debugadapter-node/blob/768e505c7d362f733a29c89fa973c6285ce8fb27/protocol/src/debugProtocol.ts) 中找到。

## 调试器协议详解

这里任然以 Java 语言为例，在 VSCODE 中搜索并安装扩展 `Debugger for Java`, 重载编辑器后即可使用 Java 调试器。

Java 调试器的工作依赖 Java 的语言服务器，调试器启动之前，会先向 LSP 服务发送几个请求来获取 `mainClass`、`classPaths` 以及调试器端口等必要的参数。

[查看扩展源码](https://github.com/Microsoft/vscode-java-debug/blob/90ea267a547f525e5ffe169efce9a6fa534acaf3/src/configurationProvider.ts#L34)可以看到这段逻辑包含在 `JavaDebugConfigurationProvider` 中，这个类负责给 VSCODE 的 `debugServices` 提供初始化参数。当扩展被激活时，会调用 `registerDebugConfigurationProvider` 函数来注册这个类。

```typescript
// vscode-java-debug   extension.ts
vscode.debug.registerDebugConfigurationProvider("java", new JavaDebugConfigurationProvider());
```

VSCODE 则会调用其中的 `resolveDebugConfiguration` 方法获取调试器初始配置。

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

Java 调试器与客户端通过 TCP 的方式进行数据传输，获取到调试器端口后，客户端便会与其连接进行通信。

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

### Java 调试 Web 端实现

上面说到，在收到 LSP 返回的
前文安装的 Java 调试插件基于 JDI 实现并遵循了 VSCODE 调试协议。当调试器启动时，会先按照上述 JDI 流程获取虚拟机管理器，连接到虚拟机，同时启动一个 TCP 服务器等待客户端连接。当客户端成功连接到调试器后，调试器还需要等待客户端发送一连串初始化及配置请求来确定被调试的程序及断点信息。

