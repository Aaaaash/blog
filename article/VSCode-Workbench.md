VSCode 作为时下最为流行的代码编辑器，自2015年推出以来逐渐蚕食了 Sublime Text、Atom 等编辑器的市场份额，占领了编辑器领域的半壁江山，截至目前其 GitHub 仓库的 star 数已经达到了 7w+，GitHub 2018年度报告 显示 VSCode 占据开源项目热度第一，Contributors 接近 2w。

上一篇文章 只对插件系统及其运行机制做了粗略的剖析，本文将开始尝试从源码入手解读 VSCode 的整体架构。
## Workbench
Workbench 即「工作区」，也就是 VSCode 主界面，众所周知 VSCode 是基于 Electron  构建的桌面应用程序，Electron 是基于 Chromium 和 Node.js 的跨平台桌面应用框架，VSCode 的工作区即是一个 Electron 的 BrowserWindow，与浏览器不同的是它还包含一个 Node.js 运行时，其渲染进程可以和 Node.js 进程通过 IPC 通信，所以在 BrowserWindow 中可以运行任何 Nodejs.js 模块。
```js
src/main.js 负责初始化 Electron 应用
// src/main.js
const app = require('electron').app;

app.once('ready', function () {
  onReady();
}
```
onReady 中读取了用户语言设置并劫持了默认的 require 为一个修改过的 loader，用它来加载 src/vs/code/electron-main/main 模块，这是 VSCode 真正的入口，负责解析环境变量和初始化主界面以及创建其他模块所依赖的「Services」。
Services(服务) 是 VSCode 中一系列可以被注入的公共模块，这些 Services 分别负责不同的功能，在这里创建了几个基本服务
```ts
// src/vs/code/electron-main/main.ts
function createServices(args: ParsedArgs, bufferLogService: BufferLogService): IInstantiationService {
	const services = new ServiceCollection();

	const environmentService = new EnvironmentService(args, process.execPath);

	const logService = new MultiplexLogService([new ConsoleLogMainService(getLogLevel(environmentService)), bufferLogService]);
	process.once('exit', () => logService.dispose());

	// environmentService 一些基本配置，包括运行目录、用户数据目录、工作区缓存目录等
	services.set(IEnvironmentService, environmentService);
	// logService 日志服务
	services.set(ILogService, logService);
	// LifecycleService 生命周期相关的一些方法
	services.set(ILifecycleService, new SyncDescriptor(LifecycleService));
        // StateService 持久化数据
	services.set(IStateService, new SyncDescriptor(StateService));
        // ConfigurationService 配置项
	services.set(IConfigurationService, new SyncDescriptor(ConfigurationService));
        // RequestService 请求服务
	services.set(IRequestService, new SyncDescriptor(RequestService));
        // DiagnosticsService 诊断服务，包括程序运行性能分析及系统状态
	services.set(IDiagnosticsService, new SyncDescriptor(DiagnosticsService));

	return new InstantiationService(services, true);
}
```
除了这些基本服务，VSCode 内还包含了大量的服务，如 IModeService、ICodeEditorService、IPanelService 等，通过 VSCode 实现的「依赖注入」模式，可以在需要用到这些服务的地方以 Decorator 的方式做为构造函数参数声明依赖，会被自动注入到类中。
例如
```ts
// src/vs/workbench/electron-browser/workbench.ts
class Workbench extends Disposable implements IPartService {
    constructor(
        private container: HTMLElement,
        private configuration: IWindowConfiguration,
	serviceCollection: ServiceCollection,
	private mainProcessClient: IPCClient,
	@IInstantiationService private readonly instantiationService: IInstantiationService,
	@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
	@IStorageService private readonly storageService: IStorageService,
	@IConfigurationService private readonly configurationService: WorkspaceService,
	@IEnvironmentService private readonly environmentService: IEnvironmentService,
	@ILogService private readonly logService: ILogService,
	@IWindowsService private readonly windowsService: IWindowsService
   ){}
}
```
这些服务会在不同的阶段被创建，关于依赖注入的细节之后会单独写一篇文章解读原理，这里不再赘述。
基础服务初始化完成后会加载 IPC 信道并创建 CodeApplication 实例，调用 startup 方法启动 code
```ts
// src/vs/code/electron-main/app.ts
function startup(args: ParsedArgs): void {

	// We need to buffer the spdlog logs until we are sure
	// we are the only instance running, otherwise we'll have concurrent
	// log file access on Windows (https://github.com/Microsoft/vscode/issues/41218)
	const bufferLogService = new BufferLogService();
        // 使用之前创建的 services 创建「实例服务」
	const instantiationService = createServices(args, bufferLogService);
	instantiationService.invokeFunction(accessor => {
		const environmentService = accessor.get(IEnvironmentService);
		const stateService = accessor.get(IStateService);

		// 根据 environmentService 的配置将必要的环境变量添加到 process.env 中
		const instanceEnvironment = patchEnvironment(environmentService);

		// Startup
		return initServices(environmentService, stateService as StateService)
			.then(() => instantiationService.invokeFunction(setupIPC), error => { // setupIPC 负责加载 IPC 信道用于进程间通信

				// Show a dialog for errors that can be resolved by the user
				handleStartupDataDirError(environmentService, error);

				return Promise.reject(error);
			})
			.then(mainIpcServer => {
				bufferLogService.logger = createSpdLogService('main', bufferLogService.getLevel(), environmentService.logsPath);
                                // 实例服务创建 CodeApplication 实例并调用 startup
				return instantiationService.createInstance(CodeApplication, mainIpcServer, instanceEnvironment).startup();
			});
	}).then(null, err => instantiationService.invokeFunction(quit, err));
}
```
CodeApplication.startup 中首先会启动 SharedProcess 共享进程，同时也创建了一些窗口相关的服务，包括 WindowsManager、WindowsService、MenubarService 等，负责窗口、多窗口管理及菜单等功能。
app.ts 中的 openFirstWindow 负责处理首次开启窗口，这里会先创建一系列 Electron 的 IPC 频道，用于主进程和渲染进程间通信
```ts
const appInstantiationService = accessor.get(IInstantiationService);

// Register more Main IPC services
const launchService = accessor.get(ILaunchService);
const launchChannel = new LaunchChannel(launchService);
this.mainIpcServer.registerChannel('launch', launchChannel);

// Register more Electron IPC services
const updateService = accessor.get(IUpdateService);
const updateChannel = new UpdateChannel(updateService);
this.electronIpcServer.registerChannel('update', updateChannel);

const issueService = accessor.get(IIssueService);
const issueChannel = new IssueChannel(issueService);
this.electronIpcServer.registerChannel('issue', issueChannel);

const workspacesService = accessor.get(IWorkspacesMainService);
const workspacesChannel = appInstantiationService.createInstance(WorkspacesChannel, workspacesService);
this.electronIpcServer.registerChannel('workspaces', workspacesChannel);

const windowsService = accessor.get(IWindowsService);
const windowsChannel = new WindowsChannel(windowsService);
this.electronIpcServer.registerChannel('windows', windowsChannel);
this.sharedProcessClient.then(client => client.registerChannel('windows', windowsChannel));

const menubarService = accessor.get(IMenubarService);
const menubarChannel = new MenubarChannel(menubarService);
this.electronIpcServer.registerChannel('menubar', menubarChannel);

const urlService = accessor.get(IURLService);
const urlChannel = new URLServiceChannel(urlService);
this.electronIpcServer.registerChannel('url', urlChannel);

const storageMainService = accessor.get(IStorageMainService);
const storageChannel = this._register(new GlobalStorageDatabaseChannel(storageMainService as StorageMainService));
this.electronIpcServer.registerChannel('storage', storageChannel);

// Log level management
const logLevelChannel = new LogLevelSetterChannel(accessor.get(ILogService));
this.electronIpcServer.registerChannel('loglevel', logLevelChannel);
this.sharedProcessClient.then(client => client.registerChannel('loglevel', logLevelChannel));
```
其中 window 和 logLevel 频道还会被注册到 sharedProcessClient ，sharedProcessClient 是主进程与共享进程（SharedProcess）进行通信的 client，我们之后再解释 SharedProcess 的 具体功能。
之后根据 environmentService 提供的相关参数（file_uri、folder_uri）准备打开窗口，最终调用了 windowsMainService.open 方法 (windowsMainService 即前文创建的 WindowsManager)，open 方法解析了参数判断打开的目录路径并调用了 doOpen 方法，这里会根据传入的参数判断将要打开的窗口及相应的工作空间（或目录），创建 CodeWindow 实例，CodeWindow 封装了一个 Electron.BrowserWindow 对象，windowsMainService 中创建CodeWindow 实例后会调用其 load 方法正式加载窗口，实际是调用 browserWindow.loadURL 加载一个 HTML 文件，在这里是加载了 vs/code/electron-browser/workbench/workbench.html ，这是整个 Workbench 的入口，内容也很简单
```html
<!-- Copyright (C) Microsoft Corporation. All rights reserved. -->
<!DOCTYPE html>
<html>
	<head>
		<meta charset="utf-8" />
		<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' https: data: vscode-remote:; media-src 'none'; child-src 'self'; object-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https:; font-src 'self' https:;">
	</head>
	<body class="vs-dark" aria-label="">
	</body>

	<!-- Startup via workbench.js -->
	<script src="workbench.js"></script>
</html>
```
加载了一个 workbench.js 文件，这个文件负责加载真正的 Workbench 模块并调用其 main 方法初始化主界面
```js
// src/vs/code/electron-browser/workbench/workbench.js
bootstrapWindow.load([
	'vs/workbench/workbench.main',
	'vs/nls!vs/workbench/workbench.main',
	'vs/css!vs/workbench/workbench.main'
],
	function (workbench, configuration) {
		perf.mark('didLoadWorkbenchMain');

		return process['lazyEnv'].then(function () {
			perf.mark('main/startup');

			// @ts-ignore
                        // 加载 Workbench 并初始化主界面
			return require('vs/workbench/electron-browser/main').main(configuration);
		});
	}, {
		removeDeveloperKeybindingsAfterLoad: true,
		canModifyDOM: function (windowConfig) {
			showPartsSplash(windowConfig);
		},
		beforeLoaderConfig: function (windowConfig, loaderConfig) {
			loaderConfig.recordStats = !!windowConfig['prof-modules'];
			if (loaderConfig.nodeCachedData) {
				const onNodeCachedData = window['MonacoEnvironment'].onNodeCachedData = [];
				loaderConfig.nodeCachedData.onData = function () {
					onNodeCachedData.push(arguments);
				};
			}
		},
		beforeRequire: function () {
			perf.mark('willLoadWorkbenchMain');
		}
	});
```
前文中的大量代码只是为这里最终创建主界面做铺垫，Workbench 模块主要代码都在 vs/workbench 目录下，主要负责界面元素的创建和具体业务功能的实现。
src/vs/workbench/electron-browser/main.ts 的 main 函数代码很简单
```ts
// src/vs/workbench/electron-browser/main.ts
export function main(configuration: IWindowConfiguration): Promise<void> {
	const window = new CodeWindow(configuration);

	return window.open();
}
```
要注意这里的 CodeWindow 和前面那个封装了 BrowserWindow 的 CodeWindow 并不是一个东西，这个 CodeWindow 只负责主界面渲染相关的功能，而之前的 CodeWindow 是负责整个窗口创建及生命周期管理（命名令人困惑）。PS: 最新代码中 CodeWindow 改名为 CodeRendererMain
window.open 里同样创建了依赖的一些服务，监听了 DOMContentLoaded 事件，浏览器 DOM 结构加载完成后创建 Workbench 实例并调用 workbench.startup 开始构建主界面布局、创建全局事件监听、加载设置项以及同样实例化一些依赖的服务，全部完成后会还原之前打开的编辑器，整个 Workbench 加载完成。
```ts
	// src/vs/workbench/electron-browser/workbench.ts 
        private doStartup(): Promise<void> {
		this.workbenchStarted = true;

		// Logging
		this.logService.trace('workbench configuration', JSON.stringify(this.configuration));

		// ARIA
		setARIAContainer(document.body);

		// Warm up font cache information before building up too many dom elements
		restoreFontInfo(this.storageService);
		readFontInfo(BareFontInfo.createFromRawSettings(this.configurationService.getValue('editor'), getZoomLevel()));
		this._register(this.storageService.onWillSaveState(() => {
			saveFontInfo(this.storageService); // Keep font info for next startup around
		}));

		// Create Workbench Container
		this.createWorkbench();

		// Install some global actions
		this.createGlobalActions();

		// Services
		this.initServices();

		// Context Keys
		this.handleContextKeys();

		// Register Listeners
		this.registerListeners();

		// Settings
		this.initSettings();

		// Create Workbench and Parts
		this.renderWorkbench();

		// Workbench Layout
		this.createWorkbenchLayout();

		// Layout
		this.layout();

		// Driver
		if (this.environmentService.driverHandle) {
			registerWindowDriver(this.mainProcessClient, this.configuration.windowId, this.instantiationService).then(disposable => this._register(disposable));
		}

		// Handle case where workbench is not starting up properly
		const timeoutHandle = setTimeout(() => {
			this.logService.warn('Workbench did not finish loading in 10 seconds, that might be a problem that should be reported.');
		}, 10000);

		this.lifecycleService.when(LifecyclePhase.Restored).then(() => {
			clearTimeout(timeoutHandle);
		});

		// Restore Parts
		return this.restoreParts();
	}
```

后记
VSCode 整体架构非常复杂，但同时源码非常清晰明了，也极少有第三方依赖，核心模块大都是由自身实现，包括依赖注入系统、模块加载（拦截加载器）、插件系统、语言服务、调试器前端及调试器协议等。同时界面包括文件树以及编辑器（Monaco）等长列表都实现了无限滚动（或者叫虚拟列表），整体性能表现非常卓越，虽然在安装大量插件后依然会出现卡顿甚至卡死等情况，但相比同样基于 Electron 架构的 Atom 编辑器来说表现已经非常令人满意了。
本文仅从 Workbench 创建的流程做粗略的解读，中间省去了部分代码及底层实现细节，之后逐步会从不同角度逐步深入，解读 VSCode 架构中一些值得学习的地方。