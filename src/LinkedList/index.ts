import Node from './Node';

interface Element {
  name: string;
}

class LinkedList {
  length: number;
  head: Node;
  constructor() {
    this.length = 0;
    this.head = null;
  }
  public append(element: Element) {
    let node = new Node(element);
    let current;
    // 列表为空时添加为第一个元素
    if (this.head === null) {
      this.head = node;
    } else {
      current = this.head;
      while(current.next) {
        current = current.next;
      }
      current.next = node;
    }
    this.length += 1;
  }

  public insert(position: number, element: Element): boolean {
    if (position >= 0 && position <= this.length) {
      const node = new Node(element);
      let current = this.head;
      let previous;
      let index = 0;
  
      // 当position为0 则在第一个位置添加新元素
      if (position === 0) {
        node.next = current;
        this.head = node;
      } else {
        while(index++ < position) {
          previous = current;
          current = current.next;
        }
        node.next = current;
        previous.next = node;
      }
      this.length += 1;
      return true;
    } else {
      return false;
    }
  }

  public removeAt(position: number): Element{
    if (position > -1 && position < this.length) {
      let current = this.head;
      let previous;
      let index = 0;

      // 移除第一项
      if (position === 0) {
        this.head = current.next;
      } else {
        /**
         * 移除列表最后一项或中间某一项时, 需要依靠一个细节来迭代列表,直到到达目标位置
         * 使用一个内部递增的index变量, current变量为所循环列表的当前元素进行引用
         */
        while (index++ < position) {
          previous = current;
          current = current.next;
        }
        previous.next = current.next;
      }
      this.length -= 1;
      return current.element;
    } else {
      return null;
    }
  }

  public toString(): string {
    let current = this.head;
    let string = '';
  
    while(current) {
      string += current.element.name + (current.next ? '\n' : '');
      current = current.next;
    }
    return string;
  }


  public indexOf(element: Element) {
    let current = this.head;
    let index = -1;
    while(current) {
      if (element === current.element) {
        return index;
      }
      index += 1;
      current = current.next;
    }
    return -1;
  }

  public remove(element: Element) {
    const index = this.indexOf(element);
    return this.removeAt(index);
  }

  public isEmpty() {
    return this.length === 0;
  }
  
  public size() {
    return this.length;
  }
  
  public getHead() {
    return this.head;
  }

  // public remove(element: Node){}
  // public indexOf(element: Node){}
  // public isEmpty(): boolean{}
  // public size(): number{}
  // public getHead(): Node{}
  // public toString(): string {}
  // public print() {}
}

const linkedList = new LinkedList();
linkedList.append({name: 'sakura'});
linkedList.append({name: 'misaka'});
linkedList.append({name: 'mikoto'});
linkedList.append({name: 'yahaha'});
console.log(linkedList);
// const data = linkedList.removeAt(0);
linkedList.insert(2, {name: 'javascript'});
console.log(linkedList);
console.log(linkedList.toString());
