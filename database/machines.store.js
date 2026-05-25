const db = require("./mysql");

async function findMachineForKey(key) {
  if (key && key.id) {
    const [byId] = await db.execute(
      "SELECT * FROM machines WHERE id = ? LIMIT 1",
      [key.id]
    );

    if (byId.length) {
      return byId[0];
    }
  }

  const [rows] = await db.execute(
    `SELECT * FROM machines
     WHERE LOWER(clientId) = ?
       AND LOWER(serialNo) = ?
       AND LOWER(model) = ?
     ORDER BY id DESC
     LIMIT 1`,
    [
      String(key.clientId || "").trim().toLowerCase(),
      String(key.serialNo || "").trim().toLowerCase(),
      String(key.model || "").trim().toLowerCase()
    ]
  );

  return rows[0] || null;
}

function safeJson(value, fallback) {
  try {
    if (value === null || value === undefined || value === "") return fallback;
    if (typeof value === "string") return JSON.parse(value);
    return value;
  } catch {
    return fallback;
  }
}

function stringifyJson(value, fallback) {
  return JSON.stringify(value === undefined ? fallback : value);
}

function toMysqlDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const day = slash[1].padStart(2, "0");
    const month = slash[2].padStart(2, "0");
    const year = slash[3];
    return `${year}-${month}-${day}`;
  }

  return null;
}

function toDisplayDate(value) {
  if (!value) return "";

  const raw = value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);

  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value);

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function mapMachine(row) {
  const technicians = safeJson(row.technicians, []);
  const partServiceDates = safeJson(row.partServiceDates, {});
  const partServiceHours = safeJson(row.partServiceHours, {});
  const updates = safeJson(row.updates, []);
  const reports = safeJson(row.reports, []);

  return {
    id: row.id,
    clientId: row.clientId || "",
    clientName: row.clientName || "",
    location: row.location || "",
    unit: row.unit || "",
    model: row.model || "",
    serialNo: row.serialNo || "",
    dateInstalled: toDisplayDate(row.dateInstalled),
    runningHours: Number(row.runningHours || 0),
    status: row.status || "",
    description: row.description || "",
    submittedBy: row.submittedBy || "",
    technicians,
    maintenanceServiceDate: row.maintenanceServiceDate || "",
    partServiceDates,
    partServiceHours,
    updates,
    reports,
    initialRunningHours: Number(row.initialRunningHours || row.runningHours || 0),
    initialStatus: row.initialStatus || row.status || "",
    initialDescription: row.initialDescription || row.description || "",
    initialMaintenanceServiceDate: row.initialMaintenanceServiceDate || row.maintenanceServiceDate || "",
    initialPartServiceDates: safeJson(row.initialPartServiceDates, partServiceDates),
    initialPartServiceHours: safeJson(row.initialPartServiceHours, partServiceHours)
  };
}

async function listMachinesByClientId(clientId) {
  const [rows] = await db.execute(
    "SELECT * FROM machines WHERE clientId = ? ORDER BY id DESC",
    [String(clientId || "").trim().toLowerCase()]
  );

  return rows.map(mapMachine);
}

async function listAllMachines() {
  const [rows] = await db.query("SELECT * FROM machines ORDER BY id DESC");
  return rows.map(mapMachine);
}

async function addMachine(machine) {
  await db.execute(
    `INSERT INTO machines
    (
      clientId, clientName, location, unit, model, serialNo, dateInstalled,
      runningHours, status, description, submittedBy, technicians,
      maintenanceServiceDate, partServiceDates, partServiceHours, updates, reports,
      initialRunningHours, initialStatus, initialDescription,
      initialMaintenanceServiceDate, initialPartServiceDates, initialPartServiceHours
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(machine.clientId || "").trim().toLowerCase(),
      machine.clientName || "",
      machine.location || "",
      machine.unit || "",
      machine.model || "",
      machine.serialNo || "",
      toMysqlDate(machine.dateInstalled),
      Number(machine.runningHours || 0),
      machine.status || "",
      machine.description || "",
      machine.submittedBy || "",
      stringifyJson(machine.technicians, []),
      toMysqlDate(machine.maintenanceServiceDate),
      stringifyJson(machine.partServiceDates, {}),
      stringifyJson(machine.partServiceHours, {}),
      stringifyJson(machine.updates, []),
      stringifyJson(machine.reports, []),
      Number(machine.runningHours || 0),
      machine.status || "",
      machine.description || "",
      toMysqlDate(machine.maintenanceServiceDate),
      stringifyJson(machine.partServiceDates, {}),
      stringifyJson(machine.partServiceHours, {})
    ]
  );
}

async function updateMachine(key, updates) {
  const found = await findMachineForKey(key);

if (!found) return null;

const current = mapMachine(found);

  const next = {
    runningHours: updates.runningHours !== undefined ? Number(updates.runningHours || 0) : current.runningHours,
    status: updates.status !== undefined ? String(updates.status || "") : current.status,
    description: updates.description !== undefined ? String(updates.description || "") : current.description,
    maintenanceServiceDate: updates.maintenanceServiceDate !== undefined ? String(updates.maintenanceServiceDate || "") : current.maintenanceServiceDate,
    partServiceDates: updates.partServiceDates || current.partServiceDates,
    partServiceHours: updates.partServiceHours || current.partServiceHours,
    updates: Array.isArray(updates.updates) ? updates.updates : current.updates
  };

  await db.execute(
    `UPDATE machines
     SET runningHours = ?, status = ?, description = ?, maintenanceServiceDate = ?,
         partServiceDates = ?,
         partServiceHours = ?,
         updates = ?
     WHERE id = ?`,
    [
      next.runningHours,
      next.status,
      next.description,
      next.maintenanceServiceDate,
      stringifyJson(next.partServiceDates, {}),
      stringifyJson(next.partServiceHours, {}),
      stringifyJson(next.updates, []),
      found.id
    ]
  );

  const [updated] = await db.execute("SELECT * FROM machines WHERE id = ?", [found.id]);
  return updated[0] ? mapMachine(updated[0]) : null;
}

async function appendMachineReport(key, report) {
  const [found] = await db.execute(
    `SELECT * FROM machines
     WHERE clientId = ? AND serialNo = ? AND model = ? AND dateInstalled = ?
     LIMIT 1`,
    [
      String(key.clientId || "").trim().toLowerCase(),
      String(key.serialNo || "").trim(),
      String(key.model || "").trim(),
      toMysqlDate(key.dateInstalled)
    ]
  );

  if (!found.length) return null;

  const current = mapMachine(found[0]);
  const reports = Array.isArray(current.reports) ? current.reports.slice() : [];
  const updates = Array.isArray(current.updates) ? current.updates.slice() : [];

  reports.push(report);

  if (report && report.submittedBy && updates.length > 0) {
    const requestedIndex = Number(report.updateIndex);
    const updateTarget =
      Number.isInteger(requestedIndex) && requestedIndex >= 0 && requestedIndex < updates.length
        ? updates[requestedIndex]
        : updates[updates.length - 1];

    updateTarget.submittedBy = String(report.submittedBy);
    updateTarget.report = report;
  }

  await db.execute(
    `UPDATE machines
     SET reports = ?, updates = ?
     WHERE id = ?`,
    [
      stringifyJson(reports, []),
      stringifyJson(updates, []),
      found.id
    ]
  );

  await db.execute(
    `INSERT INTO machine_reports
    (machine_id, technicians, problem, action_taken, recommendation)
    VALUES (?, ?, ?, ?, ?)`,
    [
      found.id,
      Array.isArray(report.technicians) ? report.technicians.join(", ") : "",
      report.problem || "",
      report.action || report.action_taken || "",
      report.recommendation || ""
    ]
  );

  const [updated] = await db.execute("SELECT * FROM machines WHERE id = ?", [found.id]);
  return updated[0] ? mapMachine(updated[0]) : null;
}

module.exports = {
  listAllMachines,
  listMachinesByClientId,
  addMachine,
  updateMachine,
  appendMachineReport
};