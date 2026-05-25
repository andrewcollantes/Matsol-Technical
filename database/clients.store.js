const db = require("./mysql");

function normalizeClientId(clientId) {
  return String(clientId || "").trim().toLowerCase();
}

async function listClients() {
  const [rows] = await db.query(
    "SELECT id, name, location, status FROM clients ORDER BY name"
  );
  return rows;
}

async function listActiveClients() {
  const [rows] = await db.query(
    "SELECT id, name, location, status FROM clients WHERE status != 'inactive' ORDER BY name"
  );
  return rows;
}

async function findClientById(clientId) {
  const [rows] = await db.execute(
    "SELECT id, name, location, status FROM clients WHERE id = ?",
    [normalizeClientId(clientId)]
  );
  return rows[0] || null;
}

async function findActiveClientByName(name) {
  const [rows] = await db.execute(
    "SELECT id, name, location, status FROM clients WHERE LOWER(name) = ? AND status != 'inactive'",
    [String(name || "").trim().toLowerCase()]
  );
  return rows[0] || null;
}

async function createClient(client) {
  await db.execute(
    "INSERT INTO clients (id, name, location, status) VALUES (?, ?, ?, ?)",
    [
      normalizeClientId(client.id),
      String(client.name || "").trim(),
      String(client.location || "").trim(),
      String(client.status || "active")
    ]
  );
  return true;
}

async function updateClient(clientId, updates) {
  await db.execute(
    "UPDATE clients SET name = ?, location = ?, status = ? WHERE id = ?",
    [
      String(updates.name || "").trim(),
      String(updates.location || "").trim(),
      String(updates.status || "active"),
      normalizeClientId(clientId)
    ]
  );
  return true;
}

async function setClientStatus(clientId, status) {
  await db.execute(
    "UPDATE clients SET status = ? WHERE id = ?",
    [String(status || "active"), normalizeClientId(clientId)]
  );
  return true;
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