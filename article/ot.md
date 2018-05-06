---
title: Monaco-Editor折腾记--多人协同编辑的实现
date: 2018-05-01 16:03:04
tags: monaco, 协作, ot
---
> 本系列文章为Monaco-Editor编辑器折腾、踩坑记录，涉及到协同编辑、代码提示、智能感知等功能的实现，不定期更新
## Monaco-Editor简介

[monaco-editor](https://github.com/Microsoft/monaco-editor)是微软开源的一款web端文本编辑器，也就是vscode内置的编辑器，扩展性很强，原生暴露了很多用于代码提示、高亮显示等API
> 仅为核心编辑器部分，不包含vscode的插件系统、文件数及terminal

## 基本用法

monaco的基本用法非常简单，导入核心依赖及相应语言依赖包，调用`monaco.editor.create`方法即可创建一个简单的编辑器



```javascript
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/editor/browser/controller/coreCommands';
import 'monaco-editor/esm/vs/editor/contrib/find/findController';

// php依赖包，提供代码语法解析及代码高亮等功能
import 'monaco-editor/esm/vs/basic-languages/php/php';
import 'monaco-editor/esm/vs/basic-languages/php/php.contribution';

const container = document.querySelector('#container');


const editor = monaco.editor.create(container, {
  language: 'php',
  glyphMargin: true,
  lightbulb: {
    enabled: true,
  },
  theme: 'vs-dark',
});

```

monaco的文档是基于typescript的类型声明及注释生成的，所以要开发高级功能大多数情况下需要翻阅monaco.d.ts文件来查找api定义及用法（参考如何画马）😆



## 多人协同编辑

多人协同编辑，顾名思义就是像Google Doc以及石墨文档、腾讯文档等在线文档产品一样可以两人或两人以上同时编辑同一个文件，双方编辑操作互不干扰且能够自动解决冲突，这里不讨论代码编辑器实时协作功能的必要性，只谈实现。

协同编辑基本实现思路有两种

* OT(Operational-Transformation)
* peer-to-peer

### OT
`Operational-Transformation`是指对文档编辑以及同时编辑冲突解决的一类技术，不仅仅是一个算法，ot将文档变更表示为三类操作（Operational）
* Insert 插入
* Retain 移动光标
* Delete 删除

举例来说，对文档的插入操作可以看做一个`insert operational`:
```javascript
// 如在第10个字符的位置插入‘hello’
retain(10);
insert('hello')
```
