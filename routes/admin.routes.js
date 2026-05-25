const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const {
  listUserAccounts,
  findAccountByEmail,
  usernameExists,
  createUserAccount,
  updateUserAccount,
  setUserStatus
} = require('../database/accounts.store');
const { createInvite } = require('../database/invites.store');
const { createPasswordReset } = require('../database/password-resets.store');
const {
  listClients,
  createClient,
  updateClient,
  setClientStatus
} = require('../database/clients.store');
const { listAllMachines } = require('../database/machines.store');
const { requireAdmin } = require('../middleware/auth');
const { sendGmailAppLink, sendGmailAppLinkInBackground, outboundEmailUiHint } = require('../lib/gmail-send');

const router = express.Router();

const usernameRegex = /^[a-z_]{4,20}$/;
const passwordRegex = /^.{8,}$/;
const nameRegex = /^[A-Za-z\s.-]+$/;
const emailRegex = /^(?=.{1,254}$)(?=.{1,64}@)[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const inviteRoles = new Set(['employee', 'admin']);
const inviteBranches = new Set(['Silang', 'Davao', 'Cebu']);

function properCase(value = '') {
  return value
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function slugify(value = '') {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isLocalBaseUrl(baseUrl) {
  const normalized = String(baseUrl || '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const hostMatch = normalized.match(/^(?:https?:\/\/)?([^/:?#]+)/i);
  const host = hostMatch ? hostMatch[1] : normalized;

  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    /^10\.\d+\.\d+\.\d+$/.test(host) ||
    /^192\.168\.\d+\.\d+$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host)
  );
}

function buildAppBaseUrl(req) {
  const baseUrl = process.env.APP_BASE_URL;
  if (baseUrl && !isLocalBaseUrl(baseUrl)) {
    return baseUrl.replace(/\/$/, '');
  }

  return `${req.protocol}://${req.get('host')}`;
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseActivityDate(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) {
    const parsed = new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const slashDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashDate) {
    const parsed = new Date(Number(slashDate[3]), Number(slashDate[2]) - 1, Number(slashDate[1]));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDayLabel(dateValue) {
  return dateValue.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function normalizeStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'active') {
    return 'Active';
  }
  if (value === 'maintenance') {
    return 'Maintenance';
  }
  if (value === 'faulty') {
    return 'Faulty';
  }
  if (value === 'inactive') {
    return 'Inactive';
  }
  return 'Unspecified';
}

function normalizeContributorName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function splitContributorNames(value) {
  return String(value || '')
    .split(',')
    .map(normalizeContributorName)
    .filter(Boolean);
}

function getReportContributors(report) {
  const submitted = splitContributorNames(report && report.submittedBy);
  const technicians = Array.isArray(report && report.technicians)
    ? report.technicians.flatMap(name => splitContributorNames(name))
    : [];

  const contributors = [...submitted, ...technicians]
    .filter(Boolean)
    .filter((name, index, arr) => arr.findIndex(v => v.toLowerCase() === name.toLowerCase()) === index)
    .filter(name => name.toLowerCase() !== 'system seed');

  return contributors;
}

function getMachineContributors(machine) {
  const technicians = Array.isArray(machine && machine.technicians)
    ? machine.technicians.flatMap(name => splitContributorNames(name))
    : [];
  const submitted = splitContributorNames(machine && machine.submittedBy);

  return [...technicians, ...submitted]
    .filter(Boolean)
    .filter((name, index, arr) => arr.findIndex(v => v.toLowerCase() === name.toLowerCase()) === index)
    .filter(name => name.toLowerCase() !== 'system seed');
}

function formatMonitorDate(value) {
  const parsed = parseActivityDate(value);
  if (!parsed) {
    return {
      label: '—',
      sortValue: 0
    };
  }

  return {
    label: parsed.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }),
    sortValue: parsed.getTime()
  };
}

function makeActivityLabel(activityKind) {
  if (activityKind === 'installed') {
    return 'Unit Installed';
  }
  if (activityKind === 'maintenance_parts') {
    return 'Maintenance + Parts';
  }
  if (activityKind === 'parts') {
    return 'Parts Change';
  }
  if (activityKind === 'maintenance') {
    return 'Maintenance';
  }
  return 'Update';
}

function summarizePartList(parts = [], limit = 3) {
  const values = Array.from(new Set(
    (Array.isArray(parts) ? parts : [])
      .map(part => normalizeContributorName(part))
      .filter(Boolean)
  ));

  if (!values.length) {
    return {
      label: 'No parts updated',
      csv: ''
    };
  }

  if (values.length <= limit) {
    return {
      label: values.join(', '),
      csv: values.join(', ')
    };
  }

  return {
    label: `${values.slice(0, limit).join(', ')} +${values.length - limit} more`,
    csv: values.join(', ')
  };
}

function getMonitorActivityRowCap() {
  const raw = process.env.MONITOR_ACTIVITY_ROW_CAP;
  if (raw === undefined || raw === '') {
    return 4000;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return Infinity;
  }
  return Math.floor(n);
}

function buildMonitorActivityRows(machines = []) {
  const activityRows = [];
  const technicianOptions = new Set();
  const clientOptions = new Set();
  const unitOptions = new Set();
  const modelOptions = new Set();
  const unitModelOptions = new Map();

  for (const machine of machines) {
    const machineContributorsOnce = getMachineContributors(machine);
    const machineClientId = String(machine.clientId || '').trim().toLowerCase();
    const clientName = String(machine.clientName || machineClientId || 'Unknown Client').trim() || 'Unknown Client';
    const modelName = String(machine.model || '').trim() || 'Unknown Model';
    const unitName = String(machine.unit || '').trim() || 'Unknown Unit';
    const serialNo = String(machine.serialNo || '').trim() || '—';
    const machineStatus = normalizeStatus(machine.status);
    const reports = Array.isArray(machine.reports) ? machine.reports : [];
    const updates = Array.isArray(machine.updates) ? machine.updates : [];

    clientOptions.add(clientName);
    unitOptions.add(unitName);
    modelOptions.add(modelName);
    if (!unitModelOptions.has(unitName)) {
      unitModelOptions.set(unitName, new Set());
    }
    unitModelOptions.get(unitName).add(modelName);

    const installationReports = reports.filter(report => {
      const updateIndex = Number(report && report.updateIndex);
      return !(Number.isInteger(updateIndex) && updateIndex >= 0);
    });

    const installationRecords = installationReports.length
      ? installationReports.map((report, reportIndex) => ({ report, reportIndex }))
      : [{
        report: {
          date: machine.dateInstalled,
          submittedBy: machine.submittedBy,
          technicians: machineContributorsOnce,
          problem: `Initial installation record for ${unitName} ${modelName}.`,
          action: String(machine.description || '').trim() || 'Installation details recorded.',
          recommendation: 'Verify installation details against the physical unit.'
        },
        reportIndex: -1
      }];

    installationRecords.forEach(({ report, reportIndex }) => {

      const dateInfo = formatMonitorDate(report && report.date);
      const technicians = getReportContributors(report);
      const technicianNames = technicians.length
        ? technicians
        : (machineContributorsOnce.length
            ? machineContributorsOnce
            : [normalizeContributorName(report && report.submittedBy) || 'Unknown Technician']);
      const technicianLabel = technicianNames.join(', ');
      const primaryTechnician = technicianNames[0] || 'Unknown Technician';
      const description = String(machine.description || '').trim() || 'Unit installation record';
      const problem = String(report && report.problem || '').trim();
      const action = String(report && report.action || '').trim();
      const recommendation = String(report && report.recommendation || '').trim();
      const details = [report && report.problem, report && report.action, report && report.recommendation]
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .join(' • ');

      technicianNames.forEach(name => technicianOptions.add(name));
      activityRows.push({
        id: `${machineClientId || 'client'}-${serialNo}-${dateInfo.sortValue}-r${reportIndex}`,
        dateLabel: dateInfo.label,
        dateSort: dateInfo.sortValue,
        technician: technicianLabel || primaryTechnician,
        technicianSort: primaryTechnician,
        technicians: technicianNames,
        submittedBy: primaryTechnician,
        techniciansText: technicianNames.join(', '),
        clientName,
        clientId: machineClientId,
        unitName,
        modelName,
        serialNo,
        runningHours: Number(machine.runningHours) || 0,
        activityKind: 'installed',
        activityTags: ['installed'],
        activityLabel: makeActivityLabel('installed'),
        sourceLabel: 'Installation',
        partsLabel: 'No parts updated',
        partsCsv: '',
        submittedBy: primaryTechnician,
        description,
        problem,
        action,
        recommendation,
        maintenanceSummary: '',
        details: details || 'Unit installation record',
        machineStatus
      });
    });

    updates.forEach((update, updateIndex) => {
      const dateInfo = formatMonitorDate(update && update.date);
      const partsSummary = summarizePartList(update && update.partsUpdated);
      const hasMaintenance = Boolean(update && update.maintenanceUpdated);
      const hasParts = Array.isArray(update && update.partsUpdated) && update.partsUpdated.length > 0;

      const updateReportContributors = update && update.report ? getReportContributors(update.report) : [];
      const technicianNames = updateReportContributors.length
        ? updateReportContributors
        : [normalizeContributorName(update && update.submittedBy) || 'Unknown Technician'];
      const technicianLabel = technicianNames.join(', ');
      const primaryTechnician = technicianNames[0] || 'Unknown Technician';

      const details = [
        update && update.description,
        update && update.maintenanceServiceDate ? `Maintenance date ${update.maintenanceServiceDate}` : '',
        update && update.report && update.report.problem ? update.report.problem : ''
      ]
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .join(' • ');

      const emitRows = [];
      if (hasMaintenance && hasParts) {
        emitRows.push({
          activityKind: 'maintenance_parts',
          activityTags: ['maintenance', 'parts'],
          activityLabel: makeActivityLabel('maintenance_parts'),
          partsLabel: partsSummary.label,
          partsCsv: partsSummary.csv
        });
      } else if (hasMaintenance) {
        emitRows.push({
          activityKind: 'maintenance',
          activityTags: ['maintenance'],
          activityLabel: makeActivityLabel('maintenance'),
          partsLabel: 'Maintenance service',
          partsCsv: ''
        });
      } else if (hasParts) {
        emitRows.push({
          activityKind: 'parts',
          activityTags: ['parts'],
          activityLabel: makeActivityLabel('parts'),
          partsLabel: partsSummary.label,
          partsCsv: partsSummary.csv
        });
      } else {
        emitRows.push({
          activityKind: 'maintenance',
          activityTags: ['maintenance'],
          activityLabel: makeActivityLabel('maintenance'),
          partsLabel: 'Maintenance service',
          partsCsv: ''
        });
      }

      technicianNames.forEach(name => technicianOptions.add(name));
      const description = String(update && update.description || '').trim() || 'Service update';
      const problem = String(update && update.report && update.report.problem || '').trim();
      const action = String(update && update.report && update.report.action || '').trim();
      const recommendation = String(update && update.report && update.report.recommendation || '').trim();
      const maintenanceSummary = [
        update && update.maintenanceServiceDate ? `Maintenance date ${update.maintenanceServiceDate}` : '',
        partsSummary.csv ? `Parts changed: ${partsSummary.csv}` : ''
      ].filter(Boolean).join(' • ');
      emitRows.forEach((activity, activityIndex) => {
        activityRows.push({
          id: `${machineClientId || 'client'}-${serialNo}-${dateInfo.sortValue}-u${updateIndex}-a${activityIndex}`,
          dateLabel: dateInfo.label,
          dateSort: dateInfo.sortValue,
          technician: technicianLabel || primaryTechnician,
          technicianSort: primaryTechnician,
          technicians: technicianNames,
          clientName,
          clientId: machineClientId,
          unitName,
          modelName,
          serialNo,
          runningHours: Number(update && update.runningHours) || Number(machine.runningHours) || 0,
          activityKind: activity.activityKind,
          activityTags: activity.activityTags,
          activityLabel: activity.activityLabel,
          sourceLabel: 'Update',
          partsLabel: activity.partsLabel,
          partsCsv: activity.partsCsv,
          submittedBy: primaryTechnician,
          techniciansText: technicianNames.join(', '),
          description,
          problem,
          action,
          recommendation,
          maintenanceSummary,
          details: details || 'Service update',
          machineStatus
        });
      });
    });
  }

  activityRows.sort((a, b) => {
    return b.dateSort - a.dateSort || a.clientName.localeCompare(b.clientName) || a.technician.localeCompare(b.technician);
  });

  return {
    activityRows,
    technicianOptions: Array.from(technicianOptions).sort((a, b) => a.localeCompare(b)),
    clientOptions: Array.from(clientOptions).sort((a, b) => a.localeCompare(b)),
    unitOptions: Array.from(unitOptions).sort((a, b) => a.localeCompare(b)),
    modelOptions: Array.from(modelOptions).sort((a, b) => a.localeCompare(b)),
    unitModelOptions: Array.from(unitModelOptions.entries()).reduce((acc, [unit, models]) => {
      acc[unit] = Array.from(models).sort((a, b) => a.localeCompare(b));
      return acc;
    }, {})
  };
}

const MONITOR_PARTS_CATALOG = {
  CIJ: {
    '9450': [
      { name: 'ENM 38941 GUTTER BLOCK', expiryMonths: 4 },
      { name: 'ENM 47458 EHV COVER', expiryMonths: 6 },
      { name: 'ENM 49967 EQUIP PRINT HEADBOARD', expiryMonths: 6 },
      { name: 'ENM 46408 FOUR ELECTOVALVE BLOCK', expiryMonths: 4 },
      { name: 'ENM 38980 MODULATION ASSEMBLY', expiryMonths: 6 },
      { name: 'A40846 RECOVERY TOOL', expiryHours: 8000 },
      { name: 'ENM 40209 AIR FILTER', expiryHours: 8000 },
      { name: 'ENM 19134 INK FILTER', expiryHours: 8000 },
      { name: 'ENM 40830 IP54 OUTLET FOAM FILTER', expiryHours: 8000 },
      { name: 'ENM 5629 PRESSURE PUMP', expiryHours: 8000 }
    ],
    '9410': [
      { name: 'ENM 38941 GUTTER BLOCK', expiryMonths: 4 },
      { name: 'ENM 47458 EHV COVER', expiryMonths: 6 },
      { name: 'ENM 49967 EQUIP PRINT HEADBOARD', expiryMonths: 6 },
      { name: 'ENM 46408 FOUR ELECTOVALVE BLOCK', expiryMonths: 4 },
      { name: 'ENM 38980 MODULATION ASSEMBLY', expiryMonths: 6 },
      { name: 'A40846 RECOVERY TOOL', expiryHours: 8000 },
      { name: 'ENM 40209 AIR FILTER', expiryHours: 8000 },
      { name: 'ENM 19134 INK FILTER', expiryHours: 8000 },
      { name: 'ENM 40830 IP54 OUTLET FOAM FILTER', expiryHours: 8000 },
      { name: 'ENM 5629 PRESSURE PUMP', expiryHours: 8000 }
    ],
    '9450S': [
      { name: 'ENM 38941 GUTTER BLOCK', expiryMonths: 4 },
      { name: 'ENM 47458 EHV COVER', expiryMonths: 6 },
      { name: 'ENM 49967 EQUIP PRINT HEADBOARD', expiryMonths: 6 },
      { name: 'ENM 46408 FOUR ELECTOVALVE BLOCK', expiryMonths: 4 },
      { name: 'ENM 38980 MODULATION ASSEMBLY', expiryMonths: 6 },
      { name: 'A40846 RECOVERY TOOL', expiryHours: 8000 },
      { name: 'ENM 40209 AIR FILTER', expiryHours: 8000 },
      { name: 'ENM 19134 INK FILTER', expiryHours: 8000 },
      { name: 'ENM 40830 IP54 OUTLET FOAM FILTER', expiryHours: 8000 },
      { name: 'ENM 5629 PRESSURE PUMP', expiryHours: 8000 }
    ],
    '9450E': [
      { name: 'ENM 38941 GUTTER BLOCK', expiryMonths: 4 },
      { name: 'ENM 47458 EHV COVER', expiryMonths: 6 },
      { name: 'ENM 49967 EQUIP PRINT HEADBOARD', expiryMonths: 6 },
      { name: 'ENM 46408 FOUR ELECTOVALVE BLOCK', expiryMonths: 4 },
      { name: 'ENM 38980 MODULATION ASSEMBLY', expiryMonths: 6 },
      { name: 'A40846 RECOVERY TOOL', expiryHours: 8000 },
      { name: 'ENM 40209 AIR FILTER', expiryHours: 8000 },
      { name: 'ENM 19134 INK FILTER', expiryHours: 8000 },
      { name: 'ENM 40830 IP54 OUTLET FOAM FILTER', expiryHours: 8000 },
      { name: 'ENM 5629 PRESSURE PUMP', expiryHours: 8000 }
    ],
    '9330': [
      { name: 'ENM 38941 GUTTER BLOCK', expiryMonths: 4 },
      { name: 'ENM 47458 EHV COVER', expiryMonths: 6 },
      { name: 'ENM 49967 EQUIP PRINT HEADBOARD', expiryMonths: 6 },
      { name: 'ENM 46408 FOUR ELECTOVALVE BLOCK', expiryMonths: 4 },
      { name: 'ENM 38980 MODULATION ASSEMBLY', expiryMonths: 6 },
      { name: 'A40846 RECOVERY TOOL', expiryHours: 8000 },
      { name: 'ENM 40209 AIR FILTER', expiryHours: 8000 },
      { name: 'ENM 19134 INK FILTER', expiryHours: 8000 },
      { name: 'ENM 40830 IP54 OUTLET FOAM FILTER', expiryHours: 8000 },
      { name: 'ENM 5629 PRESSURE PUMP', expiryHours: 8000 }
    ],
    '9750': [
      { name: 'ENM 38941 GUTTER BLOCK', expiryMonths: 4 },
      { name: 'ENM 47458 EHV COVER', expiryMonths: 6 },
      { name: 'ENM 49967 EQUIP PRINT HEADBOARD', expiryMonths: 6 },
      { name: 'ENM 46408 FOUR ELECTOVALVE BLOCK', expiryMonths: 4 },
      { name: 'ENM 38980 MODULATION ASSEMBLY', expiryMonths: 6 },
      { name: 'A40846 RECOVERY TOOL', expiryHours: 8000 },
      { name: 'ENM 40209 AIR FILTER', expiryHours: 8000 },
      { name: 'ENM 19134 INK FILTER', expiryHours: 8000 },
      { name: 'ENM 40830 IP54 OUTLET FOAM FILTER', expiryHours: 8000 },
      { name: 'ENM 5629 PRESSURE PUMP', expiryHours: 8000 }
    ],
    '9750+': [
      { name: 'ENM 38941 GUTTER BLOCK', expiryMonths: 4 },
      { name: 'ENM 47458 EHV COVER', expiryMonths: 6 },
      { name: 'ENM 49967 EQUIP PRINT HEADBOARD', expiryMonths: 6 },
      { name: 'ENM 46408 FOUR ELECTOVALVE BLOCK', expiryMonths: 4 },
      { name: 'ENM 38980 MODULATION ASSEMBLY', expiryMonths: 6 },
      { name: 'A40846 RECOVERY TOOL', expiryHours: 8000 },
      { name: 'ENM 40209 AIR FILTER', expiryHours: 8000 },
      { name: 'ENM 19134 INK FILTER', expiryHours: 8000 },
      { name: 'ENM 40830 IP54 OUTLET FOAM FILTER', expiryHours: 8000 },
      { name: 'ENM 5629 PRESSURE PUMP', expiryHours: 8000 }
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

function parseMachineDate(value) {
  return parseActivityDate(value);
}

function addMonths(dateValue, months) {
  const next = new Date(dateValue);
  const originalDay = next.getDate();
  next.setMonth(next.getMonth() + months);
  if (next.getDate() < originalDay) {
    next.setDate(0);
  }
  return next;
}

function getMachineCatalogLocation(machine) {
  const unitKey = Object.keys(MONITOR_PARTS_CATALOG).find(
    key => key.toUpperCase() === String(machine?.unit || '').toUpperCase().trim()
  ) || '';

  const modelMap = unitKey ? (MONITOR_PARTS_CATALOG[unitKey] || {}) : {};
  const modelKey = Object.keys(modelMap).find(
    key => key.toUpperCase() === String(machine?.model || '').toUpperCase().trim()
  ) || '';

  return { unitKey, modelKey };
}

function getMachineMaintenanceStatus(machine, warningDays = 30) {
  let anchorDate = parseMachineDate(machine?.maintenanceServiceDate);
  if (!anchorDate) {
    anchorDate = parseMachineDate(machine?.dateInstalled);
  }
  if (!anchorDate) {
    return { isOverdue: false, isDueSoon: false };
  }

  const maintenanceDate = new Date(anchorDate);
  maintenanceDate.setDate(anchorDate.getDate() + 750);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((maintenanceDate - today) / (1000 * 60 * 60 * 24));

  return {
    isOverdue: diffDays < 0,
    isDueSoon: diffDays >= 0 && diffDays <= warningDays
  };
}

function getMachinePartStatus(machine, part, runningHours) {
  const safePart = part || {};
  let anchorDate = null;
  let serviceHoursBase = null;

  if (machine?.partServiceDates && safePart.name) {
    anchorDate = parseMachineDate(machine.partServiceDates[safePart.name]);
  }

  if (machine?.partServiceHours && safePart.name) {
    const baseHours = Number(machine.partServiceHours[safePart.name]);
    if (Number.isFinite(baseHours)) {
      serviceHoursBase = baseHours;
    }
  }

  if (!anchorDate) {
    anchorDate = parseMachineDate(machine?.dateInstalled);
  }

  if (!anchorDate) {
    return { isOverdue: false, isDueSoon: false };
  }

  let expiryDate = null;
  if (safePart.expiryMonths) {
    expiryDate = addMonths(anchorDate, safePart.expiryMonths);
  } else if (safePart.expiryHours) {
    const usedHours = serviceHoursBase == null
      ? runningHours
      : Math.max(0, runningHours - serviceHoursBase);
    const hoursLeft = safePart.expiryHours - usedHours;
    expiryDate = new Date(anchorDate);
    if (Number.isFinite(hoursLeft)) {
      const daysRemaining = Math.round(hoursLeft / 24);
      expiryDate.setDate(expiryDate.getDate() + daysRemaining);
    }
  }

  if (!expiryDate || Number.isNaN(expiryDate.getTime())) {
    return { isOverdue: false, isDueSoon: false };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24));

  return {
    isOverdue: diffDays < 0,
    isDueSoon: diffDays >= 0 && diffDays <= 7
  };
}

function hasUnitWarning(machine) {
  const maintenanceStatus = getMachineMaintenanceStatus(machine, 30);
  if (maintenanceStatus.isOverdue || maintenanceStatus.isDueSoon) {
    return true;
  }

  const { unitKey, modelKey } = getMachineCatalogLocation(machine);
  if (!unitKey || !modelKey) {
    return false;
  }

  const parts = ((MONITOR_PARTS_CATALOG[unitKey] || {})[modelKey] || []);
  const runningHours = Number(machine?.runningHours || 0);

  return parts.some(part => {
    const partStatus = getMachinePartStatus(machine, part, runningHours);
    return partStatus.isOverdue || partStatus.isDueSoon;
  });
}

function buildMonitoring(clients = [], machines = []) {
  const safeClients = Array.isArray(clients) ? clients : [];
  const safeMachines = Array.isArray(machines) ? machines : [];
  const activityData = buildMonitorActivityRows(safeMachines);
  const activityRowCap = getMonitorActivityRowCap();
  const activityRowTotal = activityData.activityRows.length;
  const activityRowsCapped = Number.isFinite(activityRowCap) && activityRowTotal > activityRowCap;
  const activityRowsForView = activityRowsCapped
    ? activityData.activityRows.slice(0, activityRowCap)
    : activityData.activityRows;

  const activeClientIds = new Set(
    safeClients
      .filter(client => String(client.status || '').toLowerCase() !== 'inactive')
      .map(client => String(client.id || '').toLowerCase())
  );

  const statusTotals = {
    Active: 0,
    Maintenance: 0,
    Faulty: 0,
    Inactive: 0,
    Unspecified: 0
  };

  const modelCounts = new Map();
  const clientRollup = new Map();
  const userRollup = new Map();
  const completedClients = new Set();
  const timelineDayCounts = new Map();

  let completedUnits = 0;
  let pendingUnits = 0;
  let updateEvents = 0;
  let reportEvents = 0;

  for (const machine of safeMachines) {
    const machineContributorsOnce = getMachineContributors(machine);
    const machineClientId = String(machine.clientId || '').trim().toLowerCase();
    const modelName = String(machine.model || '').trim() || 'Unknown Model';
    const unitName = String(machine.unit || '').trim() || 'Unknown Unit';
    const statusLabel = normalizeStatus(machine.status);
    const updates = Array.isArray(machine.updates) ? machine.updates : [];
    const reports = Array.isArray(machine.reports) ? machine.reports : [];

    statusTotals[statusLabel] = (statusTotals[statusLabel] || 0) + 1;
    modelCounts.set(modelName, (modelCounts.get(modelName) || 0) + 1);

    if (!clientRollup.has(machineClientId)) {
      clientRollup.set(machineClientId, {
        clientId: machineClientId,
        clientName: String(machine.clientName || machineClientId || 'Unknown Client'),
        units: 0,
        models: new Set(),
        updates: 0,
        reports: 0,
        finishedUnits: 0,
        isActive: activeClientIds.has(machineClientId)
      });
    }

    const clientEntry = clientRollup.get(machineClientId);
    clientEntry.units += 1;
    clientEntry.models.add(modelName);
    clientEntry.updates += updates.length;
    clientEntry.reports += reports.length;

    updateEvents += updates.length;
    reportEvents += reports.length;

    const isCompleted = !hasUnitWarning(machine);
    if (isCompleted) {
      completedUnits += 1;
      clientEntry.finishedUnits += 1;
    } else {
      pendingUnits += 1;
    }

    for (const update of updates) {
      const contributors = update && update.report
        ? getReportContributors(update.report)
        : splitContributorNames(update?.submittedBy || '');
      const contributorNames = contributors.length ? contributors : [normalizeContributorName(update?.submittedBy) || 'Unknown Technician'];

      for (const contributorName of contributorNames) {
        if (!userRollup.has(contributorName)) {
          userRollup.set(contributorName, {
            name: contributorName,
            updates: 0,
            reports: 0,
            finishedUnits: 0,
            units: new Set(),
            models: new Set(),
            clients: new Set()
          });
        }
        const row = userRollup.get(contributorName);
        row.updates += 1;
        row.units.add(`${machineClientId}|${unitName}|${machine.serialNo || machine.model}`);
        row.models.add(modelName);
        row.clients.add(machineClientId);
      }

      const eventDate = parseActivityDate(update?.date || update?.report?.date);
      if (eventDate) {
        const dayKey = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}-${String(eventDate.getDate()).padStart(2, '0')}`;
        timelineDayCounts.set(dayKey, (timelineDayCounts.get(dayKey) || 0) + 1);
      }
    }

    const hasInstallationReport = reports.some(report => {
      const updateIndex = Number(report && report.updateIndex);
      return !(Number.isInteger(updateIndex) && updateIndex >= 0);
    });

    if (!hasInstallationReport) {
      reportEvents += 1;
    }

    if (!hasInstallationReport && machineContributorsOnce.length) {
      for (const contributorName of machineContributorsOnce) {
        if (!userRollup.has(contributorName)) {
          userRollup.set(contributorName, {
            name: contributorName,
            updates: 0,
            reports: 0,
            finishedUnits: 0,
            units: new Set(),
            models: new Set(),
            clients: new Set()
          });
        }
        const row = userRollup.get(contributorName);
        row.reports += 1;
        row.units.add(`${machineClientId}|${unitName}|${machine.serialNo || machine.model}`);
        row.models.add(modelName);
        row.clients.add(machineClientId);
      }
    }

    for (const report of reports) {
      const updateIndex = Number(report && report.updateIndex);
      const isInstallationReport = !(Number.isInteger(updateIndex) && updateIndex >= 0);

      if (!isInstallationReport) {
        continue;
      }

      const contributors = getReportContributors(report);
      const contributorNames = contributors.length
        ? contributors
        : (machineContributorsOnce.length
            ? machineContributorsOnce
            : [normalizeContributorName(report && report.submittedBy) || 'Unknown Technician']);

      for (const contributorName of contributorNames) {
        if (!userRollup.has(contributorName)) {
          userRollup.set(contributorName, {
            name: contributorName,
            updates: 0,
            reports: 0,
            finishedUnits: 0,
            units: new Set(),
            models: new Set(),
            clients: new Set()
          });
        }
        const row = userRollup.get(contributorName);
        row.reports += 1;
        row.units.add(`${machineClientId}|${unitName}|${machine.serialNo || machine.model}`);
        row.models.add(modelName);
        row.clients.add(machineClientId);
      }

      const eventDate = parseActivityDate(report?.date);
      if (eventDate) {
        const dayKey = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}-${String(eventDate.getDate()).padStart(2, '0')}`;
        timelineDayCounts.set(dayKey, (timelineDayCounts.get(dayKey) || 0) + 1);
      }
    }
  }

  const totalUnits = safeMachines.length;
  const totalModels = modelCounts.size;
  const totalClientsServed = clientRollup.size;
  const activeClientsServed = Array.from(clientRollup.values()).filter(client => client.isActive).length;
  for (const clientEntry of clientRollup.values()) {
    if (clientEntry.units > 0 && clientEntry.finishedUnits === clientEntry.units) {
      completedClients.add(clientEntry.clientId);
    }
  }
  const completionRate = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;

  const statusShare = Object.entries(statusTotals)
    .map(([label, count]) => {
      const percentage = totalUnits > 0 ? Math.round((count / totalUnits) * 100) : 0;
      return { label, count, percentage };
    })
    .sort((a, b) => b.count - a.count);

  const topModels = Array.from(modelCounts.entries())
    .map(([model, count]) => ({
      model,
      count,
      percentage: totalUnits > 0 ? Math.round((count / totalUnits) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const clientHighlights = Array.from(clientRollup.values())
    .map(entry => ({
      clientId: entry.clientId,
      clientName: entry.clientName,
      units: entry.units,
      models: entry.models.size,
      updates: entry.updates,
      reports: entry.reports,
      finishedUnits: entry.finishedUnits,
      completionRate: entry.units > 0 ? Math.round((entry.finishedUnits / entry.units) * 100) : 0,
      isActive: entry.isActive
    }))
    .sort((a, b) => b.finishedUnits - a.finishedUnits || b.reports - a.reports || b.units - a.units)
    .slice(0, 8);

  // Pending clients: clients where NOT all units are finished
  const pendingClientsList = Array.from(clientRollup.values())
    .filter(entry => entry.units > 0 && entry.finishedUnits < entry.units)
    .map(entry => ({
      clientId: entry.clientId,
      clientName: entry.clientName,
      units: entry.units,
      finishedUnits: entry.finishedUnits,
      pendingUnits: entry.units - entry.finishedUnits,
      completionRate: entry.units > 0 ? Math.round((entry.finishedUnits / entry.units) * 100) : 0,
      isActive: entry.isActive
    }))
    .sort((a, b) => b.pendingUnits - a.pendingUnits || a.clientName.localeCompare(b.clientName));

  // Tech reports: per-technician total reports (all activity types count)
  const techReports = Array.from(userRollup.values())
    .map(entry => ({
      name: entry.name,
      totalReports: entry.reports + entry.updates,
      reports: entry.reports,
      updates: entry.updates,
      unitsServed: entry.units.size,
      clientsServed: entry.clients.size
    }))
    .sort((a, b) => b.totalReports - a.totalReports);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const recentActivity = [];
  for (let i = 6; i >= 0; i -= 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    const dayKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    recentActivity.push({
      key: dayKey,
      label: formatDayLabel(day),
      count: timelineDayCounts.get(dayKey) || 0
    });
  }

  const activityPeak = recentActivity.reduce((max, day) => Math.max(max, day.count), 0);

  return {
    totalUnits,
    totalModels,
    totalClientsServed,
    activeClientsServed,
    completedUnits,
    pendingUnits,
    completedClients: completedClients.size,
    pendingClientsList,
    completionRate,
    updateEvents,
    reportEvents,
    statusShare,
    topModels,
    clientHighlights,
    techReports,
    recentActivity,
    activityPeak,
    activityRows: activityRowsForView,
    activityRowTotal,
    activityRowsCapped,
    technicianOptions: activityData.technicianOptions,
    clientOptions: activityData.clientOptions,
    unitOptions: activityData.unitOptions,
    modelOptions: activityData.modelOptions,
    unitModelOptions: activityData.unitModelOptions
  };
}

async function renderAdmin(req, res, { success = null, error = null } = {}) {
  const [userAccountsRaw, clientsRaw, machines] = await Promise.all([
    listUserAccounts(),
    listClients(),
    listAllMachines()
  ]);
  const userAccounts = userAccountsRaw.slice().sort((a, b) => a.fullName.localeCompare(b.fullName));
  const sortedClients = clientsRaw.slice().sort((a, b) => a.name.localeCompare(b.name));
  const monitoring = buildMonitoring(sortedClients, machines);

  res.render('admin_account', {
    currentUser: req.session.user,
    accounts: userAccounts,
    clients: sortedClients,
    monitoring,
    success,
    error
  });
}

function redirectWithFlash(req, res, { success, error }) {
  if (success) req.session.flashSuccess = success;
  if (error) req.session.flashError = error;
  return res.redirect('/admin_account');
}

router.get('/', requireAdmin, (req, res) => {
  const success = req.session.flashSuccess || null;
  const error = req.session.flashError || null;
  delete req.session.flashSuccess;
  delete req.session.flashError;
  return renderAdmin(req, res, { success, error });
});

/**
 * Lightweight JSON API: returns monitoring data filtered by date range.
 * Query param `range` accepts: this-month | last-month | last-year | all (default)
 */
router.get('/monitoring-data', requireAdmin, async (req, res) => {
  try {
    const range = String(req.query.range || 'all').trim().toLowerCase();
    const [clientsRaw, machines] = await Promise.all([listClients(), listAllMachines()]);
    const sortedClients = clientsRaw.slice().sort((a, b) => a.name.localeCompare(b.name));

    // Build date boundaries
    const now = new Date();
    let rangeStart = null;
    let rangeEnd = null;

    if (range === 'this-month') {
      rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
      rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (range === 'last-month') {
      rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      rangeEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else if (range === 'last-year') {
      rangeStart = new Date(now.getFullYear() - 1, 0, 1);
      rangeEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
    }
    // 'all' => rangeStart/rangeEnd stay null => no filtering

    // Filter machines: keep only those whose dateInstalled or any update/report date falls in range
    let filteredMachines = machines;
    if (rangeStart && rangeEnd) {
      filteredMachines = machines.filter(machine => {
        const installDate = parseActivityDate(machine.dateInstalled);
        if (installDate && installDate >= rangeStart && installDate <= rangeEnd) return true;
        const updates = Array.isArray(machine.updates) ? machine.updates : [];
        for (const u of updates) {
          const d = parseActivityDate(u && u.date);
          if (d && d >= rangeStart && d <= rangeEnd) return true;
        }
        const reports = Array.isArray(machine.reports) ? machine.reports : [];
        for (const r of reports) {
          const d = parseActivityDate(r && r.date);
          if (d && d >= rangeStart && d <= rangeEnd) return true;
        }
        return false;
      });
    }

    const monitoring = buildMonitoring(sortedClients, filteredMachines);
    return res.json({
      ok: true,
      range,
      monitoring: {
        totalUnits: monitoring.totalUnits,
        completedUnits: monitoring.completedUnits,
        pendingUnits: monitoring.pendingUnits,
        completedClients: monitoring.completedClients,
        pendingClientsList: monitoring.pendingClientsList,
        reportEvents: monitoring.reportEvents,
        updateEvents: monitoring.updateEvents,
        completionRate: monitoring.completionRate,
        statusShare: monitoring.statusShare,
        clientHighlights: monitoring.clientHighlights,
        techReports: monitoring.techReports,
        // Omit heavy activity rows from the lightweight response
        activityRowTotal: monitoring.activityRowTotal
      }
    });
  } catch (err) {
    console.error('[monitoring-data]', err);
    return res.status(500).json({ ok: false, error: 'Failed to load monitoring data.' });
  }
});

router.post('/employees/create', requireAdmin, async (req, res) => {
  let { username, password, fullName, department, branch } = req.body;

  username = String(username || '').trim().toLowerCase();
  fullName = properCase(fullName || '');
  department = String(department || '').trim().toUpperCase();
  branch = properCase(branch || '');

  if (!usernameRegex.test(username)) {
    return redirectWithFlash(req, res, {
      error: 'Username must be 4-20 characters using lowercase letters and underscore only.'
    });
  }

  if (!passwordRegex.test(password || '')) {
    return redirectWithFlash(req, res, {
      error: 'Password must be at least 8 characters long.'
    });
  }

  if (!nameRegex.test(fullName)) {
    return redirectWithFlash(req, res, {
      error: 'Full name must contain letters and spaces only.'
    });
  }

  if (await usernameExists(username)) {
    return redirectWithFlash(req, res, { error: 'Username already exists.' });
  }

  await createUserAccount({
    username,
    passwordHash: await bcrypt.hash(password, 10),
    role: 'user',
    fullName,
    department,
    branch,
    status: 'active'
  });

  return redirectWithFlash(req, res, { success: 'Employee account created successfully.' });
});

router.post('/employees/invite', requireAdmin, async (req, res) => {
  const email = String(req.body.inviteEmail || '').trim().toLowerCase();
  const role = String(req.body.inviteRole || '').trim().toLowerCase();
  const branch = String(req.body.inviteBranch || '').trim();
  const department = String(req.body.inviteDept || '').trim().toUpperCase();

  if (!emailRegex.test(email)) {
    return redirectWithFlash(req, res, {
      error: 'Please enter a valid employee email address.'
    });
  }

  if (!inviteRoles.has(role)) {
    return redirectWithFlash(req, res, {
      error: 'Please select a valid invite role.'
    });
  }

  if (!inviteBranches.has(branch)) {
    return redirectWithFlash(req, res, {
      error: 'Please select a valid branch.'
    });
  }

  if (!department) {
    return redirectWithFlash(req, res, {
      error: 'Department is required.'
    });
  }

  const invite = {
    token: crypto.randomBytes(24).toString('hex'),
    email,
    role,
    branch,
    department,
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  };

  await createInvite(invite);
  const inviteLink = `${buildAppBaseUrl(req)}/account_setup?token=${encodeURIComponent(invite.token)}`;

  sendGmailAppLinkInBackground({
    to: email,
    linkUrl: inviteLink,
    kind: 'account_invite',
    inviteRole: role
  });

  const successMessage = `Invite created for ${email}. Invite link: ${inviteLink}${outboundEmailUiHint()}`;
  return redirectWithFlash(req, res, { success: successMessage });
});

router.post('/employees/update', requireAdmin, async (req, res) => {
  const { username } = req.body;

  const fullName = properCase(req.body.fullName || '');
  const department = String(req.body.department || '').trim().toUpperCase();
  const branch = properCase(req.body.branch || '');

  if (!nameRegex.test(fullName)) {
    return redirectWithFlash(req, res, { error: 'Invalid full name.' });
  }

  const updated = await updateUserAccount(username, {
    fullName,
    department,
    branch
  });

  if (!updated) {
    return redirectWithFlash(req, res, { error: 'Employee account not found.' });
  }

  return redirectWithFlash(req, res, { success: 'Employee account updated successfully.' });
});

router.post('/employees/reset-password', requireAdmin, async (req, res) => {
  const email = String(req.body.resetEmail || '').trim().toLowerCase();

  if (!emailRegex.test(email)) {
    return redirectWithFlash(req, res, {
      error: 'Please enter a valid email address.'
    });
  }

  const account = await findAccountByEmail(email);
  if (!account) {
    return redirectWithFlash(req, res, {
      error: 'No account was found for that email address.'
    });
  }

  const token = crypto.randomBytes(24).toString('hex');
  const resetEntry = {
    token,
    username: account.username,
    email,
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    usedAt: null
  };

  await createPasswordReset(resetEntry);

  const resetLink = `${buildAppBaseUrl(req)}/reset_password?token=${encodeURIComponent(token)}`;

  sendGmailAppLinkInBackground({
    to: email,
    linkUrl: resetLink,
    kind: 'password_reset'
  });

  const successMessage = `Reset link created for ${email}. Reset link: ${resetLink}${outboundEmailUiHint()}`;
  return redirectWithFlash(req, res, { success: successMessage });
});

router.post('/employees/toggle', requireAdmin, async (req, res) => {
  const { username, status } = req.body;
  const updated = await setUserStatus(username, status === 'inactive' ? 'inactive' : 'active');

  if (!updated) {
    return redirectWithFlash(req, res, { error: 'Employee account not found.' });
  }

  return redirectWithFlash(req, res, { success: 'Employee status updated successfully.' });
});

router.post('/clients/create', requireAdmin, async (req, res) => {
  const clientName = properCase(req.body.clientName || '');
  const location = properCase(req.body.location || '');
  const id = slugify(clientName);

  if (!clientName) {
    return redirectWithFlash(req, res, { error: 'Client name is required.' });
  }

  const created = await createClient({
    id,
    name: clientName,
    location,
    status: 'active'
  });

  if (!created) {
    return redirectWithFlash(req, res, { error: 'Client already exists.' });
  }

  return res.redirect('/admin_account#clients');
});

router.post('/clients/update', requireAdmin, async (req, res) => {
  const { clientId } = req.body;
  const updated = await updateClient(clientId, {
    name: properCase(req.body.clientName || ''),
    location: properCase(req.body.location || '')
  });

  if (!updated) {
    return redirectWithFlash(req, res, { error: 'Client not found.' });
  }

  return res.redirect('/admin_account#clients');
});

router.post('/clients/toggle', requireAdmin, async (req, res) => {
  const { clientId, status } = req.body;
  const updated = await setClientStatus(clientId, status === 'inactive' ? 'inactive' : 'active');

  if (!updated) {
    return redirectWithFlash(req, res, { error: 'Client not found.' });
  }

  return res.redirect('/admin_account#clients');
});

module.exports = router;