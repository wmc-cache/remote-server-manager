const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const chokidar = require('chokidar');
const { EventEmitter } = require('events');

const posixPath = path.posix;

function createSyncService(sshClient) {
  const activeSyncs = new Map();
  const emitter = new EventEmitter();

  async function runWithSFTP(connectionId, handler) {
    const sftp = await sshClient.withSFTP(connectionId);
    try {
      return await handler(sftp);
    } finally {
      if (typeof sftp.end === 'function') {
        sftp.end();
      }
    }
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

  async function uploadFile(connectionId, localFile, remoteFile) {
    await runWithSFTP(connectionId, async (sftp) => {
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
    });
    emitter.emit('sync:log', { level: 'info', message: `上传 ${localFile} -> ${remoteFile}` });
  }

  async function deleteRemote(connectionId, remoteFile, isDir) {
    await runWithSFTP(connectionId, async (sftp) => new Promise((resolve, reject) => {
      const handler = isDir ? sftp.rmdir.bind(sftp) : sftp.unlink.bind(sftp);
      handler(remoteFile, (err) => {
        if (err && err.code !== 2) {
          reject(err);
          return;
        }
        resolve();
      });
    }));
    emitter.emit('sync:log', { level: 'info', message: `删除远程 ${remoteFile}` });
  }

  function startLocalWatcher(syncId, config) {
    const watcher = chokidar.watch(config.localPath, {
      ignoreInitial: true,
      persistent: true,
    });

    const handleError = (err) => emitter.emit('sync:log', { level: 'error', message: `同步失败: ${err.message}` });

    watcher
      .on('add', (filePath) => uploadFile(config.connectionId, filePath, toRemotePath(config.localPath, config.remotePath, filePath)).catch(handleError))
      .on('change', (filePath) => uploadFile(config.connectionId, filePath, toRemotePath(config.localPath, config.remotePath, filePath)).catch(handleError))
      .on('unlink', (filePath) => deleteRemote(config.connectionId, toRemotePath(config.localPath, config.remotePath, filePath), false).catch(handleError))
      .on('unlinkDir', (dirPath) => deleteRemote(config.connectionId, toRemotePath(config.localPath, config.remotePath, dirPath), true).catch(handleError))
      .on('error', (err) => emitter.emit('sync:log', { level: 'error', message: `本地监听错误: ${err.message}` }));

    return watcher;
  }

  async function startSync(config) {
    const syncId = config.id || randomUUID();
    const preparedConfig = {
      id: syncId,
      connectionId: config.connectionId,
      localPath: config.localPath,
      remotePath: config.remotePath,
      mode: config.mode || 'bidirectional',
    };

    if (!fs.existsSync(preparedConfig.localPath)) {
      throw new Error('本地目录不存在');
    }

    if (activeSyncs.has(syncId)) {
      await stopSync(syncId);
    }

    // Ensure connection is valid before starting watchers
    await runWithSFTP(preparedConfig.connectionId, (sftp) => ensureRemoteDir(sftp, preparedConfig.remotePath || '.'));

    const watcher = startLocalWatcher(syncId, preparedConfig);

    activeSyncs.set(syncId, {
      watcher,
      config: preparedConfig,
      remotePollTimer: null,
    });

    emitter.emit('sync:log', { level: 'info', message: `同步任务 ${syncId} 已启动（模式：${preparedConfig.mode}）` });

    // Placeholder for remote→local同步，可在后续接入基于 inotifywait 或 rsync 的方案
    emitter.emit('sync:log', { level: 'warn', message: '远程→本地同步尚未实现，将在后续版本支持。' });

    return syncId;
  }

  async function stopSync(syncId) {
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
    emitter.emit('sync:log', { level: 'info', message: `同步任务 ${syncId} 已停止。` });
  }

  return {
    startSync,
    stopSync,
    emitter,
  };
}

module.exports = createSyncService;
