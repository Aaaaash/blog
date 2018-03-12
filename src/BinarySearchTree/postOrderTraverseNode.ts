import Node from './Node';


function postOrderTraverseNode(node: Node, callback: Function) {
  if (node !== null) {
    postOrderTraverseNode(node.left, callback);
    postOrderTraverseNode(node.right, callback);
    callback(node.key);
  }
}

export default postOrderTraverseNode;
