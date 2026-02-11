const BASE = import.meta.env.VITE_API_URL || "/api";

const SESSION_ID = `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;

export async function sendMessage(message) {
  const res = await fetch(`${BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sessionId: SESSION_ID }),
  });
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  return res.json();
}

export async function healthCheck() {
  const res = await fetch(`${BASE}/health`);
  return res.json();
}
