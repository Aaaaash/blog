import Node from './Node';

function preOrderTraverseNode(node: Node, callback: Function) {
  if (node !== null) {
    callback(node.key);
    preOrderTraverseNode(node.left, callback);
    preOrderTraverseNode(node.right, callback);
  }
}

export default preOrderTraverseNode;
