// Format for date display
function formatDateDisplay(dateStr) {
    if (!dateStr) return '\u2014';
    const rawDate = String(dateStr).trim();
    const monthNames = [
        'January','February','March','April','May','June',
        'July','August','September','October','November','December'
    ];
    const ymdMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymdMatch) {
        const year = parseInt(ymdMatch[1], 10);
        const month = parseInt(ymdMatch[2], 10);
        const day = parseInt(ymdMatch[3], 10);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            return `${monthNames[month - 1]} ${day}, ${year}`;
        }
    }
    const dmyMatch = rawDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmyMatch) {
        const day = parseInt(dmyMatch[1], 10);
        const month = parseInt(dmyMatch[2], 10);
        const year = parseInt(dmyMatch[3], 10);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            return `${monthNames[month - 1]} ${day}, ${year}`;
        }
    }
    const date = new Date(rawDate);
    if (!Number.isNaN(date.getTime())) {
        return `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    }
    return rawDate;
}

function parseRunningHoursToSeconds(value) {
    if (value == null || value === '') return 0;
    let text = String(value).trim();
    const colonParts = text.split(':').map(part => part.trim());
    if (colonParts.length >= 2 && colonParts.every(part => /^\d+$/.test(part))) {
        let seconds = 0;
        if (colonParts.length === 3) {
            seconds = Number(colonParts[0]) * 3600 + Number(colonParts[1]) * 60 + Number(colonParts[2]);
        } else if (colonParts.length === 2) {
            seconds = Number(colonParts[0]) * 60 + Number(colonParts[1]);
        }
        return seconds;
    }
    if (!Number.isNaN(Number(text))) {
        return Math.round(Number(text) * 3600);
    }
    return 0;
}

function formatRunningHoursOnly(seconds) {
    const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const hrs = Math.floor(totalSeconds / 3600);
    return String(hrs);
}

// Helper: parse a date string (dd/mm/yyyy or yyyy-mm-dd) into a Date object
function parseDateStr(dateStr) {
    if (!dateStr) return null;
    const rawDate = String(dateStr).trim();
    const dmyMatch = rawDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmyMatch) {
        const d = new Date(parseInt(dmyMatch[3], 10), parseInt(dmyMatch[2], 10) - 1, parseInt(dmyMatch[1], 10));
        return isNaN(d.getTime()) ? null : d;
    }
    const ymdMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymdMatch) {
        const d = new Date(parseInt(ymdMatch[1], 10), parseInt(ymdMatch[2], 10) - 1, parseInt(ymdMatch[3], 10));
        return isNaN(d.getTime()) ? null : d;
    }
    return null;
}

function getTodayDateString() {
    const today = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${pad(today.getDate())}/${pad(today.getMonth() + 1)}/${today.getFullYear()}`;
}

// Helper function to prevent XSS
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    }).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, function(c) {
        return c;
    });
}

function clonePartMap(map) {
    if (!map || typeof map !== 'object') return {};
    return { ...map };
}

function cloneReportEntry(report) {
    if (!report || typeof report !== 'object') return null;
    return {
        ...report,
        technicians: Array.isArray(report.technicians) ? report.technicians.map(name => String(name || '')) : []
    };
}

function cloneUpdateEntry(update) {
    if (!update || typeof update !== 'object') return {};
    return {
        ...update,
        partsUpdated: Array.isArray(update.partsUpdated) ? update.partsUpdated.map(name => String(name || '')) : [],
        partServiceDates: clonePartMap(update.partServiceDates),
        partServiceHours: clonePartMap(update.partServiceHours),
        report: cloneReportEntry(update.report)
    };
}

function normalizeTechnicianName(name) {
    return String(name || '').trim().replace(/\s+/g, ' ');
}

function splitTechnicianNames(value) {
    return String(value || '')
        .split(',')
        .map(normalizeTechnicianName)
        .filter(Boolean);
}

function abbreviateTechnicianName(name) {
    const normalized = normalizeTechnicianName(name);
    if (!normalized) return '';

    const parts = normalized.split(' ').filter(Boolean);
    if (parts.length < 2) {
        return normalized;
    }

    const firstInitial = parts[0].charAt(0).toUpperCase();
    const lastName = parts[parts.length - 1];
    return `${firstInitial}. ${lastName}`;
}

function formatTechnicianInline(techValue) {
    const names = String(techValue || '')
        .split(',')
        .map(normalizeTechnicianName)
        .filter(Boolean);

    if (!names.length) {
        return String(techValue || 'Unknown User');
    }

    if (names.length === 1) {
        return names[0];
    }

    return names.map(abbreviateTechnicianName).join(' ');
}

function formatTechnicianLines(techValue) {
    const names = String(techValue || '')
        .split(',')
        .map(normalizeTechnicianName)
        .filter(Boolean);

    if (!names.length) {
        return escapeHtml(String(techValue || 'Unknown User'));
    }

    if (names.length === 1) {
        return escapeHtml(names[0]);
    }

    return escapeHtml(names.map(abbreviateTechnicianName).join(' '));
}

function toDateKey(dateStr) {
    const raw = String(dateStr || '').trim();
    if (!raw) return '';

    const dmyMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmyMatch) {
        const day = String(parseInt(dmyMatch[1], 10)).padStart(2, '0');
        const month = String(parseInt(dmyMatch[2], 10)).padStart(2, '0');
        return `${dmyMatch[3]}-${month}-${day}`;
    }

    const ymdMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymdMatch) {
        return `${ymdMatch[1]}-${ymdMatch[2]}-${ymdMatch[3]}`;
    }

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
        const yyyy = parsed.getFullYear();
        const mm = String(parsed.getMonth() + 1).padStart(2, '0');
        const dd = String(parsed.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    return raw;
}

function getChangedPartNames(beforeDates, afterDates) {
    const before = beforeDates && typeof beforeDates === 'object' ? beforeDates : {};
    const after = afterDates && typeof afterDates === 'object' ? afterDates : {};

    return Object.keys(after).filter(name => String(after[name] || '') !== String(before[name] || ''));
}
