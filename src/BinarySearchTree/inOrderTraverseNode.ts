import Node from './Node';

function inOrderTraverseNode(node: Node, callback: Function) {
  if (node !== null) {
    inOrderTraverseNode(node.left, callback);
    callback(node.key);
    inOrderTraverseNode(node.right, callback);
  }
}

export default inOrderTraverseNode;
