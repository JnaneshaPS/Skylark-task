/**
 * LLM-powered agent with 3 layers:
 *   1. Query Interpretation — structured plan from natural language
 *   2. Execution delegation (handled by queryEngine)
 *   3. Executive Narrative Generation — founder-ready insights + leadership update
 */

import OpenAI from "openai";

let client;
function getClient() {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

const MODEL = "gpt-4.1-mini";

// ── Layer 1: Query Interpretation ───────────────────────────────────
const INTERPRET_SYSTEM = `You are a business intelligence query planner for Skylark Drones.
Given a user question (and optional conversation history for context), return a JSON plan.

Rules:
- intent: one of pipeline_health, revenue_summary, ops_status, leadership_brief, other
- filters: extract sector, quarter, status, dateRange if mentioned
- data_sources: array from ["deals", "work_orders", "all"]
  - revenue, pipeline, deals, sectors, close rate → "deals"
  - operations, work orders, completion, overdue → "work_orders"
  - leadership brief, general overview, "how are things" → "all"
- clarifying_questions: only if genuinely ambiguous. Prefer making reasonable assumptions.
- Use conversation history to resolve pronouns ("that sector" → the sector from prior messages).
- Return ONLY valid JSON, no markdown.`;

export async function interpretQuery(userText, history = []) {
  try {
    const openai = getClient();
    const messages = [{ role: "system", content: INTERPRET_SYSTEM }];

    // Include recent conversation history for context
    for (const h of history.slice(-6)) {
      messages.push({ role: h.role === "assistant" ? "assistant" : "user", content: h.content });
    }
    messages.push({ role: "user", content: userText });

    const response = await openai.responses.create({
      model: MODEL,
      input: messages,
      text: {
        format: {
          type: "json_schema",
          name: "query_plan",
          strict: true,
          schema: {
            type: "object",
            properties: {
              intent: { type: "string", enum: ["pipeline_health", "revenue_summary", "ops_status", "leadership_brief", "other"] },
              filters: {
                type: "object",
                properties: {
                  sector: { type: ["string", "null"] },
                  quarter: { type: ["string", "null"] },
                  status: { type: ["string", "null"] },
                  dateRange: { type: ["string", "null"] },
                },
                required: ["sector", "quarter", "status", "dateRange"],
                additionalProperties: false,
              },
              data_sources: { type: "array", items: { type: "string" } },
              clarifying_questions: { type: "array", items: { type: "string" } },
            },
            required: ["intent", "filters", "data_sources", "clarifying_questions"],
            additionalProperties: false,
          },
        },
      },
    });
    return JSON.parse(response.output_text);
  } catch (err) {
    console.error("interpretQuery error:", err.message);
    return fallbackInterpret(userText);
  }
}

function fallbackInterpret(text) {
  const lower = text.toLowerCase();
  let intent = "other";
  const sources = [];

  if (/pipeline|deal|revenue|sales|sector/.test(lower)) { intent = "pipeline_health"; sources.push("deals"); }
  if (/revenue|quarter|forecast/.test(lower)) intent = "revenue_summary";
  if (/work.?order|ops|operation|completion|overdue/.test(lower)) { intent = "ops_status"; sources.push("work_orders"); }
  if (/brief|overview|summary|status|leadership/.test(lower)) { intent = "leadership_brief"; sources.push("all"); }
  if (!sources.length) sources.push("all");

  return { intent, filters: { sector: null, quarter: null, status: null, dateRange: null }, data_sources: sources, clarifying_questions: [] };
}

// ── Layer 3: Executive Narrative + Leadership Update ────────────────
const NARRATIVE_SYSTEM = `You are a senior business analyst at Skylark Drones writing for the founder/CEO.
Given metrics data, data quality info, and conversation history, produce executive-ready analysis.

Your output must be suitable for a **leadership update** — the kind of summary a founder would paste into a board meeting deck or share with investors.

Return JSON with:
- summary: 2-3 sentence executive summary with specific numbers. Lead with the most critical insight.
- insight: Detailed analysis paragraph (4-6 sentences). Cover trends, risks, and opportunities. Reference specific metrics. Acknowledge data quality limitations honestly.
- leadership_bullets: array of 5-7 bullet strings structured as:
  1. Pipeline/Revenue headline metric
  2. Operations headline metric (if available)
  3. Top risk with specific data
  4. Top opportunity with specific data
  5. Recommended immediate action
  6. Data quality caveat
  7. (Optional) Cross-board correlation insight

Format bullets as "Category: Detail" (e.g., "Risk: 70% of deals missing close dates...").
Be specific with numbers — never say "some" when you have exact counts.
If data quality is poor, say so directly and quantify the gap.`;

export async function generateNarrative(executionResults, originalQuery, history = []) {
  try {
    const openai = getClient();
    const context = JSON.stringify({
      query: originalQuery,
      metrics: executionResults.metrics,
      dataQuality: executionResults.dataQuality,
      confidence: executionResults.confidence,
    });

    const messages = [{ role: "system", content: NARRATIVE_SYSTEM }];
    for (const h of history.slice(-4)) {
      messages.push({ role: h.role === "assistant" ? "assistant" : "user", content: h.content });
    }
    messages.push({ role: "user", content: `Analyze this data and produce an executive briefing:\n${context}` });

    const response = await openai.responses.create({
      model: MODEL,
      input: messages,
      text: {
        format: {
          type: "json_schema",
          name: "executive_narrative",
          strict: true,
          schema: {
            type: "object",
            properties: {
              summary: { type: "string" },
              insight: { type: "string" },
              leadership_bullets: { type: "array", items: { type: "string" } },
            },
            required: ["summary", "insight", "leadership_bullets"],
            additionalProperties: false,
          },
        },
      },
    });
    return JSON.parse(response.output_text);
  } catch (err) {
    console.error("generateNarrative error:", err.message);
    return fallbackNarrative(executionResults);
  }
}

function fallbackNarrative(results) {
  const m = results.metrics;
  const bullets = [];

  if (m.deals) {
    bullets.push(`Pipeline: ₹${(m.deals.totalPipeline / 1e6).toFixed(1)}M across ${m.deals.dealCount} deals (avg ₹${(m.deals.avgDealSize / 1e5).toFixed(1)}L).`);
    bullets.push(`Close Rate: ${(m.deals.closeRate * 100).toFixed(0)}% (${m.deals.closedWon} won of ${m.deals.dealCount}) — ${m.deals.closeRate < 0.3 ? "below healthy threshold, needs review" : "healthy"}.`);
  }
  if (m.workOrders) {
    bullets.push(`Operations: ${m.workOrders.open} open, ${m.workOrders.closed} closed, ${m.workOrders.overdue} overdue of ${m.workOrders.total} total.`);
    bullets.push(`Completion: ${(m.workOrders.completionPct * 100).toFixed(1)}% — ${m.workOrders.completionPct < 0.5 ? "significant backlog" : "on track"}.`);
  }
  if (m.crossBoard) {
    bullets.push(`Cross-Board: ${m.crossBoard.linkedWorkOrders} work orders linked to active deals.`);
  }
  bullets.push("Data Quality: Review missing fields before using these metrics for board-level decisions.");

  return {
    summary: `Skylark Drones BI: ${m.deals?.dealCount || 0} deals (₹${((m.deals?.totalPipeline || 0) / 1e6).toFixed(1)}M pipeline), ${m.workOrders?.total || 0} work orders (${(((m.workOrders?.completionPct || 0)) * 100).toFixed(0)}% complete).`,
    insight: "This is a fallback analysis generated without LLM. The metrics above are computed directly from your Monday.com board data. Please verify your OpenAI API key for richer narrative analysis with contextual insights.",
    leadership_bullets: bullets,
  };
}
