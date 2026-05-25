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

//  Add Report Popup Logic 

let currentReportRecordIndex = null;
let currentReportUpdateIndex = null;

const reportPopup      = document.getElementById('reportPopup');
const closeReportPopupBtn = document.getElementById('closeReportPopup');
const reportForm       = document.getElementById('reportForm');
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

function openReportPopup(record, index, updateIndex) {
    if (!reportPopup) return;

    currentReportRecordIndex = index;
    currentReportUpdateIndex = Number.isInteger(updateIndex) ? updateIndex : null;

    // Close the edit modal immediately - save already succeeded, no discard prompt needed
    if (editPopup) editPopup.style.display = 'none';
    clearEditDraft();

    // Populate read-only machine info (guard each element)
    const unitEl   = document.getElementById('report-unit-display');
    const modelEl  = document.getElementById('report-model-display');
    const serialEl = document.getElementById('report-serial-display');
    if (unitEl)   unitEl.textContent   = record.unit     || '\u2014';
    if (modelEl)  modelEl.textContent  = record.model    || '\u2014';
    if (serialEl) serialEl.textContent = record.serialNo || '\u2014';

    // Clear previous inputs
    const problemEl        = document.getElementById('report-problem');
    const actionEl         = document.getElementById('report-action');
    const recommendationEl = document.getElementById('report-recommendation');
    const techniciansEl    = document.getElementById('report-technicians');
    if (problemEl)        problemEl.value        = '';
    if (actionEl)         actionEl.value         = '';
    if (recommendationEl) recommendationEl.value = '';
    if (techniciansEl)    techniciansEl.value    = '';

    closeReportTechDropdown();

    reportPopup.style.display = 'grid';
}

function closeReportModal() {
    if (reportPopup) reportPopup.style.display = 'none';
    currentReportRecordIndex = null;
    currentReportUpdateIndex = null;
    closeReportTechDropdown();
}

if (closeReportPopupBtn) closeReportPopupBtn.addEventListener('click', closeReportModal);


if (reportPopup) {
    reportPopup.addEventListener('click', (e) => {
        if (e.target === reportPopup) closeReportModal();
    });
}

if (reportTechniciansInput) {
    reportTechniciansInput.addEventListener('input', () => {
        reportTechFocusedIndex = -1;
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

if (reportForm) {
    reportForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const index = currentReportRecordIndex;
        if (index === null || index === undefined) return;

        const record = allMachines[index];
        if (!record) return;

        const problemEl        = document.getElementById('report-problem');
        const actionEl         = document.getElementById('report-action');
        const recommendationEl = document.getElementById('report-recommendation');
        const techniciansEl    = document.getElementById('report-technicians');

        const problem        = problemEl        ? problemEl.value.trim()        : '';
        const action         = actionEl         ? actionEl.value.trim()         : '';
        const recommendation = recommendationEl ? recommendationEl.value.trim() : '';
        const technicianInput = techniciansEl ? techniciansEl.value : '';

        if (technicianInput.trim()) {
            const technicianParse = parseTechnicianInput(technicianInput);
            if (technicianParse.invalid.length > 0) {
                showToast('Technician names must be selected from active user suggestions.', 'warning');
                return;
            }
        }

        const technicianParse = parseTechnicianInput(technicianInput);
        const additionalTechnicians = technicianParse.picked;
        const reporterName = normalizeTechnicianName(
            typeof CURRENT_USER_FULLNAME !== 'undefined' ? CURRENT_USER_FULLNAME : 'Unknown User'
        );
        const submittedBy = splitTechnicianNames(reporterName)[0] || reporterName || 'Unknown User';
        const technicians = [submittedBy, ...additionalTechnicians]
            .filter(Boolean)
            .filter((name, idx, arr) => arr.findIndex(v => v.toLowerCase() === name.toLowerCase()) === idx);

        if (!problem || !action || !recommendation) {
            showToast('Problem, Action, and Recommendation fields are required.', 'warning');
            return;
        }

        const todayStr = getTodayDateString();

        const reportEntry = {
            date: todayStr,
            submittedBy,
            technicians,
            problem,
            action,
            recommendation,
            updateIndex: Number.isInteger(currentReportUpdateIndex) ? currentReportUpdateIndex : null
        };

        if (!Array.isArray(record.reports)) record.reports = [];
        record.reports.push(cloneReportEntry(reportEntry));

        if (Array.isArray(record.updates) && Number.isInteger(currentReportUpdateIndex) && record.updates[currentReportUpdateIndex]) {
            record.updates[currentReportUpdateIndex].submittedBy = submittedBy;
            record.updates[currentReportUpdateIndex].report = cloneReportEntry(reportEntry);
        } else if (Array.isArray(record.updates) && record.updates.length > 0) {
            record.updates[record.updates.length - 1].submittedBy = submittedBy;
            record.updates[record.updates.length - 1].report = cloneReportEntry(reportEntry);
        }

        try {
            const response = await fetch(`/client/${encodeURIComponent(CLIENT_ID)}/machines/report`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    serialNo:      record.serialNo,
                    model:         record.model,
                    dateInstalled: record.dateInstalled,
                    updateIndex:   Number.isInteger(currentReportUpdateIndex) ? currentReportUpdateIndex : null,
                    report:        reportEntry
                })
            });

            const payload = await response.json();
            if (!response.ok || !payload.ok) {
                throw new Error(payload.error || 'Failed to save report.');
            }

            closeReportModal();
            showToast('Report saved successfully.', 'success');
        } catch (error) {
            // Save locally even if server call fails, then close
            closeReportModal();
            showToast('Report saved locally.', 'info');
            console.warn('Report save error:', error);
        }
    });
}
