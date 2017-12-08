## 基础

### 组件
React组件大致可分为三种写法
一种es6的class语法，继承React.Component类实现带有完整生命周期的组件
```javascript
import React, { Component } from 'react';

export default class SingleComponent extends Component {
  /*
    包含一些生命周期函数、内部函数以及变量等
  */
  render() {
    return (<div>{/**/}</div>)
  }
}
```
第二种是`无状态组件`，也叫函数式组件
```javascript
const SingleComponent = (props) => (
  <div>{props.value}</div>
);
export default SingleComponent;
```
还有一种较为特殊，叫[`高阶组件`](https://facebook.github.io/react/docs/higher-order-components.html)，严格来说高阶组件只是用来包装以上两种组件的一个`高阶函数`
```javascript
const HighOrderComponent = (WrappedComponent) => {
  class Hoc extends Component {
    /*包含一些生命周期函数*/
    render() {
      return (<WrappedComponent {...this.props} />);
    }
  }
  return Hoc;
}
```
高阶组件的原理是接受一个组件并返回一个包装后的组件，可以在返回的组件里插入一些生命周期函数做相应的操作，高阶组件可以使被包装的组件逻辑不受干扰从外部进行一些扩展

### props和state
react中组件自身的状态叫做state,在es6+的类组件中可以使用很简单的语法进行初始化
```javascript
export default class Xxx extends Component {
  state = {
    name: 'sakura',
  }
  render() {
    const { name } = this.state;
    return (<div>{name}</div>);
  }
}
```

state可以赋值给某个标签，如果需要更新state可以调用`this.setState()`传入一个对象，通过这个方法修改state之后绑定了相应值的元素也会触发渲染，这就是简单的数据绑定

不能通过`this.state.name = 'xxx'`的方式修改state，这样就会失去更新state同时相应元素改变的效果

`setState`函数是react中较为重要也是使用频率较高的一个api，它接受最多两个参数，第一个参数是要修改的state对象，第二个参数为一个回调函数，会在state更新操作完成后自动调用，所以setState函数是`异步`的。
调用this.setState之后react并没有立刻更新state，而是将几次连续调用setState返回的对象合并到一起，以提高性能，以下代码可能不会产生期望的效果
```javascript
class SomeButton extends Component {
  state = {
    value: 1,
  }
  handleClick = () => {
    const { value } = this.state;
    this.setState({ value: value + 1 });
    this.setState({ value: value + 1 });
    this.setState({ value: value + 1 });
    this.setState({ value: value + 1 });
  }
  render() {
    const { value } = this.state;
    return (<div>
      <span>{vlaue}</span>
      <button onClick={this.handleClick}>click!</button>
    </div>);
  }
}
```
实际上这里并没有对value进行4次+1的操作，react会对这四次更新做一次合并，最终只保留一个结果，类似于
```javascript
Object.assign({},
  { value: value + 1 },
  { value: value + 1 },
  { value: value + 1 },
);
```
并且因为setState是异步的，所以不能在调用之后立马获取新的state，如果要用只能给setState传入第二个参数回调函数来获取
```javascript
/*省略部分代码*/
this.setState({
  value: 11,
}, () => {
  const { value } = this.state;
  console.log(value);
})
```

`props`是由父元素所传递给给子元素的一个属性对象，用法通常像这样
```javascript
class Parent extends Component {
  /*父组件的state中保存了一个value*/
  state = {
    value: 0,
  };

  handleIncrease = () => {
    const { value } = this.state;
    this.setState({ value: value + 1 });
  }

  render() {
    const { value } = this.state;
    // 通过props传递给子组件Child，并传递了一个函数，用于子组件点击后修改value
    return (<div>
      <Child value={value} increase={this.handleIncrease} />
    </div>)
  }
}

// 子组件通过props获取value和increase函数
const Child = (props) => (
  <div>
    <p>{props.value}</p>
    <button onClick={props.increase}>click!</button>
  </div>
);
```
props像一个管道，父组件的状态通过props这个管道流向子组件，这个过程叫做`单向数据流`

> react中修改state和props都会引起组件的重新渲染

### 组件的生命周期
生命周期是一组用来表示组件从渲染到卸载以及接收新的props以及state声明的特殊函数

![react生命周期函数执行过程](https://www.codevoila.com/uploads/images/201607/reactjs_component_lifecycle_functions.png)
这张图展示了react几个生命周期函数执行的过程，可以简单把组件的生命周期分为三个阶段，共包含9个生命周期函数，在不同阶段组件会自动调用

* 挂载
  * componentWillMount
  * render
  * componentDidMount
* 更新
  * componentWillReceiveProps
  * shouldComponentUpdate
  * componentWillUpdate
  * render
  * componentDidUpdate
* 卸载
  * componentWillUnmount

#### 挂载--componentWillMount
这个阶段组件准备开始渲染DOM节点，可以在这个方法里做一些请求之类的操作，但是因为组件还没有首次渲染完成，所以并不能拿到任何dom节点
#### 挂载--render
正式渲染，这个方法返回需要渲染的dom节点，并且做数据绑定，这个方法里不能调用`this.setState`方法修改state，因为setState会触发重新渲染，导致再次调用render函数触发死循环
#### 挂载--componentDidMount
这个阶段组件首次渲染已经完成，可以拿到真实的DOM节点，也可以在这个方法里做一些请求操作，或者绑定事件等等

#### 更新--componentWillReceiveProps
当组件收到新的props和state且还没有执行render时会自动触发这个方法，这个阶段可以拿到新的props和state，某些情况下可能需要根据旧的props和新的props对比结果做一些相关操作，可以写在这个方法里，比如一个弹窗组件的弹出状态保存在父组件的state里通过props传给自身，判断这个弹窗弹出可以这样写
```javascript
class Dialog extends Component {
  componentWillReveiceProps(nextProps) {
    const { dialogOpen } = this.props;
    if (nextProps.dialogOpen && nextProps.dialogOpen !== dialogOpen) {
      /*弹窗弹出*/
    }
  }
}
```
#### 更新--shouldComponentUpdate
`shouldComponentUpdate`是一个非常重要的api。react的组件更新过程经过以上几个阶段，到达这个阶段需要确认一次组件是否真的需要根据新的状态再次渲染，确认的依据就是对比新旧状态是否有所改变，如果没有改变则返回false，后面的生命周期函数不会执行，如果发生改变则返回true，继续执行后续生命周期，而react默认就返回true

所以可以得出shouldComponentUpdate可以用来优化性能，可以手动实现shouldComponentUpdate函数来对比前后状态的差异，从而阻止组件不必要的重复渲染
```javascript
class Demo extends Component {
  shouldComponentUpdate(nextProps, nextState) {
    return this.props.value !== nextProps.value;
  }
}
```
这段代码是一个最简单的实现，通过判断`this.props.value`和`nextProps.value`是否相同来决定组件要不要重新渲染，但是实际项目中数据复杂多样，并不仅仅是简单的基本类型，可能有对象、数组甚至是更深嵌套的对象，而数据嵌套越深就意味着这个方法里需要做更深层次的对比，这对react性能开销是极大的，所以官方更推荐使用[Immutable.js](https://github.com/facebook/immutable-js)来代替原生的JavaScript对象和数组

由于immutablejs本身是不可变的，如果需要修改状态则返回新的对象，也正因为修改后返回了新对象，所以在shouldComponentUpdate方法里只需要对比对象的引用就很容易得出结果，并不需要做深层次的对比。但是使用immutablejs则意味着增加学习成本，所以还需要做一些取舍

#### 更新--componentWillUpdate
这个阶段是在收到新的状态并且shouldComponentUpdate确定组件需要重新渲染而还未渲染之前自动调用的，在这个阶段依然能获取到新的props和state，是组件重新渲染前最后一次更新状态的机会

#### 更新--render
根据新的状态重新渲染

#### 更新--componentDidMount
重新渲染完毕

#### 卸载--componentWillmount
组件被卸载之前，在这里可以清除定时器以及解除某些事件

### 组件通信
很多业务场景中经常会涉及到父=>子组件或者是子=>父组件甚至同级组件间的通信，父=>子组件通信非常简单，通过props传给子组件就可以。而子=>父组件通信则是大多数初学者经常碰到的问题
假设有个需求，子组件是一个下拉选择菜单，父组件是一个表单，在菜单选择一项之后需要将值传给父级表单组件，这是典型的子=>父组件传值的需求
```javascript
const list = [
  { name: 'sakura', id: 'x0001' },
  { name: 'misaka', id: 'x0003' },
  { name: 'mikoto', id: 'x0005' },
  { name: 'react', id: 'x0002' },
];

class DropMenu extends Component {
  handleClick = (id) => {
    this.props.handleSelect(id);
  }

  render() {
    <MenuWrap>
      {list.map((v) => (
        <Menu key={v.name} onClick={() => this.handleClick(v.id)}>{v.name}</Menu>
      ))}
    </MenuWrap>
  }
}

class FormLayout extends Component {
  state = {
    selected: '',
  }
  handleMenuSelected = (id) => {
    this.setState({ selected: id });
  }
  render() {
    <div>
      <MenuWrap handleSelect={this.handleMenuSelected} />
    </div>
  }
}
```
这个例子中，父组件`FormLayout`将一个函数传给子组件，子组件的`Menu`点击后调用这个函数并把值传进去，而父组件则收到了这个值，这就是简单的子=>父组件通信

而对于更为复杂的同级甚至类似于叔侄关系的组件可以通过状态提升的方式互相通信，简单来说就是如果两个组件互不嵌套，没有父子关系，这种情况下，可以找到他们上层公用的父组件，将state存在这个父组件中，再通过props给两个组件传入相应的state以及对应的回调函数即可

## 路由
React中最常用的路由解决方案就是[React-router](https://reacttraining.com/react-router/),react-router迄今为止已经经历了四个大版本的迭代，每一版api变化较大，本文将按照最新版react-router-v4进行讲解

### 基本用法
使用路由，要先用`Router`组件将App包起来，并把history对象通过props传递进去,最新版本中history被单独分出一个包，使用的时候需要先引入。对于同级组件路由的切换，需要使用Switch组件将多个Route包起来，每当路由变更，只会渲染匹配到的一个组件

```javascript
import ReactDOM from 'react-dom';
import createHistory from 'history/createBrowserHistory';
import { Router } from 'react-router';

import App from './App';

const history = createHistory();

ReactDOM.render(
  <Router history={history}>
    <App />
  </Router>,
  element,
);

// App.js
//... 省略部分代码

import {
  Switch, Route,
} from 'react-router';

class App extends Component {
  render() {
    return (
      <div>
        <Switch>
          <Route exact path="/" component={Dashboard} />
          <Route path="/about" component={About} />
        </Switch>
      </div>
    );
  }
}
```
[CodesanBox在线示例](https://codesandbox.io/s/mj9kp308xj)

## 状态管理

> 关于单页面应用状态管理可以先阅读民工叔这篇文章[单页应用的数据流方案探索](https://github.com/xufei/blog/issues/47)

React生态圈的状态管理方案由facebook提出的[flux](https://github.com/facebook/flux)架构为基础，并有多种不同实现，而最为流行的两种是
  * [Mobx](https://github.com/mobxjs/mobx)
  * [Redux](https://github.com/reactjs/redux)

![flux架构](https://facebook.github.io/flux/img/flux-simple-f8-diagram-with-client-action-1300w.png)

### Flux
> Flux is the application architecture that Facebook uses for building client-side web applications. It complements React's composable view components by utilizing a unidirectional data flow. It's more of a pattern rather than a formal framework, and you can start using Flux immediately without a lot of new code.

>Flux是facebook用于构建web应用的一种架构，它通过使用单向数据流补充来补充React的组件，它只是一种模式，而不是一个正式的框架

首先，Flux将一个应用分为三个部分：
  * dispatcher
  * stores
  * views

#### dispatcher
`dispatcher`是管理Flux应用中所有数据流的中心枢纽，它的作用仅仅是将actions分发到stores，每一个store都监听自己并且提供一个回调函数，当用户触发某个操作时，应用中的所有store都将通过监听的回调函数来接收这个操作

[facebook官方实现的Dispatcher.js](https://github.com/facebook/flux/blob/520a60c18aa3e9af59710d45cd37b9a6894a7bce/src/Dispatcher.js)

#### stores
stores包含应用程序的状态和逻辑，类似于传统MVC中的model，stores用于存储应用程序中特定区域范围的状态

一个store向dispatcher注册一个事件并提供一个回调函数，这个回调函数可以接受action作为参数，并且基于actionType来区分并解释操作。在store中提供相应的数据更新函数，在确认更新完毕后广播一个事件用于应用程序根据新的状态来更新视图
```javascript
// Facebook官方实现FluxReduceStore的用法
import { ReduceStore, Dispatcher } from 'flux';
import Immutable from 'immutable';
const dispatch = new Dispatcher();

class TodoStore extends ReduceStore {
  constructor() {
    super(dispatch);
  }
  getInitialState() {
    return Immutable.OrderedMap();
  }
  reduce(state, action) {
    switch(action.type) {
      case 'ADD_TODO':
        return state.set({
          id: 1000,
          text: action.text,
          complete: false,
        });
      default:
        return state;
    }
  }
}

export default new TodoStore();

```
#### views
React提供了views所需的可组合以及可以自由的重新渲染的视图，在React最顶层组件里，通过某种粘合代码从stores中获取所需数据，并将数据通过props传递到它的子组件中，我们就可以通过控制这个顶层组件的状态来管理页面任何部分的状态

Facebook官方实现中有一个[FluxContainer.js](https://github.com/facebook/flux/blob/520a60c18aa3e9af59710d45cd37b9a6894a7bce/src/container/FluxContainer.js)用于连接store与react组件，并在store更新数据后刷新组件状态更新视图。基本原理是用一个高阶组件传入Stores和组件需要的state与方法以及组件本身，返回注入了state和action方法的组件，基本用法像这样
```javascript
import TodoStore from './TodoStore';
import Container from 'flux';
import TodoActions from './TodoActions';

// 可以有多个store
const getStores = () => [TodoStore];

const getState = () => ({
  // 状态
  todos: TodoStore.getState(),

  // action
  onAdd: TodoActions.addTodo,
});

export default Container.createFunctional(App, getStore, getState);
```
[CodeSanbox在线示例](https://codesandbox.io/s/lpm0zyp3y7)
后续会补充flux官方实现的源码解析
### Redux
[Redux](https://github.com/reactjs/redux)是由[Dan Abramov](https://github.com/gaearon)对Flux架构的另一种实现，它延续了flux架构中`views`、`store`、`dispatch`的思想，并在这个基础上对其进行完善，将原本store中的reduce函数拆分为`reducer`，并将多个stores合并为一个store，使其更利于测试
![redux](https://camo.githubusercontent.com/c24115bb93ccefa396aee0be23f06daa3776105a/687474703a2f2f7777772e6265626574746572646576656c6f7065722e636f6d2f696d672f706f73745f696d672f7272652d322e706e67)
[The Evolution of Flux Frameworks这篇文章](https://medium.com/@dan_abramov/the-evolution-of-flux-frameworks-6c16ad26bb31)，是他对原Flux架构的看法以及他的改进
>The first change is to have the action creators return the dispatched action.What looked like this:
```javascript

export function addTodo(text) {
  AppDispatcher.dispatch({
    type: ActionTypes.ADD_TODO,
    text: text
  });
}
```
> can look like this instead:
```javascript
export function addTodo(text) {
  return {
    type: ActionTypes.ADD_TODO,
    text: text
  };
}
```
stores拆分为单一store和多个reducer
```javascript
const initialState = { todos: [] };
export default function TodoStore(state = initialState, action) {
  switch (action.type) {
  case ActionTypes.ADD_TODO:
    return { todos: state.todos.concat([action.text]) };
  default:
    return state;
}
```

Redux把应用分为四个部分
  * views
  * action
  * reducer
  * store

views可以触发一个action，reducer函数内部根据action.type的不同来对数据做相应的操作，最后返回一个新的state，store会将所有reducer返回的state组成一个state树，再通过订阅的事件函数更新给views

#### views
react组件作为应用中的视图层
#### action
action是一个简单的JavaScript对象，包含一个type属性以及action操作需要用到的参数,推荐使用`actionCreator`函数来返回一个action，actionCreator函数可以作为state传递给组件
```javascript
function singleActionCreator(payload) {
  return {
    type: 'SINGLE_ACTION',
    paylaod,
  };
}
```

#### reducer
reducer是一个纯函数，简单的根据指定输入返回相应的输出，reducer函数不应该有副作用，并且最终需要返回一个state对象，对于多个reducer，可以使用combineReducer函数组合起来
```javascript
function singleReducer(state = initialState, action) {
  switch(action.type) {
    case 'SINGLE_ACTION':
      return { ...state, value: action.paylaod };
    default:
      return state;
  }
}

function otherReducer(state = initialState, action) {
  switch(action.type) {
    case 'OTHER_ACTION':
      return { ...state, data: action.data };
    default:
      return state;
  }
}

const rootReducer = combineReducer([
  singleReducer,
  otherReducer,
]);

```
#### store
redux中store只有一个，通过调用createStore传入reducer就可以创建一个store，并且这个store包含几个方法，分别是subscribe， dispatch，getState，以及replaceReducer，subscribe用于给state的更新注册一个回调函数，而dispatch用于手动触发一个action，getState可以获取当前的state树，replaceReducer用于替换reducer，要在react项目中使用redux，必须再结合react-redux

```javascript
import { connect } from 'react-redux';
const store = createStore(rootReducer);

// App.js
class App extends Component {
  render() {
    return (
      <div>
        test
      </div>
    );
  }
}

const mapStateToProps = (state) => ({
  vlaue: state.value,
  data: state.data,
});

const mapDispatchToProps = (dispatch) => ({
  singleAction: () => dispatch(singleActionCreator());
});

export default connect(mapStateToProps, mapDispatchToProps)(App);

// index.js
import { Provider } from 'react-redux';

ReactDOM.render(
  <Provider store={store}>
    <APP />
  </Provider>,
  element,
);
```
[CodeSanbox在线示例](https://codesandbox.io/s/oj7px08qy9)
### Redux异步
Redux本身从action==>reducer==>store==>views这个过程是完全同步的，如果要进行异步操作比如请求接口，那么异步请求写在哪里是个问题，actioncreator是一个只返回action的函数，而reducer又是一个纯函数，原则上最好不要有其他操作

基于这个问题，redux很巧妙的实现了`中间件`机制,中间件的用法可以看我的这篇文章了解[applymiddleware](https://github.com/SakuraAsh/blog/blob/master/Redux%E6%BA%90%E7%A0%81%E8%A7%A3%E8%AF%BB------applyMiddleware.MD)

目前较为常用的redux中间件是[redux-saga](https://github.com/redux-saga/redux-saga)、[redux-observable](https://github.com/redux-saga/redux-saga)

用法可以参考社区的这篇文章[Redux异步方案选型](https://zhuanlan.zhihu.com/p/24337401)
