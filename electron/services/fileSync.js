const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const chokidar = require('chokidar');
const { EventEmitter } = require('events');

const posixPath = path.posix;

function createSyncService(sshClient) {
  const activeSyncs = new Map();
  const emitter = new EventEmitter();
  const queues = new Map(); // connectionId -> promise chain

  function schedule(connectionId, task) {
    const prev = queues.get(connectionId) || Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(() => task());
    // ensure errors don't break the chain
    queues.set(connectionId, next.catch(() => {}));
    return next;
  }

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
    }));
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
    })));
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

  async function listRemoteTree(connectionId, remoteRoot) {
    return schedule(connectionId, () => runWithSFTP(connectionId, async (sftp) => {
      const result = new Map(); // key: posix path relative
      const root = remoteRoot || '.';

      async function walk(dir) {
        const entries = await new Promise((resolve, reject) => {
          sftp.readdir(dir, (err, list) => (err ? reject(err) : resolve(list || [])));
        });
        for (const item of entries) {
          const full = posixPath.join(dir, item.filename);
          const isDir = item.attrs?.isDirectory && item.attrs.isDirectory();
          const rel = posixPath.relative(root, full);
          result.set(rel, {
            isDir,
            size: item.attrs?.size,
            mtimeMs: (item.attrs?.mtime || 0) * 1000,
            full,
          });
          if (isDir) {
            // eslint-disable-next-line no-await-in-loop
            await walk(full);
          }
        }
      }
      await walk(root);
      return result;
    }));
  }

  async function listLocalTree(localRoot) {
    const result = new Map(); // key: posix-like relative path
    async function walk(dir) {
      const names = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of names) {
        const full = path.join(dir, entry.name);
        const rel = path.relative(localRoot, full).split(path.sep).join('/');
        if (entry.isDirectory()) {
          result.set(rel, { isDir: true });
          // eslint-disable-next-line no-await-in-loop
          await walk(full);
        } else {
          const st = await fs.promises.stat(full);
          result.set(rel, { isDir: false, size: st.size, mtimeMs: st.mtimeMs });
        }
      }
    }
    await walk(localRoot);
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
    })));
    emitter.emit('sync:log', { level: 'info', message: `删除远程 ${remoteFile}` });
  }

  function startLocalWatcher(syncId, config, muteSet) {
    const watcher = chokidar.watch(config.localPath, {
      ignoreInitial: true,
      persistent: true,
    });

    const handleError = (err) => emitter.emit('sync:log', { level: 'error', message: `同步失败: ${err.message}` });

    watcher
      .on('add', (filePath) => {
        if (muteSet.has(filePath)) return;
        uploadFile(config.connectionId, filePath, toRemotePath(config.localPath, config.remotePath, filePath)).catch(handleError);
      })
      .on('change', (filePath) => {
        if (muteSet.has(filePath)) return;
        uploadFile(config.connectionId, filePath, toRemotePath(config.localPath, config.remotePath, filePath)).catch(handleError);
      })
      .on('unlink', (filePath) => deleteRemote(config.connectionId, toRemotePath(config.localPath, config.remotePath, filePath), false).catch(handleError))
      .on('unlinkDir', (dirPath) => deleteRemote(config.connectionId, toRemotePath(config.localPath, config.remotePath, dirPath), true).catch(handleError))
      .on('error', (err) => emitter.emit('sync:log', { level: 'error', message: `本地监听错误: ${err.message}` }));

    return watcher;
  }

  function startRemotePoller(syncId, preparedConfig, muteSet) {
    const intervalMs = 2000;
    let running = false;
    let lastPollAt = Date.now();

    const timer = setInterval(async () => {
      if (running) return;
      running = true;
      try {
        const [remoteMap, localMap] = await Promise.all([
          listRemoteTree(preparedConfig.connectionId, preparedConfig.remotePath),
          listLocalTree(preparedConfig.localPath),
        ]);

        // Ensure directories exist locally
        for (const [rel, meta] of remoteMap.entries()) {
          if (meta.isDir) {
            await fs.promises.mkdir(path.join(preparedConfig.localPath, rel.split('/').join(path.sep)), { recursive: true }).catch(() => {});
          }
        }

        // Sync remote -> local (create/modify)
        for (const [rel, rMeta] of remoteMap.entries()) {
          if (rMeta.isDir) continue;
          const localFile = path.join(preparedConfig.localPath, rel.split('/').join(path.sep));
          const lMeta = localMap.get(rel);
          const localMtime = lMeta?.mtimeMs || 0;
          const remoteMtime = rMeta.mtimeMs || 0;
          const sizeDiffers = typeof lMeta?.size === 'number' && typeof rMeta.size === 'number' && lMeta.size !== rMeta.size;
          const remoteNewer = remoteMtime - localMtime > 500; // allow coarse mtime (seconds)
          const shouldDownload = !lMeta || sizeDiffers || remoteNewer;
          if (shouldDownload) {
            muteSet.add(localFile);
            try {
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
          if (!remoteMap.has(rel)) {
            const localFile = path.join(preparedConfig.localPath, rel.split('/').join(path.sep));
            // Only if file older than last poll to reduce conflicts
            if ((lMeta.mtimeMs || 0) < lastPollAt) {
              try {
                await moveToTrash(preparedConfig.localPath, localFile);
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
      }
    }, intervalMs);

    return timer;
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
      clearInterval(current.remotePollTimer);
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
