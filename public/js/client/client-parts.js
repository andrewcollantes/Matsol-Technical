function getPartsCatalogLocation(record) {
    const unitKey = Object.keys(PARTS_CATALOG).find(
        key => key.toUpperCase() === (record?.unit || '').toUpperCase().trim()
    ) || '';
    const modelMap = unitKey ? (PARTS_CATALOG[unitKey] || {}) : {};
    const modelKey = Object.keys(modelMap).find(
        key => key.toUpperCase() === (record?.model || '').toUpperCase().trim()
    ) || '';

    return { unitKey, modelKey, modelMap };
}

function getMaintenanceAnchorDate(dateInstalled, record) {
    let anchorDate = null;

    if (record?.maintenanceServiceDate) {
        anchorDate = parseDateStr(record.maintenanceServiceDate);
    }

    if (!anchorDate) {
        anchorDate = parseDateStr(dateInstalled);
    }

    return anchorDate;
}

function calculateNextMaintenanceResult(dateInstalled, runningHoursSeconds, record, maintenanceIntervalDays = 750) {
    const anchorDate = getMaintenanceAnchorDate(dateInstalled, record);

    if (!anchorDate) {
        return { label: '\u2014', date: null };
    }

    // Calculate maintenance date from the most recent maintenance anchor.
    const maintenanceDate = new Date(anchorDate);
    maintenanceDate.setDate(anchorDate.getDate() + maintenanceIntervalDays);

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const label = `${monthNames[maintenanceDate.getMonth()]} ${maintenanceDate.getDate()}, ${maintenanceDate.getFullYear()}`;

    return { label, date: maintenanceDate };
}

function getMaintenanceStatus(dateInstalled, runningHoursSeconds, record, warningDays = 30) {
    const result = calculateNextMaintenanceResult(dateInstalled, runningHoursSeconds, record);
    if (!result.date) {
        return {
            date: null,
            isOverdue: false,
            isDueSoon: false,
            label: '\u2014'
        };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((result.date - today) / (1000 * 60 * 60 * 24));

    return {
        date: result.date,
        isOverdue: diffDays < 0,
        isDueSoon: diffDays >= 0 && diffDays <= warningDays,
        label: result.label
    };
}

function calculateNextMaintenance(dateInstalled, runningHoursSeconds, record) {
    return calculateNextMaintenanceResult(dateInstalled, runningHoursSeconds, record).label;
}

// Returns true if maintenance is overdue or within the next 30 calendar days
// Fix: Use Math.floor instead of Math.ceil for more accurate "within 30 days" calculation
function isWithin30Days(dateInstalled, runningHoursSeconds, record) {
    const s = getMaintenanceStatus(dateInstalled, runningHoursSeconds, record, 30);
    return s.isOverdue || s.isDueSoon;
}

// Parts warning logic: warn 7 days before expiry; each part keeps its own anchor date.
function getPartStatus(currentHours, part, record) {
    let anchorDate = null;
    let serviceHoursBase = null;

    // Per-part override: if this part was manually marked as serviced, use that date first.
    if (record?.partServiceDates && part?.name) {
        const servicedDate = record.partServiceDates[part.name];
        if (servicedDate) {
            anchorDate = parseDateStr(servicedDate);
        }
    }

    if (record?.partServiceHours && part?.name) {
        const baseHours = Number(record.partServiceHours[part.name]);
        if (Number.isFinite(baseHours)) {
            serviceHoursBase = baseHours;
        }
    }

    // Fallback to machine install date.
    // Important: a normal machine record update must NOT reset all parts.
    if (!anchorDate) {
        anchorDate = parseDateStr(record.dateInstalled);
    }

    // Final fallback
    if (!anchorDate) {
        anchorDate = new Date();
    }

    let expiryDate = null;
    let isOverdue = false;
    let isDueSoon = false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // =========================
    // Γ£à MONTH-BASED
    // =========================
    if (part.expiryMonths) {
        expiryDate = addMonths(anchorDate, part.expiryMonths);
    }

    // =========================
    // Γ£à HOURS-BASED
    // =========================
    else if (part.expiryHours) {
        const usedHours = serviceHoursBase == null
            ? currentHours
            : Math.max(0, currentHours - serviceHoursBase);
        const hoursLeft = part.expiryHours - usedHours;

        expiryDate = new Date(anchorDate);

        if (!isNaN(hoursLeft)) {
            const daysRemaining = Math.round(hoursLeft / 24);
            expiryDate.setDate(expiryDate.getDate() + daysRemaining);
        }
    }

    // =========================
    // Γ¥ù SAFETY CHECK
    // =========================
    if (!expiryDate || isNaN(expiryDate.getTime())) {
        return {
            expiryDate: null,
            isOverdue: false,
            isDueSoon: false,
            label: 'No expiry set'
        };
    }

    // =========================
    // STATUS CHECK
    // =========================
    const diffDays = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24));

    isOverdue = diffDays < 0;
    isDueSoon = diffDays >= 0 && diffDays <= 7;  // Parts warn 7 days before expiry

    // =========================
    // FORMAT DATE
    // =========================
    const monthNames = [
        'January','February','March','April','May','June',
        'July','August','September','October','November','December'
    ];
    const dayNames = [
        'Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'
    ];

    const formattedDate = `${dayNames[expiryDate.getDay()]}, ${monthNames[expiryDate.getMonth()]} ${expiryDate.getDate()}, ${expiryDate.getFullYear()}`;

    // =========================
    // FINAL LABEL - NO "OVERDUE" prefix
    // =========================
    const label = formattedDate;

    return {
        expiryDate,
        isOverdue,
        isDueSoon,
        label
    };
}

const PARTS_CATALOG = {
  CIJ: {
        '9450': [
            { name: 'ENM 38941 GUTTER BLOCK', expiryMonths: 4 },
            { name: 'ENM 47458 EHV COVER', expiryMonths: 6 },
            { name: 'ENM 49967 EQUIP PRINT HEADBOARD', expiryMonths: 6 },
            { name: 'ENM 46408 FOUR ELECTOVALVE BLOCK', expiryMonths: 4 },
            { name: 'ENM 38980 MODULATION ASSEMBLY', expiryMonths: 6 },
            { name: 'A40846 RECOVERY TOOL', expiryHours: 8000 },
            { name: 'ENM 40209 AIR FILTER' , expiryHours: 8000},
            { name: 'ENM 19134 INK FILTER' , expiryHours: 8000},
            { name: 'ENM 40830 IP54 OUTLET FOAM FILTER' , expiryHours: 8000},
            { name: 'ENM 5629 PRESSURE PUMP' , expiryHours: 8000}
        ],
        '9410': [
            { name: 'ENM 38941 GUTTER BLOCK', expiryMonths: 4 },
            { name: 'ENM 47458 EHV COVER', expiryMonths: 6 },
            { name: 'ENM 49967 EQUIP PRINT HEADBOARD', expiryMonths: 6 },
            { name: 'ENM 46408 FOUR ELECTOVALVE BLOCK', expiryMonths: 4 },
            { name: 'ENM 38980 MODULATION ASSEMBLY', expiryMonths: 6 },
            { name: 'A40846 RECOVERY TOOL', expiryHours: 8000 },
            { name: 'ENM 40209 AIR FILTER' , expiryHours: 8000},
            { name: 'ENM 19134 INK FILTER' , expiryHours: 8000},
            { name: 'ENM 40830 IP54 OUTLET FOAM FILTER' , expiryHours: 8000},
            { name: 'ENM 5629 PRESSURE PUMP' , expiryHours: 8000}
        ],
        '9450S': [
            { name: 'ENM 38941 GUTTER BLOCK', expiryMonths: 4 },
            { name: 'ENM 47458 EHV COVER', expiryMonths: 6 },
            { name: 'ENM 49967 EQUIP PRINT HEADBOARD', expiryMonths: 6 },
            { name: 'ENM 46408 FOUR ELECTOVALVE BLOCK', expiryMonths: 4 },
            { name: 'ENM 38980 MODULATION ASSEMBLY', expiryMonths: 6 },
            { name: 'A40846 RECOVERY TOOL', expiryHours: 8000 },
            { name: 'ENM 40209 AIR FILTER' , expiryHours: 8000},
            { name: 'ENM 19134 INK FILTER' , expiryHours: 8000},
            { name: 'ENM 40830 IP54 OUTLET FOAM FILTER' , expiryHours: 8000},
            { name: 'ENM 5629 PRESSURE PUMP' , expiryHours: 8000}
        ],
        '9450E': [
            { name: 'ENM 38941 GUTTER BLOCK', expiryMonths: 4 },
            { name: 'ENM 47458 EHV COVER', expiryMonths: 6 },
            { name: 'ENM 49967 EQUIP PRINT HEADBOARD', expiryMonths: 6 },
            { name: 'ENM 46408 FOUR ELECTOVALVE BLOCK', expiryMonths: 4 },
            { name: 'ENM 38980 MODULATION ASSEMBLY', expiryMonths: 6 },
            { name: 'A40846 RECOVERY TOOL', expiryHours: 8000 },
            { name: 'ENM 40209 AIR FILTER' , expiryHours: 8000},
            { name: 'ENM 19134 INK FILTER' , expiryHours: 8000},
            { name: 'ENM 40830 IP54 OUTLET FOAM FILTER' , expiryHours: 8000},
            { name: 'ENM 5629 PRESSURE PUMP' , expiryHours: 8000}
        ],
        '9330': [
      { name: 'ENM 38941 GUTTER BLOCK', expiryMonths: 4 },
      { name: 'ENM 47458 EHV COVER', expiryMonths: 6 },
      { name: 'ENM 49967 EQUIP PRINT HEADBOARD', expiryMonths: 6 },
      { name: 'ENM 46408 FOUR ELECTOVALVE BLOCK', expiryMonths: 4 },
      { name: 'ENM 38980 MODULATION ASSEMBLY', expiryMonths: 6 },
      { name: 'A40846 RECOVERY TOOL', expiryHours: 8000 },
      { name: 'ENM 40209 AIR FILTER' , expiryHours: 8000},
      { name: 'ENM 19134 INK FILTER' , expiryHours: 8000},
      { name: 'ENM 40830 IP54 OUTLET FOAM FILTER' , expiryHours: 8000},
      { name: 'ENM 5629 PRESSURE PUMP' , expiryHours: 8000}

    ],
        '9750': [
      { name: 'ENM 38941 GUTTER BLOCK', expiryMonths: 4 },
      { name: 'ENM 47458 EHV COVER', expiryMonths: 6 },
      { name: 'ENM 49967 EQUIP PRINT HEADBOARD', expiryMonths: 6 },
      { name: 'ENM 46408 FOUR ELECTOVALVE BLOCK', expiryMonths: 4 },
      { name: 'ENM 38980 MODULATION ASSEMBLY', expiryMonths: 6 },
      { name: 'A40846 RECOVERY TOOL', expiryHours: 8000 },
      { name: 'ENM 40209 AIR FILTER' , expiryHours: 8000},
      { name: 'ENM 19134 INK FILTER' , expiryHours: 8000},
      { name: 'ENM 40830 IP54 OUTLET FOAM FILTER' , expiryHours: 8000},
      { name: 'ENM 5629 PRESSURE PUMP' , expiryHours: 8000}
    ],
        '9750+': [
      { name: 'ENM 38941 GUTTER BLOCK', expiryMonths: 4 },
      { name: 'ENM 47458 EHV COVER', expiryMonths: 6 },
      { name: 'ENM 49967 EQUIP PRINT HEADBOARD', expiryMonths: 6 },
      { name: 'ENM 46408 FOUR ELECTOVALVE BLOCK', expiryMonths: 4 },
      { name: 'ENM 38980 MODULATION ASSEMBLY', expiryMonths: 6 },
      { name: 'A40846 RECOVERY TOOL', expiryHours: 8000 },
      { name: 'ENM 40209 AIR FILTER' , expiryHours: 8000},
      { name: 'ENM 19134 INK FILTER' , expiryHours: 8000},
      { name: 'ENM 40830 IP54 OUTLET FOAM FILTER' , expiryHours: 8000},
      { name: 'ENM 5629 PRESSURE PUMP' , expiryHours: 8000}
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
    },
};

function addMonths(date, months) {
    const d = new Date(date);
    const originalDay = d.getDate();

    d.setMonth(d.getMonth() + months);

    // Fix overflow (e.g., Feb 30 ΓåÆ Feb 28)
    if (d.getDate() < originalDay) {
        d.setDate(0);
    }

    return d;
}

function hasDueSoonPart(record) {
    const { unitKey, modelKey } = getPartsCatalogLocation(record);
    if (!unitKey) return false;
    if (!modelKey) return false;

    const parts = (PARTS_CATALOG[unitKey] || {})[modelKey];
    const currentHours = (record._runningSeconds || 0) / 3600;

    // Check each part - if ANY part is overdue OR due soon, return true
    for (const p of parts) {
        const s = getPartStatus(currentHours, p, record);
        if (s.isOverdue || s.isDueSoon) {
            return true;  // Warning icon should appear
        }
    }
    return false;
}
