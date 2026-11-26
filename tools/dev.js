#!/usr/bin/env node
/* npm run dev: rebuilds public/ when src/ changes and restarts the server when server/ changes. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const build = () => spawnSync(process.execPath, [path.join(root, 'tools', 'build.js')], { cwd: root, stdio: 'inherit' });
build();
let timer = null;
fs.watch(path.join(root, 'src'), { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(build, 200); });

const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', '--watch', 'server/index.js'], { cwd: root, stdio: 'inherit' });
const stop = () => { server.kill('SIGINT'); setTimeout(() => process.exit(0), 500); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
