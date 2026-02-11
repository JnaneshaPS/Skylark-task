import { useState, useRef, useEffect } from "react";
import { sendMessage } from "./utils/api.js";

function ConfidenceBadge({ score }) {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? "#22c55e" : pct >= 40 ? "#eab308" : "#ef4444";
  return (
    <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600, background: color + "20", color, border: `1px solid ${color}` }}>
      {pct}% confidence
    </span>
  );
}

function DataTable({ title, rows }) {
  if (!rows?.length) return null;
  const cols = Object.keys(rows[0]).filter((k) => !k.startsWith("_") && !k.endsWith("_currency"));
  if (!cols.length) return null;
  const display = rows.slice(0, 8);

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: "#94a3b8", marginBottom: 4, textTransform: "capitalize" }}>{title}</div>
      <div style={{ overflowX: "auto", borderRadius: 6, border: "1px solid #334155" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c} style={{ padding: "6px 10px", textAlign: "left", background: "#1e293b", color: "#94a3b8", fontWeight: 600, borderBottom: "1px solid #334155", whiteSpace: "nowrap" }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {display.map((row, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c} style={{ padding: "5px 10px", borderBottom: "1px solid #1e293b", color: "#cbd5e1", whiteSpace: "nowrap", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {row[c] != null ? String(row[c]) : <span style={{ color: "#475569" }}>—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 8 && <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>Showing 8 of {rows.length} rows</div>}
    </div>
  );
}

function DataQualityPanel({ dq }) {
  if (!dq || (!dq.deals && !dq.workOrders)) return null;
  const sections = [];
  for (const [key, val] of Object.entries(dq)) {
    if (!val) continue;
    sections.push(
      <div key={key} style={{ marginBottom: 8 }}>
        <strong style={{ textTransform: "capitalize" }}>{key}</strong>
        <span style={{ marginLeft: 8, fontSize: 12, color: "#94a3b8" }}>({val.totalRows} rows)</span>
        {val.warnings?.length > 0 && (
          <ul style={{ margin: "4px 0 0 16px", padding: 0, fontSize: 13, color: "#f59e0b" }}>
            {val.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        )}
        {Object.keys(val.missingCounts || {}).length > 0 && (
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
            Missing: {Object.entries(val.missingCounts).map(([k, v]) => `${k}(${v})`).join(", ")}
          </div>
        )}
      </div>
    );
  }
  return (
    <div style={{ background: "#0f172a", borderRadius: 8, padding: 12, marginTop: 8, fontSize: 13, border: "1px solid #1e293b" }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: "#cbd5e1" }}>Data Quality Report</div>
      {sections}
    </div>
  );
}

function BotMessage({ data }) {
  if (data.type === "clarification") {
    return (
      <div>
        <p style={{ color: "#fbbf24", fontWeight: 600, marginBottom: 6 }}>I need a bit more context:</p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>{data.questions.map((q, i) => <li key={i} style={{ marginBottom: 4 }}>{q}</li>)}</ul>
      </div>
    );
  }
  if (data.type === "error") {
    return <div style={{ color: "#f87171" }}><strong>Error:</strong> {data.summary}<br />{data.insight}</div>;
  }

  const tables = data.tables || {};

  return (
    <div>
      {data.confidence != null && <ConfidenceBadge score={data.confidence} />}
      <p style={{ fontSize: 15, lineHeight: 1.6, marginTop: 8 }}>{data.summary}</p>
      <div style={{ fontSize: 14, color: "#cbd5e1", lineHeight: 1.6 }}>{data.insight}</div>

      {data.leadership_bullets?.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "#94a3b8", marginBottom: 4 }}>LEADERSHIP UPDATE</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {data.leadership_bullets.map((b, i) => <li key={i} style={{ marginBottom: 5, fontSize: 14, lineHeight: 1.5 }}>{b}</li>)}
          </ul>
        </div>
      )}

      {Object.entries(tables).map(([key, rows]) => (
        <DataTable key={key} title={key.replace(/([A-Z])/g, " $1").trim()} rows={rows} />
      ))}

      <DataQualityPanel dq={data.dataQuality} />
    </div>
  );
}

export default function ChatUI() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);
    try {
      const data = await sendMessage(text);
      setMessages((m) => [...m, { role: "bot", data }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "bot", data: { type: "error", summary: err.message, insight: "Check that the backend server is running." } }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } };

  const examples = [
    "Give me a leadership brief on our business",
    "What is our quarterly revenue by sector?",
    "How many work orders are overdue?",
    "How's our pipeline for energy sector this quarter?",
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0f172a", color: "#f1f5f9", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <header style={{ padding: "16px 24px", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16 }}>S</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Skylark BI Agent</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>Monday.com Business Intelligence</div>
        </div>
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", marginTop: 60 }}>
            <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Ask me anything about your business</div>
            <div style={{ color: "#64748b", marginBottom: 24 }}>I connect to your Monday.com boards to deliver executive-ready insights and leadership updates.</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              {examples.map((ex) => (
                <button key={ex} onClick={() => setInput(ex)} style={{ background: "#1e293b", border: "1px solid #334155", color: "#cbd5e1", padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 16 }}>
            <div style={{
              maxWidth: m.role === "user" ? "65%" : "85%",
              padding: "12px 16px",
              borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
              background: m.role === "user" ? "#3b82f6" : "#1e293b",
              fontSize: 14,
              lineHeight: 1.5,
            }}>
              {m.role === "user" ? m.content : <BotMessage data={m.data} />}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 16 }}>
            <div style={{ background: "#1e293b", padding: "12px 20px", borderRadius: 16, fontSize: 14, color: "#94a3b8" }}>
              <span style={{ display: "inline-block", animation: "pulse 1.5s infinite" }}>Analyzing your Monday.com data...</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div style={{ padding: "16px 24px", borderTop: "1px solid #1e293b" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about pipeline, revenue, work orders, leadership updates..."
            disabled={loading}
            style={{ flex: 1, background: "#1e293b", border: "1px solid #334155", color: "#f1f5f9", padding: "12px 16px", borderRadius: 12, fontSize: 14, outline: "none" }}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            style={{ background: loading ? "#334155" : "#3b82f6", color: "#fff", border: "none", padding: "12px 24px", borderRadius: 12, fontWeight: 600, fontSize: 14, cursor: loading ? "default" : "pointer" }}
          >
            {loading ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
