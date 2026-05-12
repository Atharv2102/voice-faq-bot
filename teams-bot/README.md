# Teams Bot

Teams AI v2 (`@microsoft/teams.apps`) bot. Receives messages (text + voice), routes to backend, returns replies.

## Setup
```bash
cp .env.example .env   # fill in CLIENT_ID, CLIENT_SECRET, TENANT_ID
npm install
npm run dev            # http://localhost:3978
                       #   POST /api/messages   — Teams messaging endpoint
                       #   POST /api/proactive  — called by backend
                       #   GET  /health         — health probe
```

Local testing UI: [Microsoft 365 Agents Playground](https://aka.ms/agents-playground).  
`DevtoolsPlugin` (active when `NODE_ENV` is not `production`) auto-opens devtools on port 3979.

## Azure registration
1. Azure Portal → Create resource → **Azure Bot** (F0 free tier, **Single Tenant**)
2. Copy **Microsoft App ID** → paste into `.env` as `CLIENT_ID`
3. Configuration → Manage Password → New client secret → paste as `CLIENT_SECRET`
4. Copy your **Directory (tenant) ID** → paste as `TENANT_ID`
5. Deploy bot to a public HTTPS URL
6. Azure Bot → Configuration → Messaging endpoint: `https://your-url/api/messages`
7. Update `manifest/manifest.json` with your App ID, then `npm run package-manifest`
8. Teams → Apps → Upload a custom app → `faq-bot-manifest.zip`

## Voice (Whisper)
Set `OPENAI_API_KEY` in `.env`. Without it, audio messages get a graceful fallback asking the user to type instead.

## Proactive messaging
The bot exposes `POST /api/proactive` (secret-protected) on the **same port** as `/api/messages`. The backend calls this when approving/rejecting suggestions to notify submitters. Requires `CLIENT_ID`, `CLIENT_SECRET`, and `TENANT_ID` to be set, and a valid stored conversation reference.
