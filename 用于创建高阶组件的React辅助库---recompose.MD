## Recompose 用于创建函数式组件和高阶组件的react工具库
[Recompose项目地址](https://github.com/acdlite/recompose)

`recompose`可以看做React技术栈的`lodash`，提供了许多用于创建react函数式组件和高阶组件的工具函数，包括`compose`、`branch`、`withState`、`withStateHandlers`等

### 基本用法

#### withState
```javascript
const enhance = withState('counter', 'setCounter', 0)
const Counter = enhance(({ counter, setCounter }) =>
  <div>
    Count: {counter}
    <button onClick={() => setCounter(n => n + 1)}>Increment</button>
    <button onClick={() => setCounter(n => n - 1)}>Decrement</button>
  </div>
)
```
#### 使用pure和onlyUpdateForKeys实现函数式组件的shouldComponentUpdate
```javascript

// 无状态组件
const ExpensiveComponent = ({ propA, propB }) => <div>{/*xxx*/}</div>

// 使用pure函数(效果等同于 extends PureComponent)
const OptimizedComponent = pure(ExpensiveComponent)

// 指定props更新
const HyperOptimizedComponent = onlyUpdateForKeys(['propA', 'propB'])(ExpensiveComponent)
```

### 高级用法

#### compose组合
`compose`方法和之前redux源码中的compose方法一模一样，因为react的高阶组件实际上是`接受组件作为参数并最终返回一个组件的高阶函数`，所以对于相同的组件支持使用compose函数直接组合不同的高阶组件，类似于这样一种方式
```javascript
func0 = (component) => finalComponent;
func1 = (component) => finalComponent;
func2 = (component) => finalComponent;

func0(func1(func2(Component)));
```
如果直接看recompose的源代码实现会发现，很多方法比如`withState`、`withProps`、`withHandles`、`withContext`都是直接返回一个高阶组建的，他们都长这样

```javascript
const withXXX = (...args) => (BaseComponent) => {
  class WithXXX extends PureComponent {
    // 内部实现
  }
  return WithXXX;
}
```

对于这样的高阶组件，就可以使用compose方法来进行组合，compose函数的参数个数没有限制，但必须是一个高阶组件(满足输入一个组件并返回一个新组件)，使用compose函数就可以组合这些方法，包装一个纯函数组件，利用这个办法可以把组件的副作用剥离出来，使外部业务逻辑不会干扰组件自身

```javascript
// Toggle.js
const Toggle = ({ title, message, toggleVisibility, isVisible, name }) => (
  <div>
    <h1>{title}</h1>
    {isVisible ? <p>{"I'm visible"}</p> : <p>{'Not Visible'}</p>}
    <p>{message}</p>
    <p>{name}</p>
    <button onClick={toggleVisibility}> Click me! </button>
  </div>
);


// 使用recompose包装Toggle
export default compose(
  withState('isVisible', 'toggleVis', false),
  withHandlers({
    toggleVisibility: ({ toggleVis, isVisible }) => (event) =>
      toggleVis(!isVisible),
  }),
  withProps(({ isVisible }) => ({
    title: isVisible
      ? 'This is the visible title'
      : 'This is the default title',
    message: isVisible
      ? 'Hello I am Visible'
      : 'I am not visible yet, click the button!',
  })),
)(Toggle);
```
