const express = require('express');
const { listActiveClients, findClientById } = require('../database/clients.store');
const { listMachinesByClientId, updateMachine, appendMachineReport } = require('../database/machines.store');
const { listUserAccounts } = require('../database/accounts.store');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/:clientId/machines', requireAuth, async (req, res) => {
  try {
    const clientId = String(req.params.clientId || '').trim();
    const client = await findClientById(clientId);

    if (!client) {
      return res.status(404).json({ ok: false, error: 'Client not found.' });
    }

    const machineRecords = await listMachinesByClientId(client.id);
    return res.json({ ok: true, machineRecords });
  } catch (error) {
    console.error('Failed to load client machines:', error);
    return res.status(500).json({ ok: false, error: 'Failed to load machine records.' });
  }
});

router.get('/:clientId', requireAuth, async (req, res) => {
  try {
    const activeClients = await listActiveClients();
    const userAccounts = await listUserAccounts();
    const clientId = req.params.clientId;
    const client = await findClientById(clientId);
    const machineRecords = client ? await listMachinesByClientId(client.id) : [];
    const currentFullName = String(req.session?.user?.fullName || '').trim().toLowerCase();
    const teamMembers = userAccounts
      .filter(account => account.status === 'active')
      .map(account => account.fullName)
      .filter(Boolean)
      .filter(name => String(name).trim().toLowerCase() !== currentFullName)
      .filter((name, index, arr) => arr.indexOf(name) === index)
      .sort((a, b) => a.localeCompare(b));

    res.render('client', {
      currentUser: req.session.user,
      clientId,
      clients: activeClients,
      machineRecords,
      teamMembers
    });
  } catch (error) {
    console.error('Failed to render client page:', error);
    res.status(500).render('client', {
      currentUser: req.session.user,
      clientId: req.params.clientId || '',
      clients: [],
      machineRecords: [],
      teamMembers: []
    });
  }
});

router.post('/:clientId/machines/update', requireAuth, async (req, res) => {
  const clientId = String(req.params.clientId || '').trim();
  const {
    serialNo,
    model,
    dateInstalled,
    runningHours,
    status,
    description,
    maintenanceServiceDate,
    partServiceDates,
    partServiceHours,
    updates
  } = req.body || {};

  if (!serialNo || !model || !dateInstalled) {
    return res.status(400).json({ ok: false, error: 'Missing machine identity fields.' });
  }

  const parsedRunningHours = Number(runningHours);
  if (!Number.isFinite(parsedRunningHours) || parsedRunningHours < 0) {
    return res.status(400).json({ ok: false, error: 'Invalid runningHours value.' });
  }

  if (!status || typeof status !== 'string') {
    return res.status(400).json({ ok: false, error: 'Status is required.' });
  }

  const safeUpdates = Array.isArray(updates) ? updates : [];

  const machine = await updateMachine(
    { clientId, serialNo, model, dateInstalled },
    {
      runningHours: parsedRunningHours,
      status: String(status),
      description: String(description || ''),
      maintenanceServiceDate: String(maintenanceServiceDate || ''),
      partServiceDates: partServiceDates && typeof partServiceDates === 'object' ? partServiceDates : {},
      partServiceHours: partServiceHours && typeof partServiceHours === 'object' ? partServiceHours : {},
      updates: safeUpdates
    }
  );

  if (!machine) {
    return res.status(404).json({ ok: false, error: 'Machine record not found.' });
  }

  return res.json({ ok: true, machine });
});

router.post('/:clientId/machines/report', requireAuth, async (req, res) => {
  const clientId = String(req.params.clientId || '').trim();
  const { serialNo, model, dateInstalled, report, updateIndex } = req.body || {};

  if (!serialNo || !model || !dateInstalled) {
    return res.status(400).json({ ok: false, error: 'Missing machine identity fields.' });
  }

  if (!report || typeof report !== 'object') {
    return res.status(400).json({ ok: false, error: 'Missing report payload.' });
  }

  const parsedUpdateIndex = Number(updateIndex);

  const safeReport = {
    date: String(report.date || ''),
    submittedBy: String(report.submittedBy || ''),
    updateIndex: Number.isInteger(parsedUpdateIndex) && parsedUpdateIndex >= 0 ? parsedUpdateIndex : null,
    technicians: Array.isArray(report.technicians)
      ? report.technicians.map(name => String(name || '').trim()).filter(Boolean)
      : [],
    problem: String(report.problem || ''),
    action: String(report.action || ''),
    recommendation: String(report.recommendation || '')
  };

  const machine = await appendMachineReport(
    { clientId, serialNo, model, dateInstalled },
    safeReport
  );

  if (!machine) {
    return res.status(404).json({ ok: false, error: 'Machine record not found.' });
  }

  return res.json({ ok: true, machine });
});

module.exports = router;