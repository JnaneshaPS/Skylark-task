/**
 * Vercel serverless function — wraps the Express backend for deployment.
 */

import express from "express";
import cors from "cors";
import { interpretQuery, generateNarrative } from "../backend/src/llmAgent.js";
import { executePlan } from "../backend/src/queryEngine.js";

const app = express();
app.use(cors());
app.use(express.json());

// In-memory session store
const sessions = new Map();
const MAX_HISTORY = 10;

function getSession(id) {
  const session = sessions.get(id);
  if (session) return session;
  const s = { history: [], lastAccess: Date.now() };
  sessions.set(id, s);
  return s;
}

app.post("/api/chat", async (req, res) => {
  const { message, sessionId = "default" } = req.body;
  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Message is required." });
  }

  const session = getSession(sessionId);

  try {
    const plan = await interpretQuery(message.trim(), session.history);

    if (plan.clarifying_questions?.length) {
      const reply = { type: "clarification", questions: plan.clarifying_questions, plan };
      session.history.push({ role: "user", content: message.trim() });
      session.history.push({ role: "assistant", content: `Clarifying questions: ${plan.clarifying_questions.join("; ")}` });
      if (session.history.length > MAX_HISTORY * 2) session.history = session.history.slice(-MAX_HISTORY * 2);
      return res.json(reply);
    }

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

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    mondayConfigured: !!process.env.MONDAY_API_TOKEN,
    openaiConfigured: !!process.env.OPENAI_API_KEY,
    dealsBoardId: process.env.DEALS_BOARD_ID || "not set",
    workOrdersBoardId: process.env.WORK_ORDERS_BOARD_ID || "not set",
  });
});

export default app;
