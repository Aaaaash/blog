之前[一篇文章](https://zhuanlan.zhihu.com/p/73837942)大致介绍了 [lsif-typescript-chrome-extension](https://github.com/Aaaaash/lsif-typescript-chrome-extension) 的基本功能和实现原理, 经过这段时间的开发, 已经实现了令我比较满意的使用体验

![](https://raw.githubusercontent.com/Aaaaash/lsif-typescript-chrome-extension/master/snapshot/hover-navigate-jump.gif)

主要做了几点优化

- documentSymbol 的样式优化了一下, 和 VS Code 大致体验相同
- Hover 的样式也变好看了一点, 同样基本照抄了 VS Code
- 添加了 gotoDefinition 功能, 鼠标放到相应 token 上面点击一下, 不过第三方依赖暂时无法跳转

其中插件几个 script 之间以及和 lsif-server 的通信机制也做了两次大的优化. 一开始没有考虑到复用 WebSocket 连接, 每个页面都注入了一个 content script, 并且每次打开一个 GitHub 的代码页面都会和 lsif-server 之间建立一个 WebSocket 连接, 考虑到多数情况下打开代码页面不一定会停留太久, 同时太多连接势必会拖慢服务甚至浏览器性能, 所以第一步是把 WebSocket 连接挪到 background page. 

简单解释一下这里 background script 是指 Chrome 插件的一个背景页, 每个插件都可以有一个独立的后台脚本, 会随浏览器启动运行, 而 content script 是指可以访问当前页面的一段脚本, 准确来说 content script 可以和当前的页面共享 DOM, 但并不能访问页面上的 window 对象. 我的思路是, background 负责维护一个和 lsif-server 的 WebSocket 连接, content script 只负责当前页面的事件监听及 DOM 操作, 另外还有一个 popup script (也就是右上角插件点击后弹出的小框)负责显示 WebSocket 连接状态.

content script 不直接和 lsif-server 通信, 所有消息都经过 background 转发, Chrome 插件支持在 content 和 background 之间维持一个长连接
```ts
    // content script
    const messagePort = chrome.runtime.connect({ name: 'lsif-typescript-message-channel' });
    messagePort.postMessage({
    //...
    });
    
    // background script
    chrome.runtime.onConnect.addListener((messagePort) => {
    	if(messagePort.name === 'lsif-typescript-message-channel') {
    			messagePort.onMessage.addListener((message) => {
    				// ...
    			}
    	}
    });
```
这种模式下, content 只需要维持和 background 之间的通信即可, 同时 background 还需要及时向 content 发送连接状态, 保证 content < - > background < - > lsif-server 消息同步.

第二个优化源于一个想法, 先来回顾一下插件流程, 当打开一个 GitHub 代码页面, content 会检查 background 和 lsif-server 的连接状态, 然后依次发送 initialize, documentSymbol 等请求, 一旦切换到另一个页面(这里我用 [insight.io](http://insigh.io/) 插件的文件树功能切换代码页面), 会刷新页面并跳转到新的文件, 然后依然是上述流程, 这个过程没有太大问题. 但当我从 GitHub 项目主页点文件链接时发现页面并没有刷新, 而是直接请求了代码页面的数据并且渲染出来, 这时插件是没有工作的, 因为一开始进入页面 content 脚本只会检查一次 window.location, 非代码页面实际什么也不会发生, 而通过这种方式不刷新直接打开代码页时插件没有监听任何事件, 所以此时插件依然不会运行.

解决方案自然是监听 url change 事件, 进入代码页面开始运行插件, 很遗憾虽然有相应的 API 直接修改 url(不是 hash), 但并没有监听这个操作的事件, 好在社区依然有很 hack 的方案, 也就是魔改 window.history.pushState
```ts
    function nativeHistoryWrapper(eventType: string): () => ReturnType<typeof history['pushState']> {
        const origin = window.top.history[eventType];
        return function () {
            const rev = origin.apply(this, arguments);
            const event = new Event(eventType);
            // @ts-ignore
            event.args = arguments;
            window.dispatchEvent(event);
            return rev;
        }
    }
    
    const wrappedPushState = nativeHistoryWrapper('pushState');
    window.history.pushState = wrappedPushState;
    
    window.addEventListener('pushState', () => {
    	//...
    });
```
当调用 pushState 时会自动 dispatchEvent, 然后直接监听即可.

看上去很完美, 直到我在 content 脚本里加入了这段代码, 从项目主页开始点击链接, 没有任何反应. 还记得之前说的吗, content 脚本和当前页面共享 DOM, 但并不能访问当前页面的 window 对象, 也就是这段代码修改了的 window.history 并不会在当前页面生效, 因为 content 脚本本身运行就不在当前页面上下文.

当然解决办法也是有的, 常见的方式是 content 页面不做具体逻辑处理, 只负责在 document.body 里动态插入一个 script 标签, src 即是我们真正的 content 代码.
```ts
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('out/content.js');
    script.type = 'text/javascript';
    document.body.appendChild(script);
```
但这样显然还不够, 因为之前 content 和 background 之间的长连接在content 被直接注入到页面后无法通信了, 而且因为这种行为本身就比较 hack , 所以并没有官方的通信方案. 不过我们还是可以借助强大的 postMessage.

为了区分我们把注入的 content 脚本叫做 inject script, 被注入到页面真正的 content 叫做 injected script, 这两个脚本之间可以通过 postMessage 通信, 我们需要把之前 content 和 background的通信方式改为 inject < - > injected < - > background < - > lsif-server, 而 injected 可以看做一个代理 agent, 它和 inject 通过 postMessage 通信, 和 background 通过长连接通信, inject 通过 window.postMessage 发送消息到 injected, injected 不需要做任何处理直接发送给 background, background 再发送到 lsif-server , 请求响应流程则是反过来.

这样我们先前魔改 window.history 的代码就可以直接运行在当前页面, 当从项目主页进入时, 插件不会发送任何请求, 一旦通过页面链接点开代码页面, 插件会按照上述的流程向 lsif-server 发送请求获取相关的索引信息.

## 参考资料

1. [Message Passing](https://developers.chrome.com/extensions/messaging)
2. [Chrome extensions: Handling messaging from injected scripts](https://thomasboyt.github.io/2014/10/06/chrome-message-workaround.html)