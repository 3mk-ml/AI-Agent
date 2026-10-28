# WhatsApp Business Cloud API setup

This adapter uses Meta's official Cloud API. It does not automate WhatsApp Web, scrape sessions or control a personal WhatsApp account.

## Provider account preparation

Create/configure a Meta developer app with WhatsApp access and use the test phone-number environment where your account offers it. Live business use depends on Meta account eligibility, phone-number setup, permissions and any required business/app verification. Code in this repository cannot grant those approvals.

Copy from your own Meta app/account:

- WhatsApp access token with the permissions required for the chosen test/live account.
- Phone Number ID and WhatsApp Business Account ID.
- Meta App Secret for webhook signature validation.
- A supported Graph API version for your app.

Save them in AgentFlow Connections. Generate a separate random webhook verify token; it is not the App Secret and not the access token. Temporary test tokens can expire. Follow the account's supported token lifecycle for live operation.

## HTTPS ingress

Keep the app on loopback port 3000 and n8n on loopback port 5678. Run:

```powershell
npm run ingress
```

Publish only port 3001 through a secure HTTPS tunnel or a suitably restricted reverse proxy. The ingress permits only the three provider webhook paths, not operator pages or database/tool endpoints. A temporary tunnel URL may change when restarted and is not durable production hosting.

Set Meta's webhook callback to:

```text
https://YOUR-PUBLIC-INGRESS/api/hooks/whatsapp
```

Enter the same verify token saved in AgentFlow. The verification GET checks `hub.mode` and the token before returning the challenge. Subscribe the correct WhatsApp account/app to message events. POST requests are verified using the App Secret against the exact raw body and `X-Hub-Signature-256`. Events for another Phone Number ID are ignored.

## Sending rules and receipts

Free-form replies are restricted by the application's 24-hour customer-service-window check. Outside that window, use a provider-approved template and recorded messaging consent. Confirm the current Meta policy/pricing for the account before live outreach. The app does not make a promise that messages are free or that every template is permitted.

The inbox supports an approved template name/language with no variable parameters through its simple UI. The adapter also accepts body parameters through the authenticated backend. Template approval and exact content/language must match Meta's configuration. The operator's audit text does not create or approve a template at Meta.

`sent` initially means accepted with a provider message ID. Signed status webhooks can advance records to `delivered` or `read`, or mark failure. Do not interpret API acceptance as proof the customer read a message.

## Live acceptance

Use an authorized test recipient. Send a message to the configured business test number, receive a real reply, create a fictional lead and confirm a booking. Inspect the corresponding n8n run and database records. Request a human and reply through the unified inbox. Verify that repeated webhook delivery is deduplicated and invalid signatures create no records.

Supported small images, PDFs and audio can be fetched with provider authorization and processed by Gemini. Downloads are bounded and host-checked. Unsupported media receives a fallback. No voice-call integration is included.

Official entry points for current account setup/policies: https://developers.facebook.com/docs/whatsapp/cloud-api/ ; https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/
