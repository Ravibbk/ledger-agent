# Ledger – Design

Ledger is a chat agent with one job: answer questions about things that change over time, while remembering what you said last week.

## Premise

Most chat agents fail at two things: they don't know what day it is (relative to you), and they don't remember what you asked yesterday. Ledger fixes both in code, not in the model, so the model can focus on reading search results and writing clear prose.

## How a turn works

1. **Date anchoring.** The server receives the user's message and their timezone offset. chrono-node parses natural-language date references ("last Tuesday", "on 3 November", "on Monday") against the exact request timestamp. All resolution is code – weekday arithmetic, past-only enforcement, fallback candidates. The model is handed `<time_anchors>` and told to trust them.

2. **Memory recall.** The resolved calendar days are used to scan every session file for messages sent on those days (in the user's timezone). Up to 14 messages, capped at 1,400 chars each, are injected as `<recalled_history>` with a note that "the world may have moved since." If nothing is found, the model is told so explicitly and forbidden from inventing prior content.

3. **User message saved.** The user message is written to disk atomically (temp file + rename) before any model call, so it is never lost even if the stream fails.

4. **Streaming tool loop.** One `client.messages.stream` call per round, forwarding tokens over SSE immediately. The model runs up to 4 rounds; the final round has no tools so the model must write its answer. Tool calls within a round run concurrently.

5. **web_search.** The only tool. Tavily REST with parallel queries, 8s timeout, one retry, 10-minute cache, URL-level deduplication, continuous source numbering across rounds, and authority tagging (official/press/other) by domain heuristics. Results are wrapped in `<search_results>` and marked as untrusted data.

6. **Response saved and SSE closed.** The assistant response is appended to the session file with its sources. The `done` event carries timestamps, source list, and stats.

## Why it is fast

- **Parallel queries:** multiple search strings execute concurrently in a single tool round.
- **Cache:** repeated queries within 10 minutes hit memory, not the network.
- **Prompt caching:** the system prompt is sent in a `cache_control: ephemeral` block, so Anthropic charges one cached read on subsequent rounds.
- **Snippet cap:** search snippets are truncated at 650 chars, keeping context short and cheap.
- **Single LLM stream:** no planner, no critic, no second model call. One stream, forwarded immediately.

## Why it is correct

- **Dates from code:** chrono-node with the real request time and the client's UTC offset. The model is prohibited from doing date math.
- **`since` filter:** when checking "has X changed," the date anchor is passed as Tavily's `start_published_date`, excluding stale results.
- **Official-source preference:** the system prompt instructs the model to prefer `/pricing`, `/changelog`, `docs.*`, and `blog.*` over review sites and aggregators.
- **Claim re-verification:** for "is my earlier answer still correct," the model lists time-sensitive claims and re-searches each one.
- **Conflict and "no change found" rules:** the model is told never to say "nothing changed" when it merely found no evidence of change. If sources conflict, prefer the most recent official one and state the disagreement.

## Safety

- Search results are `UNTRUSTED DATA`, wrapped in `<search_results>` with an XML comment instructing the model to ignore instructions inside.
- Session IDs are validated against `/^[a-zA-Z0-9_-]{1,64}$/` before any file access.
- Request bodies are validated for type, length (message ≤ 4,000 chars), and array size.
- In-memory per-IP rate limit: 20 chat requests per minute.
- Same-origin security headers; no wildcard CORS.

## Zero-friction run

```
cp .env.example .env   # fill in two keys
npm install
npm run dev            # tsx watch src/server.ts
```

## Considered and rejected

- **Provider-native search** (Claude's built-in tool): gives less control over caching, retries, deduplication, and the `since` filter.
- **Memory as a second tool**: letting the model decide when to recall breaks the invariant that recall always precedes the model call; it also costs an extra round.
- **Planner/critic multi-agent**: adds latency and complexity without improving correctness for single-query tasks.
- **Vector/hybrid memory**: overkill for the access pattern (lookup by exact calendar day).
- **Full page fetching**: snippets are sufficient for pricing and changelog checks; full pages would blow the context budget.
- **React + DB stack**: a single HTML file with vanilla JS and JSON files on disk is enough, deployable on a free tier with no build step.

## Known limits

- **Shallow snippets:** Tavily's basic depth returns snippets, not full pages. A pricing page behind a login wall will not be retrieved.
- **Missing publish dates:** many results have no `published_date`; the model must judge recency from context clues.
- **Ephemeral free-tier disk:** Render's free plan resets the filesystem on each deploy. Conversations are lost. Use a persistent disk (`/opt/render/project/src/data`, paid plan) or export sessions before deploying.
- **No authentication:** any visitor can read and seed sessions by ID.

## With another week

- **Eval harness with dated fixtures:** replay seeded sessions against a local server with a fixed clock to catch regressions without real API calls.
- **Speculative page fetch:** for the top official result, fetch the full page and extract the pricing section, falling back to the snippet on failure.
- **Persisted structured claims:** after a "has X changed" answer, extract and store the verified claim (`{item, value, asOf}`) so a future "is it still correct?" diff can compare structured data, not prose.
- **SQLite + auth:** replace JSON files with SQLite for concurrent writes; add a simple session-cookie login so conversations are private.
- **Source trust weights + confidence line:** score sources on recency × authority; show a one-line confidence indicator ("High – two official pages agree") under time-sensitive answers.

