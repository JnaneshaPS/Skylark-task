/**
 * Monday.com CSV Import Script
 * Creates NEW boards with proper column structure and imports all CSV data.
 * Usage: node import-csv.js
 */

import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";

const API_URL = "https://api.monday.com/v2";
const TOKEN = process.env.MONDAY_API_TOKEN;
const DEALS_CSV = "C:\\Users\\jnane\\Downloads\\Deal_funnel_Data.csv";
const WO_CSV = "C:\\Users\\jnane\\Downloads\\Work_Order_Tracker_Data.csv";

let requestCount = 0;

async function monday(query, variables = {}) {
  requestCount++;
  await sleep(400); // rate limit
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: TOKEN, "API-Version": "2024-10" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    const msg = json.errors[0]?.message || "Unknown";
    if (msg.includes("complexity") || msg.includes("rate")) {
      console.log("  Rate limited. Waiting 65s...");
      await sleep(65000);
      return monday(query, variables);
    }
    console.error("API Error:", msg);
    throw new Error(msg);
  }
  return json.data;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function parseCSV(text) {
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  const result = [];
  for (const line of lines) {
    const row = [];
    let inQuote = false, cell = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === "," && !inQuote) { row.push(cell.trim()); cell = ""; continue; }
      cell += ch;
    }
    row.push(cell.trim());
    result.push(row);
  }
  return result;
}

async function getWorkspaceId() {
  // Get first workspace to create boards in
  const data = await monday(`query { boards(limit: 1, ids: [${process.env.DEALS_BOARD_ID}]) { workspace_id } }`);
  return data?.boards?.[0]?.workspace_id || null;
}

async function createBoard(name, workspaceId) {
  let query, vars;
  if (workspaceId) {
    query = `mutation ($name: String!, $kind: BoardKind!, $wsId: ID!) { create_board(board_name: $name, board_kind: $kind, workspace_id: $wsId) { id } }`;
    vars = { name, kind: "public", wsId: String(workspaceId) };
  } else {
    query = `mutation ($name: String!, $kind: BoardKind!) { create_board(board_name: $name, board_kind: $kind) { id } }`;
    vars = { name, kind: "public" };
  }
  const data = await monday(query, vars);
  return data.create_board.id;
}

async function createColumns(boardId, headers) {
  const colMap = {};
  for (const header of headers) {
    try {
      const data = await monday(
        `mutation ($boardId: ID!, $title: String!, $colType: ColumnType!) { create_column(board_id: $boardId, title: $title, column_type: $colType) { id title } }`,
        { boardId: String(boardId), title: header, colType: "text" }
      );
      colMap[header] = data.create_column.id;
      console.log(`  + Column: ${header} → ${colMap[header]}`);
    } catch (e) {
      console.error(`  ! Failed column "${header}": ${e.message}`);
    }
  }
  return colMap;
}

async function importItems(boardId, colMap, headers, rows) {
  console.log(`  Importing ${rows.length} items...`);
  let success = 0, fail = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const itemName = (row[0] || `Item_${i + 1}`).slice(0, 255);
    const colValues = {};
    for (let j = 1; j < headers.length; j++) {
      const val = row[j] || "";
      if (val && colMap[headers[j]]) {
        colValues[colMap[headers[j]]] = val;
      }
    }

    try {
      await monday(
        `mutation ($boardId: ID!, $itemName: String!, $colValues: JSON!) { create_item(board_id: $boardId, item_name: $itemName, column_values: $colValues) { id } }`,
        { boardId: String(boardId), itemName, colValues: JSON.stringify(colValues) }
      );
      success++;
    } catch (e) {
      console.error(`  ! Failed "${itemName}": ${e.message}`);
      fail++;
    }
    if ((i + 1) % 25 === 0 || i === rows.length - 1) {
      console.log(`  Progress: ${i + 1}/${rows.length} (${success} ok, ${fail} fail) [${requestCount} API calls]`);
    }
  }
  console.log(`  Done: ${success} imported, ${fail} failed.`);
  return success;
}

async function importCSV(csvPath, boardName, workspaceId) {
  console.log(`\n=== ${boardName} ===`);
  const raw = readFileSync(csvPath, "utf-8");
  const parsed = parseCSV(raw);

  // Find header row (first row with actual content)
  let headerIdx = 0;
  for (let i = 0; i < parsed.length; i++) {
    if (parsed[i].some((c) => c.length > 0)) { headerIdx = i; break; }
  }
  let headers = parsed[headerIdx];
  if (headers.every((h) => !h) || headers.filter((h) => h).length < 3) {
    headerIdx++;
    headers = parsed[headerIdx];
  }

  const dataRows = parsed.slice(headerIdx + 1).filter((r) => r.some((c) => c.length > 0));
  console.log(`  CSV: ${headers.length} columns, ${dataRows.length} rows`);
  console.log(`  Columns: ${headers.join(", ").slice(0, 120)}...`);

  // Create new board
  console.log(`  Creating board "${boardName}"...`);
  const boardId = await createBoard(boardName, workspaceId);
  console.log(`  Board created: ID ${boardId}`);

  // Create columns (skip first = item name)
  const colHeaders = headers.slice(1).filter((h) => h.length > 0);
  const colMap = await createColumns(boardId, colHeaders);

  // Import items
  await importItems(boardId, colMap, headers, dataRows);

  return boardId;
}

async function main() {
  if (!TOKEN) { console.error("MONDAY_API_TOKEN not set."); process.exit(1); }

  console.log("Getting workspace...");
  const wsId = await getWorkspaceId();
  console.log(`Workspace ID: ${wsId || "default"}`);

  const dealsBoardId = await importCSV(DEALS_CSV, "Deals - BI Agent", wsId);
  const woBoardId = await importCSV(WO_CSV, "Work Orders - BI Agent", wsId);

  // Update .env file
  const envPath = ".env";
  let envContent = readFileSync(envPath, "utf-8");
  envContent = envContent.replace(/DEALS_BOARD_ID=.*/, `DEALS_BOARD_ID=${dealsBoardId}`);
  envContent = envContent.replace(/WORK_ORDERS_BOARD_ID=.*/, `WORK_ORDERS_BOARD_ID=${woBoardId}`);
  writeFileSync(envPath, envContent);

  console.log("\n=== IMPORT COMPLETE ===");
  console.log(`Deals Board ID:       ${dealsBoardId}`);
  console.log(`Work Orders Board ID: ${woBoardId}`);
  console.log(`.env updated automatically.`);
  console.log(`Total API calls: ${requestCount}`);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
