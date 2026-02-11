/**
 * Data normalization layer for messy Monday.com board data.
 * Handles dates, currency, text canonicalization, and missing-value tracking.
 */

// ── Date Normalization ──────────────────────────────────────────────
const ISO_RE = /^\d{4}-\d{2}-\d{2}/;
const MDY_RE = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
const DMY_RE = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;

function isExcelSerial(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 30000 && n < 60000;
}

function pad2(n) { return String(n).padStart(2, "0"); }

function formatYMD(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function excelSerialToDate(serial) {
  const d = new Date(Date.UTC(1899, 11, 30 + serial));
  return d.toISOString().slice(0, 10);
}

export function normalizeDate(raw) {
  if (!raw || String(raw).trim() === "") return null;
  const s = String(raw).trim();

  if (ISO_RE.test(s)) {
    const d = new Date(s);
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }
  if (isExcelSerial(s)) {
    return excelSerialToDate(Number(s));
  }

  const mdyMatch = s.match(MDY_RE);
  if (mdyMatch) {
    const [, m, d, y] = mdyMatch;
    return formatYMD(+y, +m, +d);
  }
  return null;
}

// ── Currency Normalization ──────────────────────────────────────────
const CURRENCY_SYMBOLS = { $: "USD", "₹": "INR", "€": "EUR", "£": "GBP" };
const CURRENCY_RE = /^([₹$€£]?)\s*([\d,]+\.?\d*)\s*(USD|INR|EUR|GBP)?$/i;

export function normalizeCurrency(raw) {
  if (!raw || String(raw).trim() === "") return { value: null, currency: null };
  const s = String(raw).trim().replace(/,/g, "");
  const match = s.match(CURRENCY_RE);
  if (!match) {
    const numOnly = parseFloat(s.replace(/[^0-9.\-]/g, ""));
    return { value: isNaN(numOnly) ? null : numOnly, currency: "UNKNOWN" };
  }
  const symbol = match[1] ? CURRENCY_SYMBOLS[match[1]] : null;
  const code = match[3]?.toUpperCase() || symbol || "INR";
  return { value: parseFloat(match[2]), currency: code };
}

// ── Text Normalization ──────────────────────────────────────────────
const SECTOR_MAP = {
  "oil & gas": "Oil & Gas", "oil and gas": "Oil & Gas", "o&g": "Oil & Gas",
  mining: "Mining", mines: "Mining",
  infra: "Infrastructure", infrastructure: "Infrastructure",
  "real estate": "Real Estate", realestate: "Real Estate",
  construction: "Construction",
  agriculture: "Agriculture", agri: "Agriculture",
  solar: "Solar Energy", "solar energy": "Solar Energy",
  renewables: "Renewable Energy", "renewable energy": "Renewable Energy",
  telecom: "Telecom", telecommunications: "Telecom",
  govt: "Government", government: "Government", "public sector": "Government",
  defence: "Defence", defense: "Defence",
  "urban dev": "Urban Development", "urban development": "Urban Development",
  survey: "Survey", surveying: "Survey",
};

export function canonicalizeSector(raw) {
  if (!raw || String(raw).trim() === "") return null;
  const key = String(raw).trim().toLowerCase();
  return SECTOR_MAP[key] || String(raw).trim();
}

export function normalizeText(raw) {
  if (!raw || String(raw).trim() === "") return null;
  return String(raw).trim().replace(/\s+/g, " ");
}

// ── Monday.com Value Field Extraction ────────────────────────────────
function extractFromValue(valueStr, colType) {
  if (!valueStr) return null;
  try {
    const parsed = JSON.parse(valueStr);
    if (colType === "color" || colType === "status") return parsed?.label || parsed?.text || null;
    if (colType === "dropdown") {
      const ids = parsed?.ids;
      if (ids) return null; // dropdown needs settings_str to resolve — fall through
      return parsed?.labels?.join(", ") || null;
    }
    if (colType === "date") return parsed?.date || null;
    if (colType === "numeric") return parsed ? String(parsed) : null;
    if (typeof parsed === "string") return parsed;
    if (parsed?.text) return parsed.text;
    if (parsed?.value) return String(parsed.value);
    if (parsed?.label) return parsed.label;
  } catch { /* not JSON, ignore */ }
  return null;
}

// ── Board Row Normalization ─────────────────────────────────────────
export function normalizeBoard(board) {
  const columnMap = {};
  for (const col of board.columns) {
    columnMap[col.id] = col;
  }

  const missingCounts = {};
  const currencyTypes = new Set();
  const warnings = [];
  const rows = [];

  const items = board.items_page?.items || [];
  for (const item of items) {
    const row = { _id: item.id, _name: item.name };
    for (const cv of item.column_values) {
      const title = cv.column?.title || cv.id;
      const colType = cv.type || columnMap[cv.id]?.type;

      // Try text first, then parse the JSON value field (Monday.com status/dropdown columns often have empty text)
      let rawText = cv.text ?? "";
      if ((!rawText || rawText.trim() === "") && cv.value) {
        rawText = extractFromValue(cv.value, colType) || "";
      }

      if (!rawText || rawText.trim() === "") {
        missingCounts[title] = (missingCounts[title] || 0) + 1;
        row[title] = null;
        continue;
      }

      const isDateCol = colType === "date" || /\bdate\b/i.test(title);
      if (isDateCol && !/quantity|billed|invoice|balance/i.test(title)) {
        row[title] = normalizeDate(rawText);
        if (!row[title]) warnings.push(`Unparseable date "${rawText}" in column "${title}"`);
      } else if (colType === "numeric" || colType === "numbers" || title.toLowerCase().includes("value") || title.toLowerCase().includes("amount") || title.toLowerCase().includes("price") || title.toLowerCase().includes("revenue") || title.toLowerCase().includes("billed") || title.toLowerCase().includes("collected") || title.toLowerCase().includes("receivable") || title.toLowerCase().includes("quantity")) {
        const { value, currency } = normalizeCurrency(rawText);
        row[title] = value;
        row[`${title}_currency`] = currency;
        if (currency) currencyTypes.add(currency);
      } else {
        row[title] = normalizeText(rawText);
      }
    }
    rows.push(row);
  }

  if (currencyTypes.size > 1) {
    warnings.push(`Mixed currencies detected: ${[...currencyTypes].join(", ")}`);
  }

  return {
    boardName: board.name,
    rows,
    dataQuality: {
      totalRows: rows.length,
      missingCounts,
      currencyTypes: [...currencyTypes],
      warnings,
    },
  };
}
