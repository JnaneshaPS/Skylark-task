/**
 * Query execution engine.
 * Fetches boards, normalizes data, computes metrics, and joins cross-board data.
 */

import { fetchBoard } from "./mondayClient.js";
import { normalizeBoard, canonicalizeSector } from "./normalizer.js";

function env(key) {
  return process.env[key];
}

// ── Deals Metrics ───────────────────────────────────────────────────
function computeDealsMetrics(rows) {
  const valueCol = findCol(rows, ["masked deal value", "deal value", "value", "amount", "deal_value", "price", "revenue"]);
  const stageCol = findCol(rows, ["deal stage", "stage", "deal_stage"]);
  const statusCol = findCol(rows, ["deal status", "status"]);
  const sectorCol = findCol(rows, ["sector/service", "sector", "industry", "vertical"]);
  const dateCol = findCol(rows, ["tentative close date", "close date (a)", "close date", "closing date", "expected close", "close_date"]);
  const probCol = findCol(rows, ["closure probability", "probability", "win probability"]);
  const createdCol = findCol(rows, ["created date", "created"]);

  let totalPipeline = 0, count = 0, closedWon = 0, closedLost = 0;
  const stageDistribution = {}, sectorBreakdown = {}, statusDistribution = {}, probabilityDist = {};
  const quarterly = {};

  for (const r of rows) {
    count++;
    const val = valueCol ? (typeof r[valueCol] === "number" ? r[valueCol] : 0) : 0;
    totalPipeline += val;

    const stage = stageCol ? (r[stageCol] || "Unknown") : "Unknown";
    stageDistribution[stage] = (stageDistribution[stage] || 0) + 1;
    if (/won|closed.*won|completed|delivered/i.test(stage)) closedWon++;

    // Also check Deal Status column for won/lost
    const status = statusCol ? (r[statusCol] || "Unknown") : "Unknown";
    statusDistribution[status] = (statusDistribution[status] || 0) + 1;
    if (/won|closed.*won/i.test(status)) closedWon++;
    if (/lost|closed.*lost/i.test(status)) closedLost++;

    // Closure probability distribution
    if (probCol) {
      const prob = r[probCol] || "Unknown";
      probabilityDist[prob] = (probabilityDist[prob] || 0) + 1;
    }

    const sector = sectorCol ? canonicalizeSector(r[sectorCol]) || "Unknown" : "Unknown";
    sectorBreakdown[sector] = (sectorBreakdown[sector] || { count: 0, value: 0 });
    sectorBreakdown[sector].count++;
    sectorBreakdown[sector].value += val;

    if (dateCol && r[dateCol]) {
      const d = new Date(r[dateCol]);
      if (!isNaN(d)) {
        const q = `Q${Math.ceil((d.getMonth() + 1) / 3)} ${d.getFullYear()}`;
        quarterly[q] = (quarterly[q] || 0) + val;
      }
    }
  }

  // Deduplicate closedWon (might have been counted from both stage and status)
  closedWon = Math.min(closedWon, count);

  return {
    totalPipeline,
    dealCount: count,
    avgDealSize: count ? totalPipeline / count : 0,
    closeRate: count ? closedWon / count : 0,
    closedWon,
    closedLost,
    stageDistribution,
    statusDistribution,
    probabilityDistribution: probabilityDist,
    sectorBreakdown,
    quarterlyRevenue: quarterly,
  };
}

// ── Work Orders Metrics ─────────────────────────────────────────────
function computeWorkOrdersMetrics(rows) {
  const execStatusCol = findCol(rows, ["execution status", "status", "state", "work order status"]);
  const woStatusCol = findCol(rows, ["wo status", "wo status (billed)", "billing status"]);
  const startCol = findCol(rows, ["probable start date", "start date", "start", "start_date"]);
  const endCol = findCol(rows, ["probable end date", "end date", "completion date", "due date", "end_date"]);
  const amountCol = findCol(rows, ["amount in rupees", "amount", "value"]);
  const billedCol = findCol(rows, ["billed value", "billed"]);
  const collectedCol = findCol(rows, ["collected amount", "collected"]);
  const sectorCol = findCol(rows, ["sector", "industry"]);
  const natureCol = findCol(rows, ["nature of work", "type of work", "work type"]);

  let open = 0, closed = 0, overdue = 0, completed = 0, notStarted = 0, ongoing = 0;
  let totalDays = 0, daysCount = 0, totalAmount = 0, totalBilled = 0, totalCollected = 0;
  const execStatusDist = {}, sectorDist = {}, natureDist = {};
  const now = new Date();

  for (const r of rows) {
    const execStatus = execStatusCol ? (r[execStatusCol] || "Unknown") : "Unknown";
    execStatusDist[execStatus] = (execStatusDist[execStatus] || 0) + 1;

    if (/completed|complete|closed/i.test(execStatus)) {
      closed++;
      completed++;
    } else if (/not started|not.started/i.test(execStatus)) {
      notStarted++;
      open++;
    } else if (/ongoing|in.progress|executed/i.test(execStatus)) {
      ongoing++;
      open++;
      // Check if overdue
      if (endCol && r[endCol]) {
        const due = new Date(r[endCol]);
        if (!isNaN(due) && due < now) overdue++;
      }
    } else {
      open++;
      if (endCol && r[endCol]) {
        const due = new Date(r[endCol]);
        if (!isNaN(due) && due < now) overdue++;
      }
    }

    // Duration computation
    if (startCol && endCol && r[startCol] && r[endCol]) {
      const s = new Date(r[startCol]);
      const e = new Date(r[endCol]);
      if (!isNaN(s) && !isNaN(e)) {
        const days = (e - s) / 86400000;
        if (days >= 0) { totalDays += days; daysCount++; }
      }
    }

    // Financial metrics
    if (amountCol && typeof r[amountCol] === "number") totalAmount += r[amountCol];
    if (billedCol && typeof r[billedCol] === "number") totalBilled += r[billedCol];
    if (collectedCol && typeof r[collectedCol] === "number") totalCollected += r[collectedCol];

    // Sector distribution
    if (sectorCol) {
      const sec = canonicalizeSector(r[sectorCol]) || "Unknown";
      sectorDist[sec] = (sectorDist[sec] || 0) + 1;
    }

    // Nature of work
    if (natureCol) {
      const nature = r[natureCol] || "Unknown";
      natureDist[nature] = (natureDist[nature] || 0) + 1;
    }
  }

  const total = open + closed;
  return {
    total,
    open,
    closed,
    completed,
    notStarted,
    ongoing,
    overdue,
    completionPct: total ? closed / total : 0,
    avgCompletionDays: daysCount ? totalDays / daysCount : null,
    totalAmount,
    totalBilled,
    totalCollected,
    collectionRate: totalAmount ? totalCollected / totalAmount : 0,
    executionStatusDistribution: execStatusDist,
    sectorDistribution: sectorDist,
    natureOfWorkDistribution: natureDist,
  };
}

// ── Cross-Board Analysis ────────────────────────────────────────────
function crossBoardAnalysis(dealsRows, woRows, dealsMetrics, woMetrics) {
  const insights = [];

  // 1. Name-based linking: match deal names to work order names (fuzzy substring)
  const dealEntries = dealsRows.map((r) => ({ name: (r._name || "").toLowerCase(), row: r }));
  const linkedWOs = woRows.filter((r) => {
    const woName = (r._name || "").toLowerCase();
    const allWoText = Object.values(r).filter((v) => typeof v === "string").join(" ").toLowerCase();
    return dealEntries.some((d) => {
      if (d.name.length < 3) return false;
      return woName.includes(d.name) || d.name.includes(woName) || allWoText.includes(d.name);
    });
  });

  // 2. Sector-based linking: check if work order text mentions deal sectors
  const sectorCol = findCol(dealsRows, ["sector", "industry", "vertical"]);
  const dealSectors = sectorCol
    ? [...new Set(dealsRows.map((r) => r[sectorCol]).filter(Boolean).map((s) => s.toLowerCase()))]
    : [];
  const sectorLinkedWOs = dealSectors.length
    ? woRows.filter((r) => {
        const text = Object.values(r).filter((v) => typeof v === "string").join(" ").toLowerCase();
        return dealSectors.some((sec) => text.includes(sec));
      })
    : [];

  const totalLinked = Math.max(linkedWOs.length, sectorLinkedWOs.length);
  if (totalLinked > 0) {
    insights.push(`${totalLinked} work orders appear linked to active deals (by name or sector matching).`);
  } else {
    insights.push("No direct linkage found between work orders and deals — consider adding cross-references in Monday.com.");
  }

  // 3. Risk correlation
  if (dealsMetrics.closeRate < 0.3) {
    insights.push(`Risk: Close rate is ${(dealsMetrics.closeRate * 100).toFixed(0)}% (below 30%) — pipeline conversion needs urgent attention.`);
  }
  if (woMetrics && woMetrics.overdue > 0) {
    const overduePct = ((woMetrics.overdue / woMetrics.total) * 100).toFixed(0);
    insights.push(`Risk: ${woMetrics.overdue} work orders overdue (${overduePct}% of total) — may impact deal delivery timelines.`);
  }
  if (woMetrics && woMetrics.completionPct < 0.5) {
    insights.push(`Operations bottleneck: Only ${(woMetrics.completionPct * 100).toFixed(0)}% work orders complete — could delay deal fulfillment.`);
  }
  if (dealsMetrics.totalPipeline > 0 && dealsMetrics.dealCount > 20 && dealsMetrics.avgDealSize < dealsMetrics.totalPipeline * 0.03) {
    insights.push("Pipeline fragmentation: Many small deals — consider focusing sales effort on fewer, larger opportunities.");
  }

  // 4. High-value deals at risk (deals with value but no matching work orders)
  const valueCol = findCol(dealsRows, ["deal value", "value", "amount", "deal_value", "price", "revenue"]);
  if (valueCol) {
    const highValueDeals = dealsRows.filter((r) => typeof r[valueCol] === "number" && r[valueCol] > dealsMetrics.avgDealSize);
    const highValueNoWO = highValueDeals.filter((d) => {
      const dName = (d._name || "").toLowerCase();
      return !woRows.some((w) => (w._name || "").toLowerCase().includes(dName));
    });
    if (highValueNoWO.length > 0) {
      insights.push(`${highValueNoWO.length} high-value deals have no matching work orders — ensure operational readiness.`);
    }
  }

  return { linkedWorkOrders: totalLinked, sectorLinkedWorkOrders: sectorLinkedWOs.length, insights };
}

// ── Utility ─────────────────────────────────────────────────────────
function findCol(rows, candidates) {
  if (!rows.length) return null;
  const keys = Object.keys(rows[0]);
  for (const c of candidates) {
    const found = keys.find((k) => k.toLowerCase() === c.toLowerCase());
    if (found) return found;
  }
  for (const c of candidates) {
    const found = keys.find((k) => k.toLowerCase().includes(c.toLowerCase()));
    if (found) return found;
  }
  return null;
}

// ── Execute Plan ────────────────────────────────────────────────────
export async function executePlan(plan) {
  const results = { metrics: {}, dataQuality: {}, tables: {} };
  const sources = plan.data_sources || [];
  const needDeals = sources.includes("deals") || sources.includes("all");
  const needWO = sources.includes("work_orders") || sources.includes("all");

  let dealsNorm = null, woNorm = null;

  if (needDeals) {
    const boardId = env("DEALS_BOARD_ID");
    if (!boardId) return { error: "DEALS_BOARD_ID not configured in .env" };
    const { error, board } = await fetchBoard(boardId);
    if (error) return { error };
    dealsNorm = normalizeBoard(board);
    results.metrics.deals = computeDealsMetrics(dealsNorm.rows);
    results.dataQuality.deals = dealsNorm.dataQuality;
    results.tables.deals = dealsNorm.rows.slice(0, 20);
  }

  if (needWO) {
    const boardId = env("WORK_ORDERS_BOARD_ID");
    if (!boardId) return { error: "WORK_ORDERS_BOARD_ID not configured in .env" };
    const { error, board } = await fetchBoard(boardId);
    if (error) return { error };
    woNorm = normalizeBoard(board);
    results.metrics.workOrders = computeWorkOrdersMetrics(woNorm.rows);
    results.dataQuality.workOrders = woNorm.dataQuality;
    results.tables.workOrders = woNorm.rows.slice(0, 20);
  }

  if (dealsNorm && woNorm) {
    results.metrics.crossBoard = crossBoardAnalysis(dealsNorm.rows, woNorm.rows, results.metrics.deals, results.metrics.workOrders);
  }

  // Apply filters
  if (plan.filters) {
    if (plan.filters.sector && dealsNorm) {
      const sec = plan.filters.sector.toLowerCase();
      const filtered = dealsNorm.rows.filter((r) => {
        return Object.values(r).some((v) => typeof v === "string" && v.toLowerCase().includes(sec));
      });
      results.metrics.filteredDeals = computeDealsMetrics(filtered);
      results.tables.filteredDeals = filtered.slice(0, 20);
    }
    if (plan.filters.quarter && results.metrics.deals) {
      const q = plan.filters.quarter;
      results.metrics.quarterFocus = results.metrics.deals.quarterlyRevenue[q] || 0;
    }
  }

  results.confidence = computeConfidence(results);
  return results;
}

function computeConfidence(results) {
  let score = 0.85;
  const qualities = [results.dataQuality.deals, results.dataQuality.workOrders].filter(Boolean);
  for (const dq of qualities) {
    const totalMissing = Object.values(dq.missingCounts).reduce((a, b) => a + b, 0);
    const maxPossible = dq.totalRows * Object.keys(dq.missingCounts).length || 1;
    const missingRatio = totalMissing / maxPossible;
    score -= missingRatio * 0.3;
    if (dq.warnings.length > 3) score -= 0.05;
  }
  return Math.max(0.1, Math.min(1, parseFloat(score.toFixed(2))));
}
