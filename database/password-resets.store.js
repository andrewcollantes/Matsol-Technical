const { getDb, normalizeToken, persistDb } = require('./memory');

function cloneResetEntry(entry) {
  return { ...entry };
}

async function createPasswordReset(resetEntry) {
  const db = await getDb();
  const token = normalizeToken(resetEntry.token);

  const nextEntry = {
    token,
    username: String(resetEntry.username || '').trim().toLowerCase(),
    email: String(resetEntry.email || '').trim().toLowerCase(),
    status: String(resetEntry.status || 'pending'),
    createdAt: resetEntry.createdAt ? String(resetEntry.createdAt) : null,
    expiresAt: resetEntry.expiresAt ? String(resetEntry.expiresAt) : null,
    usedAt: resetEntry.usedAt ? String(resetEntry.usedAt) : null
  };

  if (!Array.isArray(db.passwordResets)) {
    db.passwordResets = [];
  }

  const existingIndex = db.passwordResets.findIndex(existing => existing.token === token);
  if (existingIndex >= 0) {
    db.passwordResets[existingIndex] = nextEntry;
  } else {
    db.passwordResets.push(nextEntry);
  }

  await persistDb();
  return cloneResetEntry(nextEntry);
}

async function findPasswordResetByToken(token) {
  const key = normalizeToken(token);
  if (!key) {
    return null;
  }

  const db = await getDb();
  const entries = Array.isArray(db.passwordResets) ? db.passwordResets : [];
  const found = entries.find(entry => entry.token === key);
  return found ? cloneResetEntry(found) : null;
}

async function updatePasswordReset(token, updates = {}) {
  const key = normalizeToken(token);
  const db = await getDb();
  const entries = Array.isArray(db.passwordResets) ? db.passwordResets : [];
  const target = entries.find(entry => entry.token === key);

  if (!target) {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'username')) {
    target.username = String(updates.username || '').trim().toLowerCase();
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'email')) {
    target.email = String(updates.email || '').trim().toLowerCase();
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
    target.status = String(updates.status || 'pending');
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'createdAt')) {
    target.createdAt = updates.createdAt ? String(updates.createdAt) : null;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'expiresAt')) {
    target.expiresAt = updates.expiresAt ? String(updates.expiresAt) : null;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'usedAt')) {
    target.usedAt = updates.usedAt ? String(updates.usedAt) : null;
  }

  await persistDb();
  return true;
}

module.exports = {
  createPasswordReset,
  findPasswordResetByToken,
  updatePasswordReset
};
