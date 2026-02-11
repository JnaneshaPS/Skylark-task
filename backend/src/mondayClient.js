/**
 * Monday.com GraphQL client with robust error handling.
 * Handles auth, rate-limits, retries, and network failures.
 */

const MONDAY_API_URL = "https://api.monday.com/v2";
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

function getToken() {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) throw new Error("MONDAY_API_TOKEN is not configured. Set it in your .env file.");
  return token;
}

export async function mondayRequest(query, variables = {}) {
  const token = getToken();
  let lastError;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(MONDAY_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token,
          "API-Version": "2024-10",
        },
        body: JSON.stringify({ query, variables }),
      });

      if (res.status === 401) {
        return { error: "Invalid Monday.com API token. Please verify your credentials.", data: null };
      }
      if (res.status === 429) {
        const wait = RETRY_BASE_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        return { error: `Monday.com API returned HTTP ${res.status}`, data: null };
      }

      const json = await res.json();
      if (json.errors?.length) {
        return { error: `Monday.com API error: ${json.errors.map((e) => e.message).join("; ")}`, data: null };
      }
      if (json.error_message) {
        return { error: json.error_message, data: null };
      }
      return { error: null, data: json.data };
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)));
      }
    }
  }
  return { error: `Network failure after ${MAX_RETRIES} retries: ${lastError?.message}`, data: null };
}

export async function fetchBoard(boardId) {
  const query = `query ($ids: [ID!]) {
    boards(ids: $ids) {
      id name
      columns { id title type settings_str }
      items_page(limit: 500) {
        items {
          id name
          column_values { id text value type column { title } }
        }
      }
    }
  }`;
  const { error, data } = await mondayRequest(query, { ids: [String(boardId)] });
  if (error) return { error, board: null };
  const board = data?.boards?.[0];
  if (!board) return { error: `Board ${boardId} not found or empty.`, board: null };
  return { error: null, board };
}

export async function fetchBoardByName(name) {
  const query = `query { boards(limit: 50) { id name } }`;
  const { error, data } = await mondayRequest(query);
  if (error) return { error, board: null };
  const match = data?.boards?.find((b) => b.name.toLowerCase().includes(name.toLowerCase()));
  if (!match) return { error: `No board matching "${name}" found.`, board: null };
  return fetchBoard(match.id);
}
