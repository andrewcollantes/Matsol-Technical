require('dotenv').config();
const os = require('os');


const _origConsoleLog = console.log;
const _origConsoleWarn = console.warn;
console.log = () => { };
console.warn = () => { };

const app = require('./app');
const { getDb, getDbConfigSummary } = require('./database/memory');
const HOST = '0.0.0.0';
const PORT = process.env.PORT || 3000;

function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }

  return Array.from(new Set(addresses));
}

async function startServer() {
  await getDb();

  app.listen(PORT, HOST, () => {
    // Restore console methods so we only print the single desired line.
    console.log = _origConsoleLog;
    console.warn = _origConsoleWarn;

    const cfg = getDbConfigSummary();
    const onEphemeralHost = Boolean(process.env.RENDER || process.env.FLY_APP_NAME || process.env.VERCEL);
    if (cfg.mode === 'local-file' && onEphemeralHost) {
      console.warn(
        'WARNING: Database is local JSON file storage on a cloud host. Data (invites, accounts, resets) is lost when the instance restarts. Set KV_REST_API_URL and KV_REST_API_TOKEN (Upstash Redis; you can paste UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN from the Upstash console).'
      );
    }

    const addresses = getLocalIpAddresses();
    // Prefer an RFC1918 192.168.x.x address when available (typical Wi‑Fi LAN).
    const preferred = addresses.find(a => /^192\.168\./.test(a)) || addresses[0] || 'localhost';
    console.log(`Server running at http://${preferred}:${PORT}`);
  });
}

startServer().catch(error => {
  console.error('Failed to initialize application:', error);
  process.exit(1);
});