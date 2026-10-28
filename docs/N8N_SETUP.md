# Native n8n setup — Windows, no Docker

## 1. Reuse the existing installation

```powershell
powershell -File scripts/n8n.ps1 -Action status
```

If your earlier `npm install -g n8n` is still running, do not launch another installer. After it finishes, check `n8n.cmd --version`. When n8n is genuinely missing, the optional install action uses the npm cache where possible:

```powershell
powershell -File scripts/n8n.ps1 -Action install
```

The script defaults to the project's target n8n `2.45.4`, checks package engine requirements and never silently upgrades an existing installation. Installation is separate from application dependencies. Confirm the version with the actual CLI, not an old screenshot or README.

```powershell
powershell -File scripts/n8n.ps1 -Action start
```

Open `http://127.0.0.1:5678` and create the n8n owner account locally. The script keeps the existing n8n user-data directory and binds to loopback. Do not run the editor through a public tunnel. `N8N_SECURE_COOKIE=false` is only for this local HTTP arrangement; it is not a production recommendation.

## 2. Set up the application database first

Run AgentFlow, initialize the operator, save `DATABASE_URL`, and apply migrations. The schema includes `agentflow.chat_memory`. Use the Supabase **session pooler**, normally its supplied pooler hostname and port 5432. Copy the exact username and host shown by your project's Connect dialog; don't substitute a guessed hostname. A transaction pooler on port 6543 is unsuitable for the session locks used by this app.

For TLS errors, obtain the project's CA certificate and configure `DATABASE_CA_FILE` locally. The application intentionally verifies remote certificates. Do not work around errors using `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## 3. Create credentials in n8n

In AgentFlow Connections, generate and save strong random secrets. Then create the matching n8n credentials. Values must match exactly; header names are case-insensitive.

| Credential label | n8n credential type | Required values |
|---|---|---|
| AgentFlow webhook | HTTP Header Auth | Name `X-AgentFlow-Webhook-Secret`; value equals `N8N_WEBHOOK_SECRET` |
| AgentFlow tools | HTTP Header Auth | Name `X-AgentFlow-Tool-Secret`; value equals `TOOL_SECRET` |
| AgentFlow intake | HTTP Header Auth | Name `X-AgentFlow-Ingest-Secret`; value equals `INGEST_SECRET` |
| AgentFlow Gemini | Google Gemini / Google PaLM API credential | Your Gemini API key and official provider host |
| AgentFlow Postgres | Postgres | Session-pooler host, database `postgres`, supplied username/password, verified SSL |

The Gemini credential uses n8n's internal `googlePalmApi` identifier; this is an n8n credential name, not a request to use a retired model. Choose a currently accessible Gemini chat model in the model node. Set a corresponding usable `GEMINI_MODEL` in AgentFlow for enrichment, document extraction and triage.

Credentials are deliberately absent from Git. Labels in exports are not real credential IDs.

## 4. Import drafts

The editor can import each JSON file from `workflows/`. Alternatively, create an n8n API key in the owner account, save `N8N_URL=http://127.0.0.1:5678` and `N8N_API_KEY` in AgentFlow, then run:

```powershell
npm run workflows:import
```

The importer creates drafts only, preserves existing workflows with matching names, strips placeholder credential references and does not send external messages. Bind the credentials in every imported node. The importer does not overwrite later workflow edits.

## 5. Configure the shared agent

Open **AF-01 Shared Customer Agent** and check:

- The trigger is a POST webhook with Header Auth and the production path `agentflow-chat`.
- The Gemini node has a usable chat model and credentials.
- Postgres memory uses `agentflow.chat_memory`, with a session key from the trusted webhook body.
- Every business tool uses the `AgentFlow tools` credential and points to `http://127.0.0.1:3000/api/tools`.
- The response node returns `output` and the n8n execution ID.
- The six tools are connected to the AI Agent's tool input, not its ordinary main input.

Publish/activate the workflow using the installed version's controls. In AgentFlow, save the **production webhook URL**, normally `http://127.0.0.1:5678/webhook/agentflow-chat`. Do not use `/webhook-test/` for normal operation.

Keep the Next.js application and `npm run worker` running. Add knowledge and wait for a real `ready` indexing status before testing grounded answers.

## 6. Other workflows

**AF-02** accepts authenticated `{eventId,source,lead}` intake, where source is `form`, `email` or `ads`. Use a stable source event ID. Incoming duplicate events do not create extra leads. This is an intake adapter, not a preconfigured Gmail or advertising-account connection.

**AF-05** runs an hourly draft preparation check. Enable it only after reviewing the consent/inactivity policy. It does not send marketing messages.

**AF-06** accepts `{kind,title,text,clientId}` or a bounded base64 PDF/image payload for asynchronous triage/document extraction. `kind` is `triage` or `document`. Its response means queued, not processed.

**AF-20** is a reusable sub-workflow accepting a signed context and allowed tool action. The initial shared agent uses HTTP tool nodes directly; AF-20 is provided for later orchestration reuse, not falsely represented as an already exercised call path.

**AF-99** records n8n failures and queues configured Slack/SMTP alerts. Select it as the error workflow in other workflows' settings. Error-trigger workflows are invoked by failures; do not test them only by manually pressing Execute. Do not configure AF-99 to recursively trigger itself.

## 7. Acceptance proof

From website chat: ask a knowledge question, create a fictional lead, check a future slot, explicitly confirm a booking, then request a human. Verify the database-backed CRM/inbox/appointments and corresponding n8n execution IDs. Repeat with two separate browsers for isolation. Test an unavailable slot and a controlled provider failure. A successful JSON import or green authentication diagnostic does not prove these behaviors.

## Sources

- n8n AI Agent documentation: https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/
- n8n Gemini node source: https://github.com/n8n-io/n8n/tree/master/packages/@n8n/nodes-langchain/nodes/llms/LmChatGoogleGemini
- n8n Postgres memory source: https://github.com/n8n-io/n8n/tree/master/packages/@n8n/nodes-langchain/nodes/memory/MemoryPostgresChat

Workflow node structures were checked against available official source. Runtime import and execution must still be validated against the installed version.
