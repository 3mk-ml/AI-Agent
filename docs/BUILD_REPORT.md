# Build report and requirements coverage

## Delivery model

Source is committed directly to `3mk-ml/AI-Agent`. The application uses Next.js/React/TypeScript, native Node workers, Supabase PostgreSQL/pgvector, Gemini and an actual n8n AI Agent workflow. No Docker or WSL containers are used. GitHub Actions checks fresh Windows/Linux installations.

## Coverage matrix

| Requirement | Implementation | Verification boundary |
|---|---|---|
| Conversational agent | AF-01 actual n8n AI Agent, Gemini and six tools | Live model/n8n account required |
| Website chat | Signed isolated customer session and polling UI | Browser disconnected behavior tested; live journey needs DB |
| WhatsApp | Official Cloud API, signed ingress, media, reply window, templates, receipts | Requires Meta account/number/token and HTTPS callback |
| Telegram | Private bot chat, polling/webhooks, commands, inline buttons, attachments | Requires real bot token and user test |
| Slack | Socket Mode/HTTP, DMs, mentions/threads, handoff notifications | Requires installed workspace app/scopes |
| Unified inbox | History, filtering, private notes, human reply and AI pause/resume | Live persistence/delivery requires configured services |
| CRM | Validated records, lifecycle stages, explicit completeness score, advisory AI enrichment | DB and AI evaluation required |
| Lead capture | Atomic idempotent form/email/ads intake workflow | Source systems must call the authenticated adapter |
| Appointments | Internal calendar, explicit confirmation, transactional dedupe, overlap exclusion | Real database concurrency test still required |
| Memory | Postgres Chat Memory and channel/account-scoped identities | Live n8n session-isolation test required |
| RAG | Text ingestion, Gemini embeddings, model-aware pgvector search and source metadata | Real embedding/index/retrieval test required |
| Human handoff | Persistent handoff, mode/version guards, operator replies and notifications | Live provider takeover test required |
| Email/message triage | Classification, urgency, summary, draft reply, routing owner | No native Gmail/IMAP mailbox connector |
| Document processing | Text/PDF/image input, structured extraction, reviewed Airtable/Sheets exports | Live model and destination credentials required |
| Follow-up sequences | Scheduled inactive-lead draft generation with consent and dedupe | Automatic marketing delivery deliberately disabled |
| Modular workflows | Six exports plus reusable authorized-tool sub-workflow | JSON graph tests are not runtime execution proof |
| Error handling | Durable queue, retries, failure records, n8n error workflow, optional Slack/SMTP | Provider failure/recovery tests required |
| Security | Session separation, signed webhooks, scoped tools, encrypted settings, SQL constraints | Not a full audit or production certification |
| Handover | Architecture, native setup, channels, prompts, tests and walkthrough scripts | Video recording/support contract not fabricated |

## Important limitations

One administrator and one business workspace are implemented; team RBAC, multi-tenant hosting and an operator assignment directory are not. A reserved schema field is not proof of an assignment UI. The internal CRM/calendar are not synchronized with HubSpot, GoHighLevel or Google Calendar. Provider identities stay separate unless a future explicit account-linking flow is built.

The initial durable worker is single-process. It favors understandable recovery over throughput. No benchmarks establish production capacity. Error logs and failed payloads need a retention policy. Structured AI output still needs factual review. The RAG similarity threshold needs business-specific evaluation.

Supported media interpretation is not a Vapi/Retell telephone voice agent. WhatsApp template approvals, business eligibility, app installs, service quotas and account access cannot be created by code or assumed to work from Yemen.

## Dependencies and reproducibility

Top-level framework versions are specified in package.json. CI resolves dependencies and includes its package-lock.json in verification artifacts. A committed cross-platform lockfile is a remaining reproducibility improvement; first installation uses npm install. No dependency-download size or local install duration is claimed without measurement.

## Verified versus pending

The exact observed results and run links belong in [TEST_RESULTS.md](TEST_RESULTS.md). A green build means compilation succeeded, not that external APIs or the database were exercised. Do not describe this repository as a fully deployed, approved omnichannel service until the live acceptance matrix passes.
