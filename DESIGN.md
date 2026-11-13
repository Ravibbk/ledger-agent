# Ledger – Design

Ledger is a voice-enabled chat agent with one tool: web search. It answers questions about things that change over time, remembers past conversations by date, and allows users to either type or speak naturally.

## Premise

Most chat agents fail at three things: they do not know what day it is relative to the user, they lose track of earlier conversations, and they bolt on complex voice pipelines with extra latency and API costs. Ledger solves time and memory in deterministic code, uses the browser's native Web Speech API for voice (zero extra API keys or audio streaming latency), and leaves the model to do what it does best: search, compare facts, and write clear language.

## How a turn works

1. **Input capture & speech-to-text.** The user types in the composer or taps the mic (or uses hands-free mode). The browser's native SpeechRecognition streams live interim transcripts directly into the textarea. On final recognition, the text is committed or auto-sent.
2. **Date anchoring.** The request arrives at `/api/chat` with the message text and the user's client timezone offset (`Date#getTimezoneOffset()`). chrono-node resolves natural-language references ("last Tuesday", "on 3 November", "third November", "on Monday") strictly to PAST calendar days relative to the request instant. Weekday math and spoken ordinals ("third" -> "3rd") are normalized in code. Output is passed to the model as `<time_anchors>`, which the model is instructed to trust over its own internal date math.
3. **Memory recall.** For each anchored day (and fallback day if applicable), the server scans all session JSON files in `data/sessions/` for messages that occurred on that local calendar day. Recalled messages are capped (~14 messages, ~1,400 chars each) and injected as `<recalled_history>` with an explicit note that the world may have moved since. If no record exists, the model is forbidden from inventing prior context.
4. **User message persistence.** The user message is saved to disk atomically (temp file + rename) BEFORE calling the LLM, ensuring zero lost input even on disconnect.
5. **Streaming LLM loop.** A single stream (`client.messages.stream`) with prompt caching on the system prompt. Up to 4 rounds. Tool calls in each round execute concurrently. The final round disables tools to guarantee an answer.
6. **The one tool: web_search.** Queries run in parallel against Tavily REST with an 8-second timeout, one backoff retry, 10-minute in-memory cache, URL deduplication, and continuous source numbering (`[1]`, `[2]`). Domains are tagged for authority (official vendor domains, `/pricing`, `/changelog`, docs vs press/review sites). Results are marked as `UNTRUSTED DATA` so instructions inside cannot hijack the prompt.
7. **SSE delivery & client rendering.** Events stream over SSE: `anchors`, `memory`, `search`, `sources`, `token`, and `done`. React throttles incoming token renders using `requestAnimationFrame`. Citations (`[n]`) are parsed into clickable superscript anchors without `dangerouslySetInnerHTML`.
8. **Speech synthesis & hands-free loop.** If voice mode, auto-read, or hands-free is enabled, `speechText.ts` cleans citations, URLs, and markdown formatting, spells arrows ("->" as "to"), chunks text at sentence boundaries to avoid browser synthesis cut-offs, and speaks the answer. In hands-free mode, the mic automatically reactivates after speaking finishes.

## Why it is fast

- **Parallel search queries:** up to 3 queries execute concurrently in a single tool call round.
- **Short answers in voice mode:** the model is instructed to keep answers under ~120 words when voice is active so users aren't trapped listening to long text.
- **Prompt caching:** Anthropic's ephemeral cache header reduces time-to-first-token on subsequent turns.
- **Client-side Web Speech API:** Speech recognition and speech synthesis occur entirely inside the browser without transmitting audio bytes to a third-party server.
- **Single LLM stream:** no multi-agent planner/critic handoffs or roundtrips.

## Why it is correct

- **Dates from code:** the model never computes relative dates; calendar resolution happens via chrono-node with client timezone offsets and spoken ordinal normalization.
- **`since` filter:** "Has X changed since" passes the anchored date directly to Tavily's `start_published_date`.
- **Evidence hierarchy:** official pricing pages, docs, and changelogs are prioritized over third-party review sites.
- **Honest negatives:** the model is strictly forbidden from writing "nothing changed" when evidence was merely missing; it must say "no change found" or "could not verify."

## Safety

- Search snippets are treated as untrusted data and wrapped in `<search_results>` with prompt injection warnings.
- Session IDs are validated against `/^[a-zA-Z0-9_-]{1,64}$/` to prevent path traversal.
- Request body limits, IP rate limiting (20 req/min), same-origin headers, and `Permissions-Policy: microphone=(self)`.

## Zero-friction run

- One command: `npm run dev` starts the Express server with Vite middleware in development mode with hot module reloading.
- Zero extra keys: voice uses the standard Web Speech API built into modern browsers.

## Considered and rejected

- **Provider-native search:** less control over request timeouts, retries, deduplication, and the `since` date filter.
- **Memory as a second tool:** breaks the invariant that memory recall must occur before reasoning, and burns an extra LLM turn.
- **Planner/critic multi-agent:** increases latency and cost without improving answer accuracy for search-and-compare tasks.
- **Vector/hybrid memory:** unnecessary complexity and storage overhead for exact calendar day queries.
- **Full page fetching:** snippet inspection is sufficient for pricing/version checks and respects latency budgets.
- **Server-side Whisper/cloud TTS:** adds latency, streaming complexity, and separate API billing; Web Speech API provides instant client-side dictation and synthesis.
- **Next.js / separate frontend service:** running Vite middleware directly inside Express keeps the entire application as a single deployable unit on free-tier hosting.

## Known limits

- **Shallow snippets:** Tavily basic depth returns snippets; pages gated behind authentication cannot be read.
- **Missing publish dates:** some pages lack published date headers; model must infer recency from context.
- **Web Speech browser support:** supported in Chrome, Edge, Safari; Firefox does not implement `SpeechRecognition`. Speech accuracy varies by accent and background noise.
- **Ephemeral free-tier disk:** Render free tier resets local files on redeploy. Persistent storage requires a disk mount at `/opt/render/project/src/data`.
- **No authentication:** sessions are addressable by ID.

## With another week

- **Eval harness with dated fixtures:** replay recorded session states against fixed clocks for deterministic regression testing.
- **Server-side STT fallback:** Whisper fallback for browsers without Web Speech support (e.g. Firefox).
- **Streaming TTS:** synthesize sentences while tokens stream instead of waiting for turn completion.
- **Speculative page fetch:** fetch full HTML for top official results when snippets lack price numbers.
- **Persisted structured claims:** extract verified claims (`{ item, price, date }`) to enable diff comparisons on future turns.
- **SQLite + user auth:** replace JSON files with SQLite and session cookies.
- **Source trust weights & confidence meter:** display an indicator of agreement across official sources.
