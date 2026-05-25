require("dotenv").config();
const mysql = require("mysql2/promise");

function pickEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return undefined;
}

const pool = mysql.createPool({
  host: pickEnv("MYSQLHOST", "DB_HOST") || "localhost",
  port: Number(pickEnv("MYSQLPORT", "DB_PORT") || 3306),
  user: pickEnv("MYSQLUSER", "DB_USER") || "root",
  password: pickEnv("MYSQLPASSWORD", "DB_PASSWORD") || "@ndreW11",
  database: pickEnv("MYSQLDATABASE", "DB_NAME") || "matsol_technical",
  waitForConnections: true,
  connectionLimit: 10
});

async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log("✅ MySQL Connected");
    conn.release();
  } catch (err) {
    console.error("❌ MySQL Error:", err.message);
  }
}

testConnection();

module.exports = pool;
