# Skylark Drones — Monday.com BI Agent

A conversational AI agent that connects to Monday.com, reads live board data (Deals & Work Orders), normalizes messy real-world data, and produces executive-ready business intelligence insights.

## Architecture

```
User ─→ React Chat UI ─→ Express API ─→ LLM Agent (3 layers)
                                           ├─ Query Interpretation (GPT-4.1-mini)
                                           ├─ Query Execution Engine
                                           │   ├─ Monday.com GraphQL Client
                                           │   ├─ Data Normalizer
                                           │   └─ Metrics Computer
                                           └─ Executive Narrative Generator
```

### Three-Layer Agent Design

1. **Query Interpretation** — LLM parses natural language into a structured plan (intent, filters, data sources)
2. **Query Execution** — Fetches boards via Monday.com GraphQL API, normalizes data, computes metrics
3. **Narrative Generation** — LLM produces executive summary, insights, and leadership bullets

## Quick Start

### Prerequisites

- Node.js 18+
- Monday.com API token
- OpenAI API key
- Board IDs for your Deals and Work Orders boards

### Setup

```bash
# Clone and navigate
cd skylark-bi-agent

# Configure environment
cp .env.example backend/.env
# Edit backend/.env with your actual keys

# Install & run backend
cd backend
npm install
npm run dev

# Install & run frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Environment Variables

| Variable | Description |
|---|---|
| `MONDAY_API_TOKEN` | Your Monday.com API token |
| `OPENAI_API_KEY` | OpenAI API key |
| `DEALS_BOARD_ID` | Monday.com board ID for Deals |
| `WORK_ORDERS_BOARD_ID` | Monday.com board ID for Work Orders |
| `PORT` | Backend port (default: 3001) |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/chat` | Send a natural language query |
| GET | `/api/health` | Health check with config status |

### POST /api/chat

**Request:**
```json
{ "message": "What is our pipeline health?" }
```

**Response:**
```json
{
  "type": "insight",
  "summary": "Executive summary...",
  "insight": "Detailed analysis...",
  "leadership_bullets": ["..."],
  "tables": {},
  "dataQuality": {},
  "confidence": 0.85,
  "plan": {}
}
```

## Running Tests

```bash
cd backend
npm test
```

## Supported Queries

- Pipeline health and deal analysis
- Revenue summaries and quarterly breakdown
- Sector-wise breakdown
- Work order operations status
- Overdue work order tracking
- Cross-board analysis (deals linked to work orders)
- Full leadership briefs

## Data Normalization

The normalizer handles real-world messy data:

- **Dates**: ISO, MM/DD/YYYY, DD-MM-YYYY, Excel serial numbers
- **Currency**: $, ₹, €, £ with comma stripping and mixed currency detection
- **Text**: Sector canonicalization, whitespace normalization
- **Missing values**: Tracked per-column, never silently discarded

## Deployment

### Render

1. Push to GitHub
2. Create a Web Service on Render pointing to `backend/`
3. Set environment variables
4. Build command: `npm install`
5. Start command: `npm start`
6. Deploy frontend as a Static Site pointing to `frontend/`

### Vercel

1. Deploy frontend with `vercel` from `frontend/`
2. Deploy backend as a serverless function or separate service
3. Set `VITE_API_URL` to point to the backend URL
