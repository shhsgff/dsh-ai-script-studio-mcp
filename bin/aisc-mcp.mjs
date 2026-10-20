#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUNDLE_NAME, ENTRY_ID, dshHome, dshCommand, listProfiles, isInstalled, detectPluginName,
  dumpConfig, patchAlive, removeLeftoverLink, profileDir, runDsh,
} from '../lib/dsh.mjs';
import { buildBundle, defaultBundleRoot, defaultBridgeFile, buildSnippet } from '../lib/bundle.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_SOURCE = path.resolve(HERE, '..', 'server.js');
const VERSION = '1.0.0';

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[key] = next; i++; } else { out[key] = true; }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function info(lines) { process.stdout.write(lines.join('\n') + '\n'); }
function die(msg) { process.stderr.write(msg + '\n'); process.exit(1); }

function pickProfile(args) {
  const profiles = listProfiles();
  if (args.profile) {
    if (!profiles.includes(args.profile)) die('找不到 profile「' + args.profile + '」。现有：' + (profiles.join(', ') || '（无）'));
    return args.profile;
  }
  if (profiles.includes('web')) return 'web';
  if (profiles.includes('headless')) return 'headless';
  if (profiles.length === 1) return profiles[0];
  die('请用 --profile 指定装到哪个 profile。现有：' + (profiles.join(', ') || '（无）'));
}

function bridgeStatus(bridgeFile) {
  const out = [{ file: bridgeFile, exists: fs.existsSync(bridgeFile), port: null, hasToken: false }];
  try {
    const cfg = JSON.parse(fs.readFileSync(bridgeFile, 'utf8'));
    out[0].port = cfg.port || null;
    out[0].hasToken = !!cfg.token;
  } catch (e) { /* ignore */ }
  return out[0];
}

function cmdStatus(args) {
  const bridgeFile = args.bridge || defaultBridgeFile();
  const bridge = bridgeStatus(bridgeFile);
  const profiles = listProfiles();
  const lines = [
    'AI Script Studio MCP 插件 —— 状态',
    '  本程序版本  : ' + VERSION,
    '  Node        : ' + process.version,
    '  DSH_HOME    : ' + dshHome(),
    '  dsh 命令    : ' + dshCommand(),
    '  桥配置      : ' + bridgeFile + (bridge.exists ? '（端口 ' + bridge.port + '，令牌' + (bridge.hasToken ? '已写入' : '缺失') + '）' : '（不存在：请先在软件里点「开启 MCP 服务」）'),
    '  插件包名    : ' + BUNDLE_NAME,
    '  配置条目 id : ' + ENTRY_ID,
    '',
    'profile 安装状态：',
  ];
  if (!profiles.length) lines.push('  （没有找到任何 profile，确认 DeepSeek Harness 已初始化）');
  for (const p of profiles) {
    const installed = isInstalled(p);
    const alive = installed ? patchAlive(p) : false;
    lines.push('  - ' + p + '：' + (installed ? (alive ? '已安装且配置已生效' : '已在 bundle 列表里，但 dump-config 没看到条目') : '未安装'));
  }
  info(lines);
}

function cmdSnippet(args) {
  const bridgeFile = args.bridge || defaultBridgeFile();
  const profiles = listProfiles();
  const profile = profiles.includes('web') ? 'web' : (profiles[0] || 'web');
  const pluginName = args.plugin || detectPluginName(profile);
  info(['# 手动粘贴到 ' + path.join(profileDir(profile), 'cordis.patch.yml') + ' :', buildSnippet(SERVER_SOURCE, bridgeFile, pluginName)]);
}

function cmdInstall(args) {
  const profile = pickProfile(args);
  const bridgeFile = args.bridge || defaultBridgeFile();
  const bridge = bridgeStatus(bridgeFile);
  if (!bridge.exists) {
    process.stderr.write('[提示] 还没找到桥配置：' + bridgeFile + '\n        请先打开《AI 智能剧本创作工具》→ 设置 → DSH / MCP →「开启 MCP 服务」，\n        装好之后再启动软件，桥会自动就绪。\n\n');
  }
  const pluginName = args.plugin || detectPluginName(profile);
  const outDir = args.out || path.join(defaultBundleRoot(), 'bundle-' + profile);
  const built = buildBundle({ dir: outDir, serverSource: SERVER_SOURCE, bridgeFile, pluginName, version: VERSION });
  info(['生成 bundle : ' + built.dir, 'mcp 客户端  : ' + pluginName, '桥配置      : ' + bridgeFile, '正在装进 profile：' + profile + ' ……']);
  const res = runDsh(['plugin', '--profile', profile, 'add', '"' + built.dir + '"'], 240000);
  const tail = (res.stdout + res.stderr).split(/\r?\n/).filter(Boolean).slice(-6);
  info(tail.map((l) => '  ' + l));
  if (!res.ok || !isInstalled(profile)) die('安装失败：dsh plugin add 没有成功（退出码 ' + res.status + '）。可把上面的输出发出来排查。');
  const alive = patchAlive(profile);
  info([
    '',
    '✓ 已安装到 profile「' + profile + '」',
    alive ? '✓ dump-config 里已经能看到 ' + ENTRY_ID : '! dump-config 里暂时没看到条目，请重启 DSH 后再跑一次 status 确认',
    '',
    '接下来：',
    '  1. 打开《AI 智能剧本创作工具》，设置 → DSH / MCP →「开启 MCP 服务」保持开启；',
    '  2. 重启 DeepSeek Harness（' + dshCommand() + ' ' + profile + '），让它加载插件；',
    '  3. 在 DSH 里让它调用 create_script / append_text 等工具，正文就会写进软件。',
  ]);
}

function cmdUninstall(args) {
  const profile = pickProfile(args);
  if (!isInstalled(profile)) info(['profile「' + profile + '」里本来就没有安装 ' + BUNDLE_NAME]);
  else {
    const res = runDsh(['plugin', '--profile', profile, 'remove', BUNDLE_NAME], 240000);
    const tail = (res.stdout + res.stderr).split(/\r?\n/).filter(Boolean).slice(-6);
    info(tail.map((l) => '  ' + l));
    if (!res.ok) die('卸载失败（退出码 ' + res.status + '）。');
  }
  const cleaned = removeLeftoverLink(profile);
  info(['✓ 已从 profile「' + profile + '」移除' + (cleaned ? '（并清掉了 node_modules 里的残留软链）' : ''), '  手动写进 cordis.patch.yml 的行需要自己删。']);
}

function cmdDoctor(args) {
  const profile = listProfiles()[0];
  const res = profile ? dumpConfig(profile) : { ok: false, stdout: '', stderr: '没有 profile' };
  info([
    'node         : ' + process.version,
    'dsh 可用      : ' + (profile ? (res.ok ? '是' : '否（' + (res.stderr || '').slice(0, 120) + '）') : '未找到 profile'),
    'server.js    : ' + SERVER_SOURCE,
    'server 存在  : ' + fs.existsSync(SERVER_SOURCE),
    '桥配置       : ' + (args.bridge || defaultBridgeFile()),
  ]);
}

const help = [
  '用法：aisc-mcp <install|uninstall|status|snippet|doctor> [选项]',
  '',
  '  install     把插件装进某个 DSH profile（默认 web）',
  '  uninstall   从 profile 里卸载',
  '  status      查看各 profile 的安装状态与桥配置',
  '  snippet     只打印要手动粘贴的 cordis patch 片段',
  '  doctor      环境自检',
  '',
  '选项：--profile <名字>  --bridge <桥配置路径>  --plugin <mcp 客户端包名>  --out <bundle 输出目录>',
].join('\n');

const argv = process.argv.slice(2);
const command = argv[0];
const args = parseArgs(argv.slice(1));
try {
  if (command === 'install') cmdInstall(args);
  else if (command === 'uninstall' || command === 'remove') cmdUninstall(args);
  else if (command === 'status') cmdStatus(args);
  else if (command === 'snippet') cmdSnippet(args);
  else if (command === 'doctor') cmdDoctor(args);
  else info([help]);
} catch (err) {
  die('出错：' + (err && err.stack ? err.stack : String(err)));
}
