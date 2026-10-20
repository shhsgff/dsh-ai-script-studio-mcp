import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'server.js');

function startFakeBridge(token) {
  return new Promise((resolve) => {
    const seen = [];
    const srv = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        seen.push({ auth: req.headers['x-aisc-token'], body });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, result: '来自软件的回复:' + (body.action || '?') }));
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ port: srv.address().port, seen, close: () => srv.close() }));
  });
}

function runServer(cfgFile, lines, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER, cfgFile], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { try { child.kill(); } catch (e) { /* ignore */ } reject(new Error('超时：' + out + err)); }, timeoutMs);
    child.stdout.on('data', (d) => { out += String(d); });
    child.stderr.on('data', (d) => { err += String(d); });
    child.on('close', () => { clearTimeout(timer); resolve({ out, err }); });
    for (const line of lines) child.stdin.write(JSON.stringify(line) + '\n');
    setTimeout(() => { try { child.stdin.end(); } catch (e) { /* ignore */ } }, 2500);
  });
}

test('MCP 服务器能握手、列出工具，并把工具调用转发到桥', async () => {
  const token = 'test-token';
  const bridge = await startFakeBridge(token);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aisc-mcp-test-'));
  const cfgFile = path.join(dir, 'mcp-bridge.json');
  fs.writeFileSync(cfgFile, JSON.stringify({ port: bridge.port, token }), 'utf8');
  const { out } = await runServer(cfgFile, [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_scripts', arguments: {} } },
  ]);
  bridge.close();
  const msgs = out.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const init = msgs.find((m) => m.id === 1);
  assert.equal(init.result.protocolVersion, '2024-11-05');
  assert.equal(init.result.serverInfo.name, 'ai-script-studio');
  const list = msgs.find((m) => m.id === 2);
  assert.deepEqual(list.result.tools.map((t) => t.name).sort(), ['add_chapter', 'append_text', 'create_script', 'get_script', 'list_scripts']);
  const call = msgs.find((m) => m.id === 3);
  assert.match(call.result.content[0].text, /来自软件的回复:list_scripts/);
  assert.equal(bridge.seen[0].auth, token);
  assert.equal(bridge.seen[0].body.action, 'list_scripts');
});

test('桥没起来时工具调用给出中文错误而不是崩溃', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aisc-mcp-test-'));
  const cfgFile = path.join(dir, 'mcp-bridge.json');
  fs.writeFileSync(cfgFile, JSON.stringify({ port: 9, token: 'x' }), 'utf8');
  const { out } = await runServer(cfgFile, [
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_scripts', arguments: {} } },
  ]);
  const msg = out.split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((m) => m.id === 1);
  assert.equal(msg.result.isError, true);
  assert.match(msg.result.content[0].text, /无法连接到 AI 剧本创作工具/);
});
