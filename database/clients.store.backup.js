const { getDb, persistDb } = require('./memory');

function cloneClient(client) {
  return { ...client };
}

function normalizeClientId(clientId) {
  return String(clientId || '').trim().toLowerCase();
}

async function listClients() {
  const db = await getDb();
  return db.clients.slice().sort((a, b) => a.name.localeCompare(b.name)).map(cloneClient);
}

async function listActiveClients() {
  const db = await getDb();
  return db.clients
    .filter(client => client.status !== 'inactive')
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(cloneClient);
}

async function findClientById(clientId) {
  const db = await getDb();
  const key = normalizeClientId(clientId);
  const found = db.clients.find(client => client.id === key);
  return found ? cloneClient(found) : null;
}

async function findActiveClientByName(name) {
  const key = String(name || '').trim().toLowerCase();
  const db = await getDb();
  const found = db.clients.find(client => String(client.name || '').trim().toLowerCase() === key && client.status !== 'inactive');
  return found ? cloneClient(found) : null;
}

async function createClient(client) {
  const db = await getDb();
  const id = normalizeClientId(client.id);
  if (db.clients.some(existing => existing.id === id)) {
    return false;
  }

  db.clients.push({
    id,
    name: String(client.name || '').trim(),
    location: String(client.location || '').trim(),
    status: String(client.status || 'active')
  });

  await persistDb();

  return true;
}

async function updateClient(clientId, updates) {
  const db = await getDb();
  const key = normalizeClientId(clientId);
  const target = db.clients.find(client => client.id === key);

  if (!target) {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
    target.name = String(updates.name || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'location')) {
    target.location = String(updates.location || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
    target.status = String(updates.status || 'active');
  }

  await persistDb();

  return true;
}

async function setClientStatus(clientId, status) {
  return updateClient(clientId, { status });
}

module.exports = {
  listClients,
  listActiveClients,
  findClientById,
  findActiveClientByName,
  createClient,
  updateClient,
  setClientStatus
};