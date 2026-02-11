/**
 * API routes for the BI agent.
 */

import { Router } from "express";
import { interpretQuery, generateNarrative } from "../llmAgent.js";
import { executePlan } from "../queryEngine.js";

const router = Router();

// In-memory conversation store (keyed by sessionId)
const sessions = new Map();
const MAX_HISTORY = 10;
const SESSION_TTL_MS = 30 * 60 * 1000;

function getSession(id) {
  const session = sessions.get(id);
  if (session) {
    session.lastAccess = Date.now();
    return session;
  }
  const newSession = { history: [], lastAccess: Date.now() };
  sessions.set(id, newSession);
  return newSession;
}

// Cleanup stale sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.lastAccess > SESSION_TTL_MS) sessions.delete(id);
  }
}, 60_000);

router.post("/chat", async (req, res) => {
  const { message, sessionId = "default" } = req.body;
  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Message is required." });
  }

  const session = getSession(sessionId);

  try {
    // Layer 1: Interpret the query (with conversation context)
    const plan = await interpretQuery(message.trim(), session.history);

    // If clarification needed, return early but store in history
    if (plan.clarifying_questions?.length) {
      const reply = { type: "clarification", questions: plan.clarifying_questions, plan };
      session.history.push({ role: "user", content: message.trim() });
      session.history.push({ role: "assistant", content: `Clarifying questions: ${plan.clarifying_questions.join("; ")}` });
      if (session.history.length > MAX_HISTORY * 2) session.history = session.history.slice(-MAX_HISTORY * 2);
      return res.json(reply);
    }

    // Layer 2: Execute the plan
    const execResult = await executePlan(plan);
    if (execResult.error) {
      return res.json({
        type: "error",
        summary: execResult.error,
        insight: "Please check your configuration and try again.",
        leadership_bullets: [],
        dataQuality: {},
        confidence: 0,
      });
    }

    // Layer 3: Generate narrative
    const narrative = await generateNarrative(execResult, message, session.history);

    const reply = {
      type: "insight",
      summary: narrative.summary,
      insight: narrative.insight,
      leadership_bullets: narrative.leadership_bullets,
      tables: execResult.tables,
      dataQuality: execResult.dataQuality,
      confidence: execResult.confidence,
      plan,
    };

    // Store conversation turn
    session.history.push({ role: "user", content: message.trim() });
    session.history.push({ role: "assistant", content: narrative.summary });
    if (session.history.length > MAX_HISTORY * 2) session.history = session.history.slice(-MAX_HISTORY * 2);

    return res.json(reply);
  } catch (err) {
    console.error("Chat endpoint error:", err);
    return res.status(500).json({
      type: "error",
      summary: "An internal error occurred while processing your request.",
      insight: err.message,
      leadership_bullets: [],
      dataQuality: {},
      confidence: 0,
    });
  }
});

router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    mondayConfigured: !!process.env.MONDAY_API_TOKEN,
    openaiConfigured: !!process.env.OPENAI_API_KEY,
    dealsBoardId: process.env.DEALS_BOARD_ID || "not set",
    workOrdersBoardId: process.env.WORK_ORDERS_BOARD_ID || "not set",
  });
});

export default router;
