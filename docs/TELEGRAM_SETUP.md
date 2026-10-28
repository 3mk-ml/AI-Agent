# Telegram setup

## Private bot chats, polling mode

Create a bot using Telegram's verified BotFather and `/newbot`. Save its token in AgentFlow Connections as `TELEGRAM_BOT_TOKEN`; never publish it. Set `TELEGRAM_MODE=polling`.

Initialize the database, configure the shared n8n agent and start:

```powershell
npm run dev
```

In separate terminals, from the same project folder:

```powershell
npm run worker
npm run telegram
```

Open the bot in your own Telegram account and press Start. This implementation intentionally ignores group chats and other bots. It supports `/start`, `/help`, `/services`, `/book`, `/status`, `/human`, plus allowlisted inline buttons. Polling offsets are persisted only after durable ingestion; run one poller per bot. A second poller using the same database is rejected by a lease.

If Telegram already has a webhook registered, the poller refuses to start. Use Connections → **Prepare Telegram for polling**, confirm the account change, save polling mode and restart the listener. Pending updates are not deleted. Do not configure the same bot in a separate n8n Telegram Trigger at the same time.

## Optional webhooks

Choose one mode only. In webhook mode expose the dedicated ingress and register your HTTPS `/api/hooks/telegram` URL through Telegram's `setWebhook`, including the same secret as `TELEGRAM_WEBHOOK_SECRET`. Telegram supplies it in `X-Telegram-Bot-Api-Secret-Token`. Stop the poller before switching. The application validates the header and rejects webhook deliveries while configured for polling.

Webhook registration is an account-side action; it is not automatically performed when merely saving a URL. A trusted administrator or coding agent must call the documented Bot API locally without logging the token.

## Live test

Send a company question and confirm a real reply. Supply a fictional customer name, ask for a future appointment, confirm the selected time and inspect the CRM/calendar. Send `/human`, verify AI pauses, then use Unified Inbox → Take over/Reply. The operator reply must arrive in Telegram. Repeat an earlier conversation after restarting the listener to verify memory continuity.

Small supported photos, PDFs and voice/audio attachments are fetched through the provider, bounded at 8 MB and interpreted through Gemini. Unsupported formats produce a text fallback, not a fabricated transcription. This is not telephone voice calling.

A `sent` status means the provider accepted the message; it is not a read receipt.

Official references: https://core.telegram.org/bots ; https://core.telegram.org/bots/api ; https://core.telegram.org/bots/faq
