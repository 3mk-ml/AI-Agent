# Credentials and real integration verification

## Security

The database password, Gemini API key and n8n API key supplied in chat must be **revoked and replaced**. Do not commit them, copy them into workflow JSON, or write them to this public repository. Enter new values privately through AgentFlow Connections, a locally ignored `.env.local`, or protected GitHub Actions secrets. Never share screenshots containing credentials.

## Local credential preparation

```powershell
cd C:\Users\hp\AI-Agent
git pull --ff-only
npm install --prefer-offline --no-audit --no-fund
npm run setup
npm run secrets:generate
npm run secrets:show-n8n
```

The generator creates missing `N8N_WEBHOOK_SECRET`, `TOOL_SECRET`, `INGEST_SECRET`, `TELEGRAM_WEBHOOK_SECRET`, and `WHATSAPP_VERIFY_TOKEN` locally using cryptographically secure randomness. It stores them in existing encrypted settings, without printing secret values by default or overwriting existing values. The show commands reveal the selected values **only to your private local terminal**, to configure n8n or provider webhook credentials. Never post that output.

## Required provider configuration

| Variable | Source | Purpose |
|---|---|---|
| DATABASE_URL | Supabase Connect: session pooler host, full username, new DB password, port 5432, postgres database | CRM, memory, appointments, pgvector |
| DATABASE_CA_FILE | Optional verified CA certificate | PostgreSQL TLS |
| GEMINI_API_KEY | Newly created Google AI Studio key | Gemini generation, embeddings |
| GEMINI_MODEL | Available Gemini chat model | Chat |
| GEMINI_EMBEDDING_MODEL | Available model supporting 768 output dimensions | RAG |
| N8N_URL | http://127.0.0.1:5678 | Local n8n API |
| N8N_WEBHOOK_URL | http://127.0.0.1:5678/webhook/agentflow-chat | Published AF-01 |
| N8N_API_KEY | Newly created n8n API key | Import workflows |
| N8N_WEBHOOK_SECRET | Locally generated | HTTP Header Auth name X-AgentFlow-Webhook-Secret |
| TOOL_SECRET | Locally generated | HTTP Header Auth name X-AgentFlow-Tool-Secret |
| INGEST_SECRET | Locally generated | HTTP Header Auth name X-AgentFlow-Ingest-Secret |

n8n credentials must be bound within the editor: **AgentFlow webhook** (Header Auth), **AgentFlow tools** (Header Auth), **AgentFlow intake** (Header Auth), **AgentFlow Gemini** (Gemini API), and **AgentFlow Postgres** (Supabase PostgreSQL session pooler with verified SSL). Importing JSON does not import credential IDs. The Supabase pooler login often has format `postgres.PROJECT_REF`, not simply `postgres`; always use the username supplied by Supabase Connect.

## Optional account-issued credentials

These **cannot** be locally generated: `TELEGRAM_BOT_TOKEN` (BotFather), `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_TEAM_ID`, optional `SLACK_SIGNING_SECRET` and `SLACK_HANDOFF_CHANNEL`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`, `META_GRAPH_VERSION`, `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`, `AIRTABLE_TABLE_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SHEET_ID`, and optional SMTP host/port/user/password/from/recipient.

The local generator creates `TELEGRAM_WEBHOOK_SECRET` and `WHATSAPP_VERIFY_TOKEN` independently; they do not replace the official provider-issued tokens.

## Testing status and limitations

Existing GitHub Actions verify unit tests, workflow structure, TypeScript, production build, native disposable PostgreSQL behavior, and browser journeys; see [TEST_RESULTS.md](TEST_RESULTS.md). These are **not** evidence of a live Gemini answer or n8n execution.

After the replacement credentials are entered on the development PC, run `npm run doctor`, ensure app, worker and n8n are running, import and publish AF-01, then test a website chat. Verify real output, indexed knowledge, lead creation, explicitly confirmed appointment, human handoff, database rows and correlated n8n execution IDs.

**GitHub-hosted Actions cannot reach the n8n instance on your computer at 127.0.0.1.** To test the actual local workflow, use the running Windows application and n8n, not an internet-hosted CI runner. Do not expose your n8n editor or application dashboard through a public tunnel merely for testing.

Keep secrets in the encrypted Connections settings or a gitignored local environment file. Exposed secrets must be rotated before any live deployment.
