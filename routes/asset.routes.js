const express = require('express');
const {
  listActiveClients,
  findClientById,
  findActiveClientByName
} = require('../database/clients.store');
const { addMachine } = require('../database/machines.store');
const { listUserAccounts } = require('../database/accounts.store');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function normalizeTechnicianName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function splitTechnicianNames(value) {
  return String(value || '')
    .split(',')
    .map(normalizeTechnicianName)
    .filter(Boolean);
}

function buildSavedAssetFromBody(body = {}) {
  return {
    clientId: String(body.clientId || '').trim().toLowerCase(),
    unit: body.unit || '',
    model: String(body.model || '').toUpperCase().trim(),
    serialNo: body.serialNo || '',
    dateInstalled: body.dateInstalled || '',
    runningHours: body.runningHours || '',
    status: body.status || '',
    description: body.description || ''
  };
}

function renderNewMachineForm(res, req, { activeClients, teamMembers, selectedClientId = '', error = null, success = null, savedAsset = null }) {
  return res.render('user_asset_form', {
    currentUser: req.session.user,
    clients: activeClients,
    teamMembers,
    selectedClientId,
    success,
    error,
    savedAsset,
    partsCatalog: PARTS_CATALOG
  });
}

// Parts catalog with all models and their parts
const PARTS_CATALOG = {
  CIJ: {
    '9450': [
      { name: 'ENM 38941 GUTTER BLOCK', expiryMonths: 4 },
      { name: 'ENM 47458 EHV COVER', expiryMonths: 6 },
      { name: 'ENM 49967 EQUIP PRINT HEADBOARD', expiryMonths: 6 },
      { name: 'ENM 46408 FOUR ELECTOVALVE BLOCK', expiryMonths: 4 },
      { name: 'ENM 38980 MODULATION ASSEMBLY', expiryMonths: 6 },
      { name: 'PREVENTIVE MAINTENANCE', expiryHours: 8000 }
    ],
    '9410': [
      { name: 'ENM 38941 GUTTER BLOCK', expiryMonths: 4 },
      { name: 'ENM 47458 EHV COVER', expiryMonths: 6 },
      { name: 'ENM 49967 EQUIP PRINT HEADBOARD', expiryMonths: 6 },
      { name: 'ENM 46408 FOUR ELECTOVALVE BLOCK', expiryMonths: 4 },
      { name: 'ENM 38980 MODULATION ASSEMBLY', expiryMonths: 6 },
      { name: 'PREVENTIVE MAINTENANCE', expiryHours: 8000 }
    ],
    '9450S': [
      { name: 'ENM 38941 GUTTER BLOCK', expiryMonths: 4 },
      { name: 'ENM 47458 EHV COVER', expiryMonths: 6 },
      { name: 'ENM 49967 EQUIP PRINT HEADBOARD', expiryMonths: 6 },
      { name: 'ENM 46408 FOUR ELECTOVALVE BLOCK', expiryMonths: 4 },
      { name: 'ENM 38980 MODULATION ASSEMBLY', expiryMonths: 6 },
      { name: 'PREVENTIVE MAINTENANCE', expiryHours: 8000 }
    ],
    '9450E': [
      { name: 'ENM 38941 GUTTER BLOCK', expiryMonths: 4 },
      { name: 'ENM 47458 EHV COVER', expiryMonths: 6 },
      { name: 'ENM 49967 EQUIP PRINT HEADBOARD', expiryMonths: 6 },
      { name: 'ENM 46408 FOUR ELECTOVALVE BLOCK', expiryMonths: 4 },
      { name: 'ENM 38980 MODULATION ASSEMBLY', expiryMonths: 6 },
      { name: 'PREVENTIVE MAINTENANCE', expiryHours: 8000 }
    ],
    '9330': [
      { name: 'ENM 38941 GUTTER BLOCK', expiryMonths: 4 },
      { name: 'ENM 47458 EHV COVER', expiryMonths: 6 },
      { name: 'ENM 49967 EQUIP PRINT HEADBOARD', expiryMonths: 6 },
      { name: 'ENM 46408 FOUR ELECTOVALVE BLOCK', expiryMonths: 4 },
      { name: 'ENM 38980 MODULATION ASSEMBLY', expiryMonths: 6 },
      { name: 'PREVENTIVE MAINTENANCE', expiryHours: 8000 }
    ],
    '9750': [
      { name: 'ENM 38941 GUTTER BLOCK', expiryMonths: 4 },
      { name: 'ENM 47458 EHV COVER', expiryMonths: 6 },
      { name: 'ENM 49967 EQUIP PRINT HEADBOARD', expiryMonths: 6 },
      { name: 'ENM 46408 FOUR ELECTOVALVE BLOCK', expiryMonths: 4 },
      { name: 'ENM 38980 MODULATION ASSEMBLY', expiryMonths: 6 },
      { name: 'PREVENTIVE MAINTENANCE', expiryHours: 8000 }
    ],
    '9750+': [
      { name: 'ENM 38941 GUTTER BLOCK', expiryMonths: 4 },
      { name: 'ENM 47458 EHV COVER', expiryMonths: 6 },
      { name: 'ENM 49967 EQUIP PRINT HEADBOARD', expiryMonths: 6 },
      { name: 'ENM 46408 FOUR ELECTOVALVE BLOCK', expiryMonths: 4 },
      { name: 'ENM 38980 MODULATION ASSEMBLY', expiryMonths: 6 },
      { name: 'PREVENTIVE MAINTENANCE', expiryHours: 8000 }
    ]
  },
  TTO: {
    '8018': [],
    'X40': [],
    'X45': [],
    'X60': [],
    'X65': []
  },
  'P&A': {
    'E-TOUCH': [],
    'BLOW': [],
    'FLEX SE SHORT LEFT HAND': [],
    'FLEX SE SHORT RIGHT HAND': [],
    'FLEX SE LONG LEFT HAND': [],
    'FLEX SE LONG RIGHT HAND': []
  },
  DOD: {
    '4020': [],
    '4500': [],
    '4700': []
  },
  LASER: {
    'C150': [],
    'C150L': [],
    'C150S': [],
    'C350': [],
    'C350L': [],
    'C350S': []
  },
  SUNINE: {},
  ANSER: {
    'X1': []
  }
};

router.get('/new-machine', requireAuth, async (req, res) => {
  const activeClients = (await listActiveClients())
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const userAccounts = await listUserAccounts();
  const currentFullName = String(req.session?.user?.fullName || '').trim().toLowerCase();
  const teamMembers = userAccounts
    .filter(account => account.status === 'active')
    .map(account => account.fullName)
    .filter(Boolean)
    .filter(name => String(name).trim().toLowerCase() !== currentFullName)
    .filter((name, index, arr) => arr.indexOf(name) === index)
    .sort((a, b) => a.localeCompare(b));
  const selectedClientId = req.query.clientId || '';

  res.render('user_asset_form', {
    currentUser: req.session.user,
    clients: activeClients,
    teamMembers,
    selectedClientId,
    success: null,
    error: null,
    savedAsset: null,
    partsCatalog: PARTS_CATALOG
  });
});

router.post('/new-machine', requireAuth, async (req, res) => {
  const activeClients = await listActiveClients();
  const userAccounts = await listUserAccounts();
  const currentFullName = String(req.session?.user?.fullName || '').trim().toLowerCase();
  const teamMembers = userAccounts
    .filter(account => account.status === 'active')
    .map(account => account.fullName)
    .filter(Boolean)
    .filter(name => String(name).trim().toLowerCase() !== currentFullName)
    .filter((name, index, arr) => arr.indexOf(name) === index)
    .sort((a, b) => a.localeCompare(b));

  try {
    let { clientId, unit, model, serialNo, dateInstalled, runningHours, status, description } = req.body;
    const problem = String(req.body.problem || '').trim();
    const action = String(req.body.action || '').trim();
    const recommendation = String(req.body.recommendation || '').trim();
    description = String(description || '').trim();
    const techniciansInput = String(req.body.technicians || '');

    clientId = String(clientId || '').trim().toLowerCase();

    // Fallback: if clientId is empty but clientName was submitted, match by name.
    if (!clientId && req.body.clientName) {
      const matched = await findActiveClientByName(req.body.clientName);
      if (matched) clientId = matched.id;
    }

    // Normalize model to uppercase for consistency.
    if (model) {
      model = model.toUpperCase().trim();
    }

    const unitKey = Object.keys(PARTS_CATALOG).find(
      key => key.toUpperCase() === String(unit || '').toUpperCase().trim()
    );

    if (!unitKey) {
      return renderNewMachineForm(res, req, {
        activeClients,
        teamMembers,
        selectedClientId: clientId || '',
        error: 'Invalid unit type.',
        savedAsset: buildSavedAssetFromBody({ ...req.body, clientId })
      });
    }

    // If a unit has predefined models, enforce them. If the catalog is empty
    // for that unit, allow manual model entry instead of blocking the save.
    const allowedModels = Object.keys(PARTS_CATALOG[unitKey] || {});
    const isModelAllowed = !allowedModels.length || allowedModels.some(m => m.toUpperCase() === model);

    if (!isModelAllowed) {
      return renderNewMachineForm(res, req, {
        activeClients,
        teamMembers,
        selectedClientId: clientId || '',
        error: 'Invalid model for the selected unit.',
        savedAsset: buildSavedAssetFromBody({ ...req.body, clientId, model })
      });
    }

    if (!clientId || !unit || !model || !serialNo || !dateInstalled || runningHours === undefined || runningHours === '' || !status || !description || !problem || !action || !recommendation) {
      return renderNewMachineForm(res, req, {
        activeClients,
        teamMembers,
        selectedClientId: clientId || '',
        error: 'Please fill in all required fields (Client, Unit, Model, Serial No, Date Installed, Running Hours, Status, Description, Problem, Action, Recommendation).',
        savedAsset: buildSavedAssetFromBody({ ...req.body, clientId, model })
      });
    }

    const client = await findClientById(clientId);
    if (!client) {
      return renderNewMachineForm(res, req, {
        activeClients,
        teamMembers,
        selectedClientId: clientId || '',
        error: 'Client was not found. Please select a client from the dropdown list.',
        savedAsset: buildSavedAssetFromBody({ ...req.body, clientId, model })
      });
    }

    // Convert date format into dd/mm/yyyy for consistent display/storage.
    let installedDate = dateInstalled || '';
    const ymdMatch = installedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymdMatch) {
      installedDate = `${ymdMatch[3]}/${ymdMatch[2]}/${ymdMatch[1]}`;
    }

    const dmyMatch = installedDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmyMatch) {
      const day = String(dmyMatch[1]).padStart(2, '0');
      const month = String(dmyMatch[2]).padStart(2, '0');
      const year = dmyMatch[3];
      installedDate = `${day}/${month}/${year}`;
    }

    const asset = {
      clientId,
      clientName: client.name,
      location: client.location,
      unit: unitKey,
      model,
      serialNo,
      dateInstalled: installedDate,
      runningHours,
      status,
      description,
      submittedBy: req.session.user
        ? req.session.user.fullName || req.session.user.username || 'Unknown User'
        : 'Unknown User'
    };

    const submittedBy = normalizeTechnicianName(asset.submittedBy) || 'Unknown User';
    const additionalTechnicians = splitTechnicianNames(techniciansInput)
      .filter((name, idx, arr) => arr.findIndex(v => v.toLowerCase() === name.toLowerCase()) === idx)
      .filter(name => name.toLowerCase() !== submittedBy.toLowerCase());
    const technicians = [submittedBy, ...additionalTechnicians]
      .filter(Boolean)
      .filter((name, idx, arr) => arr.findIndex(v => v.toLowerCase() === name.toLowerCase()) === idx);

    asset.reports = [
      {
        date: installedDate,
        submittedBy,
        updateIndex: null,
        technicians,
        problem,
        action,
        recommendation
      }
    ];
    asset.technicians = technicians;

    await addMachine(asset);

    return renderNewMachineForm(res, req, {
      activeClients,
      teamMembers,
      selectedClientId: clientId,
      success: 'Printer asset request submitted successfully.',
      savedAsset: asset
    });
  } catch (error) {
    console.error('Failed to save machine:', error);
    return renderNewMachineForm(res, req, {
      activeClients,
      teamMembers,
      selectedClientId: String(req.body.clientId || '').trim().toLowerCase(),
      error: `Failed to save machine: ${error.message}`,
      savedAsset: buildSavedAssetFromBody(req.body)
    });
  }
});

module.exports = router;