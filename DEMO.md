# Demo Guide

## Setup (5 minutes)

1. **Get your Monday.com API token:**
   - Go to monday.com → Profile picture → Developers → My Access Tokens
   - Copy the API token

2. **Get Board IDs:**
   - Open your Deals board → look at the URL: `monday.com/boards/XXXXXXXXXX`
   - The number is your board ID
   - Repeat for Work Orders board

3. **Configure environment:**
   ```bash
   cp .env.example backend/.env
   ```
   Edit `backend/.env`:
   ```
   MONDAY_API_TOKEN=eyJhbG...your_token
   OPENAI_API_KEY=sk-...your_key
   DEALS_BOARD_ID=1234567890
   WORK_ORDERS_BOARD_ID=0987654321
   ```

4. **Start the system:**
   ```bash
   # Terminal 1 — Backend
   cd backend && npm install && npm run dev

   # Terminal 2 — Frontend
   cd frontend && npm install && npm run dev
   ```

5. **Open** `http://localhost:5173`

## Demo Script

### Query 1: Leadership Brief
> "Give me a complete leadership brief on our current business"

**Expected output:**
- Executive summary covering pipeline value and work order status
- Sector breakdown
- Close rate analysis
- Risk flags (overdue work orders, low close rate)
- Data quality transparency

### Query 2: Pipeline Health
> "How healthy is our deals pipeline?"

**Expected output:**
- Total pipeline value
- Deal count and average size
- Stage distribution
- Close rate with trend analysis

### Query 3: Revenue Breakdown
> "What is our quarterly revenue breakdown by sector?"

**Expected output:**
- Quarterly revenue figures
- Sector breakdown with deal counts and values
- Concentration risk analysis

### Query 4: Operations Status
> "How many work orders are overdue and what's our completion rate?"

**Expected output:**
- Open vs closed counts
- Overdue count with percentage
- Average completion time
- Operational efficiency assessment

### Query 5: Cross-Board Insight
> "Which large deals have associated work orders? Are any at risk?"

**Expected output:**
- Cross-referencing deals and work orders
- Risk correlation
- Specific recommendations

### Query 6: Ambiguous Query
> "How are things going?"

**Expected output:**
- Either a full leadership brief (reasonable assumption) or clarifying questions

## Health Check

Visit `http://localhost:3001/api/health` to verify configuration:
```json
{
  "status": "ok",
  "mondayConfigured": true,
  "openaiConfigured": true,
  "dealsBoardId": "1234567890",
  "workOrdersBoardId": "0987654321"
}
```

## Testing

```bash
cd backend
npm test
```

Runs normalizer unit tests covering:
- Date parsing (ISO, MDY, Excel serial)
- Currency parsing (multi-currency, commas)
- Sector canonicalization
- Missing value tracking
- Full board normalization with data quality output
