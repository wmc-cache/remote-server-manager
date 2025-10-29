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
    return this.store.get('syncMappings');
  }

  async saveSyncMapping(mapping) {
    const mappings = this.getSyncMappings();
    if (mapping.id) {
      const idx = mappings.findIndex((item) => item.id === mapping.id);
      if (idx !== -1) {
        mappings[idx] = { ...mappings[idx], ...mapping, updatedAt: new Date().toISOString() };
      } else {
        mappings.push({ ...mapping, updatedAt: new Date().toISOString() });
      }
    } else {
      const timestamp = new Date().toISOString();
      mappings.push({ ...mapping, id: randomUUID(), createdAt: timestamp, updatedAt: timestamp });
    }
    this.store.set('syncMappings', mappings);
    return mappings.find((item) => item.id === mapping.id) || mappings[mappings.length - 1];
  }

  async deleteSyncMapping(id) {
    const updated = this.getSyncMappings().filter((item) => item.id !== id);
    this.store.set('syncMappings', updated);
  }
}

module.exports = ConnectionStore;
