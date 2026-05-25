const db = require("./mysql");

function normalizeUsername(username) {
    return String(username || "").trim().toLowerCase();
}

async function readAccounts() {
    const [rows] = await db.query(
        "SELECT * FROM accounts ORDER BY username"
    );

    return rows;
}

async function findActiveAccountByUsername(username) {
    const [rows] = await db.execute(
        `SELECT * FROM accounts
         WHERE username = ? AND status != 'inactive'`,
        [normalizeUsername(username)]
    );

    return rows[0] || null;
}

async function findAccountByUsername(username) {
    const [rows] = await db.execute(
        "SELECT * FROM accounts WHERE username = ?",
        [normalizeUsername(username)]
    );

    return rows[0] || null;
}

async function listUserAccounts() {
    const [rows] = await db.execute(
        "SELECT * FROM accounts WHERE role='user'"
    );

    return rows;
}

async function usernameExists(username) {
    const [rows] = await db.execute(
        "SELECT username FROM accounts WHERE username=?",
        [normalizeUsername(username)]
    );

    return rows.length > 0;
}

async function createUserAccount(account) {
    await db.execute(
        `INSERT INTO accounts
        (username,passwordHash,role,fullName,department,branch,status)
        VALUES (?,?,?,?,?,?,?)`,
        [
            normalizeUsername(account.username),
            account.passwordHash,
            account.role || "user",
            account.fullName || "",
            account.department || "",
            account.branch || "",
            account.status || "active"
        ]
    );

    return true;
}

module.exports = {
    readAccounts,
    findActiveAccountByUsername,
    findAccountByUsername,
    listUserAccounts,
    usernameExists,
    createUserAccount
};