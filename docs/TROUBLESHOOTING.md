# Troubleshooting

## The app opens but pages report DATABASE_URL is not configured

The web interface can run before its database. Open Connections, save a PostgreSQL session-pooler URL and apply migrations. This application does not silently replace Supabase with fabricated local records.

## PowerShell says n8n is not recognized

A missing command can mean an incomplete installation or PATH issue. Run `powershell -File scripts/n8n.ps1 -Action status`. If your installer is still running, inspect its final output rather than launching another installation. Dependency warnings are not the same as a non-zero exit. Preserve the npm cache. The application and n8n are separate installations/processes.

## npm ci fails

A fresh checkout without a committed lockfile must use `npm install` first. The current CI uploads its resolved `package-lock.json` with the verification artifacts; do not assume `npm ci` works without a matching lockfile. Never delete the cache as a generic response to dependency warnings.

## Login/setup does not work

Run `npm run setup` from the repository folder. Use its one-time token at `/login` and a password of at least 12 characters. Do not delete runtime keys to reset a configured workspace: losing the encryption key makes saved settings unreadable. Local setup is intended for one trusted machine/account. There is no email password-reset system in this MVP.

## Database password or TLS error

The password is the project's database password, not the Supabase anon/service-role API key. Replace the URL placeholder and percent-encode reserved password characters. Use the exact session-pooler username/hostname. Download the project CA when needed, configure its local path and restart the worker after configuration changes. Do not disable TLS verification. Run `npm run doctor` for sanitized diagnostics.

## relation agentflow.* does not exist / extension missing

Apply migrations using an account permitted to create the schema and required extensions. Check the final migration error, not just connectivity. `vector` and `btree_gist` must be available. Do not manually remove migration tracking rows on an existing database. Runtime queries search `agentflow,public,extensions` so vector types/operators work with the supported extension locations.

## Queue never processes

Start `npm run worker` in a separate terminal using the same project folder and credentials. Only one worker may hold its database lease. The overview heartbeat becomes stale when it stops. A job marked `pending` is not a completed automation.

## Chat is received but no AI answer appears

Check all four layers: database persistence, worker terminal, published n8n production webhook and provider/model credentials. Do not use an n8n test webhook URL. The Header Auth value must exactly match `N8N_WEBHOOK_SECRET`. Tools require the different `TOOL_SECRET`. Inspect Activity & logs for correlated errors. A failed agent request can move the conversation to human handling; fix the cause and explicitly Resume AI before another test.

## n8n tool request returns 401/409

The tool header and short-lived conversation capability are both required. Capabilities expire and are invalidated by conversation-mode changes. Never paste an old capability into a production test. Retry from a fresh customer message after confirming the conversation is in AI mode. Do not remove checks to make a test pass.

## Knowledge indexing fails or no sources match

Confirm an embedding model exists for the account and supports the requested 768 dimensions. Quota/access failures are real blockers. The worker must be running. A document must reach `ready`; a saved row alone is not indexed knowledge. Re-add/re-index after model changes. No matching context should produce an honest fallback rather than invented company policy.

## Telegram 409 or polling refuses to start

Only one polling process should own the bot. Stop other pollers and avoid an n8n Telegram Trigger registering a competing webhook. Use the explicit Prepare Telegram for polling action only when you intend to remove the bot's existing webhook. The application preserves pending updates.

## Slack receives nothing

Confirm Socket Mode is enabled, app-level token has connections:write, the installed bot has required scopes, bot events are subscribed and `SLACK_TEAM_ID` matches the actual workspace. Reinstall after permission changes. Enable DM messaging in App Home. Invite the bot before testing a channel mention. This app intentionally ignores bot events and unrelated channel traffic.

## WhatsApp webhook verification or delivery fails

Verification token, App Secret, access token and Phone Number ID are different values. Check callback HTTPS availability and app/account message subscriptions. The verify challenge must reach the dedicated ingress. A test recipient may need provider-side authorization. Free-form replies outside the allowed window are rejected; use an approved template with recorded consent rather than an unofficial workaround.

## Message status is unknown

Do not blindly resend. A timeout may have occurred after provider acceptance. Check the provider's records and stored IDs, then reconcile explicitly. Unknown messages are intentionally not auto-retried.

## Document export unavailable

Configure Airtable PAT/base/table or a Google service-account JSON and Sheet ID. Airtable should have text fields `RecordID`, `Kind`, `Title`, `Payload`. Create a Google Sheets tab named `AgentFlow` and share the spreadsheet with the service-account email. Review the extracted record before export. Export uncertainty is recorded rather than silently duplicated.

## Changing models, ports or configuration

Environment variables override encrypted local settings. Stop relevant listeners/workers and restart after token/mode changes. When moving the application URL, regenerate/import workflow copies and update provider callbacks deliberately. Temporary tunnel URLs can change. The current n8n workflows default to a local application, not a remote n8n Cloud instance reaching your private localhost.

## Logs and support evidence

Share the failing command, sanitized final error, commit SHA and relevant execution ID. Redact passwords, URLs containing credentials, tokens, setup keys, customer messages and service-account JSON. Do not publish `.runtime`, `.env*` or n8n credential exports in an issue.
