let state = null;
let initializationPromise = null;
let kvClient = undefined;
const fs = require('fs/promises');
const path = require('path');

const DB_STATE_KEY = String(process.env.DB_STATE_KEY || 'printer-asset-app:state').trim();
const LOCAL_DB_FILE = path.join(__dirname, '..', 'data', 'local-db-state.json');

const SEED_ACCOUNTS = [
  {
    username: 'admin_account',
    passwordHash: '$2a$10$VmIUzDx21IaoiHoedyw4eO56jtOM4Tzkco1/9RqZ5Ix2SbOoqGrNi',
    role: 'admin',
    fullName: 'MSI System Administrator',
    department: 'ADMIN',
    branch: 'Silang',
    status: 'active'
  },
  {
    username: 'user_account',
    passwordHash: '$2a$10$i.4ePyGvZY2JTTRStKhVm.0OV/xqzH/qQDWT6FDFDyZMM/SjX/Cda',
    role: 'user',
    fullName: 'MSI Employee User',
    department: 'OPERATIONS',
    branch: 'Davao',
    status: 'active'
  }
];

// NOTE:
// The original seed data included a list of real employee names for demonstration purposes.
// To prevent unintended exposure of names when no external database is configured,
// we intentionally omit those demo employees from the seed state. Only two accounts
// (an administrator and a generic user) are seeded. Additional user accounts should
// be created through the application's UI or via an actual database.

const SEED_CLIENTS = [
  { id: 'cdo', name: 'CDO', location: 'Patricia Murillo', status: 'active' },
  { id: 'bsp', name: 'BSP', location: 'Janine Avila', status: 'active' },
  { id: 'alaska', name: 'Alaska', location: 'Neil Ella', status: 'active' },
  { id: 'interphil', name: 'Interphil', location: 'ABI', status: 'active' },
  { id: 'del-monte', name: 'Del Monte', location: 'Caamba', status: 'active' },
  { id: 'lamoiyan', name: 'Lamoiyan', location: 'Bicutan', status: 'active' },
  { id: 'monde', name: 'Monde', location: 'Cainta', status: 'active' },
  { id: 'purefoods', name: 'Purefoods', location: 'Gen Trias', status: 'active' }
];

const SEED_UNITS = ['CIJ', 'TTO', 'P&A', 'DOD', 'LASER', 'SUNINE', 'ANSER'];
const SEED_MACHINE_TOTAL = 0;
const PARTS_UPDATE_CHUNK_PATTERN = [1, 2, 3, 4];

const SEED_UNIT_MODELS = {
  CIJ: ['9450', '9410', '9450S', '9450E', '9330', '9750', '9750+'],
  TTO: ['8018', 'X40', 'X45', 'X60', 'X65'],
  'P&A': [
    'E-TOUCH',
    'BLOW',
    'FLEX SE SHORT LEFT HAND',
    'FLEX SE SHORT RIGHT HAND',
    'FLEX SE LONG LEFT HAND',
    'FLEX SE LONG RIGHT HAND'
  ],
  DOD: ['4020', '4500', '4700'],
  LASER: ['C150', 'C150L', 'C150S', 'C350', 'C350L', 'C350S'],
  SUNINE: [],
  ANSER: ['X1']
};

function getSeedModel(unit, index) {
  const models = SEED_UNIT_MODELS[unit];
  if (!Array.isArray(models)) {
    return `${unit}-MODEL`;
  }
  if (!models.length) {
    return '';
  }
  return models[index % models.length];
}

function normalizePersonName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function getActiveTechnicianPool(accounts = SEED_ACCOUNTS) {
  const source = Array.isArray(accounts) ? accounts : [];
  const pool = source
    .filter(account => String(account.status || '').toLowerCase() === 'active')
    .filter(account => String(account.role || '').toLowerCase() !== 'admin')
    .map(account => normalizePersonName(account.fullName))
    .filter(Boolean)
    .filter((name, index, arr) => arr.findIndex(v => v.toLowerCase() === name.toLowerCase()) === index);

  return pool.length ? pool : ['MSI Employee User'];
}

function pickTechnicianTeam(pool, clientIndex, recordIndex) {
  const safePool = Array.isArray(pool) && pool.length ? pool : ['MSI Employee User'];
  const requestedSize = Math.min([1, 2, 3, 4][recordIndex % 4], safePool.length);
  const start = (clientIndex * 7 + recordIndex * 3) % safePool.length;
  const team = [];

  for (let i = 0; i < requestedSize; i += 1) {
    const name = safePool[(start + i) % safePool.length];
    if (!team.some(existing => existing.toLowerCase() === name.toLowerCase())) {
      team.push(name);
    }
  }

  return team.length ? team : [safePool[0]];
}

function buildSeedReport(machine, position, team) {
  const technicians = Array.isArray(team) && team.length ? team : ['MSI Employee User'];
  return {
    date: machine.dateInstalled,
    submittedBy: technicians[0],
    updateIndex: null,
    technicians,
    problem: `Initial installation record for ${machine.unit} ${machine.model}.`,
    action: `Temporary record ${position + 1} created for monitoring and summary testing.`,
    recommendation: 'Verify installation details against the physical unit.'
  };
}

function buildSeedMachinesForClient(client, clientIndex, startIndex = 0, totalCount = SEED_MACHINE_TOTAL) {
  const machines = [];
  const technicianPool = getActiveTechnicianPool(SEED_ACCOUNTS);

  for (let recordIndex = startIndex; recordIndex < totalCount; recordIndex += 1) {
    const unit = 'CIJ';
    const year = 2006 + recordIndex;
    const month = String(((clientIndex + recordIndex) % 12) + 1).padStart(2, '0');
    const day = String(((clientIndex * 3 + recordIndex * 2) % 28) + 1).padStart(2, '0');
    const model = getSeedModel(unit, clientIndex + recordIndex);
    const team = pickTechnicianTeam(technicianPool, clientIndex, recordIndex);
    const machine = {
      clientId: client.id,
      clientName: client.name,
      location: client.location || '',
      unit,
      model,
      serialNo: `${unit.slice(0, 3)}-${client.id.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${String(recordIndex + 1).padStart(3, '0')}`,
      dateInstalled: `${year}-${month}-${day}`,
      runningHours: 300 + (clientIndex * 90) + (recordIndex * 45),
      status: ['Active', 'Maintenance', 'Faulty', 'Inactive'][recordIndex % 4],
      description: `Temporary seed record ${recordIndex + 1} for ${client.name}.`,
      submittedBy: team[0],
      maintenanceServiceDate: '',
      partServiceDates: {},
      partServiceHours: {},
      updates: [],
      reports: []
    };

    machine.reports.push(buildSeedReport(machine, recordIndex, team));
    machines.push(machine);
  }

  return machines;
}

function buildSeedMachines() {
  return SEED_CLIENTS.flatMap((client, clientIndex) => buildSeedMachinesForClient(client, clientIndex));
}

function mergeSeedMachines(existingMachines) {
  const current = [];
  const countsByClient = new Map();

  for (const machine of Array.isArray(existingMachines) ? existingMachines : []) {
    const clientId = String(machine.clientId || '').trim().toLowerCase();
    if (!clientId) {
      continue;
    }
    const nextCount = (countsByClient.get(clientId) || 0) + 1;
    if (nextCount > SEED_MACHINE_TOTAL) {
      continue;
    }

    countsByClient.set(clientId, nextCount);
    current.push(machine);
  }

  SEED_CLIENTS.forEach((client, clientIndex) => {
    const clientId = String(client.id || '').trim().toLowerCase();
    const existingCount = countsByClient.get(clientId) || 0;
    const remaining = Math.max(0, SEED_MACHINE_TOTAL - existingCount);
    if (remaining === 0) {
      return;
    }

    const seedRows = buildSeedMachinesForClient(client, clientIndex, existingCount, existingCount + remaining);
    current.push(...seedRows);
  });

  return current;
}

function normalizeMachineTechnicianData(machines, accounts) {
  const source = Array.isArray(machines) ? machines : [];
  const technicianPool = getActiveTechnicianPool(accounts);

  return source.map((machine, machineIndex) => {
    const defaultTeam = pickTechnicianTeam(technicianPool, machineIndex % Math.max(1, SEED_CLIENTS.length), machineIndex);
    const submittedBy = normalizePersonName(machine.submittedBy);
    const normalizedSubmittedBy = !submittedBy || submittedBy.toLowerCase() === 'system seed'
      ? defaultTeam[0]
      : submittedBy;
    const machineTechnicians = Array.isArray(machine.technicians)
      ? machine.technicians.map(normalizePersonName).filter(Boolean)
      : [];
    const normalizedMachineTechnicians = machineTechnicians.length
      ? machineTechnicians
          .filter(name => name.toLowerCase() !== 'system seed')
          .filter((name, index, arr) => arr.findIndex(v => v.toLowerCase() === name.toLowerCase()) === index)
      : [normalizedSubmittedBy];

    const reports = Array.isArray(machine.reports) ? machine.reports.map((report, reportIndex) => {
      const fallbackTeam = pickTechnicianTeam(technicianPool, machineIndex % Math.max(1, SEED_CLIENTS.length), machineIndex + reportIndex + 1);
      const reportSubmitted = normalizePersonName(report && report.submittedBy);
      const rawTechnicians = Array.isArray(report && report.technicians)
        ? report.technicians.map(normalizePersonName).filter(Boolean)
        : [];

      let technicians = rawTechnicians.filter(name => name.toLowerCase() !== 'system seed');
      if (reportSubmitted && reportSubmitted.toLowerCase() !== 'system seed') {
        technicians.unshift(reportSubmitted);
      }

      technicians = technicians
        .filter(Boolean)
        .filter((name, idx, arr) => arr.findIndex(v => v.toLowerCase() === name.toLowerCase()) === idx);

      if (!technicians.length) {
        technicians = fallbackTeam;
      }

      return {
        ...report,
        submittedBy: technicians[0],
        technicians
      };
    }) : [];
    const updates = Array.isArray(machine.updates)
      ? machine.updates.flatMap(splitPartsUpdate)
      : [];

    return {
      ...machine,
      unit: 'CIJ',
      model: getSeedModel('CIJ', machineIndex),
      submittedBy: normalizedSubmittedBy,
      technicians: normalizedMachineTechnicians,
      updates,
      reports
    };
  });
}

function normalizeToken(token) {
  let decoded;
  try {
    decoded = decodeURIComponent(String(token || ''));
  } catch {
    decoded = String(token || '');
  }
  return decoded
    .trim()
    .toLowerCase()
    .replace(/[^a-f0-9]/g, '');
}

function mapAccountRow(row) {
  return {
    username: row.username,
    passwordHash: row.passwordHash,
    role: row.role,
    fullName: row.fullName,
    department: row.department,
    branch: row.branch,
    status: row.status
  };
}

function mapClientRow(row) {
  return {
    id: row.id,
    name: row.name,
    location: row.location || '',
    status: row.status
  };
}

function cloneReport(report) {
  return { ...report };
}

function cloneMapSubset(source, keys) {
  const result = {};
  const safeSource = source && typeof source === 'object' ? source : {};
  const safeKeys = Array.isArray(keys) ? keys : [];

  for (const key of safeKeys) {
    if (Object.prototype.hasOwnProperty.call(safeSource, key)) {
      result[key] = safeSource[key];
    }
  }

  return result;
}

function splitPartsUpdate(update) {
  if (!update || typeof update !== 'object') {
    return [];
  }

  const partsUpdated = Array.isArray(update.partsUpdated)
    ? update.partsUpdated.map(name => String(name || '').trim()).filter(Boolean)
    : [];

  if (partsUpdated.length <= 4) {
    return [{
      ...update,
      partsUpdated,
      partServiceDates: cloneMapSubset(update.partServiceDates, partsUpdated),
      partServiceHours: cloneMapSubset(update.partServiceHours, partsUpdated),
      report: cloneReport(update.report)
    }];
  }

  const splitUpdates = [];
  let cursor = 0;
  let chunkIndex = 0;

  while (cursor < partsUpdated.length) {
    const requestedSize = PARTS_UPDATE_CHUNK_PATTERN[chunkIndex % PARTS_UPDATE_CHUNK_PATTERN.length];
    const chunkSize = Math.min(requestedSize, partsUpdated.length - cursor);
    const chunkParts = partsUpdated.slice(cursor, cursor + chunkSize);

    splitUpdates.push({
      ...update,
      partsUpdated: chunkParts,
      maintenanceUpdated: splitUpdates.length === 0 ? Boolean(update.maintenanceUpdated) : false,
      maintenanceServiceDate: splitUpdates.length === 0 ? String(update.maintenanceServiceDate || '') : '',
      partServiceDates: cloneMapSubset(update.partServiceDates, chunkParts),
      partServiceHours: cloneMapSubset(update.partServiceHours, chunkParts),
      report: splitUpdates.length === 0 ? cloneReport(update.report) : null
    });

    cursor += chunkSize;
    chunkIndex += 1;
  }

  return splitUpdates;
}

function mapMachineRow(row) {
  return {
    clientId: row.clientId,
    clientName: row.clientName || 'Unknown Client',
    location: row.location || 'Unknown',
    unit: row.unit || '',
    model: row.model || '',
    serialNo: row.serialNo || '',
    dateInstalled: row.dateInstalled || '',
    runningHours: Number(row.runningHours || 0),
    status: row.status || '',
    description: row.description || '',
    submittedBy: row.submittedBy || '',
    maintenanceServiceDate: row.maintenanceServiceDate || '',
    partServiceDates: { ...(row.partServiceDates || {}) },
    partServiceHours: { ...(row.partServiceHours || {}) },
    updates: Array.isArray(row.updates) ? row.updates.map(cloneReport) : [],
    reports: Array.isArray(row.reports) ? row.reports.map(cloneReport) : []
  };
}

function mapInviteRow(row) {
  return {
    token: row.token,
    email: row.email,
    role: row.role,
    branch: row.branch,
    department: row.department,
    status: row.status,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    acceptedAt: row.acceptedAt,
    acceptedUsername: row.acceptedUsername
  };
}

function mapPasswordResetRow(row) {
  return {
    token: normalizeToken(row.token),
    username: String(row.username || '').trim().toLowerCase(),
    email: String(row.email || '').trim().toLowerCase(),
    status: String(row.status || 'pending'),
    createdAt: row.createdAt ? String(row.createdAt) : null,
    expiresAt: row.expiresAt ? String(row.expiresAt) : null,
    usedAt: row.usedAt ? String(row.usedAt) : null
  };
}

function createSeedState() {
  return {
    accounts: SEED_ACCOUNTS.map(account => ({ ...account })),
    clients: SEED_CLIENTS.map(client => ({ ...client })),
    invites: [],
    passwordResets: [],
    machines: buildSeedMachines().map(machine => ({ ...machine }))
  };
}

function normalizeStateShape(candidate) {
  const source = candidate && typeof candidate === 'object' ? candidate : {};
  // Regardless of the persisted state, always use the seed accounts defined in this module.
  // This prevents the application from carrying over demo employee names when no external
  // database is configured. Admins can still create additional users via the UI, but
  // those should be persisted in a proper database rather than in the code.
  const accounts = createSeedState().accounts;
  const clients = Array.isArray(source.clients) ? source.clients.map(mapClientRow) : createSeedState().clients;
  const invites = Array.isArray(source.invites) ? source.invites.map(mapInviteRow) : [];
  const passwordResets = Array.isArray(source.passwordResets)
    ? source.passwordResets.map(mapPasswordResetRow)
    : [];
  const mergedMachines = mergeSeedMachines(Array.isArray(source.machines) ? source.machines.map(mapMachineRow) : []);
  const machines = normalizeMachineTechnicianData(mergedMachines, accounts);

  return {
    accounts,
    clients,
    invites,
    passwordResets,
    machines
  };
}

function getKvClient() {
  if (kvClient !== undefined) {
    return kvClient;
  }

  // @vercel/kv expects KV_REST_*; Upstash often provides UPSTASH_REDIS_REST_* only.
  if (!process.env.KV_REST_API_URL && process.env.UPSTASH_REDIS_REST_URL) {
    process.env.KV_REST_API_URL = process.env.UPSTASH_REDIS_REST_URL;
  }
  if (!process.env.KV_REST_API_TOKEN && process.env.UPSTASH_REDIS_REST_TOKEN) {
    process.env.KV_REST_API_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
  }

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    kvClient = null;
    return kvClient;
  }

  try {
    const { kv } = require('@vercel/kv');
    kvClient = kv || null;
  } catch (error) {
    console.warn('Vercel KV package not available, falling back to in-memory mode.');
    kvClient = null;
  }

  return kvClient;
}

async function loadLocalState() {
  try {
    const raw = await fs.readFile(LOCAL_DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const normalized = normalizeStateShape(parsed);
    // Avoid double full JSON.stringify on large DBs; only persist when shape/counts change.
    const needsWrite =
      !parsed ||
      typeof parsed !== 'object' ||
      !Array.isArray(parsed.accounts) ||
      !Array.isArray(parsed.machines) ||
      parsed.accounts.length !== normalized.accounts.length ||
      parsed.machines.length !== normalized.machines.length ||
      (Array.isArray(parsed.invites) ? parsed.invites.length : -1) !== normalized.invites.length ||
      (Array.isArray(parsed.passwordResets) ? parsed.passwordResets.length : -1) !==
        normalized.passwordResets.length;
    if (needsWrite) {
      await saveLocalState(normalized);
    }

    return normalized;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      const seed = createSeedState();
      await saveLocalState(seed);
      return seed;
    }

    console.warn('Failed to read local DB state, resetting to seed state.');
    const seed = createSeedState();
    await saveLocalState(seed);
    return seed;
  }
}

async function saveLocalState(nextState) {
  const normalized = normalizeStateShape(nextState);
  await fs.mkdir(path.dirname(LOCAL_DB_FILE), { recursive: true });
  await fs.writeFile(LOCAL_DB_FILE, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

async function getDb() {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      const kv = getKvClient();
      if (!kv) {
        state = await loadLocalState();
        return state;
      }

      const stored = await kv.get(DB_STATE_KEY);
      if (stored && typeof stored === 'object') {
        state = normalizeStateShape(stored);
      } else {
        state = createSeedState();
        await kv.set(DB_STATE_KEY, state);
      }

      return state;
    })();
  }

  return initializationPromise;
}

async function persistDb() {
  const kv = getKvClient();
  if (!state) {
    return false;
  }

  if (!kv) {
    state = await saveLocalState(state);
    return true;
  }

  await kv.set(DB_STATE_KEY, state);
  return true;
}

function getDbConfigSummary() {
  const usingKv = Boolean(getKvClient());
  return {
    mode: usingKv ? 'vercel-kv' : 'local-file',
    host: usingKv ? 'vercel' : 'localhost',
    database: usingKv ? DB_STATE_KEY : LOCAL_DB_FILE,
    ssl: usingKv
  };
}

module.exports = {
  getDb,
  persistDb,
  getDbConfigSummary,
  normalizeToken,
  mapAccountRow,
  mapClientRow,
  mapMachineRow,
  mapInviteRow
};