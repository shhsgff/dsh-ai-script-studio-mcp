import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const BUNDLE_NAME = 'dsh-ai-script-studio-mcp';
export const ENTRY_ID = 'mcp-ai-script-studio';
export const DEFAULT_PLUGIN = '@deepseek-ai/dsh-mcp-client';

export function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
}

export function dshCommand() {
  return process.env.AISC_DSH || 'dsh';
}

export function runDsh(args, timeoutMs) {
  const res = spawnSync(dshCommand(), args, {
    encoding: 'utf8',
    timeout: timeoutMs || 180000,
    shell: true,
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    ok: res.status === 0,
    status: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    error: res.error ? String(res.error.message || res.error) : '',
  };
}

export function profileDir(profile) {
  return path.join(dshHome(), 'profiles', profile);
}

export function listProfiles() {
  const root = path.join(dshHome(), 'profiles');
  let names = [];
  try {
    names = fs.readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch (e) {
    return [];
  }
  return names.filter((n) => {
    try { return fs.existsSync(path.join(root, n, 'package.json')); } catch (e2) { return false; }
  });
}

export function readProfileManifest(profile) {
  const file = path.join(profileDir(profile), 'package.json');
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

export function installedBundles(profile) {
  try {
    const pkg = readProfileManifest(profile);
    const list = pkg && pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles;
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

export function isInstalled(profile) {
  return installedBundles(profile).includes(BUNDLE_NAME);
}

export function dumpConfig(profile) {
  return runDsh(['--profile', profile, '--dump-config'], 120000);
}

export function detectPluginName(profile) {
  const res = dumpConfig(profile);
  const text = (res.stdout || '') + '\n' + (res.stderr || '');
  const names = text.match(/name:\s*['"]?([^'"\s]*mcp-client[^'"\s]*)['"]?/g) || [];
  for (const line of names) {
    const m = line.match(/name:\s*['"]?([^'"\s]+)['"]?/);
    if (m && m[1]) return m[1];
  }
  return DEFAULT_PLUGIN;
}

export function patchAlive(profile) {
  const res = dumpConfig(profile);
  return ((res.stdout || '') + (res.stderr || '')).includes(ENTRY_ID);
}

export function removeLeftoverLink(profile) {
  const link = path.join(profileDir(profile), 'node_modules', BUNDLE_NAME);
  try {
    if (!fs.existsSync(link)) return false;
    fs.rmSync(link, { recursive: true, force: true });
    return true;
  } catch (e) {
    return false;
  }
}
