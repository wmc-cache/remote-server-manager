const { randomUUID } = require('crypto');
const Store = require('electron-store');

class ConnectionStore {
  constructor() {
    this.store = new Store({
      name: 'remote-server-manager',
      defaults: {
        connections: [],
        syncMappings: [],
      },
    });
  }

  getConnections() {
    return this.store.get('connections');
  }

  async saveConnection(connection) {
    const connections = this.getConnections();
    if (connection.id) {
      const idx = connections.findIndex((item) => item.id === connection.id);
      if (idx !== -1) {
        connections[idx] = { ...connections[idx], ...connection };
      } else {
        connections.push({ ...connection });
      }
    } else {
      connections.push({ ...connection, id: randomUUID() });
    }
    this.store.set('connections', connections);
    return connections.find((item) => item.id === connection.id) || connections[connections.length - 1];
  }

  async deleteConnection(id) {
    const updated = this.getConnections().filter((item) => item.id !== id);
    this.store.set('connections', updated);
  }

  getSyncMappings() {
    const raw = this.store.get('syncMappings') || [];
    let mutated = false;
    const normalized = raw.map((item) => {
      if (!item.mode) {
        mutated = true;
        return { ...item, mode: 'upload' };
      }
      if (!item.kind) {
        mutated = true;
        return { ...item, kind: 'dir' };
      }
      return item;
    });
    if (mutated) {
      this.store.set('syncMappings', normalized);
    }
    return normalized;
  }

  async saveSyncMapping(mapping) {
    const mappings = this.getSyncMappings();
    const normalize = (payload, previous = {}) => {
      const timestamp = new Date().toISOString();
      return {
        ...previous,
        ...payload,
        mode: payload.mode || previous.mode || 'upload',
        kind: payload.kind || previous.kind || 'dir',
        updatedAt: timestamp,
      };
    };
    if (mapping.id) {
      const idx = mappings.findIndex((item) => item.id === mapping.id);
      if (idx !== -1) {
        mappings[idx] = normalize(mapping, mappings[idx]);
      } else {
        mappings.push(normalize(mapping));
      }
    } else {
      const timestamp = new Date().toISOString();
      mappings.push({
        ...normalize(mapping),
        id: randomUUID(),
        createdAt: timestamp,
      });
    }
    this.store.set('syncMappings', mappings);
    return mappings.find((item) => item.id === mapping.id) || mappings[mappings.length - 1];
  }

  async deleteSyncMapping(id) {
    const updated = this.getSyncMappings().filter((item) => item.id !== id);
    this.store.set('syncMappings', updated);
  }

  // DeepSeek 配置管理
  getDeepSeekConfig() {
    return this.store.get('deepSeekConfig') || {
      apiKey: '',
      apiBaseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      enabled: false,
    };
  }

  setDeepSeekConfig(config) {
    this.store.set('deepSeekConfig', {
      apiKey: config.apiKey || '',
      apiBaseUrl: config.apiBaseUrl || 'https://api.deepseek.com',
      model: config.model || 'deepseek-chat',
      enabled: config.enabled || false,
    });
  }
}

module.exports = ConnectionStore;
