## 利用ImmutableJS实现Pure-Render
`PureRender`是react应用中最常见的优化方式之一，顾名思义是纯·渲染，React的核心思想可以用一个表达式来概括

`view = f(model)`

这个很简单的表达式阐述了一个最基本的思想，数据的更新触发视图的更新，如果把它看做一个[纯函数](https://medium.com/javascript-scene/master-the-javascript-interview-what-is-a-pure-function-d1c076bec976)，那么给定相同的输入必定得到相同的输出，简而言之就是如果state&props没有改变，理论上讲组件不会重新渲染

React生命周期有一个函数`shouldComponentUpdate`,看名字就知道这个函数决定了组件要不要更新（重新渲染），默认情况下这个函数始终返回`true`

但是过多的rerender势必会引起性能问题，所以在必要的情况下开发者需要自己手动实现shouldComponentUpdate:
```javascript
shouldComponentUpdate(nextProps, nextState) {
  return this.props.value !== nextProps.value;
}
```
事实上在较新版本的React中内置了一个已经实现shouldComponentUpdate方法的类，叫做`PureComponent`,使用时只要将原先的Component替换为PureComponent即可
```javascript
import react, { PureComponent } from 'react';
class MyPage extends PureComponent {
  // your code
}
```
然而不管是上面那个简单的例子，还是PureComponent，它们实现的方式很简单，都是浅比较

对于基本数据类型，只需要对比值，而引用类型则只对比引用地址，试想一下如果有一个长度为50+的数组，单纯的`!==`浅对比就完全没有任何用处了，因为数组是引用类型，每次传来新的数组都是不同的引用，始终还是返回true，但是深对比带来的开销更大，到底如何取舍？

答案是[ImmutableData](https://github.com/facebook/immutable-js)
### 什么是ImmutableData？
> ImmutableData（不可变数据）就是指一旦创建就不能被改变的数据
上对ImmutableData的任何修改都会返回一个新的immutable对象

Immutablejs实现了List、Map等常用数据类型，分别对应js中的数组和对象

简单来说，当对一个immutabledata进行增删改操作时，并不会修改原本的数据，而是生成了新的immutable对象，如果没有任何修改则返回原对象

基本用法可参考[官方文档](http://facebook.github.io/immutable-js/)
### React中怎么用？
可以将组件state中的数据转为immutabledata，也可以将redux的state转为immutabledata
```javascript
// state
import React from 'react';
import { fromJS } from 'immutable';

class Dmoe extends PureComponent {
  state = {
    someDeepData: fromJS({
      name: 'misaka',
      age: 20,
    }),
  }

  handleChangeAge = () => {
    const { someDeepData } = this.state;
    const prevAge = someDeepData.get('age');
    this.setState({
      someDeepData: someDeepData.set('age', prevAge - 1),
    });
  }

  render() {
    const { someDeepData } = this.state;
    return (<div>
      <h1>{someDeepData.get('name')}</h1>
      <button onClick={this.handleChangeAge}>-1s</button>
    </div>);
  }
}
```
[CodeSandbox在线示例](https://codesandbox.io/s/3rq3orqom6)

例如一个父子组件嵌套，父组件数据改变导致自身rerender从而引发子组件一起rerender，这种情况使用ImmutableData + PureComponent则可以很好的避免子组件的重复渲染
```javascript
class Child extends PureComponent {
  render() {
    const { info } = this.props;
    console.log("render");
    return (
      <div>
        <h1>my name is {info.name}</h1>
        <p>i'm {info.age} years old!</p>
      </div>
    );
  }
}

class Parent extends PureComponent {
  state = {
    info: fromJS({
      name: "misaka",
      age: 10
    }),
    age: 20
  };

  handleChangeAge = () => {
    const { age } = this.state;
    this.setState({
      age: age + 1
    });
  };
  render() {
    const { info, age } = this.state;
    return (
      <div>
        <Child info={info} />
        I'm Sakura, {age} years old. this is my child!
        <button onClick={this.handleChangeAge}>+1s</button>
      </div>
    );
  }
}

```

[CodeSanBox在线示例](https://codesandbox.io/s/n9z3z2k0op)

### refs:
* [Master the JavaScript Interview: What is a Pure Function?](https://medium.com/javascript-scene/master-the-javascript-interview-what-is-a-pure-function-d1c076bec976)
* [ReactShallowRenderer.js](https://github.com/facebook/react/blob/2a1b1f3094e524338b3eb3de51b23921576f02f5/packages/react-test-renderer/src/ReactShallowRenderer.js#L170)
* [什么时候要在React组件中写shouldComponentUpdate？](http://www.infoq.com/cn/news/2016/07/react-shouldComponentUpdate)
* [Should I use shouldComponentUpdate?](http://jamesknelson.com/should-i-use-shouldcomponentupdate/)
* [Optimizing Performance](https://reactjs.org/docs/optimizing-performance.html)
* [Immutable详解及React中实践](https://github.com/camsong/blog/issues/3)
