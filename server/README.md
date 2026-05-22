# Classifier backend

Node + Express + Claude Haiku 4.5 backend for the Office Content
Classifier add-in.

- **`POST /classify`** — accepts document text, returns a structured
  classification with rationale and evidence.
- **`GET /health`** — liveness check + policy source.

## Setup

```bash
cd server
npm install
cp .env.example .env
# Edit .env: set ANTHROPIC_API_KEY (and SHARED_AUTH_TOKEN for prod)
npm run dev    # HTTPS on https://localhost:4000
```

Drop your real policy file at `policy/classification-policy.pdf` (or
`.txt`) and restart. See `policy/README.md`.

## How it works

- The policy text is loaded once at startup.
- Each `/classify` call sends a two-block system prompt:
  1. Short instructions (uncached).
  2. The full policy, wrapped in `<classification_policy>` tags, with
     `cache_control: { type: "ephemeral", ttl: "1h" }`.
- The user message carries the document text inside `<document>` tags.
- Output is constrained to a Zod schema via
  `client.messages.parse({ output_config: { format: zodOutputFormat(...) } })`,
  so the response is guaranteed to match `ClassificationResultSchema`
  or the endpoint returns a 502.

## Response shape

```json
{
  "classification": "Confidential",
  "confidence": "high",
  "rationale": "Contains customer contract terms covered by §3.2…",
  "evidence": [
    { "snippet": "Acme Corp agrees to a 3-year exclusive license", "reason": "Contract term — §3.2" }
  ],
  "policyReferences": ["§3.2 Customer agreements"],
  "model": "claude-haiku-4-5",
  "usage": { "input_tokens": 124, "cache_read_input_tokens": 8420, "output_tokens": 312 },
  "cache": { "read": 8420, "write": 0, "hit": true }
}
```

`cache.hit` flips to `true` once the policy prefix has been cached
(usually from the second request onward, and only if the policy is
above ~4K tokens — see `policy/README.md`).

## Auth

Set `SHARED_AUTH_TOKEN` in `.env`. The task pane must then send
`Authorization: Bearer <token>` on every call. Empty in dev = no
auth (logged as a warning on startup). **Set it before exposing this
service to anything but localhost.**

## Production notes

- This server holds your Anthropic API key. Put it behind your normal
  auth (SSO, mTLS, signed JWT) instead of just the shared token.
- Behind a TLS-terminating proxy, set `USE_HTTP=true` so the app listens
  on plain HTTP.
- Log retention: request bodies contain document text — apply your
  normal data-handling policy.

## Limits

- Per-request cap: 300,000 chars of document text (~75K tokens). Larger
  documents should be chunked client-side; classify each chunk and pick
  the highest classification.
- Haiku 4.5 context window: 200K tokens total.
