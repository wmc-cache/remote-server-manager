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
        .connect({
          host: config.host,
          port: config.port || 22,
          username: config.username,
          password: config.password,
          privateKey: config.privateKey,
          passphrase: config.passphrase,
          readyTimeout: config.readyTimeout || 10000,
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

  listDirectory(connectionId, remotePath) {
    const client = this.ensureConnection(connectionId);
    return new Promise((resolve, reject) => {
      client.sftp((err, sftp) => {
        if (err) {
          reject(err);
          return;
        }
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
    });
  }

  withSFTP(connectionId) {
    const client = this.ensureConnection(connectionId);
    return new Promise((resolve, reject) => {
      client.sftp((err, sftp) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(sftp);
      });
    });
  }

  readFile(connectionId, remotePath) {
    const client = this.ensureConnection(connectionId);
    return new Promise((resolve, reject) => {
      client.sftp((err, sftp) => {
        if (err) {
          reject(err);
          return;
        }
        const stream = sftp.createReadStream(remotePath, { encoding: 'utf-8' });
        let data = '';
        stream.on('data', (chunk) => {
          data += chunk;
        });
        stream.on('end', () => resolve(data));
        stream.on('error', (error) => reject(error));
      });
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
