import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Reassembler, SendWindow, ReceiveBuffer } from '../index.js';

test('乱序重组：2、3 先到暂存，0、1 到齐后按序输出', () => {
  const r = new Reassembler();
  assert.deepEqual(r.push(2, 'B2'), []);
  assert.deepEqual(r.push(3, 'B3'), []);
  assert.deepEqual(r.push(0, 'B0'), [{ seq: 0, payload: 'B0' }]);
  assert.deepEqual(r.push(1, 'B1'), [
    { seq: 1, payload: 'B1' },
    { seq: 2, payload: 'B2' },
    { seq: 3, payload: 'B3' },
  ]);
  assert.equal(r.nextSeq, 4);
  assert.equal(r.pending.size, 0);
});

test('QoS1 重复帧去重', () => {
  const r = new Reassembler();
  assert.deepEqual(r.push(0, 'A'), [{ seq: 0, payload: 'A' }]);
  assert.deepEqual(r.push(0, 'A'), []); // 重复
  assert.deepEqual(r.push(1, 'B'), [{ seq: 1, payload: 'B' }]);
});

test('滑动窗口：8 帧满后 canSend=false，累计确认后开窗', async () => {
  const w = new SendWindow(8);
  for (let i = 0; i < 8; i++) w.track(i, `p${i}`);
  assert.equal(w.canSend(), false);
  const wait = w.waitSlot(); // 挂起等待
  const confirmed = w.onAck(3); // 累计确认 0..3
  assert.equal(confirmed.length, 4);
  assert.equal(w.canSend(), true);
  await wait;
  // 再填满窗口：0..3 已确认，剩余 4..7 共 4 帧 in-flight，补 4 帧到 8 满
  for (let i = 8; i <= 11; i++) w.track(i, `p${i}`);
  assert.equal(w.canSend(), false);
  w.onAck(11);
  assert.equal(w.canSend(), true);
  assert.deepEqual(w.onAck(2), []); // 过期 ack 无效
});

test('背压：接收缓冲 >1MB 触发暂停', () => {
  const rb = new ReceiveBuffer(1024 * 1024);
  assert.equal(rb.shouldPause(), false);
  rb.add(1024 * 1024 + 1);
  assert.equal(rb.shouldPause(), true);
  rb.release(2);
  assert.equal(rb.shouldPause(), false);
});
