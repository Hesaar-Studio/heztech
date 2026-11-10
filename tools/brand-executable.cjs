'use strict';

/**
 * afterPack hook — brand the packaged Windows executable.
 *
 * electron-builder copies the Electron runtime from its own download cache, so
 * patching node_modules/electron/dist has no effect. This hook runs after the
 * app directory is assembled and before the installer is built, so the file
 * that ends up on disk (and inside the installer) carries the HezTech identity:
 * icon, product name, description and version.
 *
 * If rcedit cannot be located the build is not failed — the app still works,
 * it just keeps the stock Electron resources.
 */

const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

function findRcedit() {
  if (process.env.RCEDIT_PATH && fs.existsSync(process.env.RCEDIT_PATH)) return process.env.RCEDIT_PATH;

  const roots = [
    path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache', 'winCodeSign')
  ];
  for (const root of roots) {
    let entries = [];
    try { entries = fs.readdirSync(root); } catch { continue; }
    for (const dir of entries) {
      const candidate = path.join(root, dir, 'rcedit-x64.exe');
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return '';
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const exe = path.join(context.appOutDir, 'HezTech.exe');
  if (!fs.existsSync(exe)) {
    console.warn('[afterPack] HezTech.exe not found in ' + context.appOutDir);
    return;
  }

  const rcedit = findRcedit();
  if (!rcedit) {
    console.warn('[afterPack] rcedit not found — executable keeps stock Electron resources.');
    return;
  }

  const projectDir = context.packager.projectDir;
  const ico = path.join(projectDir, 'build', 'icon.ico');
  const version = context.packager.appInfo.version;
  const fileVersion = version + '.0';

  const args = [
    exe,
    '--set-version-string', 'CompanyName', 'HezTech',
    '--set-version-string', 'ProductName', 'HezTech',
    '--set-version-string', 'FileDescription', 'HezTech',
    '--set-version-string', 'InternalName', 'HezTech',
    '--set-version-string', 'OriginalFilename', 'HezTech.exe',
    '--set-version-string', 'LegalCopyright', 'HezTech',
    '--set-file-version', fileVersion,
    '--set-product-version', version
  ];
  if (fs.existsSync(ico)) args.push('--set-icon', ico);

  try {
    execFileSync(rcedit, args, { stdio: 'inherit' });
    console.log('[afterPack] branded HezTech.exe (' + version + ')');
  } catch (err) {
    console.warn('[afterPack] rcedit failed: ' + (err && err.message));
  }
};
