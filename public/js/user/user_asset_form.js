const clientInput = document.getElementById('clientInput');
const clientIdField = document.getElementById('clientId');
const clientDropdown = document.getElementById('clientDropdown');

let filteredClients = [];
let focusedIndex = -1;

function findClientById(id) {
  return CLIENTS.find(c => c.id === id) || null;
}

function setSelectedClient(client) {
  if (!client) return;
  clientInput.value = client.name;
  clientIdField.value = client.id;
  closeDropdown();
}

function renderDropdown(items) {
  filteredClients = items;

  if (!items.length) {
    clientDropdown.innerHTML = '<li class="combo-empty">No clients found.</li>';
    openDropdown();
    return;
  }

  clientDropdown.innerHTML = items.map((client, idx) => `
    <li class="combo-item" data-index="${idx}" data-id="${client.id}" tabindex="0">${client.name}</li>
  `).join('');

  clientDropdown.querySelectorAll('.combo-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      const selClient = findClientById(id);
      setSelectedClient(selClient);
    });
  });

  openDropdown();
}

function openDropdown() {
  clientDropdown.classList.add('open');
}

function closeDropdown() {
  clientDropdown.classList.remove('open');
  focusedIndex = -1;
}

function filterClients(value) {
  const query = value.trim().toLowerCase();

  const matches = CLIENTS
    .filter(c => c.name.toLowerCase().includes(query))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  renderDropdown(matches);
}

if (clientInput) {
  const initialClient = findClientById(INITIAL_CLIENT_ID);
  if (initialClient) {
    setSelectedClient(initialClient);
  } else {
    clientInput.value = '';
    clientIdField.value = '';
  }

  const dateInput = document.getElementById('dateInstalled');
  const datePreview = document.getElementById('dateInstalledPreview');

  function updateDatePreview(value) {
    if (!datePreview) return;
    if (!value) {
      datePreview.textContent = 'Selected date: —';
      return;
    }
    const date = new Date(value);
    const monthNames = [
      'January','February','March','April','May','June',
      'July','August','September','October','November','December'
    ];
    if (Number.isNaN(date.getTime())) {
      datePreview.textContent = `Selected date: ${value}`;
      return;
    }
    datePreview.textContent = `Selected date: ${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }

  if (dateInput) {
    updateDatePreview(dateInput.value);
    dateInput.addEventListener('input', (e) => updateDatePreview(e.target.value));
  }

  clientInput.addEventListener('input', (event) => {
    const query = event.target.value;
    if (query.trim().length === 0) {
      closeDropdown();
      clientIdField.value = '';
      return;
    }
    filterClients(query);
    clientIdField.value = '';
  });

  clientInput.addEventListener('keydown', (event) => {
    const items = clientDropdown.querySelectorAll('.combo-item');
    if (!items.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusedIndex = Math.min(focusedIndex + 1, items.length - 1);
      items[focusedIndex].focus();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusedIndex = Math.max(focusedIndex - 1, 0);
      items[focusedIndex].focus();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const sel = items[focusedIndex];
      if (sel) {
        const selClient = findClientById(sel.dataset.id);
        setSelectedClient(selClient);
      }
    }

    if (event.key === 'Escape') {
      closeDropdown();
    }
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.combo-wrap')) {
      closeDropdown();
    }
  });

  clientInput.addEventListener('focus', () => {
    if (clientInput.value.trim()) {
      filterClients(clientInput.value);
    } else {
      closeDropdown();
    }
  });

  // Auto-select if there is exactly one match when the user clicks away without
  // explicitly picking from the dropdown list.
  clientInput.addEventListener('blur', () => {
    // Small delay so a dropdown item click fires before this blur handler runs
    setTimeout(() => {
      if (clientIdField.value) return; // already resolved via dropdown
      const query = clientInput.value.trim().toLowerCase();
      if (!query) return;
      // Prefer exact name match first
      const exact = CLIENTS.filter(c => c.name.toLowerCase() === query);
      if (exact.length === 1) {
        setSelectedClient(exact[0]);
        return;
      }
      // Fall back to single partial match
      const partials = CLIENTS.filter(c => c.name.toLowerCase().includes(query));
      if (partials.length === 1) {
        setSelectedClient(partials[0]);
      }
    }, 150);
  });
}



const modelInput = document.getElementById('model');
const modelDropdown = document.getElementById('modelDropdown');
const unitSelect = document.getElementById('unit');
const assetForm = document.getElementById('assetForm');

let filteredModels = [];
let modelFocusedIndex = -1;

function getAvailableModels(unitKey) {
  if (!PARTS_CATALOG[unitKey]) return [];
  return Object.keys(PARTS_CATALOG[unitKey]);
}

function getAvailableModelsForSelectedUnit() {
  const selectedUnit = (unitSelect?.value || '').trim();
  return getAvailableModels(selectedUnit);
}

function isValidModelForSelectedUnit(modelValue) {
  const normalized = (modelValue || '').trim().toUpperCase();
  if (!normalized) return false;
  const availableModels = getAvailableModelsForSelectedUnit();
  if (!availableModels.length) return true;
  return availableModels.some(m => m.toUpperCase() === normalized);
}

function applyModelValidation() {
  if (!modelInput) return true;
  const value = (modelInput.value || '').trim().toUpperCase();
  modelInput.value = value;

  const availableModels = getAvailableModelsForSelectedUnit();
  if (!value) {
    modelInput.setCustomValidity('Please enter a model.');
    return false;
  }

  if (!availableModels.length) {
    // Some unit types do not have a fixed model catalog yet, so manual model
    // entry is allowed as long as a model value was typed.
    modelInput.setCustomValidity('');
    return true;
  }

  if (!isValidModelForSelectedUnit(value)) {
    modelInput.setCustomValidity('Invalid model for the selected unit.');
    return false;
  }

  modelInput.setCustomValidity('');
  return true;
}

function renderModelDropdown(items) {
  filteredModels = items;

  if (!items.length) {
    modelDropdown.innerHTML = '<li class="combo-empty">No models available.</li>';
    openModelDropdown();
    return;
  }

  modelDropdown.innerHTML = items.map((model, idx) => `
    <li class="combo-item" data-index="${idx}" data-model="${model}" tabindex="0">${model}</li>
  `).join('');

  modelDropdown.querySelectorAll('.combo-item').forEach(item => {
    item.addEventListener('click', () => {
      const model = item.dataset.model;
      setSelectedModel(model);
    });
  });

  openModelDropdown();
}

function openModelDropdown() {
  modelDropdown.classList.add('open');
}

function closeModelDropdown() {
  modelDropdown.classList.remove('open');
  modelFocusedIndex = -1;
}

function setSelectedModel(model) {
  if (!model) return;
  modelInput.value = model.toUpperCase();
  modelInput.setCustomValidity('');
  closeModelDropdown();
}

function filterModels(value) {
  const selectedUnit = unitSelect.value;
  if (!selectedUnit) {
    modelDropdown.innerHTML = '<li class="combo-empty">Select a unit first.</li>';
    openModelDropdown();
    return;
  }

  const availableModels = getAvailableModels(selectedUnit);
  const query = value.trim().toUpperCase();

  if (!availableModels.length) {
    modelDropdown.innerHTML = '<li class="combo-empty">No fixed model list. You can type the model manually.</li>';
    openModelDropdown();
    return;
  }

  const matches = availableModels
    .filter(m => m.includes(query))
    .sort();
  
  renderModelDropdown(matches);
}

if (modelInput) {
  if (modelInput.value) {
    modelInput.value = modelInput.value.toUpperCase();
  }

  modelInput.addEventListener('input', (event) => {
    const query = event.target.value.toUpperCase();
    event.target.value = query;
    modelInput.setCustomValidity('');
    if (query.trim().length === 0) {
      closeModelDropdown();
    } else {
      filterModels(query);
    }
  });

  modelInput.addEventListener('keydown', (event) => {
    const items = modelDropdown.querySelectorAll('.combo-item');
    if (!items.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      modelFocusedIndex = Math.min(modelFocusedIndex + 1, items.length - 1);
      items[modelFocusedIndex].focus();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      modelFocusedIndex = Math.max(modelFocusedIndex - 1, 0);
      items[modelFocusedIndex].focus();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const sel = items[modelFocusedIndex];
      if (sel) {
        setSelectedModel(sel.dataset.model);
      }
    }

    if (event.key === 'Escape') {
      closeModelDropdown();
    }
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.combo-wrap') || !modelInput.closest('.combo-wrap').contains(event.target)) {
      closeModelDropdown();
    }
  });

  modelInput.addEventListener('focus', () => {
    const selectedUnit = unitSelect.value;
    if (!selectedUnit) {
      modelDropdown.innerHTML = '<li class="combo-empty">Select a unit first.</li>';
      openModelDropdown();
    } else if (!getAvailableModels(selectedUnit).length) {
      modelDropdown.innerHTML = '<li class="combo-empty">No fixed model list. You can type the model manually.</li>';
      openModelDropdown();
    } else if (modelInput.value.trim()) {
      filterModels(modelInput.value);
    } else {
      closeModelDropdown();
    }
  });

  unitSelect.addEventListener('change', () => {
    modelInput.value = '';
    modelInput.setCustomValidity('');
    closeModelDropdown();
  });

  modelInput.addEventListener('blur', () => {
    if (modelInput.value.trim()) {
      applyModelValidation();
    }
  });
}

if (assetForm) {
  assetForm.addEventListener('submit', (event) => {
    const modelOk = applyModelValidation();
    if (!modelOk) {
      event.preventDefault();
      modelInput.reportValidity();
      return;
    }

    if (reportTechniciansInput && reportTechniciansInput.value.trim()) {
      const technicianParse = parseTechnicianInput(reportTechniciansInput.value);
      if (technicianParse.invalid.length > 0) {
        event.preventDefault();
        reportTechniciansInput.setCustomValidity('Technician names must be selected from active user suggestions.');
        reportTechniciansInput.reportValidity();
        return;
      }
      reportTechniciansInput.setCustomValidity('');
    }
  });
}

function normalizeTechnicianName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function getTechnicianPool() {
  const currentName = normalizeTechnicianName(
    typeof CURRENT_USER_FULLNAME !== 'undefined' ? CURRENT_USER_FULLNAME : ''
  ).toLowerCase();

  return (Array.isArray(TEAM_MEMBERS) ? TEAM_MEMBERS : [])
    .map(normalizeTechnicianName)
    .filter(Boolean)
    .filter((name, index, arr) => arr.findIndex(v => v.toLowerCase() === name.toLowerCase()) === index)
    .filter(name => name.toLowerCase() !== currentName)
    .sort((a, b) => a.localeCompare(b));
}

function getTechnicianDraftState(rawValue) {
  const text = String(rawValue || '');
  const endsWithSeparator = /,\s*$/.test(text);
  const segments = text.split(',');
  const normalized = segments.map(normalizeTechnicianName);

  let searchTerm = '';
  if (!endsWithSeparator && normalized.length > 0) {
    searchTerm = normalized[normalized.length - 1] || '';
  }

  const committed = endsWithSeparator
    ? normalized.filter(Boolean)
    : normalized.slice(0, -1).filter(Boolean);

  return { committed, searchTerm };
}

function parseTechnicianInput(rawValue) {
  const pool = getTechnicianPool();
  const lookup = new Map(pool.map(name => [name.toLowerCase(), name]));
  const chunks = String(rawValue || '')
    .split(',')
    .map(normalizeTechnicianName)
    .filter(Boolean);

  const picked = [];
  const invalid = [];

  chunks.forEach(name => {
    const allowed = lookup.get(name.toLowerCase());
    if (!allowed) {
      invalid.push(name);
      return;
    }

    if (!picked.some(existing => existing.toLowerCase() === allowed.toLowerCase())) {
      picked.push(allowed);
    }
  });

  return { picked, invalid };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const reportTechniciansInput = document.getElementById('report-technicians');
const reportTechDropdown = document.getElementById('report-tech-dropdown');
let reportTechFocusedIndex = -1;

function closeReportTechDropdown() {
  if (!reportTechDropdown) return;
  reportTechDropdown.classList.remove('open');
  reportTechFocusedIndex = -1;
}

function insertSelectedTechnician(name) {
  if (!reportTechniciansInput) return;

  const draft = getTechnicianDraftState(reportTechniciansInput.value);
  const merged = [...draft.committed, name]
    .filter(Boolean)
    .filter((value, idx, arr) => arr.findIndex(v => v.toLowerCase() === value.toLowerCase()) === idx);

  reportTechniciansInput.value = merged.length ? `${merged.join(', ')}, ` : '';
  reportTechniciansInput.setCustomValidity('');
  closeReportTechDropdown();
  reportTechniciansInput.focus();
}

function renderReportTechDropdown() {
  if (!reportTechniciansInput || !reportTechDropdown) return;

  const draft = getTechnicianDraftState(reportTechniciansInput.value);
  const committedSet = new Set(draft.committed.map(name => name.toLowerCase()));

  let options = getTechnicianPool().filter(name => !committedSet.has(name.toLowerCase()));

  if (draft.searchTerm) {
    const q = draft.searchTerm.toLowerCase();
    options = options.filter(name => name.toLowerCase().includes(q));
  }

  if (!options.length) {
    reportTechDropdown.innerHTML = '<li class="report-tech-empty">No active users found.</li>';
    reportTechDropdown.classList.add('open');
    return;
  }

  reportTechDropdown.innerHTML = options.map((name, index) =>
    `<li class="report-tech-item${index === reportTechFocusedIndex ? ' is-active' : ''}" data-name="${escapeHtml(name)}">${escapeHtml(name)}</li>`
  ).join('');

  reportTechDropdown.classList.add('open');

  reportTechDropdown.querySelectorAll('.report-tech-item').forEach(item => {
    item.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const selected = item.dataset.name || '';
      insertSelectedTechnician(selected);
    });
  });
}

if (reportTechniciansInput) {
  reportTechniciansInput.addEventListener('input', () => {
    reportTechFocusedIndex = -1;
    reportTechniciansInput.setCustomValidity('');
    renderReportTechDropdown();
  });

  reportTechniciansInput.addEventListener('focus', () => {
    renderReportTechDropdown();
  });

  reportTechniciansInput.addEventListener('keydown', (event) => {
    if (!reportTechDropdown || !reportTechDropdown.classList.contains('open')) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        renderReportTechDropdown();
      }
      return;
    }

    const items = Array.from(reportTechDropdown.querySelectorAll('.report-tech-item'));
    if (!items.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      reportTechFocusedIndex = Math.min(reportTechFocusedIndex + 1, items.length - 1);
      renderReportTechDropdown();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      reportTechFocusedIndex = Math.max(reportTechFocusedIndex - 1, 0);
      renderReportTechDropdown();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (reportTechFocusedIndex >= 0 && items[reportTechFocusedIndex]) {
        const selected = items[reportTechFocusedIndex].dataset.name || '';
        insertSelectedTechnician(selected);
      }
      return;
    }

    if (event.key === 'Escape') {
      closeReportTechDropdown();
    }
  });
}

document.addEventListener('click', (event) => {
  if (!reportTechniciansInput || !reportTechDropdown) return;
  if (!event.target.closest('.report-tech-wrap')) {
    closeReportTechDropdown();
  }
});