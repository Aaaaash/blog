import Node from './Node';
import insertNode from './insertNode';
import inOrderTraverseNode from './inOrderTraverseNode';
import preOrderTraverseNode from './preOrderTraverseNode';
import postOrderTraverseNode from './postOrderTraverseNode';

class BinarySearchTree {
  root: Node;
  constructor() {
    this.root = null;
  }

  public insert(key: any) {
    const node = new Node(key);
    if (this.root === null) {
      this.root = node;
    } else {
      insertNode(this.root, node);
    }
  }

  public inOrderTraverse(callback: Function) {
    inOrderTraverseNode(this.root, callback);
  }

  public preOrderTraverse(callback: Function) {
    preOrderTraverseNode(this.root, callback);
  }

  public postOrderTraverse(callback: Function) {
    postOrderTraverseNode(this.root, callback);
  }  
}

const tree = new BinarySearchTree();

tree.insert(10);
tree.insert(23);
tree.insert(27);
tree.insert(1);
tree.insert(7);
tree.insert(231);
console.log('中序遍历');
tree.inOrderTraverse((key: any) => {
  console.log(key);
});
console.log('先序遍历');
tree.preOrderTraverse((key: any) => {
  console.log(key);
});
console.log('后序遍历');
tree.postOrderTraverse((key: any) => {
  console.log(key);
});
// console.log(tree);
