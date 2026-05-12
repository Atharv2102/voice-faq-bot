# Backend

Node.js + Express. All data lives in `backend/data/` as JSON and Excel files.

## Setup
```bash
cp .env.example .env   # set JWT_SECRET and BOT_PROACTIVE_SECRET
npm install
npm run seed           # writes data/*.json + prints credentials
npm run dev            # http://localhost:3000
```

## Curl examples

```bash
# Health
curl http://localhost:3000/api/health

# Ask a question (any user)
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{"text":"what are office hours","teamsUserId":"user-1","userName":"Test User"}'

# Admin command (returns needs_confirmation for destructive actions)
curl -X POST http://localhost:3000/api/admin-command \
  -H "Content-Type: application/json" \
  -d '{"text":"add question what is the wifi password answer guest2024","teamsUserId":"29:demo-admin-id","userEmail":"admin@example.com","userName":"Demo Admin"}'

# Confirm pending action
curl -X POST http://localhost:3000/api/admin-confirm \
  -H "Content-Type: application/json" \
  -d '{"teamsUserId":"29:demo-admin-id","response":"yes"}'

# Submit suggestion (any user)
curl -X POST http://localhost:3000/api/admin-command \
  -H "Content-Type: application/json" \
  -d '{"text":"suggest a change to office hours: new timing is 10 to 6","teamsUserId":"user-1","userEmail":"user@example.com","userName":"Test User"}'

# List pending suggestions (admin command)
curl -X POST http://localhost:3000/api/admin-command \
  -H "Content-Type: application/json" \
  -d '{"text":"show pending suggestions","teamsUserId":"29:demo-admin-id"}'

# Web panel login
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"changeme"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# List FAQs
curl http://localhost:3000/api/questions -H "Authorization: Bearer $TOKEN"

# Get pending suggestions count
curl http://localhost:3000/api/suggestions/count?status=pending -H "Authorization: Bearer $TOKEN"

# Approve suggestion
curl -X POST http://localhost:3000/api/suggestions/S-001/approve -H "Authorization: Bearer $TOKEN"

# Audit log
curl "http://localhost:3000/api/audit-log?limit=10" -H "Authorization: Bearer $TOKEN"

# Unanswered queries
curl "http://localhost:3000/api/query-log?answered=false" -H "Authorization: Bearer $TOKEN"
```

## Data files
| File | Purpose |
|------|---------|
| `faqs.json` | Knowledge base — commit this |
| `admins.json` | Admin accounts — commit this |
| `suggestions.json` | User suggestions — commit this |
| `audit-log.xlsx` | Change history — optional to commit |
| `query-log.xlsx` | Query history — optional to commit |
| `conversation-refs.json` | Bot proactive refs — do not commit |
