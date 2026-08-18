import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode, FLAGS, HEADER_LEN, MAX_PAYLOAD } from '../index.js';

test('帧编解码 roundtrip（含各类 flags）', () => {
  const cases = [
    { chId: 'abcd1234', seq: 0, flags: FLAGS.DATA, payload: Buffer.from('hello 隧道') },
    { chId: 'ssh00001', seq: 42, flags: FLAGS.DATA | FLAGS.BULK, payload: Buffer.alloc(1024, 7) },
    { chId: 'f1', seq: 0xffffffff, flags: FLAGS.OPEN | FLAGS.ACK, payload: Buffer.alloc(0) },
  ];
  for (const f of cases) {
    const buf = encode(f);
    assert.equal(buf.length, HEADER_LEN + f.payload.length);
    const back = decode(buf);
    assert.equal(back.chId, f.chId); // 短 chId 解码后裁掉填充
    assert.equal(back.seq, f.seq);
    assert.equal(back.flags, f.flags);
    assert.deepEqual(back.payload, f.payload);
  }
});

test('头部布局：chId(8) + seq(4 BE) + flags(4 BE)', () => {
  const buf = encode({ chId: '12345678', seq: 258, flags: FLAGS.BULK, payload: Buffer.from('x') });
  assert.equal(buf.toString('ascii', 0, 8), '12345678');
  assert.equal(buf.readUInt32BE(8), 258);
  assert.equal(buf.readUInt32BE(12), FLAGS.BULK);
});

test('非法输入：chId 超长 / 载荷超 64KB / 帧过短', () => {
  assert.throws(() => encode({ chId: '123456789', seq: 0, flags: 0 }));
  assert.throws(() => encode({ chId: 'a', seq: 0, flags: 0, payload: Buffer.alloc(MAX_PAYLOAD + 1) }));
  assert.throws(() => decode(Buffer.alloc(15)));
});
