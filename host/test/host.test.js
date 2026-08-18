// host 单元测试：safePath 防穿越 / HMAC 令牌 / 冲突检测 / agent 解析 / 指纹
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  safePath, handleFileRequest, issueTransferToken, verifyTransferToken, negotiateDirect, startDirectServer,
} from '../src/files.js';
import { resolveAgentCommand } from '../src/daemon.js';
import { fingerprint } from '../src/report.js';
import { uuid16 } from '../src/util.js';

const root = mkdtempSync(join(tmpdir(), 'acp-share-'));
test.after(() => rmSync(root, { recursive: true, force: true }));

test('uuid16：16 位 hex 设备标识', () => {
  const id = uuid16();
  assert.match(id, /^[0-9a-f]{16}$/);
});

test('safePath：根内路径通过，穿越拒绝', () => {
  writeFileSync(join(root, 'a.txt'), 'hello');
  mkdirSync(join(root, 'sub'));
  assert.equal(safePath(root, 'a.txt'), join(root, 'a.txt'));
  assert.equal(safePath(root, 'sub/../a.txt'), join(root, 'a.txt'));
  assert.throws(() => safePath(root, '../outside.txt'));
  assert.throws(() => safePath(root, '/etc/passwd'));
  // 符号链接逃逸
  symlinkSync('/etc', join(root, 'evil'));
  assert.throws(() => safePath(root, 'evil/passwd'));
});

test('handleFileRequest：stat/list/read/write + baseVersion 冲突 409 语义', () => {
  const j = (r) => JSON.parse(r.body);
  assert.equal(j(handleFileRequest(root, { op: 'stat', path: 'a.txt' })).size, 5);
  assert.equal(j(handleFileRequest(root, { op: 'stat', path: 'nope' })), null);
  assert.ok(Array.isArray(j(handleFileRequest(root, { op: 'list', path: '' }))));
  assert.ok(j(handleFileRequest(root, { op: 'read', path: 'a.txt' })).stream);

  // 写回：新文件 ok + mtime；旧 baseVersion 冲突
  const w1 = j(handleFileRequest(root, { op: 'write', path: 'w.txt', data: Buffer.from('v1').toString('base64'), baseVersion: 0 }));
  assert.equal(w1.ok, true);
  const stale = j(handleFileRequest(root, { op: 'write', path: 'w.txt', data: Buffer.from('v2').toString('base64'), baseVersion: w1.mtime - 99999 }));
  assert.equal(stale.conflict, true);
  assert.equal(stale.current, w1.mtime);
  const ok = j(handleFileRequest(root, { op: 'write', path: 'w.txt', data: Buffer.from('v3').toString('base64'), baseVersion: w1.mtime }));
  assert.equal(ok.ok, true);
});

test('直连令牌：HMAC 签发/校验，5 分钟时效，篡改拒绝', () => {
  const key = 'device-token-secret';
  const exp = Date.now() + 5 * 60 * 1000;
  const token = issueTransferToken(key, 'a.txt', exp);
  assert.equal(token.length, 64);
  assert.equal(verifyTransferToken(key, 'a.txt', exp, token), true);
  assert.equal(verifyTransferToken(key, 'b.txt', exp, token), false); // 换 path
  assert.equal(verifyTransferToken('other', 'a.txt', exp, token), false); // 换 key
  assert.equal(verifyTransferToken(key, 'a.txt', Date.now() - 1, token), false); // 过期
});

test('直连协商：同网段允许 / 跨网段拒绝（中继回落）', () => {
  const same = negotiateDirect({ shareRoot: root, path: 'a.txt', secretKey: 'k', localNet: { peer: '192.168.1.5', self: '192.168.1.9' } });
  assert.equal(same.direct, true);
  assert.match(same.url, /\/xfer\?/);
  const diff = negotiateDirect({ shareRoot: root, path: 'a.txt', secretKey: 'k', localNet: { peer: '1.2.3.4', self: '192.168.1.9' } });
  assert.equal(diff.direct, false);
});

test('直连 HTTP 服务：无令牌 403，令牌 + Range 可读', async () => {
  const key = 'k';
  const server = await startDirectServer({ shareRoot: root, secretKey: key, port: 0 });
  const port = server.address().port;
  const exp = Date.now() + 300000;
  const token = issueTransferToken(key, 'a.txt', exp);
  const bad = await fetch(`http://127.0.0.1:${port}/xfer?path=a.txt&exp=${exp}&token=deadbeef`);
  assert.equal(bad.status, 403);
  const good = await fetch(`http://127.0.0.1:${port}/xfer?path=a.txt&exp=${exp}&token=${token}`, {
    headers: { 'X-Transfer-Token': token },
  });
  assert.equal(good.status, 200);
  assert.equal(await good.text(), 'hello');
  // Range
  const part = await fetch(`http://127.0.0.1:${port}/xfer?path=a.txt&exp=${exp}&token=${token}`, {
    headers: { Range: 'bytes=1-3' },
  });
  assert.equal(part.status, 206);
  assert.equal(await part.text(), 'ell');
  server.close();
});

test('resolveAgentCommand：已知 agent 或 PATH 命中；未知兜底 sh -i', () => {
  const r = resolveAgentCommand('definitely-not-exist-xyz');
  assert.deepEqual([r.cmd, r.args], ['sh', ['-i']]);
  const sh = resolveAgentCommand('sh');
  assert.ok(/\/sh$/.test(sh.cmd));
});

test('指纹：key 只取 sha256 前 16 位，不回明文', () => {
  const fp = fingerprint('sk-live-abcdefghijklmnop');
  assert.match(fp, /^[0-9a-f]{16}$/);
  assert.notEqual(fp, 'sk-live-abcdefghijklmnop');
  assert.equal(fingerprint(''), null);
  // key 文件路径也能取指纹：文件含尾部换行 → 与字符串指纹不同；同内容则一致
  const keyFile = join(root, 'k1.key');
  writeFileSync(keyFile, 'file-secret-key\n');
  assert.match(fingerprint(keyFile), /^[0-9a-f]{16}$/);
  assert.notEqual(fingerprint(keyFile), fingerprint('file-secret-key'));
  writeFileSync(keyFile, 'file-secret-key');
  assert.equal(fingerprint(keyFile), fingerprint('file-secret-key'));
});
