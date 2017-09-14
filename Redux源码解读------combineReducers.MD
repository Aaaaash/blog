## redux源码解读第二篇---combineReducers
`combineReducer`是redux中相当重要的一个函数，它接受一个对象作为参数，包含一组子reducer，当应用较为庞大时需要按照某种规则切分reducer，combineReducer就是用来组合这些reducer给`createStore`生成store树的

> createStore函数的第一个参数是可以返回一个state对象的reducer

以下对部分类型判断以及错误信息做了省略，可结合[官方源码combineReducers](https://github.com/reactjs/redux/blob/ab5cafdd50ee740261032cef94935c1f99354173/src/combineReducers.js)一同食用

```javascript
export default function combineReducers(reducers) {
  // 使用Object.keys方法将reducers中可枚举的属性生成一个keys数组
  const reducerKeys = Object.keys(reducers)
  const finalReducers = {}
  for (let i = 0; i < reducerKeys.length; i++) {
    const key = reducerKeys[i]
    /*省略部分类型判断*/
    if (typeof reducers[key] === 'function') {
      // 遍历keys数组，并把相应的subreducer赋值给finalReducers
      finalReducers[key] = reducers[key]
    }
  }

//第一步其实只是简单的将reducers对象中type为’function’的subreducer筛选出来赋值给finalReducers对象


  // 将finalReducers中可枚举的属性生成一个keys数组
  const finalReducerKeys = Object.keys(finalReducers)

  // 这里返回最终合成的reducer，注意这个reducer将会被传递给createStore函数

  /* !!!!!!!!!! 划重点
  这个函数不同于之前例子中的reducer

  将它称为reducer函数是因为他们会有相同的作用

  既传入默认state和action将会生成一个计算后的state对象

  不同之处在于： 这个函数并不需要根据action.type使用相应的策略更新state

  只是简单依次执行所有reducer并将所有reducer生成的state合并起来返回给store

  并且它所接受的state参数也是所有reducer生成的state组合后产生的总的state

  !!!!!!!!!!
  (东厂厂公)
  */
  
  return function combination(state = {}, action) {

    let hasChanged = false
    // 最终产生的state树
    const nextState = {}
    for (let i = 0; i < finalReducerKeys.length; i++) {
      const key = finalReducerKeys[i]
      // 根据key获取相应的subReducer
      const reducer = finalReducers[key]
      // 根据key获取相应的subState
      const previousStateForKey = state[key]

      /*
      这里直接执行reducer函数, 传入subState和action
      这个循环内会依次执行subReducer函数
      第一个参数state会根据每个reducer的key不同来进行筛选
      第二个参数action不出意外会每个reducer都传一遍，有相应策略则会更新
      所以不同action的type不能相同，否则会出现状态混乱的情况
      */
      const nextStateForKey = reducer(previousStateForKey, action)

      // 把新的state赋值给nextState对象
      nextState[key] = nextStateForKey
      hasChanged = hasChanged || nextStateForKey !== previousStateForKey
    }
    // 简单对比后返回最终state
    return hasChanged ? nextState : state
  }
}

```

最后返回的`combination`函数通过引用`finalReducers`对象形成了一个闭包，当这个函数被返回给createStore调用后，内部依然可以访问finalReducers，而createStore内部dispatch调用reducer时也会把state对象传递进去，再通过reducer的策略更新并返回，形成一个闭环
