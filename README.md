# Voice FAQ Bot for Microsoft Teams

A voice-first FAQ assistant with three tiers of interaction:

```
┌──────────────────────────────────────────────────────────────┐
│                    Microsoft Teams                            │
│                                                               │
│  User:  "what are the office hours?"       → answer          │
│  User:  "suggest a change to hours: 10-6" → confirmation     │
│  Admin: "update answer for hours to 10-6" → confirmation     │
│  Admin: "approve suggestion S-001"        → applied + notify │
└────────────────┬─────────────────────────────────────────────┘
                 │ Bot Framework / HTTP
                 ▼
┌────────────────────────┐     ┌──────────────────────────────┐
│     teams-bot/          │     │       admin-panel/            │
│  Teams AI v2 + Whisper  │◄───►│  React + Vite (full CRUD)    │
└───────────┬────────────┘     └──────────────────────────────┘
            │                               │
            └──────────────┬────────────────┘
                           │ HTTP/REST
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                       backend/                                │
│  Express · fileStore (JSON) · excelLogger (xlsx)             │
│  commandHandler · intent parser · fuzzy matcher              │
│  lockManager · pendingActions · emailNotifier                │
│                                                               │
│  backend/data/                                                │
│  ├── faqs.json          ← knowledge base                     │
│  ├── admins.json        ← who can manage FAQs                │
│  ├── suggestions.json   ← user change requests               │
│  ├── audit-log.xlsx     ← full change history                │
│  └── query-log.xlsx     ← what users asked                   │
└──────────────────────────────────────────────────────────────┘
```

---

## Quick start

### 1. Backend
```bash
cd backend
cp .env.example .env        # set JWT_SECRET and BOT_PROACTIVE_SECRET
npm install
npm run seed                 # creates data files + 10 sample FAQs
npm run dev                  # http://localhost:3000
curl http://localhost:3000/api/health
```

### 2. Admin panel
```bash
cd admin-panel
npm install
npm run dev                  # http://localhost:5173
# Login: admin@example.com / changeme
```

### 3. Teams bot
```bash
cd teams-bot
cp .env.example .env        # fill in CLIENT_ID, CLIENT_SECRET, TENANT_ID
                             # set BOT_PROACTIVE_SECRET same as backend
npm install
npm run dev                  # http://localhost:3978  (messages + proactive + health)
# DevtoolsPlugin auto-opens devtools on port 3979 in your browser
```

### All at once (after individual installs)
```bash
npm install && npm run dev:all
```

---

## Voice command grammar

### Anyone
| Say | What happens |
|-----|------|
| `what are the office hours?` | Fuzzy-matched answer returned |
| `suggest a change to <topic>: <new answer>` | Confirmation prompt → submits suggestion |
| `suggest adding <question> with answer <answer>` | Confirmation → new FAQ suggestion |
| `report wrong answer for <topic>` | Flags FAQ, notifies admins |
| `the answer for <topic> is outdated` | Same as report |
| `my suggestions` | Lists your submitted suggestions |
| `help` | Shows available commands |

### Admins only
| Say | What happens |
|-----|------|
| `add question <Q> answer <A>` | Adds FAQ after confirmation |
| `update answer for <Q> to <A>` | Updates after confirmation |
| `delete question about <Q>` | Deletes after confirmation |
| `disable / enable question about <Q>` | Toggles active flag |
| `list questions [about <topic>]` | Shows matching FAQs |
| `how many questions` | Count of active FAQs |
| `show recent changes` | Last 10 audit entries |
| `show changes today / yesterday / this week / this month` | Filtered audit |
| `show changes by <name>` | Audit by actor |
| `who edited <topic>` | Change history for a FAQ |
| `revert last change` | Reverts most recent edit |
| `show pending suggestions` | Lists pending user suggestions |
| `approve suggestion S-042` | Approves + applies + notifies user |
| `reject suggestion S-042` | Rejects + notifies user |

**All destructive actions require "yes" confirmation.** If multiple FAQs match, the bot lists candidates numbered 1–3 and waits for a number pick before the final confirmation.

---

## SDK choice

The bot uses **Teams AI v2** (`@microsoft/teams.apps`) — Microsoft's current agent SDK (replacing the Bot Framework SDK, which was archived December 31, 2025). Local testing uses the **Microsoft 365 Agents Playground** (replaces Bot Framework Emulator); `DevtoolsPlugin` opens it automatically. Azure registration must use **single-tenant** (multi-tenant bot registrations are deprecated).

## How to add yourself as admin

1. Send any message to the bot in the Playground or Teams
2. Check backend logs for your `teamsUserId` (looks like `29:xxxxxxxx`)
3. Edit `backend/data/admins.json`:
```json
{ "teams_user_id": "29:your-real-id", "email": "you@company.com", ... }
```
4. Send `help` to the bot — admin commands will now appear

---

## SMTP configuration

Leave all `SMTP_*` vars blank in dev — emails are logged to the console instead.

**Gmail (App Password):**
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=<16-char app password>   # Google Account → Security → App passwords
SMTP_FROM="FAQ Bot <you@gmail.com>"
```

**Office 365:**
```
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=you@company.com
SMTP_PASS=<password or app password if MFA enabled>
SMTP_FROM="FAQ Bot <noreply@company.com>"
```
> IT may need to enable SMTP AUTH for your account: Exchange Admin Center → Users → Mailboxes → your account → Mail flow settings → SMTP AUTH.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Agents Playground can't connect | Ensure `npm run dev` is running and `DevtoolsPlugin` is active (`NODE_ENV` ≠ `production`) |
| Emails not sending | Check `SMTP_HOST` is set; in dev leave it blank for console logging |
| ngrok URL changes on restart | Update Azure Bot → Configuration → Messaging endpoint each time |
| Proactive messages not sending | Check `BOT_URL=http://localhost:3978` in `backend/.env` matches the bot's `PORT` |
| Whisper transcribes "yes" as "yeah" | Already handled — `yeah/yep/ok/sure` all parse as confirm |
| Suggestion ID "S 042" not recognised | Already handled — spaces and word-numbers are normalised |
| Proactive messages fail in Emulator | Expected — `continueConversationAsync` requires Azure registration. Test proactive after deploying. |
| One-click email link shows "already processed" | Correct — tokens are single-use. Use the panel for retries. |
