const db = require("./mysql");

function normalizeToken(token) {
  let decoded;
  try {
    decoded = decodeURIComponent(String(token || ""));
  } catch {
    decoded = String(token || "");
  }

  return decoded
    .trim()
    .toLowerCase()
    .replace(/[^a-f0-9]/g, "");
}

function toMysqlDateTime(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString().slice(0, 19).replace("T", " ");
}

function mapInvite(row) {
  if (!row) return null;

  return {
    token: row.token,
    email: row.email || "",
    role: row.role || "",
    branch: row.branch || "",
    department: row.department || "",
    status: row.status || "pending",
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
    acceptedAt: row.acceptedAt ? new Date(row.acceptedAt).toISOString() : null,
    acceptedUsername: row.acceptedUsername || null
  };
}

async function createInvite(invite) {
  const token = normalizeToken(invite.token);

  const nextInvite = {
    token,
    email: String(invite.email || "").trim().toLowerCase(),
    role: String(invite.role || ""),
    branch: String(invite.branch || ""),
    department: String(invite.department || ""),
    status: String(invite.status || "pending"),
    createdAt: toMysqlDateTime(invite.createdAt),
    expiresAt: toMysqlDateTime(invite.expiresAt),
    acceptedAt: toMysqlDateTime(invite.acceptedAt),
    acceptedUsername: invite.acceptedUsername ? String(invite.acceptedUsername) : null
  };

  await db.execute(
    `INSERT INTO invites
    (token, email, role, branch, department, status, createdAt, expiresAt, acceptedAt, acceptedUsername)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      email = VALUES(email),
      role = VALUES(role),
      branch = VALUES(branch),
      department = VALUES(department),
      status = VALUES(status),
      createdAt = VALUES(createdAt),
      expiresAt = VALUES(expiresAt),
      acceptedAt = VALUES(acceptedAt),
      acceptedUsername = VALUES(acceptedUsername)`,
    [
      nextInvite.token,
      nextInvite.email,
      nextInvite.role,
      nextInvite.branch,
      nextInvite.department,
      nextInvite.status,
      nextInvite.createdAt,
      nextInvite.expiresAt,
      nextInvite.acceptedAt,
      nextInvite.acceptedUsername
    ]
  );

  return nextInvite;
}

async function findInviteByToken(token) {
  const key = normalizeToken(token);

  if (!key) {
    return null;
  }

  const [rows] = await db.execute(
    "SELECT * FROM invites WHERE token = ? LIMIT 1",
    [key]
  );

  return mapInvite(rows[0]);
}

async function updateInvite(token, updates) {
  const key = normalizeToken(token);

  if (!key) {
    return false;
  }

  const current = await findInviteByToken(key);

  if (!current) {
    return false;
  }

  const next = {
    email: Object.prototype.hasOwnProperty.call(updates, "email")
      ? String(updates.email || "").trim().toLowerCase()
      : current.email,
    role: Object.prototype.hasOwnProperty.call(updates, "role")
      ? String(updates.role || "")
      : current.role,
    branch: Object.prototype.hasOwnProperty.call(updates, "branch")
      ? String(updates.branch || "")
      : current.branch,
    department: Object.prototype.hasOwnProperty.call(updates, "department")
      ? String(updates.department || "")
      : current.department,
    status: Object.prototype.hasOwnProperty.call(updates, "status")
      ? String(updates.status || "pending")
      : current.status,
    createdAt: Object.prototype.hasOwnProperty.call(updates, "createdAt")
      ? toMysqlDateTime(updates.createdAt)
      : toMysqlDateTime(current.createdAt),
    expiresAt: Object.prototype.hasOwnProperty.call(updates, "expiresAt")
      ? toMysqlDateTime(updates.expiresAt)
      : toMysqlDateTime(current.expiresAt),
    acceptedAt: Object.prototype.hasOwnProperty.call(updates, "acceptedAt")
      ? toMysqlDateTime(updates.acceptedAt)
      : toMysqlDateTime(current.acceptedAt),
    acceptedUsername: Object.prototype.hasOwnProperty.call(updates, "acceptedUsername")
      ? updates.acceptedUsername ? String(updates.acceptedUsername) : null
      : current.acceptedUsername
  };

  await db.execute(
    `UPDATE invites
     SET email = ?, role = ?, branch = ?, department = ?, status = ?,
         createdAt = ?, expiresAt = ?, acceptedAt = ?, acceptedUsername = ?
     WHERE token = ?`,
    [
      next.email,
      next.role,
      next.branch,
      next.department,
      next.status,
      next.createdAt,
      next.expiresAt,
      next.acceptedAt,
      next.acceptedUsername,
      key
    ]
  );

  return true;
}

module.exports = {
  createInvite,
  findInviteByToken,
  updateInvite
};