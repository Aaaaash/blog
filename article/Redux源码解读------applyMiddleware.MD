## redux源码解读第三篇---applyMiddleware
`applyMiddleware`用于应用自定义中间件，也是整个redux架构中的难点所在，代码非常简短，但是运用了一些较难理解的函数式编程范式，而middleware的多种使用方式也使得这短短的几十行代码非常难以理解

[查看applyMiddleware源码](https://github.com/reactjs/redux/blob/ab5cafdd50ee740261032cef94935c1f99354173/src/applyMiddleware.js)

> 这篇文章推荐深度使用redux及middleware之后再阅读,本文会结合之前createStore中遗漏的第三个参数enhancer一同解读

### 首先redux的middleware有两种使用方式

第一种通过调用`createStore`函数传入第三个参数`enhancer`,官方文档的解释是
> `enhancer` (Function): Store enhancer 是一个组合 store creator 的高阶函数，返回一个新的强化过的 store creator。这与 middleware 相似，它也允许你通过复合函数改变 store 接口。

实际在使用时这个参数就是事先调用`applyMiddleware`函数之后的返回结果


```javascript
  /*...省略部分代码*/
  const middlewares = [
    middlewarex,
    middlewarey,
  ];

  const enhaner = applyMiddleware(...middlewares);
  const store = createStore(reducers, {}, enhaner);
```

applyMiddleware源码中有这个`enhaner`函数的定义

```javascript
export default function applyMiddleware(...middlewares) {
  return (createStore) => (reducer, preloadedState, enhancer) => {
    /*省略*/
  }
}
```

使用es6箭头函数后这段代码看起来有点难懂，实际这里做了柯里化处理，翻译一下就是这样的
```javascript
function applyMiddleware(...middlewares) {
  // 第一次调用applyMiddleware(...middlewares)后返回的是一个接受createStore函数为参数的函数
  return function (createStore) {
    // 最终返回类似于createStore的增强型函数
    return function (reducer, preloadState, enhancer) {
      /* 省略*/
    }
  }
}
```

在调用createStore时，内部对第三个参数`enhancer`做了这样的处理
```javascript
if (typeof enhancer !== 'undefined') {
  if (typeof enhancer !== 'function') {
    throw new Error('Expected the enhancer to be a function.')
  }
  // 直接返回并把自身传给enhancer，并不会执行之后剩余的代码
  // 因为在applyMiddleware第一次调用后就返回了一个接受createStore做为参数的函数
  // 而传入createStore之后最终又返回了一个增强后的createStore
  // applyMiddleware中增强的这个createStore同样接受reducer、state、enhancer三个参数
  return enhancer(createStore)(reducer, preloadedState)
}
```

而在applyMiddleware中这个所谓增强型的createStore是这样定义的

```javascript
  // 再回头调用createStore传入参数创建一个store
  const store = createStore(reducer, preloadedState, enhancer)
  // 获取dispatch
  let dispatch = store.dispatch
  // 用户缓存middleware运行结果
  let chain = []

  // 获取middleware所需的api，分别为getState和dispatch
  const middlewareAPI = {
    getState: store.getState,
    dispatch: (...args) => dispatch(...args)
  }

  // 依次给每个middleware传入api并直接运行
  // 将运行结果储存在chain数组中
  chain = middlewares.map(middleware => middleware(middlewareAPI))

  /*
    最重要的一步
    用compose组合所有middleware的运行结果并创建一个新的dispatch函数
  */
  dispatch = compose(...chain)(store.dispatch)

  return {
    ...store,
    dispatch
  }
```

`compose`是函数式编程中将多个函数一起使用的过程，叫做组合函数，想象有两个功能不同的函数，第一个函数的返回值(输出)可以使是第二个函数的参数(输入),那么这两个函数可以被组合使用,类似于这样
```javascript
const funca = (a, b) => a + b;

const funcs = (num) => num * 2;

funcs(funca(1,2));  // 6

// 使用组合
const compose = (fn2, fn1) => (...args) => fn2(fn1(...args));

// 注意调用时最后调用的函数要最先传进去
// 调用顺序和传参顺序是相反的
const result = compose(funcs, funca);
result(1, 2); // 6
```
而如果现在我们有多个函数，恰好前一个函数的输出是后一个函数的输出，那么可以使用通用的`compose`函数，最简单的compose函数可以是这样
```javascript
const compose = (...fns) => result => {
  const list = fns.slice();
  while(list.length > 0) {
    result = list.pop()(result);
  }
  return result;
}

const result = compose(funcs, funca, ...func);
result(1, 2);
```

理解了这一点再来看redux中的[compose函数源码](https://github.com/reactjs/redux/blob/feb85574115ec2c7174527b126435abd6154481a/src/compose.js)

```javascript
export default function compose(...funcs) {
  if (funcs.length === 0) {
    return arg => arg
  }

  if (funcs.length === 1) {
    return funcs[0]
  }

  /*
  比之前实现方式更简单的是，redux直接用数组的reduce方法
  遍历funcs数组并按照顺序最后传进的函数被最先调用依次执行最后返回结果
  */
  return funcs.reduce((a, b) => (...args) => a(b(...args)))
}
```

经过这些步骤最终applyMiddleware返回了一个新的store，包含了增强后的dispatch函数，每次调用dispatch触发一个action都会经过每个middleware然后才到达reducer

而第二种调用方式是这样的
```javascript
const store = applyMiddleware(...middlewares)(createStore)(reducers, initialState);
/*
这里拆开来看
applyMiddleware(...middlewares)  ===  enhancer
enhancer(createStore) ====  createStore
createStore(reducers, initialState)
*/
```
经过上面的分析其实可以看得出来这种调用方式省去了先调用createStore传入enhancer又把createStore传给enhancer的过程，相当于直接执行createStore里的`enhancer(createStore)(reducer, preloadedState)`,之后运行过程就和第一种方式一样了

applyMiddleware作为redux中最重要的api之一，其运行过程中增强了createStore函数，并改造了store的dispatch方法，使action => reducer这个过程中middleware可以进行副作用操作
