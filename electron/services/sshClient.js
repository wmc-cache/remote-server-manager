const { randomUUID } = require('crypto');
const { Client } = require('ssh2');

class SSHClientService {
  constructor() {
    this.connections = new Map();
  }

  connect(config) {
    return new Promise((resolve, reject) => {
      const client = new Client();
      const connectionId = config.id || randomUUID();

      if (this.connections.has(connectionId)) {
        this.disconnect(connectionId);
      }

      client
        .on('ready', () => {
          this.connections.set(connectionId, { client, config: { ...config, id: connectionId } });
          resolve({ id: connectionId });
        })
        .on('error', (error) => {
          client.end();
          reject(error);
        })
        .on('end', () => {
          this.connections.delete(connectionId);
        })
        .on('close', () => {
          this.connections.delete(connectionId);
        })
        .connect({
          host: config.host,
          port: config.port || 22,
          username: config.username,
          password: config.password,
          privateKey: config.privateKey,
          passphrase: config.passphrase,
          readyTimeout: config.readyTimeout || 10000,
          keepaliveInterval: 10000,
          keepaliveCountMax: 3,
        });
    });
  }

  ensureConnection(connectionId) {
    const record = this.connections.get(connectionId);
    if (!record) {
      throw new Error('Connection not found or not established.');
    }
    return record.client;
  }

  async getSFTP(connectionId) {
    const record = this.connections.get(connectionId);
    if (!record) {
      throw new Error('Connection not found or not established.');
    }
    if (record.sftp && !record.sftp.__closed) {
      return record.sftp;
    }
    if (record.sftpReady) {
      return record.sftpReady;
    }
    const openOnce = () => new Promise((resolve, reject) => {
      record.client.sftp((err, sftp) => {
        if (err) {
          reject(err);
          return;
        }
        sftp.__closed = false;
        const cleanup = () => {
          sftp.__closed = true;
          record.sftp = null;
          record.sftpReady = null;
        };
        sftp.on('close', cleanup);
        sftp.on('end', cleanup);
        sftp.on('error', () => {});
        record.sftp = sftp;
        resolve(sftp);
      });
    });

    const retry = async (retries = 3, delay = 500) => {
      try {
        const sftp = await openOnce();
        return sftp;
      } catch (e) {
        if (retries <= 0) {
          record.sftpReady = null;
          throw e;
        }
        await new Promise((r) => setTimeout(r, delay));
        return retry(retries - 1, Math.min(delay * 2, 2000));
      }
    };

    record.sftpReady = retry().finally(() => {
      // clear marker after initial resolve/reject so next call can retry
      record.sftpReady = null;
    });
    return record.sftpReady;
  }

  async listDirectory(connectionId, remotePath) {
    const sftp = await this.getSFTP(connectionId);
    return new Promise((resolve, reject) => {
      const pathToRead = remotePath || '.';
      sftp.readdir(pathToRead, (error, list) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(list.map((item) => ({
          filename: item.filename,
          longname: item.longname,
          attrs: {
            size: item.attrs.size,
            isDirectory: item.attrs.isDirectory && item.attrs.isDirectory(),
            permissions: item.attrs.permissions,
            mtime: item.attrs.mtime,
          },
        })));
      });
    });
  }

  withSFTP(connectionId) {
    return this.getSFTP(connectionId);
  }

  async readFile(connectionId, remotePath) {
    const sftp = await this.getSFTP(connectionId);
    return new Promise((resolve, reject) => {
      const stream = sftp.createReadStream(remotePath, { encoding: 'utf-8' });
      let data = '';
      stream.on('data', (chunk) => { data += chunk; });
      stream.on('end', () => resolve(data));
      stream.on('error', (error) => reject(error));
    });
  }

  async readFileBinary(connectionId, remotePath) {
    const sftp = await this.getSFTP(connectionId);
    return new Promise((resolve, reject) => {
      const stream = sftp.createReadStream(remotePath); // Buffer chunks
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      stream.on('end', () => {
        try {
          const buf = Buffer.concat(chunks);
          resolve(buf.toString('base64'));
        } catch (e) {
          reject(e);
        }
      });
      stream.on('error', (error) => reject(error));
    });
  }

  async statPath(connectionId, remotePath) {
    const sftp = await this.getSFTP(connectionId);
    return new Promise((resolve, reject) => {
      sftp.stat(remotePath, (err, attrs) => {
        if (err) {
          const notFound = err.code === 2 || /no such file/i.test(err.message || '');
          if (notFound) { resolve(null); return; }
          reject(err);
          return;
        }
        const result = {
          size: attrs?.size,
          mtimeSec: attrs?.mtime || 0,
          mtimeMs: (attrs?.mtime || 0) * 1000,
          isDirectory: attrs?.isDirectory && attrs.isDirectory(),
        };
        resolve(result);
      });
    });
  }

  async downloadFile(connectionId, remotePath, localPath) {
    const sftp = await this.getSFTP(connectionId);
    return new Promise((resolve, reject) => {
      sftp.fastGet(remotePath, localPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(true);
      });
    });
  }

  async deleteFile(connectionId, remotePath) {
    const sftp = await this.getSFTP(connectionId);
    return new Promise((resolve, reject) => {
      sftp.unlink(remotePath, (unlinkErr) => {
        if (unlinkErr) {
          reject(unlinkErr);
          return;
        }
        resolve(true);
      });
    });
  }

  deletePath(connectionId, remotePath, options = {}) {
    const recursive = options.recursive !== false; // default true
    const client = this.ensureConnection(connectionId);
    return new Promise((resolve, reject) => {
      client.sftp((err, sftp) => {
        if (err) {
          reject(err);
          return;
        }

        const stat = (p) => new Promise((res, rej) => {
          sftp.stat(p, (e, attrs) => {
            if (e) {
              // If not found, treat as success
              if (e.code === 2 || /no such file/i.test(e.message || '')) {
                res(null);
                return;
              }
              rej(e);
              return;
            }
            res(attrs);
          });
        });

        const readdir = (p) => new Promise((res, rej) => {
          sftp.readdir(p, (e, list) => (e ? rej(e) : res(list || [])));
        });

        const unlink = (p) => new Promise((res, rej) => {
          sftp.unlink(p, (e) => (e && e.code !== 2 ? rej(e) : res()));
        });

        const rmdir = (p) => new Promise((res, rej) => {
          sftp.rmdir(p, (e) => (e && e.code !== 2 ? rej(e) : res()));
        });

        const posix = require('path').posix;

        const removeRecursive = async (p) => {
          const attrs = await stat(p);
          if (!attrs) return; // already gone
          const isDir = attrs.isDirectory && attrs.isDirectory();
          if (!isDir) {
            await unlink(p);
            return;
          }
          if (!recursive) {
            await rmdir(p);
            return;
          }
          const entries = await readdir(p);
          for (const item of entries) {
            const child = posix.join(p, item.filename);
            // eslint-disable-next-line no-await-in-loop
            await removeRecursive(child);
          }
          await rmdir(p);
        };

        removeRecursive(remotePath).then(() => resolve(true)).catch(reject);
      });
    });
  }

  async writeFile(connectionId, remotePath, content) {
    const sftp = await this.getSFTP(connectionId);
    return new Promise((resolve, reject) => {
      const tempPath = `${remotePath}.${Date.now()}.tmp`;
      const tmpStream = sftp.createWriteStream(tempPath, { encoding: 'utf8', flags: 'w' });

      let settled = false;
      const settleOnce = (fn) => (arg) => {
        if (settled) return;
        settled = true;
        fn(arg);
      };

      const onError = settleOnce((error) => reject(error));
      const onClose = settleOnce(() => {
        const tryDirectWrite = () => {
          const ws = sftp.createWriteStream(remotePath, { encoding: 'utf8', flags: 'w' });
          ws.on('error', (e) => { sftp.unlink(tempPath, () => {}); reject(e); });
          ws.on('close', () => { sftp.unlink(tempPath, () => {}); resolve(true); });
          ws.end(typeof content === 'string' ? content : String(content), 'utf8');
        };

        sftp.rename(tempPath, remotePath, (renameErr) => {
          if (renameErr) {
            sftp.unlink(remotePath, () => {
              sftp.rename(tempPath, remotePath, (renameErr2) => {
                if (renameErr2) { tryDirectWrite(); return; }
                resolve(true);
              });
            });
            return;
          }
          resolve(true);
        });
      });

      tmpStream.on('error', onError);
      tmpStream.on('close', onClose);
      tmpStream.on('finish', onClose);

      const timeout = setTimeout(() => onError(new Error('SFTP write timed out')), 20000);
      tmpStream.on('close', () => clearTimeout(timeout));
      tmpStream.on('finish', () => clearTimeout(timeout));
      tmpStream.on('error', () => clearTimeout(timeout));

      tmpStream.end(typeof content === 'string' ? content : String(content), 'utf8');
    });
  }

  executeCommand(connectionId, command) {
    const client = this.ensureConnection(connectionId);
    return new Promise((resolve, reject) => {
      client.exec(command, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }
        let stdout = '';
        let stderr = '';
        stream
          .on('close', (code) => {
            resolve({ code, stdout, stderr });
          })
          .on('data', (data) => {
            stdout += data.toString();
          })
          .stderr.on('data', (data) => {
            stderr += data.toString();
          });
      });
    });
  }

  disconnect(connectionId) {
    const record = this.connections.get(connectionId);
    if (record) {
      record.client.end();
      this.connections.delete(connectionId);
    }
  }
}

module.exports = SSHClientService;
