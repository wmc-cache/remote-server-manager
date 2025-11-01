#!/usr/bin/env node
// Simple Electron main-process watcher with hot restart.
// Watches files under `electron/` and restarts Electron on change.

const path = require('path');
const { spawn } = require('child_process');
const chokidar = require('chokidar');
const electronPath = require('electron');

let child = null;
let restarting = false;

function start() {
  const env = { ...process.env };
  child = spawn(electronPath, ['.'], { stdio: 'inherit', env });
  child.on('exit', (code) => {
    if (!restarting) {
      console.log(`[electron] exited with code ${code}`);
    }
  });
}

function restart() {
  if (!child) {
    start();
    return;
  }
  if (restarting) return;
  restarting = true;
  console.log('[electron] restarting...');
  const proc = child;
  const killTimer = setTimeout(() => {
    try { proc.kill('SIGKILL'); } catch (_) {}
  }, 3000);
  proc.once('exit', () => {
    clearTimeout(killTimer);
    restarting = false;
    start();
  });
  proc.kill();
}

function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

start();

const watcher = chokidar.watch([
  'electron/**/*.{js,cjs,mjs,json}',
], { ignoreInitial: true });

const debouncedRestart = debounce(restart, 150);

watcher.on('all', (evt, file) => {
  console.log(`[electron] ${evt}: ${path.relative(process.cwd(), file)}`);
  debouncedRestart();
});

function cleanup() {
  watcher.close().catch(() => {});
  if (child && !child.killed) {
    try { child.kill(); } catch (_) {}
  }
}

process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

