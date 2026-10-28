# Slack setup

## Create a workspace app

Use a development Slack workspace you control. Create an app, enable a bot user and Socket Mode, and generate an app-level token with `connections:write`.

Minimum bot OAuth scopes for the implemented text path:

- `chat:write` for replies.
- `app_mentions:read` for mentions.
- `im:history` for direct-message events.
- Optional `files:read` only when you intend to process accessible attachments.

Subscribe to bot events `app_mention` and `message.im`. Enable the Messages tab in App Home so users can send DMs. Install the app to your workspace, authorize the requested scopes and reinstall when scopes change. Invite it to the test channel before mentioning it. Private-channel access requires workspace authorization and membership; this project does not bypass Slack permissions.

Save in AgentFlow Connections:

| Setting | Meaning |
|---|---|
| SLACK_BOT_TOKEN | Installed bot token, normally xoxb-… |
| SLACK_APP_TOKEN | Socket Mode app-level token, normally xapp-… |
| SLACK_TEAM_ID | Exact authorized workspace ID |
| SLACK_MODE | `socket` |
| SLACK_HANDOFF_CHANNEL | Optional channel ID for internal alerts |

Start the web app and worker, then run `npm run slack` in a separate terminal. The listener persists valid events before acknowledging them. The SDK manages the WebSocket connection. Restart after changing credentials.

## Conversation behavior

Unthreaded DMs retain one customer conversation. Channel mentions reply in their thread. Keys also include workspace and user; no automatic cross-user or cross-channel identity merging occurs. Events from another workspace, bot-generated messages and unsupported event types are ignored to prevent loops.

The operator can take over a conversation in AgentFlow and reply through its original Slack channel/thread. Handoff notifications are separate internal messages and must not be mistaken for customer replies.

## Optional HTTP events

Choose `SLACK_MODE=webhook`, save the Slack Signing Secret and configure the public HTTPS `/api/hooks/slack` request URL through the dedicated ingress. Slack's URL challenge is answered only after signature verification. Request timestamps older/newer than the allowed freshness window are rejected. Do not run Socket Mode and HTTP delivery as if they were two independent sources for the same app.

## Acceptance test

Send a DM, then a follow-up referring to your previous message. Confirm continuity. Mention the bot in a channel and verify a threaded reply. Request a human, check the internal alert and send an operator reply. Confirm a bot reply does not trigger another bot reply. Try an event with an invalid signature in the test harness; it must be rejected without creating a conversation.

Official references: https://docs.slack.dev/apis/events-api/using-socket-mode/ ; https://docs.slack.dev/app-management/quickstart-app-settings/ ; https://docs.slack.dev/surfaces/app-home/
