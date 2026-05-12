# Admin Panel

React + Vite + TypeScript. Full FAQ management + suggestion review.

## Setup
```bash
npm install
npm run dev   # http://localhost:5173
```

Login: `admin@example.com` / `changeme` (after running `npm run seed` in backend).

Vite proxies `/api` → `http://localhost:3000`, so the backend must be running first.

## Pages
| Route | Purpose |
|-------|---------|
| `/dashboard` | Stats + recent activity + unanswered queries |
| `/questions` | Full FAQ CRUD with edit locking |
| `/suggestions` | Review pending user suggestions (Pending / Approved / Rejected tabs) |
| `/import` | Bulk import CSV or JSON with merge/replace mode |
| `/audit` | Audit log with filters + Excel download |
| `/queries` | Query log with "Add as FAQ" shortcut on unanswered rows |

The sidebar shows a live badge on Suggestions when there are pending items (polls every 30s).
