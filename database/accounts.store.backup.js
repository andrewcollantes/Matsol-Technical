const { getDb, persistDb } = require('./memory');

function cloneAccount(account) {
  return { ...account };
}

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

async function readAccounts() {
  const db = await getDb();
  return db.accounts.slice().sort((a, b) => a.username.localeCompare(b.username)).map(cloneAccount);
}

async function findActiveAccountByUsername(username) {
  const db = await getDb();
  const key = normalizeUsername(username);
  const found = db.accounts.find(account => account.username === key && account.status !== 'inactive');
  return found ? cloneAccount(found) : null;
}

async function findAccountByUsername(username) {
  const db = await getDb();
  const key = normalizeUsername(username);
  const found = db.accounts.find(account => account.username === key);
  return found ? cloneAccount(found) : null;
}

async function findAccountByEmail(email) {
  const db = await getDb();
  const key = String(email || '').trim().toLowerCase();
  if (!key) {
    return null;
  }

  const found = db.accounts.find(account => String(account.email || '').trim().toLowerCase() === key);
  return found ? cloneAccount(found) : null;
}

async function listUserAccounts() {
  const db = await getDb();
  return db.accounts
    .filter(account => account.role === 'user')
    .slice()
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
    .map(cloneAccount);
}

async function usernameExists(username) {
  const db = await getDb();
  const key = normalizeUsername(username);
  return db.accounts.some(account => account.username === key);
}

async function createUserAccount(account) {
  const db = await getDb();
  const username = normalizeUsername(account.username);
  if (db.accounts.some(existing => existing.username === username)) {
    return false;
  }

  db.accounts.push({
    username,
    passwordHash: String(account.passwordHash || ''),
    role: String(account.role || 'user'),
    fullName: String(account.fullName || ''),
    email: String(account.email || '').trim().toLowerCase(),
    department: String(account.department || ''),
    branch: String(account.branch || ''),
    status: String(account.status || 'active')
  });

  await persistDb();

  return true;
}

async function updateUserAccount(username, updates) {
  const db = await getDb();
  const key = normalizeUsername(username);
  const target = db.accounts.find(account => account.username === key && account.role === 'user');

  if (!target) {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'fullName')) {
    target.fullName = String(updates.fullName || '');
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'department')) {
    target.department = String(updates.department || '');
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'branch')) {
    target.branch = String(updates.branch || '');
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
    target.status = String(updates.status || 'active');
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'passwordHash')) {
    target.passwordHash = String(updates.passwordHash || '');
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'email')) {
    target.email = String(updates.email || '').trim().toLowerCase();
  }

  await persistDb();

  return true;
}

async function resetUserPassword(username, passwordHash) {
  return updateUserAccount(username, { passwordHash });
}

async function setUserStatus(username, status) {
  return updateUserAccount(username, { status });
}

module.exports = {
  readAccounts,
  findAccountByUsername,
  findAccountByEmail,
  findActiveAccountByUsername,
  listUserAccounts,
  usernameExists,
  createUserAccount,
  updateUserAccount,
  resetUserPassword,
  setUserStatus
};