# Ledger

A chat agent that remembers what you said last week and checks whether it is still true.

## Quick start

```bash
cp .env.example .env   # add ANTHROPIC_API_KEY and TAVILY_API_KEY
npm install
npm run dev            # starts on http://localhost:3000
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key |
| `TAVILY_API_KEY` | Yes | Tavily search API key |
| `MODEL` | No | Claude model ID (default: `claude-sonnet-4-5`) |
| `PORT` | No | HTTP port (default: `3000`) |

See [DESIGN.md](./DESIGN.md) for architecture details.

## Seed example

Plant dated history for testing:

```bash
curl -X POST http://localhost:3000/api/seed \
  -H "Content-Type: application/json" \
  -d '[{
    "sessionId": "my-session-nov3",
    "messages": [
      {"role":"user","content":"What are the best CRM tools?","at":"2026-11-03T10:00:00.000Z"},
      {"role":"assistant","content":"HubSpot, Salesforce, Pipedrive...","at":"2026-11-03T10:01:00.000Z"}
    ]
  }]'
```

## Live URL

https://ledger-agent.onrender.com

