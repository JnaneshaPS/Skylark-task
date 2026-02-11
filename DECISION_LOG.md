# Decision Log

## Key Assumptions

1. **Board structure varies.** Column names and types differ between Monday.com accounts. The agent auto-detects columns by name patterns (e.g., "deal value," "status," "close date") rather than hardcoding column IDs.
2. **Data is messy by design.** The sample CSVs have missing fields, inconsistent date formats, and mixed currencies. The system treats this as expected and reports quality gaps transparently rather than silently dropping rows.
3. **Read-only access is sufficient.** The agent never writes to Monday.com. All interactions are read-only GraphQL queries.
4. **Reasonable defaults over endless clarification.** When a query like "how are things?" is ambiguous, the agent defaults to a full leadership brief rather than asking clarifying questions. Clarification is only requested when genuinely needed (e.g., an unresolvable reference).
5. **500-item page limit covers most boards.** Monday.com pagination adds significant complexity. For this prototype, 500 items per board is the cap. Production would implement cursor-based pagination.

## Architecture Decisions

### Three-Layer Agent Design
**Decision:** Separate query interpretation, execution, and narrative generation into distinct layers.
**Why:** Each layer can fail independently, be tested independently, and be swapped (e.g., different LLM). The execution layer works without LLM access (fallback mode), ensuring graceful degradation.

### Monday.com GraphQL API (not MCP)
**Decision:** Use Monday.com's GraphQL API directly via native `fetch`.
**Why:** GraphQL fetches exactly the columns and items needed in a single request. No external MCP server dependency. Retry/rate-limit logic is custom for full control. Native fetch (Node 18+) avoids unnecessary dependencies.

### LLM Structured Output with JSON Schema
**Decision:** Use OpenAI's strict `json_schema` response format for both interpretation and narrative.
**Why:** Guarantees valid JSON output. Eliminates fragile regex parsing. Strict schemas prevent hallucinated fields.

### Fallback Without LLM
**Decision:** Keyword-based interpretation + metric-based narrative when OpenAI is unavailable.
**Why:** The system should not be fully non-functional if the LLM API is down or slow.

### Column Auto-Detection by Name
**Decision:** Search for known column name patterns instead of hardcoding IDs.
**Why:** Monday.com column IDs are opaque (e.g., "numbers8"). Name-based detection works across different board configurations without manual mapping.

## Interpretation: "Leadership Updates"

**My interpretation:** The agent should produce output that a founder can directly paste into a board meeting deck, investor update, or leadership Slack channel — without further editing.

**Implementation:**
- Every response includes structured `leadership_bullets` formatted as "Category: Detail" (Risk, Opportunity, Recommendation, Data Caveat).
- The LLM narrative prompt explicitly instructs: produce output suitable for a leadership update.
- The summary is written in the tone of an executive briefing — specific numbers, not vague statements.
- Data quality caveats are included so the founder knows the confidence level before sharing.
- The "leadership_brief" intent triggers a full cross-board analysis across both Deals and Work Orders.

## Trade-offs Chosen

| Trade-off | Reasoning |
|---|---|
| No database/caching | Live API calls are acceptable for a prototype. Production: Redis cache with 5-min TTL. |
| In-memory session store | Simple and sufficient for prototype. Production: Redis or database-backed sessions. |
| 500-item board limit | Avoids pagination complexity. Covers most real boards. Production: cursor pagination. |
| No backend auth | Prototype scope. Production: JWT or API key middleware. |
| Inline styles (no CSS framework) | Faster iteration. The intelligence is in the backend, not the UI polish. |
| Name-based cross-board linking | No explicit foreign key between Deals and Work Orders boards. Name/sector matching is the best heuristic available without schema changes. |

## What I'd Do Differently With More Time

1. **Cursor-based pagination** — Handle boards with 500+ items properly.
2. **Redis caching** — Cache Monday.com API responses (5-min TTL) to reduce latency and API rate-limit risk.
3. **Streaming responses** — Stream the LLM narrative to the frontend for perceived speed.
4. **Chart visualizations** — Add simple bar/pie charts for sector breakdown and pipeline stages using a lightweight library.
5. **Board schema discovery** — On first connection, introspect all boards and their column types, then cache the schema. This would replace the name-based column guessing with exact type mapping.
6. **Multi-turn refinement** — Let the user say "drill into mining sector" and the agent refines the prior query with filters.
7. **Export to PDF/Slides** — Generate a downloadable leadership update document.
8. **Webhook-based refresh** — Subscribe to Monday.com board changes instead of polling.
9. **User authentication** — Proper login flow so multiple users can have separate sessions and API tokens.
10. **Comprehensive test coverage** — Integration tests against a mock Monday.com API, not just unit tests on the normalizer.
