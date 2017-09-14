## redux源码解读第一篇---createStore

[这里是源码createStore.js](https://github.com/reactjs/redux/blob/ab5cafdd50ee740261032cef94935c1f99354173/src/createStore.js)


`createStore`函数是redux状态管理流程的入口，通过调用`createStore(reducer, preloadState)`之后可以创建一个store对象,store包含四个方法(不包含调用后产生的ubsubscribe)

 * `getState`
 * `subscribe` 
 * `dispatch`
 * `replaceReducer`

### 首先初始化内部变量
```javascript

let currentReducer = reducer   // 传入的reducer函数

let currentState = preloadedState   // 初始state

let currentListeners = []    // 事件监听列表

let nextListeners = currentListeners    // 当前监听函数

let isDispatching = false    // 是否正在dispatch
```

### getState
很简单，直接返回当前state对象
```javascript
function getState() {
  return currentState
}
```

### subscribe
redux内部实现了一个简单的观察者模式, 通过subscribe可以传入事件监听函数
```javascript
function subscribe(listener) {
  // 接受一个事件处理函数
  
  //在react-redux库的connect函数中的用法大致如下
  /*
  trySubscribe() {
    if (shouldSubscribe && !this.unsubscribe) {
      this.unsubscribe = this.store.subscribe(this.handleChange.bind(this))
    }
  }
  调用store.subscribe时传入了this.handleChange函数

  this.handleChange函数的作用是在收到新的store后手动更新传给react组件的store对象：
  handleChange = () => {
    const prevStore = this.state.currentStore;
    const nextStore = this.store.getState();
    // 这里通常会做一次深度对比，确定store是否更新
    this.setState({ currentStore: nextStore });
  }
  */


  /* 省略部分代码*/


  nextListeners.push(listener)   // 将事件监听函数添加到监听列表

  // store调用subscribe方法后会得到一个ubsubscribe方法用于取消事件监听
  return function unsubscribe() {
    // 找到当前监听的函数并使用splice方法移除
    const index = nextListeners.indexOf(listener)
    nextListeners.splice(index, 1)
  }
}
```

### dispatch
`dispatch`方法接受`action`作为参数,用于触发一个action,可以理解为手动触发事件
```javascript
function dispatch(action) {
  try {
    // 设置当前dispatch状态为true
    isDispatching = true

    // 将当前state和action作为参数传给当前reducer函数
    /*
    reducer函数应当类似于这种形式：
    function someReducer(state = {}, action) {
      switch (action.type) {
        case xxx:
          return Object.assign({}, state, {
            xx: xx,
          });
        default:
          return state;
      }
    }
    */

    // 调用后reducer函数会根据传递的action.type来对当前state做出相应修改最后返回一个新的state
    currentState = currentReducer(currentState, action)
  } finally {
    isDispatching = false
  }

  // 将所有订阅监听的函数赋值给listers
  const listeners = currentListeners = nextListeners
  for (let i = 0; i < listeners.length; i++) {
    const listener = listeners[i]
    // 分别执行lister
    listener()
  }
  /*
  到这一步基本实现：
    创建store=>subscribe
    订阅更新 =>reducer
    根据action.type完成更新 => 更新完执行事件监听函数
  */

  // 返回action
  return action
}
```

### replaceReducer
用于在redux热更新等场景中替换reducer
```javascript
function replaceReducer(nextReducer) {
  // 传入新的reducer函数并替换当前reducer
  currentReducer = nextReducer
  // 手动触发初始action
  dispatch({ type: ActionTypes.INIT })
}
```

实际上createStore做的事情很简单，创建store，添加订阅接口,手动触发事件,自动执行订阅函数,createStore最多接受三个参数,前两个分别是`reducer`和`preloadState`,第三个参数为`enhancer`,由于逻辑较为复杂，将在`applyMiddleware`部分单独解读.

下一篇分析`combineReducers.js`
