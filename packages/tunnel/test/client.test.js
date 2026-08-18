import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { TunnelClient, encode, decode, FLAGS, parseTopic } from '../index.js';

// 极简 mqtt 假实现：记录 publish 供测试驱动 ack/乱序投递
class FakeMqtt extends EventEmitter {
  constructor() {
    super();
    this.published = [];
    this.subs = [];
  }
  subscribe(topic, _opts, cb) { this.subs.push(topic); cb?.(); }
  publish(topic, msg, _opts, cb) { this.published.push({ topic, msg }); cb?.(); }
}

test('parseTopic 匹配五种隧道子主题', () => {
  for (const kind of ['open', 'data', 'bulk', 'ack', 'close']) {
    assert.deepEqual(parseTopic(`d/abc1234567890123/tunnel/ch1/${kind}`), { ch: 'ch1', kind });
  }
  assert.equal(parseTopic('u/1/msg'), null);
});

test('openChannel 订阅通配主题并发 open JSON；sendData seq 自动递增', async () => {
  const mqtt = new FakeMqtt();
  const tc = new TunnelClient({ mqtt, did: 'dev001' });
  await tc.openChannel({ chId: 'abc00001', proto: 'ssh', target: { agent: 'dsh' } });
  assert.deepEqual(mqtt.subs, ['d/dev001/tunnel/abc00001/#']);
  const open = mqtt.published[0];
  assert.equal(open.topic, 'd/dev001/tunnel/abc00001/open');
  assert.deepEqual(JSON.parse(open.msg), { chId: 'abc00001', proto: 'ssh', target: { agent: 'dsh' } });

  const s0 = await tc.sendData('abc00001', Buffer.from('a'));
  const s1 = await tc.sendData('abc00001', Buffer.from('b'), { bulk: true });
  assert.deepEqual([s0, s1], [0, 1]);
  const data = mqtt.published[1];
  assert.equal(data.topic, 'd/dev001/tunnel/abc00001/data');
  assert.deepEqual(decode(data.msg).payload, Buffer.from('a'));
  const bulk = mqtt.published[2];
  assert.equal(bulk.topic, 'd/dev001/tunnel/abc00001/bulk');
  assert.equal(decode(bulk.msg).flags, FLAGS.DATA | FLAGS.BULK);
});

test('接收乱序帧：按序上抛 + 累计 ack', async () => {
  const mqtt = new FakeMqtt();
  const got = [];
  const tc = new TunnelClient({ mqtt, did: 'd1', onFrame: (f) => got.push([f.seq, f.payload.toString()]) });
  const ch = 'xyz00001';
  await tc.openChannel({ chId: ch, proto: 'ssh', target: {} });
  mqtt.published.length = 0;
  // 乱序投递 seq 1, 0
  await mqtt.emit('message', `d/d1/tunnel/${ch}/data`, encode({ chId: ch, seq: 1, flags: FLAGS.DATA, payload: Buffer.from('B') }));
  await mqtt.emit('message', `d/d1/tunnel/${ch}/data`, encode({ chId: ch, seq: 0, flags: FLAGS.DATA, payload: Buffer.from('A') }));
  assert.deepEqual(got, [[0, 'A'], [1, 'B']]);
  // ack 应为累计确认 seq=1
  const ack = mqtt.published.find((p) => p.topic.endsWith('/ack'));
  assert.equal(JSON.parse(ack.msg).seq, 1);
});

test('bulk 发送：8 帧窗口在未 ack 前停发，ack 推进后继续', async () => {
  const mqtt = new FakeMqtt();
  const tc = new TunnelClient({ mqtt, did: 'd2' });
  const ch = 'blk00001';
  await tc.openChannel({ chId: ch, proto: 'file', target: {} });
  mqtt.published.length = 0;

  // 10 块数据：窗口 8 帧 → 未 ack 时只能发到 8 帧
  let done = false;
  const sender = (async () => {
    let i = 0;
    await tc.sendBulkStream(ch, async () => (i++ < 10 ? Buffer.alloc(100, i) : null));
    done = true;
  })();
  await new Promise((r) => setTimeout(r, 30));
  const bulkFrames = mqtt.published.filter((p) => p.topic.endsWith('/bulk'));
  assert.equal(bulkFrames.length, 8);
  assert.equal(done, false);

  // 对端累计确认前 5 帧 → 窗口推进，剩余 2 帧发出
  await mqtt.emit('message', `d/d2/tunnel/${ch}/ack`, Buffer.from(JSON.stringify({ seq: 4 })));
  await sender;
  const total = mqtt.published.filter((p) => p.topic.endsWith('/bulk'));
  assert.equal(total.length, 10);
  const seqs = total.map((p) => decode(p.msg).seq);
  assert.deepEqual(seqs, [...Array(10).keys()]);
});

test('背压：接收缓冲 >1MB 时延迟 ack，释放后补发累计确认', async () => {
  const mqtt = new FakeMqtt();
  const tc = new TunnelClient({ mqtt, did: 'd3' });
  const ch = 'bp000001';
  await tc.openChannel({ chId: ch, proto: 'file', target: {} });
  mqtt.published.length = 0;

  // 单帧 64KB，17 帧 > 1MB 且消费端不释放（直接吞掉）→ 观察 ack 被延迟与否由内部计数决定
  // 这里通过大 payload 一次灌满：Reassembler 暂存乱序帧使 rxbuf 累积
  for (let seq = 1; seq <= 17; seq++) {
    await mqtt.emit('message', `d/d3/tunnel/${ch}/data`,
      encode({ chId: ch, seq, flags: FLAGS.DATA, payload: Buffer.alloc(64 * 1024) }));
  }
  // 乱序暂存 >1MB，seq 0 未到：不应有任何 ack
  assert.equal(mqtt.published.filter((p) => p.topic.endsWith('/ack')).length, 0);
  // seq 0 到达：全部按序释放，缓冲回落 → 补发累计 ack
  await mqtt.emit('message', `d/d3/tunnel/${ch}/data`,
    encode({ chId: ch, seq: 0, flags: FLAGS.DATA, payload: Buffer.alloc(64 * 1024) }));
  const ack = mqtt.published.filter((p) => p.topic.endsWith('/ack')).pop();
  assert.equal(JSON.parse(ack.msg).seq, 17);
});
