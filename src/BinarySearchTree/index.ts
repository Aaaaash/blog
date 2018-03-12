import Node from './Node';
import insertNode from './insertNode';

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
}

const tree = new BinarySearchTree();

tree.insert(10);
tree.insert(23);
tree.insert(27);
tree.insert(1);
console.log(tree);
