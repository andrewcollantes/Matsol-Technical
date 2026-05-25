/* ── SECTION SWITCHING ── */
function switchSection(name, el) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('section-' + name).classList.add('active');
    el.classList.add('active');
}

/* ── MODAL HELPERS ── */
function openModal(id) {
    document.getElementById(id).classList.add('open');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('open');
}

function closeOnOverlay(event, id) {
    if (event.target === event.currentTarget) closeModal(id);
}

/* ── EDIT EMPLOYEE ── */
function openEditEmployee(username, fullName, dept, branch) {
    document.getElementById('editEmpUsername').value = username;
    document.getElementById('editEmpFullName').value = fullName;
    document.getElementById('editEmpDept').value     = dept;
    document.getElementById('editEmpBranch').value   = branch;
    openModal('modal-edit-employee');
}

/* ── RESET PASSWORD ── */
function openResetPass(username) {
    document.getElementById('resetPassUsername').value      = username;
    document.getElementById('resetPassDisplay').textContent = username;
    const resetEmailInput = document.querySelector('#modal-reset-pass input[name="resetEmail"]');
    if (resetEmailInput) {
        resetEmailInput.value = '';
    }
    openModal('modal-reset-pass');
}

/* ── TOGGLE EMPLOYEE STATUS ── */
function toggleEmployee(username, status) {
    if (!confirm(`${status === 'inactive' ? 'Deactivate' : 'Reactivate'} account "${username}"?`)) return;
    document.getElementById('toggleEmpUsername').value = username;
    document.getElementById('toggleEmpStatus').value   = status;
    document.getElementById('form-toggle-emp').submit();
}

/* ── EDIT CLIENT ── */
function openEditClient(id, name, location) {
    document.getElementById('editClientId').value       = id;
    document.getElementById('editClientName').value     = name;
    document.getElementById('editClientLocation').value = location || '';
    openModal('modal-edit-client');
}

/* ── TOGGLE CLIENT STATUS ── */
function toggleClient(id, status) {
    if (!confirm(`${status === 'inactive' ? 'Deactivate' : 'Reactivate'} client "${id}"?`)) return;
    document.getElementById('toggleCliId').value     = id;
    document.getElementById('toggleCliStatus').value = status;
    document.getElementById('form-toggle-cli').submit();
}

/* ── EMPLOYEE TABLE FILTER ── */
let currentEmpStatusFilter = 'all';

function filterByStatus(status, el) {
    currentEmpStatusFilter = status;
    document.querySelectorAll('#section-employees .filter-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    applyEmpFilters();
}

function filterAccounts() { applyEmpFilters(); }

function applyEmpFilters() {
    const q = document.getElementById('accountSearch').value.toLowerCase().trim();
    document.querySelectorAll('.emp-row').forEach(row => {
        const matchQ = !q || row.innerText.toLowerCase().includes(q);
        const matchS = currentEmpStatusFilter === 'all' || row.dataset.status === currentEmpStatusFilter;
        row.style.display = matchQ && matchS ? '' : 'none';
    });
}

/* ── CLIENT TABLE FILTER ── */
let currentCliStatusFilter = 'all';

function filterClientsByStatus(status, el) {
    currentCliStatusFilter = status;
    document.querySelectorAll('#section-clients .filter-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    applyCliFilters();
}

function filterClients() { applyCliFilters(); }

function applyCliFilters() {
    const q = document.getElementById('clientSearch').value.toLowerCase().trim();
    document.querySelectorAll('.cli-row').forEach(row => {
        const matchQ = !q || row.innerText.toLowerCase().includes(q);
        const matchS = currentCliStatusFilter === 'all' || row.dataset.status === currentCliStatusFilter;
        row.style.display = matchQ && matchS ? '' : 'none';
    });
}

/* ── MONITORING ACTIVITY LOG ── */
function getMonitoringRows() {
    return Array.from(document.querySelectorAll('#monitorActivityBody .monitor-row'));
}

function normalizeMonitoringText(value) {
    return String(value || '').trim().toLowerCase();
}

function rowMatchesTechnicianFilter(rowTechnicians, technicianFilter) {
    if (!technicianFilter) {
        return true;
    }

    return String(rowTechnicians || '')
        .split(',')
        .map(name => normalizeMonitoringText(name))
        .some(name => name === technicianFilter);
}

function rowMatchesTypeFilter(row, typeFilter) {
    if (!typeFilter) {
        return true;
    }

    const tags = String(row?.dataset?.activityTags || row?.dataset?.type || '')
        .split(',')
        .map(normalizeMonitoringText)
        .filter(Boolean);

    return tags.includes(typeFilter);
}

function updateMonitoringResultsCount(visibleCount, totalCount) {
    const label = document.getElementById('monitorResultsCount');
    if (label) {
        label.textContent = `${visibleCount} of ${totalCount}`;
    }

    const empty = document.getElementById('monitorNoResults');
    if (empty) {
        empty.hidden = visibleCount !== 0;
    }
}

function applyMonitoringFilters() {
    syncMonitoringModelOptions();
    const rows = getMonitoringRows();
    if (!rows.length) {
        updateMonitoringResultsCount(0, 0);
        return;
    }

    const technicianFilter = normalizeMonitoringText(document.getElementById('monitorTechnicianFilter')?.value);
    const clientFilter = normalizeMonitoringText(document.getElementById('monitorClientFilter')?.value);
    const unitFilter = normalizeMonitoringText(document.getElementById('monitorUnitFilter')?.value);
    const modelFilter = normalizeMonitoringText(document.getElementById('monitorModelFilter')?.value);
    const typeFilter = normalizeMonitoringText(document.getElementById('monitorTypeFilter')?.value);

    let visibleCount = 0;
    rows.forEach(row => {
        const rowTechnicians = row.dataset.technicians || row.dataset.technician;
        const rowClient = normalizeMonitoringText(row.dataset.client);
        const rowUnit = normalizeMonitoringText(row.dataset.unit);
        const rowModel = normalizeMonitoringText(row.dataset.model);
        const matchesTechnician = rowMatchesTechnicianFilter(rowTechnicians, technicianFilter);
        const matchesClient = !clientFilter || rowClient === clientFilter;
        const matchesUnit = !unitFilter || rowUnit === unitFilter;
        const matchesModel = !modelFilter || rowModel === modelFilter;
        const matchesType = rowMatchesTypeFilter(row, typeFilter);
        const visible = matchesTechnician && matchesClient && matchesUnit && matchesModel && matchesType;

        row.hidden = !visible;
        if (visible) {
            visibleCount += 1;
        }
    });

    updateMonitoringResultsCount(visibleCount, rows.length);
}

function sortMonitoringRows() {
    const tbody = document.getElementById('monitorActivityBody');
    const rows = getMonitoringRows();
    if (!tbody || !rows.length) {
        updateMonitoringResultsCount(0, 0);
        return;
    }

    const sortValue = document.getElementById('monitorSortFilter')?.value || 'date-desc';

    rows.sort((left, right) => {
        const leftDate = Number(left.dataset.dateSort || 0);
        const rightDate = Number(right.dataset.dateSort || 0);
        const leftTechnician = normalizeMonitoringText(left.dataset.technician);
        const rightTechnician = normalizeMonitoringText(right.dataset.technician);
        const leftClient = normalizeMonitoringText(left.dataset.client);
        const rightClient = normalizeMonitoringText(right.dataset.client);

        switch (sortValue) {
            case 'date-asc':
                return leftDate - rightDate || leftTechnician.localeCompare(rightTechnician) || leftClient.localeCompare(rightClient);
            case 'technician-asc':
                return leftTechnician.localeCompare(rightTechnician) || leftClient.localeCompare(rightClient) || leftDate - rightDate;
            case 'technician-desc':
                return rightTechnician.localeCompare(leftTechnician) || rightClient.localeCompare(leftClient) || rightDate - leftDate;
            case 'client-asc':
                return leftClient.localeCompare(rightClient) || leftTechnician.localeCompare(rightTechnician) || leftDate - rightDate;
            case 'client-desc':
                return rightClient.localeCompare(leftClient) || rightTechnician.localeCompare(leftTechnician) || rightDate - leftDate;
            case 'date-desc':
            default:
                return rightDate - leftDate || leftTechnician.localeCompare(rightTechnician) || leftClient.localeCompare(rightClient);
        }
    });

    rows.forEach(row => tbody.appendChild(row));
    applyMonitoringFilters();
}

function escapeCsvCell(value) {
    const text = String(value ?? '');
    if (/[",\n\r]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function syncMonitoringModelOptions() {
    const unitSelect = document.getElementById('monitorUnitFilter');
    const modelSelect = document.getElementById('monitorModelFilter');
    if (!unitSelect || !modelSelect) {
        return;
    }

    const unitValue = unitSelect.value || '';
    const currentModel = modelSelect.value || '';
    const modelOptions = unitValue
        ? (window.monitoringUnitModelOptions && window.monitoringUnitModelOptions[unitValue]) || []
        : (window.monitoringModelOptions || []);

    while (modelSelect.options.length > 1) {
        modelSelect.remove(1);
    }

    modelOptions.forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        modelSelect.appendChild(option);
    });

    if (currentModel && modelOptions.includes(currentModel)) {
        modelSelect.value = currentModel;
    } else {
        modelSelect.value = '';
    }
}

function getCellText(row, index) {
    const cell = row.cells[index];
    return cell ? cell.textContent.replace(/\s+/g, ' ').trim() : '';
}

function getRowDataText(row, key) {
    return String(row?.dataset?.[key] || '').trim();
}

function getMonitoringActivityDetail(row) {
    const activityType = normalizeMonitoringText(row?.dataset?.type || '');

    if (activityType === 'maintenance_parts') {
        const parts = getRowDataText(row, 'partsCsv') || getCellText(row, 6) || 'Parts changed';
        return `Maintenance + Parts (${parts})`;
    }

    if (activityType === 'maintenance') {
        return 'Maintenance';
    }

    if (activityType === 'parts') {
        return getRowDataText(row, 'partsCsv') || getCellText(row, 6) || 'Parts changed';
    }

    if (activityType === 'installed') {
        return 'Installation';
    }

    return getCellText(row, 7) || '';
}

function exportMonitoringCsv() {
    const rows = getMonitoringRows().filter(row => !row.hidden);
    if (!rows.length) {
        alert('No monitoring rows match the current filters.');
        return;
    }

    const header = [
        'Date',
        'Submitted By',
        'Technicians',
        'Client',
        'Unit',
        'Model',
        'Serial No',
        'Running Hours',
        'Status',
        'Activity',
        'Activity Details',
        'Description',
        'Problem / Root Cause',
        'Action Taken',
        'Recommendation'
    ];
    const csvRows = rows.map(row => [
        getCellText(row, 0),
        getRowDataText(row, 'submittedBy'),
        getRowDataText(row, 'techniciansText') || getRowDataText(row, 'technicians'),
        getRowDataText(row, 'client'),
        getRowDataText(row, 'unit'),
        getRowDataText(row, 'model'),
        getRowDataText(row, 'serialNo'),
        getRowDataText(row, 'runningHours'),
        normalizeMonitoringText(row.dataset.status || row.dataset.machineStatus || ''),
        getCellText(row, 5),
        getMonitoringActivityDetail(row),
        getRowDataText(row, 'description'),
        getRowDataText(row, 'problem'),
        getRowDataText(row, 'action'),
        getRowDataText(row, 'recommendation')
    ]);

    const csv = [header, ...csvRows]
        .map(row => row.map(escapeCsvCell).join(','))
        .join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `monitoring-results-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

/* ── TITLE-CASE: Edit Employee Full Name ── */
const editEmpFullName = document.getElementById('editEmpFullName');
if (editEmpFullName) {
    editEmpFullName.addEventListener('input', () => {
        const pos = editEmpFullName.selectionStart;
        editEmpFullName.value = editEmpFullName.value
            .toLowerCase()
            .replace(/\b\w/g, c => c.toUpperCase());
        editEmpFullName.setSelectionRange(pos, pos);
    });
}

/* ── UPPERCASE: Edit Employee Dept & Invite Dept ── */
['editEmpDept', 'inviteDeptInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => { el.value = el.value.toUpperCase(); });
});

/* ── FLASH AUTO-DISMISS ── */
const flashMsg = document.getElementById('flashMsg');
if (flashMsg) {
    setTimeout(() => {
        flashMsg.style.transition = 'opacity 0.5s';
        flashMsg.style.opacity    = '0';
        flashMsg.style.pointerEvents = 'none';
        setTimeout(() => { flashMsg.style.display = 'none'; }, 500);
    }, 4000);
}

/* ── CLOSE ALL MODALS ON LOAD (safety reset) ── */
document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('open'));

/* ── URL HASH: jump to clients tab ── */
(function () {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'clients' || hash === 'monitoring') {
        const btn = document.querySelector(`[data-section="${hash}"]`);
        if (btn) switchSection(hash, btn);
    }
})();

sortMonitoringRows();
syncMonitoringModelOptions();

/* ── TOP 3 TECHNICIAN LEADERBOARD ── */

/* ══════════════════════════════════════
   MONITORING INTERACTIVITY
   ══════════════════════════════════════ */

// Cache latest monitoring data (initialised from server-rendered JSON)
let monitoringData = window.monitoringInitData || {};

/* ── KPI DETAIL MODAL ── */
const KPI_META = {
    pendingUnits: {
        title: 'Pending Units',
        desc: 'Units that still have outstanding maintenance, parts, or status warnings.',
        color: 'amber'
    },
    pendingClients: {
        title: 'Clients Pending',
        desc: 'Clients that still need services — not all units are finished.',
        color: 'amber'
    },
    techReports: {
        title: 'Tech Reports Log',
        desc: 'All technician activity: maintenance, parts changes, installations, and service reports.',
        color: 'navy'
    },
    completionRate: {
        title: 'Completion Rate',
        desc: 'Percentage of tracked units that are warning-free.',
        color: 'green',
        isPercent: true
    }
};

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function openKpiDetail(kpiKey) {
    const meta = KPI_META[kpiKey];
    if (!meta) return;
    const d = monitoringData;

    document.getElementById('kpiDetailTitle').textContent = meta.title;
    const container = document.getElementById('kpiDetailContent');

    let html = '';

    // Contextual visualisation depending on KPI type
    if (kpiKey === 'pendingUnits') {
        const finished = d.completedUnits || 0;
        const pending = d.pendingUnits || 0;
        const total = finished + pending;
        const finPct = total > 0 ? Math.round((finished / total) * 100) : 0;
        const penPct = total > 0 ? Math.round((pending / total) * 100) : 0;

        // Donut chart like the reference image
        html += `<div class="kpi-donut-row">
            <div class="kpi-donut" style="background:conic-gradient(#0ea472 ${finPct}%, #d4910e ${finPct}% ${finPct + penPct}%, #e8eef7 ${finPct + penPct}%)">
                <div class="kpi-donut-inner">
                    <strong>${total}</strong>
                    <span>TOTAL</span>
                </div>
            </div>
            <div class="kpi-legend">
                <div class="kpi-legend-item">
                    <span class="kpi-legend-dot" style="background:#0ea472"></span>
                    Finished
                    <span class="kpi-legend-value">${finished} (${finPct}%)</span>
                </div>
                <div class="kpi-legend-item">
                    <span class="kpi-legend-dot" style="background:#d4910e"></span>
                    Pending
                    <span class="kpi-legend-value">${pending} (${penPct}%)</span>
                </div>
            </div>
        </div>`;

        // Only show clients that are NOT 100% — pending clients only
        if (d.clientHighlights && d.clientHighlights.length) {
            const pendingClients = d.clientHighlights.filter(c => {
                const pct = c.units > 0 ? Math.round((c.finishedUnits / c.units) * 100) : 0;
                return pct < 100;
            });
            if (pendingClients.length) {
                html += `<div class="kpi-bar-chart">`;
                pendingClients.forEach(c => {
                    const pct = c.units > 0 ? Math.round((c.finishedUnits / c.units) * 100) : 0;
                    html += `<div class="kpi-bar-row">
                        <div class="kpi-bar-head">
                            <strong>${c.clientName}</strong>
                            <span>${c.finishedUnits}/${c.units} units (${pct}%)</span>
                        </div>
                        <div class="kpi-bar-track">
                            <span class="kpi-bar-fill kpi-bar-fill-${pct > 50 ? 'blue' : 'amber'}" style="width:${pct}%"></span>
                        </div>
                    </div>`;
                });
                html += `</div>`;
            }
        }
    }
    else if (kpiKey === 'pendingClients') {
        const pendingList = d.pendingClientsList || [];
        const pendingCount = pendingList.length;

        if (pendingCount === 0) {
            html += `<p class="monitor-empty">All clients are fully serviced!</p>`;
        } else {
            html += `<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 10px;">`;
            pendingList.forEach(c => {
                html += `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
                    <strong style="margin-bottom: 4px; text-align: center; color: var(--navy); font-size: 13px;">${escapeHtml(c.clientName)}</strong>
                    <span style="font-size: 11px; color: var(--text-muted); font-weight: 600;">${c.pendingUnits} pending</span>
                </div>`;
            });
            html += `</div>`;
        }
    }
    else if (kpiKey === 'techReports') {
        const techList = d.techReports || [];
        const totalReports = (d.reportEvents || 0) + (d.updateEvents || 0);

        if (!techList.length) {
            html += `<p class="monitor-empty">No technician reports recorded yet.</p>`;
        } else {
            html += `<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 10px;">`;
            techList.forEach(t => {
                html += `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
                    <strong style="margin-bottom: 4px; text-align: center; color: var(--navy); font-size: 13px;">${escapeHtml(t.name)}</strong>
                    <span style="font-size: 11px; color: var(--text-muted); font-weight: 600;">${t.totalReports} reports</span>
                </div>`;
            });
            html += `</div>`;
        }
    }
    else if (kpiKey === 'completionRate') {
        const rate = d.completionRate || 0;
        const finished = d.completedUnits || 0;
        const pending = d.pendingUnits || 0;
        const total = finished + pending;
        const finPct = total > 0 ? Math.round((finished / total) * 100) : 0;
        const penPct = total > 0 ? Math.round((pending / total) * 100) : 0;

        // Donut visualisation only — matching the reference image
        html += `<div class="kpi-donut-row">
            <div class="kpi-donut" style="background:conic-gradient(#0ea472 ${finPct}%, #d4910e ${finPct}% ${finPct + penPct}%, #e8eef7 ${finPct + penPct}%)">
                <div class="kpi-donut-inner">
                    <strong>${total}</strong>
                    <span>TOTAL</span>
                </div>
            </div>
            <div class="kpi-legend">
                <div class="kpi-legend-item">
                    <span class="kpi-legend-dot" style="background:#0ea472"></span>
                    Finished
                    <span class="kpi-legend-value">${finished} (${finPct}%)</span>
                </div>
                <div class="kpi-legend-item">
                    <span class="kpi-legend-dot" style="background:#d4910e"></span>
                    Pending
                    <span class="kpi-legend-value">${pending} (${penPct}%)</span>
                </div>
            </div>
        </div>`;

    }

    container.innerHTML = html;
    openModal('modal-kpi-detail');
}

/* ── CLIENT DETAIL MODAL ── */
function openClientDetail(name, units, finished, reports, updates, rate, isActive) {
    document.getElementById('clientDetailTitle').textContent = name;
    const container = document.getElementById('clientDetailContent');
    const pending = units - finished;

    let html = `<div class="kpi-detail-summary">
        <div class="kpi-detail-big">${rate}%</div>
        <div class="kpi-detail-desc">
            <strong>${name}</strong>
            ${isActive ? 'Active client' : 'Inactive client'} • ${units} tracked unit${units !== 1 ? 's' : ''}
        </div>
    </div>`;

    // Stat grid
    html += `<div class="client-detail-grid">
        <div class="client-detail-stat">
            <span class="stat-num">${finished}</span>
            <span class="stat-label">Units Finished</span>
        </div>
        <div class="client-detail-stat">
            <span class="stat-num">${pending}</span>
            <span class="stat-label">Pending Units</span>
        </div>
        <div class="client-detail-stat">
            <span class="stat-num">${reports}</span>
            <span class="stat-label">Reports</span>
        </div>
        <div class="client-detail-stat">
            <span class="stat-num">${updates}</span>
            <span class="stat-label">Updates</span>
        </div>
    </div>`;

    // Progress bar
    const pct = units > 0 ? Math.round((finished / units) * 100) : 0;
    html += `<div class="kpi-bar-chart">
        <div class="kpi-bar-row">
            <div class="kpi-bar-head">
                <strong>Completion Progress</strong>
                <span>${finished}/${units} (${pct}%)</span>
            </div>
            <div class="kpi-bar-track" style="height:14px">
                <span class="kpi-bar-fill kpi-bar-fill-${pct >= 100 ? 'green' : pct > 50 ? 'blue' : 'amber'}" style="width:${pct}%"></span>
            </div>
        </div>
    </div>`;

    // Donut
    html += `<div class="kpi-donut-row">
        <div class="kpi-donut" style="background:conic-gradient(#0ea472 ${pct}%, #d4910e ${pct}% ${pct + (100 - pct)}%, #e8eef7 100%)">
            <div class="kpi-donut-inner">
                <strong>${pct}%</strong>
                <span>done</span>
            </div>
        </div>
        <div class="kpi-legend">
            <div class="kpi-legend-item">
                <span class="kpi-legend-dot" style="background:#0ea472"></span>
                Finished
                <span class="kpi-legend-value">${finished}</span>
            </div>
            <div class="kpi-legend-item">
                <span class="kpi-legend-dot" style="background:#d4910e"></span>
                Pending
                <span class="kpi-legend-value">${pending}</span>
            </div>
            <div class="kpi-legend-item">
                <span class="kpi-legend-dot" style="background:var(--navy-mid)"></span>
                Reports
                <span class="kpi-legend-value">${reports}</span>
            </div>
            <div class="kpi-legend-item">
                <span class="kpi-legend-dot" style="background:#3b82f6"></span>
                Updates
                <span class="kpi-legend-value">${updates}</span>
            </div>
        </div>
    </div>`;

    container.innerHTML = html;
    openModal('modal-client-detail');
}

/* ── DATE RANGE FILTER ── */
let monitorRangeAbort = null;

function onMonitorRangeChange(range) {
    if (monitorRangeAbort) monitorRangeAbort.abort();
    monitorRangeAbort = new AbortController();

    const kpiRow = document.getElementById('monitorKpiRow');
    if (kpiRow) kpiRow.classList.add('monitor-kpis-loading');

    fetch(`/admin_account/monitoring-data?range=${encodeURIComponent(range)}`, {
        signal: monitorRangeAbort.signal
    })
    .then(res => res.json())
    .then(data => {
        if (!data.ok) throw new Error(data.error || 'Failed');
        const m = data.monitoring;

        // Update local cache
        monitoringData = {
            completedUnits: m.completedUnits,
            pendingUnits: m.pendingUnits,
            completedClients: m.completedClients,
            pendingClientsList: m.pendingClientsList || [],
            reportEvents: m.reportEvents,
            updateEvents: m.updateEvents,
            completionRate: m.completionRate,
            totalUnits: m.totalUnits,
            statusShare: m.statusShare,
            clientHighlights: m.clientHighlights,
            techReports: m.techReports || []
        };

        // Update KPI numbers
        updateKpiNum('kpi-pendingUnits', m.pendingUnits);
        updateKpiNum('kpi-pendingClients', (m.pendingClientsList || []).length);
        updateKpiNum('kpi-techReports', (m.reportEvents || 0) + (m.updateEvents || 0));
        updateKpiNum('kpi-completionRate', m.completionRate + '%');

        // Update status distribution card
        updateStatusDistribution(m);

        // Update client highlights
        updateClientHighlights(m.clientHighlights || []);

        if (kpiRow) kpiRow.classList.remove('monitor-kpis-loading');
    })
    .catch(err => {
        if (err.name === 'AbortError') return;
        console.error('[monitoring range]', err);
        if (kpiRow) kpiRow.classList.remove('monitor-kpis-loading');
    });
}

function updateKpiNum(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function updateStatusDistribution(m) {
    // Update donut ring
    const ring = document.querySelector('.status-ring');
    if (ring) ring.style.setProperty('--pct', m.completionRate);

    const ringLabel = document.querySelector('.status-ring-inner strong');
    if (ringLabel) ringLabel.textContent = m.completionRate + '%';

    // Update tracked units count
    const trackedLabel = document.querySelector('.monitor-card-emphasis .monitor-card-head small');
    if (trackedLabel) trackedLabel.textContent = (m.totalUnits || 0) + ' tracked units';

    // Update status bars
    const barsContainer = document.querySelector('.status-bars');
    if (barsContainer && m.statusShare) {
        let html = '';
        if (!m.statusShare.length) {
            html = '<p class="monitor-empty">No status data yet.</p>';
        } else {
            const statusColors = { Active: 'green', Maintenance: 'amber', Faulty: 'red', Inactive: 'navy', Unspecified: 'blue' };
            m.statusShare.forEach(row => {
                html += `<div class="status-row">
                    <div class="status-row-head">
                        <span>${row.label}</span>
                        <small>${row.count} (${row.percentage}%)</small>
                    </div>
                    <div class="status-track">
                        <span class="status-fill status-fill-${statusColors[row.label] || 'navy'}" style="width:${row.percentage}%"></span>
                    </div>
                </div>`;
            });
        }
        barsContainer.innerHTML = html;
    }
}

function updateClientHighlights(highlights) {
    const container = document.getElementById('clientHighlightList');
    if (!container) return;

    if (!highlights.length) {
        container.innerHTML = '<p class="monitor-empty">No client progress available yet.</p>';
        return;
    }

    let html = '';
    highlights.forEach(c => {
        html += `<div class="client-highlight-row client-highlight-clickable"
                     onclick="openClientDetail('${c.clientName.replace(/'/g, "\\'")}', ${c.units}, ${c.finishedUnits}, ${c.reports}, ${c.updates || 0}, ${c.completionRate}, ${c.isActive})"
                     title="Click to view client details">
            <div>
                <strong>${c.clientName}</strong>
                <small>${c.isActive ? 'Active client' : 'Inactive client'}</small>
            </div>
            <div class="client-highlight-meta">
                <span>${c.finishedUnits}/${c.units} units</span>
                <span>${c.reports} reports</span>
                <span class="score-pill">${c.completionRate}%</span>
            </div>
        </div>`;
    });
    container.innerHTML = html;
}