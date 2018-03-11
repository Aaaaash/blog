import DoublyNode from './DoublyNode';

interface Element {
  name: string;
}

class DoublyLinkedList {
  length: number;
  head: DoublyNode;
  tail: DoublyNode;
  constructor() {
    this.length = 0;
    this.head = null;
    this.tail = null;
  }

  public insert(position: number, element: Element): boolean {
    if (position >= 0 && position <= this.length) {
      const node = new DoublyNode(element);
      let current = this.head;
      let previous;
      let index = 0;
  
      if (position === 0) {
        if (!this.head) {
          this.head = node;
          this.tail = node;
        } else {
          node.next = current;
          current.prev = node;
          this.head = node;
        }
      } else if (position === this.length) {
        current = this.tail;
        current.next = node;
        node.prev = current;
        this.tail = node;
      } else {
        while (index++ < position) {
          previous = current;
          current = current.next;
        }
        node.next = current;
        previous.next = node;
        debugger;
        current.prev = node;
        node.prev = previous;
      }
      this.length += 1;
      return true;
    } else {
      return false;
    }
  }
}

const doublyLinkedList = new DoublyLinkedList();
doublyLinkedList.insert(0, {name: 'sakura'});
console.log(doublyLinkedList);
doublyLinkedList.insert(1, {name: 'misaka'});
console.log(doublyLinkedList);


