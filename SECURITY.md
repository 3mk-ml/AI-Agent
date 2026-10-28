# Security

This is a development MVP, not an audited production system. Read [security boundaries](docs/WEBHOOK_SECURITY.md) before exposing any service.

Do not publish secrets, raw customer transcripts, `.runtime`, `.env*`, full database URLs or n8n credential exports in GitHub issues. Report suspected vulnerabilities to the repository owner through a private channel. No monitored support email or response-time guarantee is implied.

Rotate exposed credentials at the provider, not only in local settings. Preserve an incident record without retaining unnecessary secret values. For potential cross-customer access, disable public ingress and preserve relevant sanitized logs before further testing.
