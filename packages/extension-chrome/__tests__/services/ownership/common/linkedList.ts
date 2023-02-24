import { LinkedList } from '../../../../src/services/ownership/linkedList';

describe('linkedList', () => {
  it('should headNode return empty when the list is empty', () => {
    const list = new LinkedList<number>([]);
    expect(list.headNode?.data).toEqual(undefined);
  });
  it('should headNode return the first node when the list is not empty', () => {
    const list = new LinkedList<number>([1, 2, 3]);
    expect(list.headNode?.data).toEqual(1);
  });
  it('should traverse list', () => {
    const list = new LinkedList<number>([1, 2, 3]);
    expect(list.traverse()).toEqual([1, 2, 3]);
  });
  it('should return correct length', () => {
    const list = new LinkedList<number>([1, 2, 3]);
    expect(list.size()).toEqual(3);
  });
  it('should insert element return corresponding node', () => {
    const list = new LinkedList<number>([1, 2, 3]);
    const node = list.insertAtEnd(4);
    expect(node).toEqual({ data: 4, next: null });
  });
  it('should delete nothing if list is empty', () => {
    const list = new LinkedList<number>([]);
    list.delete((data) => data === 2);
    expect(list.traverse()).toEqual([]);
  });
  it('should delete head', () => {
    const list = new LinkedList<number>([1, 2]);
    list.delete((data) => data === 1);
    expect(list.traverse()).toEqual([2]);
  });
  it('should delete 2nd node when call delete(2)', () => {
    const list = new LinkedList<number>([1, 2, 3]);
    list.delete((data) => data === 2);
    expect(list.traverse()).toEqual([1, 3]);
  });
  it('should delete only one node when there are same nodes', () => {
    const list = new LinkedList<number>([1, 2, 2, 3]);
    list.delete((data) => data === 2);
    expect(list.traverse()).toEqual([1, 2, 3]);
  });
  it('should insert element return corresponding node', () => {
    const list = new LinkedList<number>([1, 2, 3]);
    const node = list.search((data) => data > 1);
    expect(node?.data).toEqual(2);
    expect(node?.next?.data).toEqual(3);
  });
});
