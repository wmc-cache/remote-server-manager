const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const chokidar = require('chokidar');
const { EventEmitter } = require('events');

const posixPath = path.posix;

function createSyncService(sshClient) {
  const activeSyncs = new Map();
  const emitter = new EventEmitter();
  // connectionId -> lane pools
  // lanes: transfer (fastPut/fastGet), control (mkdir/unlink/rmdir), list (readdir walks)
  const lanePools = new Map();

  function ensureLanePool(connectionId) {
    if (!lanePools.has(connectionId)) {
      lanePools.set(connectionId, {
        lanes: new Map([
          ['transfer', { q: [], active: 0, concurrency: 3 }],
          ['control', { q: [], active: 0, concurrency: 1 }],
          ['list', { q: [], active: 0, concurrency: 1 }],
        ]),
      });
    }
    return lanePools.get(connectionId);
  }

  function setTransferConcurrency(connectionId, n) {
    const pool = ensureLanePool(connectionId);
    const lane = pool.lanes.get('transfer');
    if (lane) lane.concurrency = Math.max(1, Math.min(8, Number(n) || 3));
  }

  function schedule(connectionId, task, laneName = 'transfer') {
    const pool = ensureLanePool(connectionId);
    const lane = pool.lanes.get(laneName) || pool.lanes.get('transfer');

    return new Promise((resolve, reject) => {
      lane.q.push({ task, resolve, reject });
      pumpLane(lane);
    });
  }

  function pumpLane(lane) {
    while (lane.active < lane.concurrency && lane.q.length) {
      const item = lane.q.shift();
      if (!item) break;
      lane.active += 1;
      Promise.resolve()
        .then(() => item.task())
        .then((res) => item.resolve(res))
        .catch((err) => item.reject(err))
        .finally(() => {
          lane.active -= 1;
          if (lane.q.length) pumpLane(lane);
        });
    }
  }

  // schedule() overload removed in favor of lane-based scheduler above

  async function runWithSFTP(connectionId, handler) {
    const sftp = await sshClient.withSFTP(connectionId);
    return handler(sftp);
  }

  async function ensureRemoteDir(sftp, remoteDir) {
    if (!remoteDir || remoteDir === '.' || remoteDir === '/') {
      return;
    }
    const segments = remoteDir.split('/').filter(Boolean);
    let current = remoteDir.startsWith('/') ? '/' : '';

    for (const segment of segments) {
      current = current === '/' ? `/${segment}` : posixPath.join(current, segment);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve, reject) => {
        sftp.stat(current, (statErr) => {
          if (!statErr) {
            resolve();
            return;
          }
          const notFound = statErr.code === 2 || /no such file/i.test(statErr.message || '');
          if (!notFound) {
            reject(statErr);
            return;
          }
          sftp.mkdir(current, { mode: 0o755 }, (mkdirErr) => {
            if (mkdirErr && mkdirErr.code !== 4 && !/failure/i.test(mkdirErr.message || '')) {
              reject(mkdirErr);
              return;
            }
            resolve();
          });
        });
      });
    }
  }

  function toRemotePath(localRoot, remoteRoot, targetPath) {
    const relative = path.relative(localRoot, targetPath);
    const normalized = relative.split(path.sep).join('/');
    return remoteRoot.endsWith('/')
      ? `${remoteRoot}${normalized}`
      : posixPath.join(remoteRoot, normalized);
  }

  function toLocalPath(localRoot, remoteRoot, remoteTarget) {
    const relative = posixPath.relative(remoteRoot, remoteTarget);
    return path.join(localRoot, relative.split('/').join(path.sep));
  }

  async function uploadFile(connectionId, localFile, remoteFile) {
    await schedule(connectionId, () => runWithSFTP(connectionId, async (sftp) => {
      await ensureRemoteDir(sftp, posixPath.dirname(remoteFile));
      return new Promise((resolve, reject) => {
        sftp.fastPut(localFile, remoteFile, (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    }), 'transfer');
    emitter.emit('sync:log', { level: 'info', message: `上传 ${localFile} -> ${remoteFile}` });
  }

  async function downloadFile(connectionId, remoteFile, localFile) {
    await fs.promises.mkdir(path.dirname(localFile), { recursive: true });
    await schedule(connectionId, () => runWithSFTP(connectionId, async (sftp) => new Promise((resolve, reject) => {
      sftp.fastGet(remoteFile, localFile, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    })), 'transfer');
    emitter.emit('sync:log', { level: 'info', message: `下载 ${remoteFile} -> ${localFile}` });
  }

  async function moveToTrash(localRoot, localTarget) {
    const rel = path.relative(localRoot, localTarget);
    const trashRoot = path.join(localRoot, '.rsm_trash');
    const dest = path.join(trashRoot, rel);
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    try {
      await fs.promises.rename(localTarget, dest);
    } catch (e) {
      // fallback to copy+unlink if cross-device
      try {
        const data = await fs.promises.readFile(localTarget);
        await fs.promises.writeFile(dest, data);
        await fs.promises.unlink(localTarget);
      } catch (_) { /* ignore */ }
    }
    emitter.emit('sync:log', { level: 'warn', message: `远程已删除，本地已移动到回收站: ${rel}` });
  }

  // -------- Ignore Helpers (.syncignore + sane defaults) --------
  function readSyncIgnore(localRoot) {
    const file = path.join(localRoot, '.syncignore');
    let patterns = [];
    try {
      const raw = fs.readFileSync(file, 'utf8');
      patterns = raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
    } catch (_) { /* no file */ }
    // Always ignore our trash and common heavy dirs unless explicitly negated later
    const defaults = ['.rsm_trash/', '.git/', 'node_modules/', 'dist/'];
    for (const d of defaults) {
      if (!patterns.some((p) => p.replace(/^!/,'') === d)) patterns.push(d);
    }
    return patterns;
  }

  function compilePattern(pat) {
    const neg = pat.startsWith('!');
    const raw = neg ? pat.slice(1) : pat;
    const dirOnly = raw.endsWith('/');
    const base = raw.replace(/\/+$/, '');

    // Very small subset of .gitignore patterns:
    // - '*.ext' -> suffix match
    // - 'path/segment' -> prefix match from root
    // - 'segment' -> match any path segment
    // - trailing '/' -> directory only
    // Note: We keep it intentionally simple for performance.
    const isGlobSuffix = base.startsWith('*.');
    const suffix = isGlobSuffix ? base.slice(1) : null; // like '.log'
    const anchored = base.includes('/');
    const segment = !anchored && !isGlobSuffix ? base : null;
    const prefix = anchored ? base.replace(/^\/+/, '') : null;

    return {
      neg,
      test(rel, isDir) {
        if (dirOnly && !isDir) return false;
        if (isGlobSuffix) return rel.endsWith(suffix);
        if (segment) {
          const parts = rel.split('/');
          return parts.includes(segment);
        }
        if (prefix) {
          return rel === prefix || rel.startsWith(prefix + '/');
        }
        return false;
      },
    };
  }

  function createIgnoreMatcher(patterns) {
    const compiled = patterns.map(compilePattern);
    const positives = compiled.filter((p) => !p.neg);
    const negatives = compiled.filter((p) => p.neg);
    return function isIgnored(rel, isDir) {
      // normalize to posix-like
      const r = rel.split(path.sep).join('/');
      let ignored = false;
      for (const p of positives) {
        if (p.test(r, isDir)) { ignored = true; break; }
      }
      if (!ignored) return false;
      for (const n of negatives) {
        if (n.test(r, isDir)) return false;
      }
      return true;
    };
  }

  // -------- Parallel directory listing (SFTP + Local) --------
  async function listRemoteTree(connectionId, remoteRoot, isIgnored = () => false) {
    const concurrency = Math.max(4, Math.min(16, (os.cpus()?.length || 4)));
    return schedule(connectionId, () => runWithSFTP(connectionId, async (sftp) => {
      const result = new Map(); // key: posix path relative
      const root = remoteRoot || '.';
      const queue = [root];
      const seen = new Set();
      let active = 0;

      function readdir(dir) {
        return new Promise((resolve, reject) => {
          sftp.readdir(dir, (err, list) => {
            if (err) {
              // code 2: No such file, ignore that directory
              const notFound = err.code === 2 || /no such file/i.test(err.message || '');
              if (notFound) { resolve([]); return; }
              reject(err);
              return;
            }
            resolve(list || []);
          });
        });
      }

      await new Promise((resolve, reject) => {
        const pump = () => {
          while (active < concurrency && queue.length) {
            const dir = queue.shift();
            if (!dir) break;
            if (seen.has(dir)) continue;
            seen.add(dir);
            active += 1;
            readdir(dir)
              .then((entries) => {
                for (const item of entries) {
                  const name = item.filename;
                  if (name === '.' || name === '..') continue;
                  const full = posixPath.join(dir, name);
                  const isDir = item.attrs?.isDirectory && item.attrs.isDirectory();
                  const rel = posixPath.relative(root, full);
                  const ignored = isIgnored(rel, !!isDir);
                  if (ignored) continue;
                  result.set(rel, {
                    isDir,
                    size: item.attrs?.size,
                    mtimeMs: (item.attrs?.mtime || 0) * 1000,
                    full,
                  });
                  if (isDir) queue.push(full);
                }
              })
              .catch((e) => reject(e))
              .finally(() => {
                active -= 1;
                if (queue.length) {
                  pump();
                } else if (active === 0) {
                  resolve();
                }
              });
          }
          // If nothing can be started and no active tasks, we're done
          if (active === 0 && queue.length === 0) resolve();
        };
        pump();
      });

      return result;
    }), 'list');
  }

  async function listLocalTree(localRoot, isIgnored = () => false) {
    const result = new Map(); // key: posix-like relative path
    const queue = [localRoot];
    const concurrency = Math.max(4, Math.min(16, (os.cpus()?.length || 4)));
    let idx = 0;

    async function processDir(dir) {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        const rel = path.relative(localRoot, full).split(path.sep).join('/');
        const ignored = isIgnored(rel, entry.isDirectory());
        if (ignored) continue;
        if (entry.isDirectory()) {
          result.set(rel, { isDir: true });
          queue.push(full);
        } else {
          const st = await fs.promises.stat(full);
          result.set(rel, { isDir: false, size: st.size, mtimeMs: st.mtimeMs });
        }
      }
    }

    const workers = Array.from({ length: concurrency }, async () => {
      while (idx < queue.length) {
        const myIndex = idx; // capture index
        idx += 1;
        const dir = queue[myIndex];
        // eslint-disable-next-line no-await-in-loop
        await processDir(dir);
      }
    });
    await Promise.all(workers);
    return result;
  }

  async function deleteRemote(connectionId, remoteFile, isDir) {
    await schedule(connectionId, () => runWithSFTP(connectionId, async (sftp) => new Promise((resolve, reject) => {
      const handler = isDir ? sftp.rmdir.bind(sftp) : sftp.unlink.bind(sftp);
      handler(remoteFile, (err) => {
        if (err && err.code !== 2) {
          reject(err);
          return;
        }
        resolve();
      });
    })), 'control');
    emitter.emit('sync:log', { level: 'info', message: `删除远程 ${remoteFile}` });
  }

  function startLocalWatcher(syncId, config, muteSet) {
    // Build ignore matcher for chokidar
    const isIgnored = config.isIgnored || (() => false);
    const watcher = chokidar.watch(config.localPath, {
      ignoreInitial: true,
      persistent: true,
      ignored: (p) => {
        const rel = path.relative(config.localPath, p).split(path.sep).join('/');
        if (!rel || rel === '.') return false;
        // We don't always know if path is a dir here; try both to be safe
        return isIgnored(rel, true) || isIgnored(rel, false);
      },
    });

    const handleError = (err) => emitter.emit('sync:log', { level: 'error', message: `同步失败: ${err.message}` });

    watcher
      .on('add', (filePath) => {
        if (muteSet.has(filePath)) return;
        const rel = path.relative(config.localPath, filePath).split(path.sep).join('/');
        if (isIgnored(rel, false)) return;
        uploadFile(config.connectionId, filePath, toRemotePath(config.localPath, config.remotePath, filePath)).catch(handleError);
      })
      .on('change', (filePath) => {
        if (muteSet.has(filePath)) return;
        const rel = path.relative(config.localPath, filePath).split(path.sep).join('/');
        if (isIgnored(rel, false)) return;
        uploadFile(config.connectionId, filePath, toRemotePath(config.localPath, config.remotePath, filePath)).catch(handleError);
      })
      .on('unlink', (filePath) => {
        const rel = path.relative(config.localPath, filePath).split(path.sep).join('/');
        if (isIgnored(rel, false)) return;
        return deleteRemote(config.connectionId, toRemotePath(config.localPath, config.remotePath, filePath), false).catch(handleError);
      })
      .on('unlinkDir', (dirPath) => {
        const rel = path.relative(config.localPath, dirPath).split(path.sep).join('/');
        if (isIgnored(rel, true)) return;
        return deleteRemote(config.connectionId, toRemotePath(config.localPath, config.remotePath, dirPath), true).catch(handleError);
      })
      .on('error', (err) => emitter.emit('sync:log', { level: 'error', message: `本地监听错误: ${err.message}` }));

    return watcher;
  }

  function startRemotePoller(syncId, preparedConfig, muteSet) {
    // Adaptive interval based on workload
    const isIgnored = preparedConfig.isIgnored || (() => false);
    const minInterval = preparedConfig.pollMinMs || 1000;
    const maxInterval = preparedConfig.pollMaxMs || 10000;
    const shrink = 0.6; // when busy, poll faster
    const grow = 1.5;   // when idle, back off
    const idleRoundsForBackoff = 3;
    let currentInterval = preparedConfig.initialPollMs || 2000;
    let idleRounds = 0;
    let running = false;
    let lastPollAt = Date.now();
    let timer = null;
    let stopped = false;

    const scheduleNext = (ms) => {
      if (stopped) return null;
      timer = setTimeout(tick, Math.max(minInterval, Math.min(maxInterval, ms)));
      return timer;
    };

    const tick = async () => {
      if (running || stopped) {
        scheduleNext(currentInterval);
        return;
      }
      running = true;
      const startedAt = Date.now();
      let changes = 0;
      try {
        const [remoteMap, localMap] = await Promise.all([
          listRemoteTree(preparedConfig.connectionId, preparedConfig.remotePath, isIgnored),
          listLocalTree(preparedConfig.localPath, isIgnored),
        ]);

        // Ensure directories exist locally
        for (const [rel, meta] of remoteMap.entries()) {
          if (!meta.isDir) continue;
          if (isIgnored(rel, true)) continue;
          // eslint-disable-next-line no-await-in-loop
          await fs.promises.mkdir(path.join(preparedConfig.localPath, rel.split('/').join(path.sep)), { recursive: true }).catch(() => {});
        }

        // Sync remote -> local (create/modify)
        for (const [rel, rMeta] of remoteMap.entries()) {
          if (rMeta.isDir) continue;
          if (isIgnored(rel, false)) continue;
          const localFile = path.join(preparedConfig.localPath, rel.split('/').join(path.sep));
          const lMeta = localMap.get(rel);
          const localMtime = lMeta?.mtimeMs || 0;
          const remoteMtime = rMeta.mtimeMs || 0;
          const sizeDiffers = typeof lMeta?.size === 'number' && typeof rMeta.size === 'number' && lMeta.size !== rMeta.size;
          const remoteNewer = remoteMtime - localMtime > 500; // allow coarse mtime (seconds)
          const shouldDownload = !lMeta || sizeDiffers || remoteNewer;
          if (shouldDownload) {
            changes += 1;
            muteSet.add(localFile);
            try {
              // eslint-disable-next-line no-await-in-loop
              await downloadFile(preparedConfig.connectionId, posixPath.join(preparedConfig.remotePath, rel), localFile);
            } catch (e) {
              emitter.emit('sync:log', { level: 'error', message: `下载失败: ${e.message}` });
            } finally {
              setTimeout(() => muteSet.delete(localFile), 2000);
            }
          }
        }

        // Remote deletion -> move local to trash (safe)
        for (const [rel, lMeta] of localMap.entries()) {
          if (lMeta.isDir) continue;
          if (isIgnored(rel, false)) continue;
          if (!remoteMap.has(rel)) {
            const localFile = path.join(preparedConfig.localPath, rel.split('/').join(path.sep));
            // Only if file older than last poll to reduce conflicts
            if ((lMeta.mtimeMs || 0) < lastPollAt) {
              try {
                // eslint-disable-next-line no-await-in-loop
                await moveToTrash(preparedConfig.localPath, localFile);
                changes += 1;
              } catch (e) {
                emitter.emit('sync:log', { level: 'error', message: `移动回收站失败: ${e.message}` });
              }
            }
          }
        }

        lastPollAt = Date.now();
      } catch (err) {
        emitter.emit('sync:log', { level: 'error', message: `远程轮询失败: ${err.message}` });
      } finally {
        running = false;
        const duration = Date.now() - startedAt;
        // Adjust interval: busy => shrink; idle for a while => grow
        if (changes > 5 || duration > currentInterval * 0.7) {
          currentInterval = Math.max(minInterval, Math.floor(currentInterval * shrink));
          idleRounds = 0;
        } else if (changes === 0) {
          idleRounds += 1;
          if (idleRounds >= idleRoundsForBackoff) {
            currentInterval = Math.min(maxInterval, Math.floor(currentInterval * grow));
            idleRounds = 0;
          }
        } else {
          // small number of changes -> keep interval
          idleRounds = 0;
        }
        scheduleNext(currentInterval);
      }
    };

    scheduleNext(currentInterval);
    return { __rsmCancel: () => { stopped = true; if (timer) clearTimeout(timer); } };
  }

  async function startSync(config) {
    const syncId = config.id || randomUUID();
    const preparedConfig = {
      id: syncId,
      connectionId: config.connectionId,
      localPath: config.localPath,
      remotePath: config.remotePath,
      mode: config.mode || 'upload',
    };

    if (!fs.existsSync(preparedConfig.localPath)) {
      throw new Error('本地目录不存在');
    }

    if (activeSyncs.has(syncId)) {
      await stopSync(syncId, { silent: true });
    }

    // Ensure connection is valid before starting watchers
    await runWithSFTP(preparedConfig.connectionId, (sftp) => ensureRemoteDir(sftp, preparedConfig.remotePath || '.'));

    // Apply transfer concurrency for this connection
    if (typeof config.transferConcurrency === 'number') {
      setTransferConcurrency(preparedConfig.connectionId, config.transferConcurrency);
      emitter.emit('sync:log', { level: 'info', message: `传输并发已设置: ${config.transferConcurrency}` });
    }

    // Prepare ignore matcher once
    const patterns = readSyncIgnore(preparedConfig.localPath);
    const isIgnored = createIgnoreMatcher(patterns);
    preparedConfig.isIgnored = isIgnored;

    const muteSet = new Set();
    const watcher = startLocalWatcher(syncId, preparedConfig, muteSet);

    let remotePollTimer = null;
    if (preparedConfig.mode === 'bidirectional') {
      remotePollTimer = startRemotePoller(syncId, preparedConfig, muteSet);
    }

    activeSyncs.set(syncId, {
      watcher,
      config: preparedConfig,
      remotePollTimer,
    });

    emitter.emit('sync:log', { level: 'info', message: `同步任务 ${syncId} 已启动（模式：${preparedConfig.mode}）` });

    return syncId;
  }

  async function stopSync(syncId, options = {}) {
    const { silent = false } = options;
    const current = activeSyncs.get(syncId);
    if (!current) {
      return;
    }
    if (current.watcher) {
      await current.watcher.close();
    }
    if (current.remotePollTimer) {
      if (typeof current.remotePollTimer === 'object' && current.remotePollTimer.__rsmCancel) {
        current.remotePollTimer.__rsmCancel();
      } else {
        clearInterval(current.remotePollTimer);
      }
    }
    activeSyncs.delete(syncId);
    if (!silent) {
      emitter.emit('sync:log', { level: 'info', message: `同步任务 ${syncId} 已停止。` });
    }
  }

  return {
    startSync,
    stopSync,
    emitter,
  };
}

module.exports = createSyncService;
