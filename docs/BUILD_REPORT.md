# Build report and requirements coverage

## Delivery

Source, workflows, database migrations, tests and setup documentation are committed directly to `3mk-ml/AI-Agent`. The implementation uses Next.js/React/TypeScript, native Node workers, PostgreSQL/pgvector, Gemini integrations and an actual n8n AI Agent workflow definition. No Docker or WSL containers are required.

**Verified source:** `dee7261e0049d74365d34b564eb68fdbacf24e06`. [GitHub Actions run 40627068421](https://github.com/3mk-ml/AI-Agent/actions/runs/40627068421) passed all three jobs: Windows quality checks, Linux quality/browser checks, and native PostgreSQL business/browser tests. See [TEST_RESULTS.md](TEST_RESULTS.md) for the exact evidence and limits.

## Coverage matrix

| Requirement | Implementation | Verification boundary |
|---|---|---|
| Conversational agent | AF-01 actual n8n AI Agent, Gemini and six business tools | Workflow structure tested; live n8n/model execution still requires credentials |
| Website chat | Signed isolated customer session and persistent incoming-message flow | Database-backed browser journey passed; live AI response not tested |
| WhatsApp | Official Cloud API adapter, signed ingress, media, reply window, templates and receipts | Signature/normalizer/window unit tests passed; live Meta account tests not run |
| Telegram | Private chats, polling/webhooks, commands, inline actions and attachments | Normalizer/filter tests passed; live bot account tests not run |
| Slack | Socket Mode/HTTP, DMs, mentions/threads and handoff notifications | DM continuity, thread/workspace isolation and signature tests passed; live app tests not run |
| Unified inbox | History, filtering, notes, AI pause/resume and queued operator replies | Database-backed browser takeover/reply-queue test passed; external delivery not run |
| CRM | Validated records, lifecycle, explicit completeness score and separate AI advisory enrichment | Real native PostgreSQL and browser creation/update tests passed; Gemini enrichment not run |
| Lead capture | Atomic idempotent form/email/ads intake workflow | Concurrent native PostgreSQL intake test passed; upstream accounts not connected |
| Appointments | Internal calendar, explicit confirmation, transactional deduplication and overlap exclusion | Native concurrent conflict tests and browser booking journey passed |
| Conversation memory | n8n Postgres Chat Memory with scoped session keys | Export/source structure and key isolation tested; live n8n restart memory not run |
| RAG | Document chunking, Gemini embeddings, model-aware vector search and source metadata | Chunk/vector logic and native pgvector storage tested; actual embedding/retrieval evaluation not run |
| Human handoff | Persistent handoff, mode/version guards, operator reply and optional notification | Native stale-action suppression and browser takeover passed; provider notifications not run |
| Email/message triage | Category, urgency, summary, reply draft and routing owner | Implementation and schema checks included; no native Gmail/IMAP mailbox connection |
| Document processing | Text/PDF/image extraction and reviewed Airtable/Sheets export | Live model extraction and destination-account tests not run |
| Follow-ups | Scheduled inactive-lead drafts with consent, deduplication and failed-draft recovery | Native no-consent/inactivity behavior tested; model drafting not run; no automatic marketing send |
| Modular n8n workflows | Six JSON exports plus reusable authorized-tool sub-workflow | Seven structural tests passed; real import/execution not run |
| Reliability | Durable queue, bounded retry, uncertain-delivery state, error records and optional alerts | Core/database controls tested; real provider failure/restart scenarios not run |
| Security | Separate sessions, signed webhooks, scoped tools, encrypted local settings and SQL constraints | Unit, native DB and browser authorization checks passed; not a penetration audit |
| Handover | Architecture, native setup, channel guides, prompts, tests and recording outlines | Video recording and support contract are not fabricated |

## Product design

The responsive operations console contains nine workspace sections plus public chat and administrator setup/login. It uses a consistent navy/mint design system, purposeful empty/error states, accessible controls, desktop navigation, mobile navigation, tables, status indicators and meaningful database-derived analytics. Screenshots of populated desktop/mobile views were reviewed from the passing CI run.

No generated AI message, provider receipt or business statistic is shown as live merely to fill the interface. CI fixtures are fictional and are not automatically installed into a user's database.

## Scope limitations

This is a single-business, single-administrator MVP. Team RBAC, a multi-operator assignment directory, multi-tenant hosting and automatic cross-channel account linking are not implemented. The internal CRM/calendar are not synchronized with HubSpot, GoHighLevel or Google Calendar. Email/form/ads integrations expose authenticated intake adapters; they do not themselves log into a live email inbox or advertising account.

The worker is deliberately single-process. No benchmark establishes production-scale throughput. Failed payloads and transcripts need an operational retention policy. LLM JSON validation is not proof of factual correctness. The retrieval threshold requires a business-specific evaluation set. Provider messages can have ambiguous delivery outcomes; the system avoids blindly resending those outcomes rather than promising universal exactly-once delivery.

Attachment interpretation is not a Vapi/Retell telephone voice agent. Meta approval, account eligibility, workspace authorization, network reachability from Yemen and provider quotas cannot be granted or assumed by the repository.

Follow-ups are reviewable drafts. Exporting a reviewed document or sending an operator reply is an explicit account-side action. No campaign, payment or unsolicited bulk message is performed by this delivery.

## Reproducibility

Top-level framework versions are specified in package.json. Fresh Windows/Linux CI installation, TypeScript and production builds passed. CI includes its resolved package-lock.json in verification artifacts. A committed cross-platform lockfile remains a reproducibility improvement; first checkout currently uses `npm install`, not `npm ci` without a lockfile.

The native database test uses disposable local PostgreSQL/pgvector without containers. Its synthetic vector test must not be represented as a successful Gemini embedding test. Provider account tests remain separate.

## First run and safe migration

Follow [FIRST_RUN_CHECKLIST.md](FIRST_RUN_CHECKLIST.md). Use a fresh Supabase development project/database for this implementation rather than applying its schema over an earlier Codex-generated application that happens to use the same schema name. Preserve the older project for comparison. Enter credentials locally; never commit them to this public repository.

## Challenge reporting

This GitHub-assisted implementation is its own build. Do not copy it into Cline/OpenCode/Codex runs and claim those tools independently produced the same code. Record any shared assistance, real costs, duration, network failures and acceptance results. The repository supplies a 2–3 minute challenge script and a longer handover outline; it does not contain a recorded video or a promise of 14 days of future support.
