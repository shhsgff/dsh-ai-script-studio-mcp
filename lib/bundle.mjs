import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BUNDLE_NAME, ENTRY_ID } from './dsh.mjs';

export function defaultBridgeFile() {
  const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appdata, 'ai-script-studio', 'mcp', 'mcp-bridge.json');
}

export function defaultBundleRoot() {
  const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appdata, BUNDLE_NAME);
}

function yamlQuote(value) {
  return '"' + String(value).replace(/\\/g, '/').replace(/"/g, '\\"') + '"';
}

export function buildPatch(serverFile, bridgeFile, pluginName) {
  const s = String(serverFile).replace(/\\/g, '/');
  const b = String(bridgeFile).replace(/\\/g, '/');
  return [
    '# 由 dsh-ai-script-studio-mcp 安装器生成，路径写死在本机，换机器请重新安装。',
    '- insert:',
    '    - id: ' + ENTRY_ID,
    '      name: ' + yamlQuote(pluginName),
    '      config:',
    '        serverName: ai-script-studio',
    '        transport: stdio',
    '        command: node',
    '        args:',
    '          - ' + yamlQuote(s),
    '          - ' + yamlQuote(b),
    '        toolCallTimeoutMs: 45000',
    '',
  ].join('\n');
}

export function buildSnippet(serverFile, bridgeFile, pluginName) {
  return buildPatch(serverFile, bridgeFile, pluginName);
}

/**
 * 生成一个标准的 DSH bundle 目录：package.json + cordis.patch.yml + index.js + server.js
 * 返回 { dir, serverFile, bridgeFile, pluginName }。
 */
export function buildBundle(opts) {
  const dir = opts.dir;
  const serverFile = path.join(dir, 'server.cjs');
  const bridgeFile = opts.bridgeFile;
  const pluginName = opts.pluginName;
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(opts.serverSource, serverFile);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: BUNDLE_NAME,
    version: opts.version || '1.0.0',
    private: true,
    main: 'index.js',
    files: ['cordis.patch.yml', 'index.js', 'server.cjs'],
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'cordis.patch.yml'), buildPatch(serverFile, bridgeFile, pluginName), 'utf8');
  // 这个 bundle 只提供 cordis.patch.yml 里的那一行配置，运行时不需要做任何事。
  // 用 CommonJS 写：目录里不声明 type，server.cjs 与 index.js 都能被 Node 正常加载。
  fs.writeFileSync(path.join(dir, 'index.js'), [
    "'use strict';",
    "module.exports = { name: 'ai-script-studio-mcp', apply() {} };",
    '',
  ].join('\n'), 'utf8');
  return { dir, serverFile, bridgeFile, pluginName };
}
