# Verification record

## Verified source revision

**Source commit:** `dee7261e0049d74365d34b564eb68fdbacf24e06`  
**Date:** October 28, 2026  
**GitHub Actions:** [Run 40627068421 — all three jobs passed](https://github.com/3mk-ml/AI-Agent/actions/runs/40627068421)

The subsequent handover commit changes documentation only. The source revision above is the exact code exercised by this record; later source changes require a new run.

## Observed automated results

| Check | Windows | Linux |
|---|---|---|
| Dependency installation | PASS | PASS |
| 31 core and workflow-structure tests | PASS | PASS |
| TypeScript check | PASS | PASS |
| Optimized Next.js production build | PASS | PASS |
| Four credential-free browser smoke/security tests | Not run | PASS |
| Twelve native PostgreSQL business scenarios | Not run | PASS |
| One database-backed operator/customer browser journey | Not run | PASS |

The database test runner reports 13 passing Node test entries because it counts the enclosing parent test as well as its **12 business subtests**. Do not describe that as 13 independent business scenarios. Browser coverage is four credential-free cases plus one multi-step database-backed journey, for five browser tests.

All jobs use native processes. The PostgreSQL job installs PostgreSQL and pgvector directly on its Linux runner; it does not use Docker. This verifies PostgreSQL behavior, not access to a user's hosted Supabase project.

## What was exercised

### Core and workflow structure: 31 tests

Twenty-four core tests cover secret comparisons; signed token purpose, expiry and tampering; salted password hashes; Slack/Meta raw-body signatures and replay freshness; channel/account/session isolation; text chunking; vector validation; explicit lead scoring; retry bounds; the WhatsApp service-window boundary; secret redaction; Telegram commands/media/filtering; stable Slack DM keys and thread isolation; and WhatsApp account filtering.

Seven workflow tests verify exported JSON graph structure, referenced nodes, inactive status, header authentication and the actual AI Agent/model/memory/six-tool configuration. These are **structural tests**, not an n8n runtime import or execution test.

### Native PostgreSQL: 12 business scenarios

1. Apply migrations to a fresh database and rerun them safely.
2. Submit the same inbound event concurrently and retain one message and one inbound job.
3. Update a lead without losing earlier supplied facts; verify explicit score factors.
4. Prevent a conversation from selecting another customer's lead through model arguments.
5. Deduplicate source lead intake transactionally.
6. Reject booking against another conversation's lead.
7. Submit competing reservations simultaneously: exactly one succeeds and the other receives a conflict.
8. Repeat a successful booking without creating a duplicate, and remove its slot from availability.
9. Make human takeover idempotent, invalidate stale actions and suppress stale AI replies.
10. Update inactivity when a customer returns and skip follow-ups without consent.
11. Enforce database-backed request limits.
12. Store and compare a real 768-dimensional pgvector value.

The final vector fixture is explicitly synthetic. It proves storage/operator compatibility, **not** that Gemini generated an embedding or that retrieval quality is adequate.

### Browser checks

The credential-free tests verify first-run administrator setup, navigation through the workspace, honest disconnected states, responsive mobile width, sidebar opening/closing including Escape, customer-chat configuration errors, rejection of unauthenticated access to CRM/settings/inbox/executions, and rejection of cross-origin authentication mutation.

The database-backed browser journey uses a disposable database and fictional records. It:

- Creates a customer through the CRM form and verifies the persisted row through the authenticated API.
- Reads real available slots, selects a customer, explicitly confirms and saves an appointment.
- Opens a website customer session and stores an inbound message.
- Finds that conversation in Unified Inbox, takes over and queues an operator reply.
- Confirms human mode and verifies a queued, undelivered operator reply is not falsely exposed as delivered to the customer.
- Opens the populated overview and checks mobile overflow.

The worker and external providers are deliberately not started during this browser journey. It verifies real application/database operations, **not an AI-generated reply or provider delivery**.

## Visual evidence

The run's `verification-PostgreSQL` artifact contains:

- `test-results/relationships-populated.png`
- `test-results/appointments-populated.png`
- `test-results/inbox-populated.png`
- `test-results/overview-populated.png`
- `test-results/overview-populated-mobile.png`
- `test-results/database-tests.txt`
- The Playwright HTML report.

The populated desktop dashboard, CRM, appointments, inbox and mobile overview were visually inspected. These are screenshots of the application backed by fictional CI test records, not live customer activity. The development-mode Next.js indicator can appear in screenshots; it is not an application control.

The `verification-Linux` artifact contains the credential-free browser report/screenshots. Windows and Linux artifacts also include their resolved dependency lockfiles. Artifact retention is limited; download relevant evidence from the run before its configured expiry.

## Defects found and repaired during verification

Earlier iterations caught embedding/worker TypeScript errors, an ambiguous browser alert selector and a mobile-overlay test click hidden behind the sidebar. Those were corrected and rerun.

The populated browser test then exposed a real website-session SQL error: one uncast parameter was used as both a UUID primary key and a text external key. The final source revision uses separate explicitly typed parameters. The complete customer-session and inbox journey now passes against native PostgreSQL.

## Live integrations still NOT RUN

No real Supabase, Gemini, Meta, Telegram or Slack credentials were supplied to the build environment. Provider authentication, quotas, account approvals and actual delivery cannot be inferred from compilation, mocks, normalized fixtures or local database tests.

| Test | Current status / next evidence required |
|---|---|
| User's Supabase session-pooler and TLS connection | NOT RUN; configure the intended development project |
| Real Gemini chat response and model quota | NOT RUN; authorized API key/model required |
| Actual document embeddings and grounded retrieval | NOT RUN; index real demo text through Gemini |
| n8n workflow import, credential binding and publication | NOT RUN against a running n8n instance |
| Customer agent calling CRM/booking tools through n8n | NOT RUN; verify a correlated execution ID and resulting records |
| Persistent n8n memory across restarts | NOT RUN |
| Real Telegram inbound/outbound/operator reply | NOT RUN |
| Real Slack DM/thread response and handoff notification | NOT RUN |
| Real WhatsApp inbound/outbound/template and status receipt | NOT RUN |
| Provider media download and Gemini interpretation | NOT RUN |
| AI enrichment, triage, extraction and eligible follow-up drafting | NOT RUN against Gemini |
| Reviewed Airtable or Google Sheets export | NOT RUN against destination accounts |
| n8n error-trigger failure alert to Slack/SMTP | NOT RUN |
| Outbound timeout/restart recovery with an actual provider | NOT RUN |
| End-to-end prompt-injection and factual-grounding evaluation | NOT RUN against the configured model/knowledge base |

Record commit SHA, date, inputs, actual result, execution/provider IDs and PASS/FAIL/BLOCKED for these tests. No configuration or import step alone should be marked as a successful live customer journey.

## Reproduce

Use a clean checkout, install dependencies, then run `npm test`, `npm run typecheck`, `npm run build`. Browser tests require Playwright Chromium and a disposable runtime directory. Do not run first-user setup tests against your personal configured workspace.

The native database suite additionally requires `AGENTFLOW_DATABASE_TESTS=1` and a loopback database named exactly `agentflow_ci`; it refuses an arbitrary or remote database. This safeguard protects real data. The committed CI YAML is the reproducible reference for its setup.

For Windows startup and account configuration, see [FIRST_RUN_CHECKLIST.md](FIRST_RUN_CHECKLIST.md). Use a fresh database for this implementation rather than applying its schema over an earlier independently generated Codex project.
