> 写这篇文章是因为最近一段时间的工作涉及到 Cloud Studio 插件这一块的内容，旧的插件系统在面向用户开放后暴露了安全性、扩展性等诸多问题。调研了几个不同架构下 IDE 的插件系统实现( Theia, VSCode 等)，也大致阅读了一遍 VSCode 插件系统相关的源码，在这里做一个简单的分享，个人水平有限，如有错误之处还请观众老爷们指点一下。

## 从加载一个插件开始
以我们熟悉的 vscode-eslint 为例，查看源码会发现入口是 extension.ts 文件里的 activate 函数，它的函数签名像这样：
```typescript
activate(context: ExtensionContext): void
```
需要了解的一点是， package.json 里的 activationEvents 字段定义了插件的激活事件，考虑到性能问题，我们并不需要一启动 VSCode 就立即激活所有的插件。activation-events 定义了一组事件，当 activationEvents 字段指定的事件被触发时才会激活相应的插件。包含了特定语言的文件被打开，或者特定的【命令】被触发，以及某些视图被切换甚至是一些自定义命令被触发等等事件。
例如在 vscode-java 中，activationEvents 字段的值为
```json
"activationEvents": [
    "onLanguage:java",
    "onCommand:java.show.references",
    "onCommand:java.show.implementations",
    "onCommand:java.open.output",
    "onCommand:java.open.serverLog",
    "onCommand:java.execute.workspaceCommand",
    "onCommand:java.projectConfiguration.update",
    "workspaceContains:pom.xml",
    "workspaceContains:build.gradle"
]
```
其中包含 languageId 为 java 的文件被打开，以及由该插件自定义的几个 JDT 语言服务命令被触发，和【工作空间】包含 pom.xml/buld.gradle 这些事件。在以上事件被触发时插件将会被激活。
这段逻辑被定义在 `src/vs/workbench/api/node/extHostExtensionService.ts` 中

```typescript
// 由 ExtensionHostProcessManager 调用并传入相应事件作为参数
public $activateByEvent(activationEvent: string): Thenable<void> {
  return (
    this._barrier.wait()
      .then(_ => this._activateByEvent(activationEvent, false))
  );
}

/* 省略部分代码 */

// 实例化 activator
this._activator = new ExtensionsActivator(this._registry, {
  
  /* 省略部分代码 */

  actualActivateExtension: (extensionDescription: IExtensionDescription, reason: ExtensionActivationReason): Promise<ActivatedExtension> => {
    return this._activateExtension(extensionDescription, reason);
  }
});

// 调用 ExtensionsActivator 的实例 activator 的方法激活插件
private _activateByEvent(activationEvent: string, startup: boolean): Thenable<void> {
  const reason = new ExtensionActivatedByEvent(startup, activationEvent);
  return this._activator.activateByEvent(activationEvent, reason);
}
```
其中 ExtensionsActivator 定义在 src/vs/workbench/api/node/extHostExtensionActivator.ts 中

```typescript
export class ExtensionsActivator {
  constructor(
    registry: ExtensionDescriptionRegistry,
    // 既上文中实例化 activator 传的第二个参数
    host: IExtensionsActivatorHost，
  ) {
    this._registry = registry;
    this._host = host;
  }
}
```
当调用 activator.activateByEvent 方法时(既某个事件被触发)，activator  会获取所有符合该事件的插件并逐一执行 extHostExtensionService._activateExtension 方法(也就是 activator.actualActivateExtension) ，中间省去获取上下文，记录日志等一通操作后调用了 extHostExtensionService._callActivateOptional 静态方法

```typescript
/* 省略部分代码 */
// extension.ts 里的 activate 函数
if (typeof extensionModule.activate === 'function') {
  try {
    activationTimesBuilder.activateCallStart();
    logService.trace(`ExtensionService#_callActivateOptional ${extensionId}`);
    // 调用并传入相关参数
    const activateResult: Thenable<IExtensionAPI> = extensionModule.activate.apply(global, [context]);
    activationTimesBuilder.activateCallStop();

    activationTimesBuilder.activateResolveStart();
    return Promise.resolve(activateResult).then((value) => {
      activationTimesBuilder.activateResolveStop();
      return value;
    });
  } catch (err) {
    return Promise.reject(err);
  }
}
```
至此，插件被成功激活。

## 插件如何运行
再来看插件的代码，插件中需要引入一个叫 vscode 的模块
import * as vscode from 'vscode';
熟悉 TypeScript 的朋友都知道这实际上只是引入了一个 vscode.d.ts 类型声明文件而已，这个文件包含了所有插件可用的 API 及类型定义。
这些 API 在插件 import 时就被注入到了插件的运行环境中，它们定义在源码 `src/vs/workbench/api/node/extHost.api.impl.ts` 文件 `createApiFactory` 函数中，通过 defineAPI 函数统一被注入到插件运行环境。

```typescript
function defineAPI(factory: IExtensionApiFactory, extensionPaths: TernarySearchTree<IExtensionDescription>, extensionRegistry: ExtensionDescriptionRegistry): void {

  // each extension is meant to get its own api implementation
  const extApiImpl = new Map<string, typeof vscode>();
  let defaultApiImpl: typeof vscode;

  // 已被全局劫持过的 require
  const node_module = <any>require.__$__nodeRequire('module');
  const original = node_module._load;
  // 重写 Module.prototype._load 方法
  node_module._load = function load(request: string, parent: any, isMain: any) {
    // 模块名不是 vscode 调用原方法返回模块
    if (request !== 'vscode') {
      return original.apply(this, arguments);
    }

    // 这里会为每一个插件生成一份独立的 API (为了安全考虑？)
    const ext = extensionPaths.findSubstr(URI.file(parent.filename).fsPath);
    if (ext) {
      let apiImpl = extApiImpl.get(ext.id);
      if (!apiImpl) {
        // factory 函数会返回所有 API 
        apiImpl = factory(ext, extensionRegistry);
        extApiImpl.set(ext.id, apiImpl);
      }
      return apiImpl;
     }
    /* 省略部分代码 */
  }
}
```
实际上也很简单，这里的 `require` 已经被 Microsoft/vscode-loader 劫持了，所以在插件代码中所有通过 import (运行时会被编译为 require) 引入的模块都会经过这里，通过这种方式将 API 注入到了插件执行环境中。
一般我们查看资源管理器或者进程会发现 VSCode 创建了很多个子进程，且所有插件都在一个独立的 Extension Host 进程在运行，这是考虑到插件需要在一个与主线程完全隔离的环境下运行，保证安全性。那么问题来了，我们调用 vscode.window.setStatusBarMessage('Hello World') 时是怎么在编辑器状态栏插入消息的？前文我们提到所有的 API 被定义在 extHost.api.impl.ts 文件的 createApiFactory 里，例如 vscode.window.setStatusBarMessage 的实现
```typescript
const window: typeof vscode.window = {
  /* 省略部分代码 */
  setStatusBarMessage(text: string, timeoutOrThenable?: number | Thenable<any>): vscode.Disposable {
    return extHostStatusBar.setStatusBarMessage(text, timeoutOrThenable);
  },
  /* 省略部分代码 */
}
```
实际调用的是 `extHostStatusBar.setStatusBarMessage` 函数，而 extHostStatusBar 则是 ExtHostStatusBar 的实例
```typescript
const extHostStatusBar = new ExtHostStatusBar(rpcProtocol);
```
ExtHostStatusBar 包含了两个方法 createStatusBarEntry 和 setStatusBarMessage，createStatusBarEntry 返回了一个  ExtHostStatusBarEntry ，它被包装了一层代理，在 ExtHostStatusBar 被实例化化的同时也会产生一个 ExtHostStatusBarEntry 实例
```typescript
export class ExtHostStatusBar {

  private _proxy: MainThreadStatusBarShape;
  private _statusMessage: StatusBarMessage;

  constructor(mainContext: IMainContext) {
    // 获取代理
    this._proxy = mainContext.getProxy(MainContext.MainThreadStatusBar);
    // 传入 this, StatusBarMessage 中也随即实例化了一个 ExtHostStatusBarEntry
    this._statusMessage = new StatusBarMessage(this);
  }
  /* 省略部分代码 */
}

class StatusBarMessage {

  private _item: StatusBarItem;
  private _messages: { message: string }[] = [];

  constructor(statusBar: ExtHostStatusBar) {
    // 调用 createStatusBarEntry 
    this._item = statusBar.createStatusBarEntry(void 0, ExtHostStatusBarAlignment.Left, Number.MIN_VALUE);
  }
  /* 省略部分代码 */
}
```
所以当我们调用 setStatusBarMessage 时，先是调用了 this._statusMessage.setMessage 方法
```typescript
// setStatusBarMessage 方法
let d = this._statusMessage.setMessage(text);
```

而 this._statusMessage.setMessage 方法经过层层调用，最终调用了 ExtHostStatusBarEntry 实例的 update 方法，也就是前面的 StatusBarMessage 构造函数中的 this._item.update，而这里就到了重头戏，update 方法中包含了一个 延时为 0 的 setTimeout ：
```typescript
this._timeoutHandle = setTimeout(() => {
  this._timeoutHandle = undefined;

  // Set to status bar
  // 还记得一开始实例化 ExtHostStatusBar 中的 this._proxy = mainContext.getProxy(MainContext.MainThreadStatusBar); 吗
  this._proxy.$setEntry(this.id, this._extensionId, this.text, this.tooltip, this.command, this.color,
    this._alignment === ExtHostStatusBarAlignment.Left ? MainThreadStatusBarAlignment.LEFT : MainThreadStatusBarAlignment.RIGHT,
    this._priority);
}, 0);
```
这里的 this.proxy 就是 ExtHostStatusBar 构造函数中的 this.proxy
```typescript
constructor(mainContext: IMainContext) {
  this._proxy = mainContext.getProxy(MainContext.MainThreadStatusBar);
  this._statusMessage = new StatusBarMessage(this);
}
```
这里的 IMainContext 其实就是继承了 IRPCProtocol 的一个别名而已，new ExtHostStatusBar  的参数是一个 rpcProtocol 实例，它被定义在 src/vs/workbench/services/extensions/node/rpcProtocol.ts 中，我们重点看一下 getProxy 的实现
```typescript
// 我错了，这里才是重头戏，VSCode 源码太绕了 /(ㄒoㄒ)/~~
public getProxy<T>(identifier: ProxyIdentifier<T>): T {
  // 这里只是根据对应的 identifier 生成对应的 scope 而已，插件调用和 API 的调用一模一样比较方便一些
  const rpcId = identifier.nid;
  // 例如 StatusBar 的 identifier.nid 就是 'MainThreadStatusBar'
  if (!this._proxies[rpcId]) {
    // 缓存中没有代理则生成新的代理
    this._proxies[rpcId] = this._createProxy(rpcId);
  }
  // 返回代理后的对象
  return this._proxies[rpcId];
}


// 创建代理
private _createProxy<T>(rpcId: number): T {
  let handler = {
    get: (target: any, name: string) => {
      // target 即表示 scope，name 即为被调用方法名
      if (!target[name] && name.charCodeAt(0) === CharCode.DollarSign) {
        target[name] = (...myArgs: any[]) => {
          // 插件中的 API 实际被代理到 remoteCall，因为这是一个 RPC 协议
	  return this._remoteCall(rpcId, name, myArgs);
	};
      }
      return target[name];
    }
  };
  // 返回 API 代理
  return new Proxy(Object.create(null), handler);
}
```

_createProxy 返回的是一个代理对象，即它代理了主线程中真正实现这些 API 的对象，例如 'MainThreadStatusBar' 返回的是一个 `MainThreadStatusBarShape` 类型的代理。
```typescript
export interface MainThreadStatusBarShape extends IDisposable {
  $setEntry(id: number, extensionId: string, text: string, tooltip: string, command: string, color: string | ThemeColor, alignment: MainThreadStatusBarAlignment, priority: number): void;
  $dispose(id: number): void;
}
```
插件 API 定义中并没有实现这个接口，它只需要被主线程中对应的模块实现即可，前面我们说到 setStatusMessage 最终调用了 this._proxy.$setEntry。
_remoteCall 里会调用 RPCProcotol 的静态方法 serializeRequest 将 rpcId 方法名以及参数序列化成一个 Buffer 并发送给主线程。
```typescript
const msg = MessageIO.serializeRequest(req, rpcId, methodName, args, !!cancellationToken, this._uriReplacer);

// 省略部分代码
this._protocol.send(msg);
```
关于主线程中接收到消息如何处理其实已经不用多说了，根据 rpcId 找到对应的 Services 以及方法，传入参数即可。
