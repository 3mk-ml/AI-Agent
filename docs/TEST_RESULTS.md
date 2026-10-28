# Verification record

## Observed results — October 28, 2026

For commit `26a3c5604d3916562b05ae343ce1c0bc8b944d04`, GitHub Actions run [40624588788](https://github.com/3mk-ml/AI-Agent/actions/runs/40624588788) reported:

| Check | Windows | Linux |
|---|---|---|
| Dependency installation | PASS | PASS |
| 31 core/workflow-structure tests | PASS | PASS |
| TypeScript check | PASS | PASS |
| Optimized Next.js production build | PASS | PASS |
| Browser setup/navigation/mobile layout smoke test | Not run on Windows | PASS |
| Customer-chat disconnected-state browser test | Not run on Windows | Failed test locator: matched both the application alert and Next.js route announcer |

The ambiguous locator has been corrected in the next revision. Mobile screenshot capture now disables transitions and explicitly checks that the collapsed sidebar is outside the viewport. Two additional API authorization checks have been added. These changes require a new run; do not assume they passed from this historical record.

Separately, the exact core source blob `4899c4323cbc7339c8bf0cd43574655c417e12b3` passed 24 isolated Node.js tests locally. CI adds seven workflow structural checks, for 31 total. No core test calls real provider APIs.

## What automated checks do not prove

Workflow JSON tests verify names, graph edges, authentication configuration and the presence of real node types in the exports. They do not start n8n, import credentials or run a live AI conversation. Compilation and disconnected-page smoke tests do not prove database migrations, booking concurrency, embedding quality, provider delivery or restart recovery.

No Supabase, Gemini, Meta, Telegram or Slack production credentials were supplied to the build environment. All corresponding end-to-end tests remain **NOT RUN / require authorized account configuration**.

## Live acceptance matrix

For each test record date, commit SHA, input, actual result, execution/provider IDs and PASS/FAIL/BLOCKED. Do not leave a checkbox implying success without evidence.

| ID | Test | Expected result | Current live status |
|---|---|---|---|
| L01 | Apply migrations to a fresh test database | Schema, indexes, constraints and memory table created | Not run |
| L02 | Restart application/worker | Records remain and only one worker owns its lease | Not run |
| L03 | Index fictional handbook | Actual embeddings, ready status and correct vector dimensions | Not run |
| L04 | Ask supported company question | Retrieved evidence and grounded answer | Not run |
| L05 | Ask unsupported lifetime-hosting question | Honest uncertainty; no invented policy | Not run |
| L06 | Prompt injection in message/document | No secret disclosure or authorization bypass | Not run |
| L07 | Two customer sessions | No cross-customer lead/history access | Not run |
| L08 | Qualify a customer | Persistent own-lead record; explicit score factors; advisory enrichment | Not run |
| L09 | Confirm an available appointment | Persistent booking and truthful confirmation | Not run |
| L10 | Concurrent competing bookings | One reservation; conflict for the other | Not run |
| L11 | Duplicate source/webhook event | One processed event/action, not duplicate records | Not run |
| L12 | Human takeover during agent processing | Subsequent stale AI output suppressed | Not run |
| L13 | Telegram inbound/outbound/operator reply | Actual messages and matching stored provider IDs | Not run |
| L14 | Slack DM continuity and thread isolation | Correct memory scope and no reply loop | Not run |
| L15 | WhatsApp receive/reply/status receipt | Correct account, provider IDs and delivery state | Not run |
| L16 | WhatsApp closed service window | Free-form rejected; approved consented template only | Not run |
| L17 | Email triage | Validated category/urgency/owner/summary/draft | Not run |
| L18 | PDF/image invoice extraction | Structured facts with null unknowns and warnings | Not run |
| L19 | Reviewed Airtable/Sheets export | Correct destination record; no unapproved send | Not run |
| L20 | Follow-up inactivity/consent | One eligible draft; no automatic external message | Not run |
| L21 | n8n controlled failure | Execution ID/reason recorded and configured alert sent | Not run |
| L22 | Simulated outbound timeout after acceptance | Unknown state; no blind automatic resend | Not run |

## Reproduce automated checks

Use a clean checkout, install dependencies, then run `npm test`, `npm run typecheck`, `npm run build`. Browser tests require Playwright Chromium and a disposable runtime directory. The test account password/token are synthetic and used only in CI; never reuse them for a real workspace.

Screenshots and reports, when available, are attached to the corresponding Actions run under `verification-Linux`. Inspect the run's commit SHA because later changes invalidate assumptions about an older result.
