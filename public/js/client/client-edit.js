//  Edit / Update modal ΓöÇ

const editPopup = document.getElementById('editPopup');
const closeEditPopup = document.getElementById('closeEditPopup');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const editForm = document.getElementById('editForm');
const confirmOverlay = document.getElementById('confirmOverlay');
const confirmTitle = document.getElementById('confirmTitle');
const confirmMessage = document.getElementById('confirmMessage');
const confirmOkBtn = document.getElementById('confirmOkBtn');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');
let editDraft = null;
let activeConfirmResolver = null;

function showConfirmDialog(options = {}) {
    const {
        title = 'Please Confirm',
        message = 'Are you sure?',
        confirmText = 'Confirm',
        cancelText = 'Cancel',
        tone = 'default'
    } = options;

    if (!confirmOverlay || !confirmTitle || !confirmMessage || !confirmOkBtn || !confirmCancelBtn) {
        return Promise.resolve(window.confirm(message));
    }

    if (activeConfirmResolver) {
        activeConfirmResolver(false);
        activeConfirmResolver = null;
    }

    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmOkBtn.textContent = confirmText;
    confirmCancelBtn.textContent = cancelText;

    confirmOkBtn.classList.remove('is-warning', 'is-danger');
    if (tone === 'warning') confirmOkBtn.classList.add('is-warning');
    if (tone === 'danger') confirmOkBtn.classList.add('is-danger');

    confirmOverlay.style.display = 'grid';
    requestAnimationFrame(() => confirmOkBtn.focus());

    return new Promise((resolve) => {
        activeConfirmResolver = resolve;
    });
}

function resolveConfirmDialog(result) {
    if (!activeConfirmResolver) return;
    const resolver = activeConfirmResolver;
    activeConfirmResolver = null;
    confirmOverlay.style.display = 'none';
    resolver(result);
}

function buildEditDraft(record, index) {
    return {
        index,
        runningHours: formatRunningHoursOnly(record._runningSeconds),
        status: record.status || '',
        description: record.description || '',
        maintenanceServiceDate: record.maintenanceServiceDate || '',
        partServiceDates: clonePartMap(record.partServiceDates),
        partServiceHours: clonePartMap(record.partServiceHours)
    };
}

function clearEditDraft() {
    editDraft = null;
}

function syncEditDraftFromInputs() {
    if (!editDraft) return;
    editDraft.runningHours = document.getElementById('edit-runningHours').value || '0';
    editDraft.status = document.getElementById('edit-status').value || '';
    editDraft.description = document.getElementById('edit-description').value || '';
}

async function closeEditModal(discardChanges = false) {
    if (!discardChanges && hasEditDraftChanges()) {
        const shouldDiscard = await showConfirmDialog({
            title: 'Discard Changes?',
            message: 'You have unsaved updates in this form. Discard them?',
            confirmText: 'Discard',
            cancelText: 'Keep Editing',
            tone: 'warning'
        });
        if (!shouldDiscard) return;
    }

    editPopup.style.display = 'none';
    clearEditDraft();
}

function hasEditDraftChanges() {
    if (!editDraft) return false;
    const index = editDraft.index;
    const record = allMachines[index];
    if (!record) return false;

    const liveHours = formatRunningHoursOnly(record._runningSeconds);
    const draftHours = String(editDraft.runningHours || '0');
    const liveStatus = record.status || '';
    const liveDescription = record.description || '';
    const liveMaintenanceServiceDate = record.maintenanceServiceDate || '';

    const liveDates = JSON.stringify(clonePartMap(record.partServiceDates));
    const draftDates = JSON.stringify(clonePartMap(editDraft.partServiceDates));
    const livePartHours = JSON.stringify(clonePartMap(record.partServiceHours));
    const draftPartHours = JSON.stringify(clonePartMap(editDraft.partServiceHours));

    return (
        draftHours !== liveHours ||
        (editDraft.status || '') !== liveStatus ||
        (editDraft.description || '') !== liveDescription ||
        (editDraft.maintenanceServiceDate || '') !== liveMaintenanceServiceDate ||
        draftDates !== liveDates ||
        draftPartHours !== livePartHours
    );
}

function validateEditFormInputs() {
    const runningInput = document.getElementById('edit-runningHours');
    const statusInput = document.getElementById('edit-status');

    const runningRaw = String(runningInput.value || '').trim();
    const runningNum = Number(runningRaw);

    if (runningRaw === '') {
        return { valid: false, message: 'Running Hours is required.' };
    }
    if (!Number.isFinite(runningNum) || Number.isNaN(runningNum)) {
        return { valid: false, message: 'Running Hours must be a valid number.' };
    }
    if (runningNum < 0) {
        return { valid: false, message: 'Running Hours cannot be negative.' };
    }
    if (!Number.isInteger(runningNum)) {
        return { valid: false, message: 'Running Hours must be a whole number.' };
    }
    if (!statusInput.value) {
        return { valid: false, message: 'Status is required.' };
    }

    return { valid: true };
}

window.openEditModal = function(index) {
    const record = allMachines[index];
    if (!record) return;

    if (typeof record._runningSeconds === 'undefined') {
        record._runningSeconds = parseRunningHoursToSeconds(record.runningHours);
    }

    // Display only (not editable)
    document.getElementById('edit-unit-display').textContent = record.unit || '\u2014';
    document.getElementById('edit-model-display').textContent = record.model || '\u2014';
    document.getElementById('edit-serial-display').textContent = record.serialNo || '\u2014';

    editDraft = buildEditDraft(record, index);

    // Pre-fill editable fields
    document.getElementById('edit-runningHours').value = editDraft.runningHours;

    const statusSel = document.getElementById('edit-status');
    statusSel.value = editDraft.status;

    document.getElementById('edit-description').value = editDraft.description;

    syncEditDraftFromInputs();

    // Parts checker is fixed to this machine's existing unit/model.
    const { unitKey, modelKey } = getPartsCatalogLocation(record);

    renderPartsList(unitKey, modelKey, record._runningSeconds, record, editDraft);

    // Store which record we're editing
    editForm.dataset.index = index;

    editPopup.style.display = 'grid';
};
function renderPartsList(unitKey, modelKey, runningSeconds, record, draftState = null) {
    const partsBody = document.getElementById('parts-tbody');
    if (!unitKey || !modelKey) {
        partsBody.innerHTML = `<tr><td colspan="2" style="text-align:center;color:var(--muted);padding:12px;">No parts data for this machine.</td></tr>`;
        return;
    }
    const parts = (PARTS_CATALOG[unitKey] || {})[modelKey] || [];
    if (!parts.length) {
        partsBody.innerHTML = `<tr><td colspan="2" style="text-align:center;color:var(--muted);padding:12px;">No parts listed for this model.</td></tr>`;
        return;
    }
    const currentHours = (runningSeconds || 0) / 3600;
    const recordIndex = findMachineIndexByRecord(record);
    const statusRecord = draftState
        ? {
            ...record,
            maintenanceServiceDate: draftState.maintenanceServiceDate || '',
            partServiceDates: clonePartMap(draftState.partServiceDates),
            partServiceHours: clonePartMap(draftState.partServiceHours)
        }
        : record;

    const maintenanceStatus = getMaintenanceStatus(record.dateInstalled, runningSeconds, statusRecord, 30);
    let maintenanceRow = '';

    if (maintenanceStatus.isOverdue || maintenanceStatus.isDueSoon) {
        const maintenanceBadge = maintenanceStatus.isOverdue
            ? `<button type="button" class="parts-badge parts-badge-overdue parts-badge-action" title="Mark maintenance as completed today" onclick="markMaintenanceAsServiced(${recordIndex})">OVERDUE</button>`
            : `<button type="button" class="parts-badge parts-badge-soon parts-badge-action" title="Mark maintenance as completed today" onclick="markMaintenanceAsServiced(${recordIndex})">\u26A0 DUE SOON</button>`;
        const maintenanceRowClass = maintenanceStatus.isOverdue ? 'parts-row-overdue' : 'parts-row-soon';
        maintenanceRow = `<tr class="${maintenanceRowClass}">
            <td class="parts-cell-part">MAINTENANCE</td>
            <td class="parts-cell-status">
                <div class="parts-status-wrapper">
                    ${maintenanceBadge}
                    <span class="parts-expiry-label">${escapeHtml(maintenanceStatus.label)}</span>
                </div>
            </td>
        </tr>`;
    }

    const partRows = parts.map(p => {
        const s = getPartStatus(currentHours, p, statusRecord);
        if (!s.isOverdue && !s.isDueSoon) {
            return '';
        }

        let statusBadge, rowClass = '';
        let displayLabel = s.label;

        if (s.isOverdue) {
            statusBadge = `<button type="button" class="parts-badge parts-badge-overdue parts-badge-action" title="Mark this part as replaced today" onclick="markPartAsServiced(${recordIndex}, '${encodeURIComponent(p.name)}')">OVERDUE</button>`;
            rowClass = 'parts-row-overdue';
            // Remove "OVERDUE - " prefix from the label since badge already shows it
            displayLabel = s.label.replace(/^OVERDUE \u2014\s*/, '');
        } else if (s.isDueSoon) {
            statusBadge = `<button type="button" class="parts-badge parts-badge-soon parts-badge-action" title="Mark this part as replaced today" onclick="markPartAsServiced(${recordIndex}, '${encodeURIComponent(p.name)}')">\u26A0 DUE SOON</button>`;
            rowClass = 'parts-row-soon';
            // Remove "DUE SOON - " prefix if it exists
            displayLabel = s.label.replace(/^DUE SOON \u2014\s*/, '');
        }

        return `<tr class="${rowClass}">
            <td class="parts-cell-part">${escapeHtml(p.name)}</td>
            <td class="parts-cell-status">
                <div class="parts-status-wrapper">
                    ${statusBadge}
                    <span class="parts-expiry-label">${escapeHtml(displayLabel)}</span>
                </div>
            </td>
         </tr>`;
    }).join('');

    const alertRows = `${maintenanceRow}${partRows}`;
    partsBody.innerHTML = alertRows || `<tr><td colspan="2" style="text-align:center;color:var(--muted);padding:14px;font-size:13px;">No due soon or overdue items.</td></tr>`;
}

window.markMaintenanceAsServiced = async function(index) {
    const record = allMachines[index];
    if (!record || !editDraft || editDraft.index !== index) return;

    const shouldApply = await showConfirmDialog({
        title: 'Confirm Maintenance Completion',
        message: 'Mark preventive maintenance as completed today?',
        confirmText: 'Apply Update',
        cancelText: 'Cancel',
        tone: 'warning'
    });
    if (!shouldApply) return;

    const todayStr = getTodayDateString();
    editDraft.maintenanceServiceDate = todayStr;

    const { unitKey, modelKey } = getPartsCatalogLocation(record);

    renderPartsList(unitKey, modelKey, record._runningSeconds || 0, record, editDraft);
};

window.markPartAsServiced = async function(index, encodedPartName) {
    const record = allMachines[index];
    if (!record || !editDraft || editDraft.index !== index) return;

    const partName = decodeURIComponent(encodedPartName || '');
    if (!partName) return;

    const shouldApply = await showConfirmDialog({
        title: 'Confirm Part Replacement',
        message: `Mark "${partName}" as replaced today?`,
        confirmText: 'Apply Update',
        cancelText: 'Cancel',
        tone: 'warning'
    });
    if (!shouldApply) return;

    if (!editDraft.partServiceDates || typeof editDraft.partServiceDates !== 'object') {
        editDraft.partServiceDates = {};
    }
    if (!editDraft.partServiceHours || typeof editDraft.partServiceHours !== 'object') {
        editDraft.partServiceHours = {};
    }

    // Use current date as the new anchor date for this part.
    const todayStr = getTodayDateString();
    syncEditDraftFromInputs();

    editDraft.partServiceDates[partName] = todayStr;
    editDraft.partServiceHours[partName] = Number(editDraft.runningHours) || ((record._runningSeconds || 0) / 3600);

    const { unitKey, modelKey } = getPartsCatalogLocation(record);

    renderPartsList(unitKey, modelKey, record._runningSeconds || 0, record, editDraft);
};

closeEditPopup.addEventListener('click', async () => {
    await closeEditModal();
});

if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', async () => {
        await closeEditModal();
    });
}

if (confirmOkBtn) {
    confirmOkBtn.addEventListener('click', () => {
        resolveConfirmDialog(true);
    });
}

if (confirmCancelBtn) {
    confirmCancelBtn.addEventListener('click', () => {
        resolveConfirmDialog(false);
    });
}

if (confirmOverlay) {
    confirmOverlay.addEventListener('click', (e) => {
        if (e.target === confirmOverlay) {
            resolveConfirmDialog(false);
        }
    });
}

document.addEventListener('keydown', (e) => {
    if (!confirmOverlay || confirmOverlay.style.display === 'none' || !activeConfirmResolver) return;
    if (e.key === 'Escape') {
        e.preventDefault();
        resolveConfirmDialog(false);
    }
    if (e.key === 'Enter') {
        e.preventDefault();
        resolveConfirmDialog(true);
    }
});

document.getElementById('edit-runningHours').addEventListener('input', syncEditDraftFromInputs);
document.getElementById('edit-status').addEventListener('change', syncEditDraftFromInputs);
document.getElementById('edit-description').addEventListener('input', syncEditDraftFromInputs);

editPopup.addEventListener('click', (e) => {
    if (e.target === editPopup) {
        closeEditModal();
    }
});

editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    syncEditDraftFromInputs();

    const index = parseInt(editForm.dataset.index, 10);
    const record = allMachines[index];
    if (!record) return;

    const validation = validateEditFormInputs();
    if (!validation.valid) {
        showToast(validation.message, 'warning');
        return;
    }

    if (!hasEditDraftChanges()) {
        showToast('No changes to save.', 'info');
        return;
    }

    const confirmSave = await showConfirmDialog({
        title: 'Save Update?',
        message: 'Apply these machine updates now?',
        confirmText: 'Save Update',
        cancelText: 'Review Again',
        tone: 'default'
    });
    if (!confirmSave) return;

    const newRunningHours = parseInt(document.getElementById('edit-runningHours').value, 10) || 0;
    const newStatus = document.getElementById('edit-status').value;
    const newDescription = document.getElementById('edit-description').value;
    const previousMaintenanceServiceDate = String(record.maintenanceServiceDate || '');
    const previousPartServiceDates = clonePartMap(record.partServiceDates);

    if (!Array.isArray(record.updates)) record.updates = [];

    const todayStr = getTodayDateString();
    const nextMaintenanceServiceDate = editDraft ? String(editDraft.maintenanceServiceDate || '') : '';
    const nextPartServiceDates = editDraft ? clonePartMap(editDraft.partServiceDates) : {};
    const changedParts = getChangedPartNames(previousPartServiceDates, nextPartServiceDates);
    const maintenanceUpdated = previousMaintenanceServiceDate !== nextMaintenanceServiceDate;

    const updateEntry = {
        date: todayStr,
        submittedBy: typeof CURRENT_USER_FULLNAME !== 'undefined' ? CURRENT_USER_FULLNAME : 'Unknown User',
        status: newStatus,
        runningHours: newRunningHours,
        description: newDescription,
        maintenanceUpdated,
        maintenanceServiceDate: nextMaintenanceServiceDate,
        partsUpdated: changedParts,
        partServiceDates: nextPartServiceDates,
        partServiceHours: editDraft ? clonePartMap(editDraft.partServiceHours) : {}
    };

    record.updates.push(updateEntry);

    // Apply updated values to the record
    record.runningHours = newRunningHours;
    record._runningSeconds = newRunningHours * 3600;
    record.status = newStatus;
    record.description = newDescription;

    if (editDraft) {
        record.maintenanceServiceDate = editDraft.maintenanceServiceDate || '';
        record.partServiceDates = clonePartMap(editDraft.partServiceDates);
        record.partServiceHours = clonePartMap(editDraft.partServiceHours);
    }

    try {
        const response = await fetch(`/client/${encodeURIComponent(CLIENT_ID)}/machines/update`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                serialNo: record.serialNo,
                model: record.model,
                dateInstalled: record.dateInstalled,
                runningHours: newRunningHours,
                status: newStatus,
                description: newDescription,
                maintenanceServiceDate: editDraft ? editDraft.maintenanceServiceDate || '' : '',
                partServiceDates: editDraft ? clonePartMap(editDraft.partServiceDates) : {},
                partServiceHours: editDraft ? clonePartMap(editDraft.partServiceHours) : {},
                updates: record.updates
            })
        });

        const payload = await response.json();
        if (!response.ok || !payload.ok) {
            throw new Error(payload.error || 'Failed to save updates.');
        }

        Object.assign(record, payload.machine);
        record._runningSeconds = (Number(payload.machine.runningHours) || 0) * 3600;

        allMachines = orderMachinesNewestFirst(allMachines);
        filteredMachines = orderMachinesNewestFirst(filteredMachines);
        currentPage = 1;

        // Keep the modal open after saving so user can continue updating parts.
        // Modal will close only when the user explicitly closes it.
        editDraft = buildEditDraft(record, index);

        const { unitKey, modelKey } = getPartsCatalogLocation(record);

        renderPartsList(unitKey, modelKey, record._runningSeconds, record, editDraft);

        // Re-render - warning icon will disappear automatically if the new
        // maintenance date is now more than 30 days away
        renderTable(filteredMachines);

        // Refresh detail popup if it is still open for this record
        if (detailPopup.style.display !== 'none' && currentDetailIndex === index) {
            showDetails(index);
        }

        showToast('Record updated successfully.', 'success');

        // Open the Add Report popup
        openReportPopup(record, index, record.updates.length - 1);
    } catch (error) {
        showToast(error.message || 'Failed to save updates.', 'warning');
    }
});

function showToast(message, type = 'success') {
    let toast = document.getElementById('update-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'update-toast';
        toast.style.cssText = `
            position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
            background: #1e7c3a; color: #fff; padding: 12px 24px;
            border-radius: 8px; font-size: 14px; font-weight: 600;
            box-shadow: 0 4px 16px rgba(0,0,0,0.18); z-index: 9999;
            transition: opacity 0.4s;
        `;
        document.body.appendChild(toast);
    }

    if (type === 'warning') {
        toast.style.background = '#b45309';
    } else if (type === 'info') {
        toast.style.background = '#2a6499';
    } else {
        toast.style.background = '#1e7c3a';
    }

    toast.textContent = message;
    toast.style.opacity = '1';
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => { toast.style.opacity = '0'; }, 2800);
}
