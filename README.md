# Content Classifier — Word Add-in

A two-piece system for Microsoft Word:

1. **Task pane add-in** (`src/`) — reads the open document via `Word.js`,
   sends the text to a backend, and presents the resulting classification
   with rationale and evidence. On user confirmation, applies the matching
   Microsoft Information Protection (MIP) sensitivity label.
2. **Classifier backend** (`server/`) — Node + Express + Claude Haiku 4.5.
   Holds the company's classification policy (PDF or text) and grades each
   document against it via the Anthropic API, using prompt caching on the
   policy for ~10× cost reduction per request.

```
Word task pane (HTTPS:3000)  ──►  Express backend (HTTPS:4000)  ──►  Anthropic API
                                       │
                                       └── policy/classification-policy.pdf
                                           (cached as system prompt)
```

> **v1 scope:** Word only. The code is structured so Excel / PowerPoint can be added
> by introducing additional readers and extending the manifest's `<Hosts>` /
> `VersionOverrides`.

## Why a backend?

Calling Claude directly from the task pane would put the Anthropic API key
into the browser bundle and skip any audit/logging that compliance owners
will want. The backend keeps the key server-side, gives you a single chokepoint
for rate limits and access control, and is the only sensible place to enforce
the prompt-caching strategy (policy cached once, every classification call
reads from cache).

## Setup

Two processes, each in its own terminal.

### 1. Backend

```bash
cd server
npm install
cp .env.example .env
# Edit .env: set ANTHROPIC_API_KEY
npm run dev       # https://localhost:4000
```

On first run, accept the self-signed certificate from `office-addin-dev-certs`.

Drop your policy at `server/policy/classification-policy.pdf` (or `.txt`)
and restart. Without one, the server uses a generic placeholder — see
`server/policy/README.md`.

### 2. Task pane

```bash
# From the repo root
npm install
npm run dev-server   # https://localhost:3000
```

In a third terminal, sideload the manifest:

```bash
npm start            # uses office-addin-debugging to sideload manifest.xml
```

The add-in adds a **Classification → Classify Document** button to the Home
tab. Click it, then click **Classify document** in the task pane.

## How classification works

1. `Word.run` reads `document.body.text`.
2. The task pane POSTs `{ documentText, host: "Word" }` to the backend's
   `/classify` endpoint.
3. The backend calls `claude-haiku-4-5` via `client.messages.parse()` with:
   - **System prompt** = short instructions + the full policy (the policy
     block carries `cache_control: { type: "ephemeral", ttl: "1h" }`).
   - **User message** = the document text wrapped in `<document>` tags.
   - **`output_config.format`** = a Zod schema, so the response is guaranteed
     to match `ClassificationResult` or the endpoint returns 502.
4. The response carries the chosen level, confidence, prose rationale,
   exact-quote evidence snippets, and policy references.
5. On **Apply label…**, the task pane maps the classification ID to one of
   several candidate tenant label names (see `src/taskpane/levels.ts`
   → `LABEL_NAME_CANDIDATES`) and calls `setSelectedSensitivityLabelAsync`
   if available, otherwise prompts the user to apply it manually via Word's
   Sensitivity menu.

## Prompt caching note

For caching to kick in, the cached prefix must be at least **4,096 tokens**
on Haiku 4.5 (~16 KB of text). Below that, every request pays full price.
Real policy PDFs usually clear this comfortably; the placeholder may not.
The task pane shows "policy cache hit" once the cache is warm.

## Production checklist

- Replace `CLASSIFIER_AUTH_TOKEN` in `src/taskpane/config.ts` with a real
  per-user token (e.g. minted via Office SSO + Microsoft Graph) and have
  the backend validate it against your identity provider.
- Set `SHARED_AUTH_TOKEN` on the backend at minimum.
- Host the task pane and backend at real HTTPS URLs and update
  `manifest.xml`, `webpack.config.js` (`urlProd`), and
  `src/taskpane/config.ts` accordingly.
- Decide your data-handling policy for document text — it leaves the user's
  Office session and reaches Anthropic via your backend.
- Review `server/policy/classification-policy.pdf` with your compliance team
  before relying on its recommendations.
- Confirm `LABEL_NAME_CANDIDATES` in `src/taskpane/levels.ts` matches the
  exact label names in your tenant.

## Project layout

```
manifest.xml                       Office Add-in manifest (XML)
package.json / tsconfig.json /
  webpack.config.js                Task-pane build
src/
  taskpane/
    taskpane.html                  Task pane shell, loads Office.js + index.tsx
    index.tsx                      React bootstrap (FluentProvider)
    App.tsx                        Main component (classify → review → apply)
    config.ts                      Backend URL + optional bearer token
    types.ts                       ClassificationResult / ClassificationLevel
    levels.ts                      Level metadata + tenant label-name candidates
    api/classify.ts                fetch() wrapper around the backend
    office/word.ts                 Word.js body reader
    office/sensitivity.ts          MIP label Office.js wrappers + feature detection
    components/ClassificationCard  Recommendation, confidence, override radios
    components/EvidenceList        Snippets + policy references
    components/ConfirmApplyDialog  Confirmation + optional justification
  commands/                        FunctionFile required by the manifest
server/
  src/
    index.ts                       Express + HTTPS bootstrap
    classify.ts                    /classify route + retry/error handling
    policy.ts                      PDF or .txt loader (with placeholder fallback)
    schema.ts                      Zod schemas (request + response)
  policy/                          Drop your real PDF here (gitignored)
  README.md                        Backend ops notes
```

## Known gaps

- **No icons committed.** `assets/README.md` lists the required PNG sizes;
  the manifest references them but `copy-webpack-plugin` has
  `noErrorOnMissing: true` so the build is fine.
- **Excel / PowerPoint not supported in v1.** Add a reader in
  `src/taskpane/office/` and extend the manifest to include those hosts.
- **No automated tests yet.** The Zod schema and the `policy.ts` loader are
  pure and easy to cover with Jest if you want a next step.
- **Sensitivity-label setter is feature-detected, not guaranteed.** Verify
  behaviour in your tenant before depending on the auto-apply path.
