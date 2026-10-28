# Security boundaries and operations

## Credentials and sessions

Run `npm run setup` once per installation. `.runtime/master.key` encrypts saved provider settings with AES-256-GCM; `.runtime/session.key` signs session/capability tokens. The setup token creates the first operator account and is then removed. Passwords are salted with scrypt. Treat runtime keys, backups and encrypted settings as sensitive. Encryption does not protect against an attacker already controlling the same operating-system account.

Settings are never returned as saved raw values to the browser. New credentials necessarily travel from the local form to the trusted local server; this is credential entry, not public exposure. Never publish the dashboard over plain HTTP. Environment variables override saved settings. No credential is included in committed workflow exports.

Operator and customer cookies have separate signed purposes, HttpOnly access and SameSite restrictions. Administrative mutations enforce same-origin requests. Customer APIs cannot choose arbitrary conversation IDs. Tools require both a separate shared secret and a short-lived signed conversation capability. Every mutating agent tool checks mode/version under a database lock.

## Webhooks

| Ingress | Verification | Slow work |
|---|---|---|
| WhatsApp | Raw-body HMAC with Meta App Secret; account filter | Durable queue after verified event |
| Slack HTTP | Raw-body signing secret plus timestamp freshness; workspace filter | Durable queue before acknowledgment |
| Telegram HTTP | Bot webhook secret header; configured-mode check | Durable queue before acknowledgment |
| Slack Socket Mode | Authorized app-level connection and workspace filter | Persist before ack |
| Telegram polling | Authorized Bot API token, persisted update offset | Advance offset after persistence |

Replay/duplicate resistance relies on provider event IDs and database uniqueness. A valid provider signature is not itself a new-event guarantee. Never use retrieved text or model output to select an authorization scope.

## Public surface

Tunnel only `npm run ingress` on port 3001. It forwards a strict allowlist of provider webhook routes. It does not expose the Next.js operator dashboard, private tools, intake endpoints, n8n editor or database. Never tunnel 3000 or 5678 for this development design.

Raw bodies and uploads have size limits. Media downloads restrict provider hosts, refuse redirects and enforce a streaming byte limit. Text is rendered as React text, not unsanitized HTML. AI prompts treat attachments and knowledge as untrusted input.

## Delivery uncertainty

External APIs can accept a message before a connection fails. The queue marks potentially accepted outbound requests `unknown`; it does not blindly retry them. Inspect provider history/IDs, then perform an explicit operator reconciliation. This implementation does not claim universal exactly-once delivery.

Human takeover increments a conversation version. Queued agent responses are checked before sending; a database row lock serializes takeover with an already-dispatching reply. A reply already accepted by a provider cannot be recalled merely by taking over afterward.

## Production gaps

The local MVP is not a security certification. Before publishing: add a production secrets store, HTTPS/cookie review, per-operator identities and RBAC, audited least-privilege database roles, account recovery, proper distributed login throttling, retention/deletion jobs, encrypted backups with restore tests, penetration tests, provider-policy review and operational alerts. The current login throttle is process-local and the worker is intentionally single-process.

Supabase tables enable RLS and revoke public schema access. The server currently expects a privileged database session, not a browser API key. Move to deliberately scoped server/migration roles before multi-user production use. Maintain an explicit extension search path and do not allow untrusted users to create objects in trusted schemas.

Failed job payloads, execution error data, customer transcripts and knowledge may contain sensitive data. Set and enforce a retention policy. n8n error executions can also contain model inputs; keep the editor private and configure pruning. Back up the database and local runtime keys separately. No public issue should contain raw transcripts, tokens or connection strings.
