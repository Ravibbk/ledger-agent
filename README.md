# Ledger

A voice-enabled chat agent that remembers what you said last week, checks whether it is still true using live web search, and lets you speak or type.

## Quick start

```bash
cp .env.example .env   # add ANTHROPIC_API_KEY and TAVILY_API_KEY
npm install
npm run dev            # starts single process on http://localhost:3000 with hot reload
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key |
| `TAVILY_API_KEY` | Yes | Tavily search API key |
| `MODEL` | No | Claude model ID (default: `claude-sonnet-4-5`) |
| `PORT` | No | HTTP port (default: `3000`) |

Voice input uses the browser's standard Web Speech API, so no additional speech API keys are required.

## Browser support for voice

- **Speech-to-text (Dictation / Hands-free):** Google Chrome, Microsoft Edge, Safari. (Firefox does not currently support the Web Speech API `SpeechRecognition` standard; users on unsupported browsers can type normally).
- **Text-to-speech (Read-aloud):** Supported in all modern evergreen browsers via `window.speechSynthesis`.
- **Keyboard shortcut:** `Ctrl+Shift+M` (or `Cmd+Shift+M`) toggles dictation; `Esc` cancels listening and speaking.

See [DESIGN.md](./DESIGN.md) for full architecture details.

## Seed example

Reviewers can plant dated history into memory using the seed endpoint:

```bash
curl -X POST http://localhost:3000/api/seed \
  -H "Content-Type: application/json" \
  -d '[{
    "sessionId": "crm-shortlist-eval",
    "messages": [
      {
        "role": "user",
        "content": "Shortlist 5 CRM tools for a 20-person sales team: Salesforce, HubSpot, Pipedrive, Zoho, Monday.",
        "at": "2026-11-03T10:00:00.000Z"
      },
      {
        "role": "assistant",
        "content": "Here is the shortlisted pricing from Nov 3: Salesforce Starter at $25/user/mo, HubSpot Pro at $90/user/mo, Pipedrive Essential at $14.90/user/mo, Zoho Standard at $14/user/mo, and Monday Basic at $10/user/mo.",
        "at": "2026-11-03T10:01:00.000Z"
      }
    ]
  }]'
```

## Production build & run

```bash
npm run build          # builds web/dist using Vite
NODE_ENV=production npm start  # starts production Express server serving web/dist
```

## Live URL

https://ledger-agent-65bp.onrender.com
