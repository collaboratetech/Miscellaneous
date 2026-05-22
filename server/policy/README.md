# Classification policy

Drop your company's classification policy here. The server loads it on
startup and uses it as the **cached system prompt** for every `/classify`
call (1-hour cache TTL).

Recognised filenames, checked in order:

1. `classification-policy.txt` — used as-is.
2. `classification-policy.pdf` — text auto-extracted with `pdf-parse` at
   server startup. Restart the server after replacing it.

If neither file is present, the server starts with a generic placeholder
policy (defined in `server/src/policy.ts`). The placeholder is good enough
to smoke-test the pipeline but should never be relied on for real
classification decisions.

## Caching considerations

The minimum cacheable prefix for Claude Haiku 4.5 is **4,096 tokens**
(roughly 16 KB of text). Below that the system prompt still works but
won't be cached — the response field `cache.hit` will be `false`.

If your policy is short, consider adding worked examples or detailed
clause text to push the system prompt above the minimum, since prompt
caching cuts the per-request cost by ~10×.

## Privacy

The policy text is sent to Anthropic as part of every classification
request. Don't put secrets, individual names, or other regulated content
into the policy file itself.
