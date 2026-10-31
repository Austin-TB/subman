# Subman

Brightloop's subscription management system: products and plans, quotations, subscriptions, recurring invoices, automatic discounts, payments and a finance dashboard. Built in an ~8-hour hackathon; see [PLAN.md](PLAN.md) for the phased plan and every design decision.

## Setup

Needs Node 24+ and a local PostgreSQL.

```sh
# 1. Database (Arch Linux; adapt for your OS)
sudo -iu postgres psql -c "CREATE ROLE subman LOGIN CREATEDB PASSWORD 'subman';"
sudo -iu postgres createdb -O subman subman

# 2. App
cp .env.example .env            # then set BETTER_AUTH_SECRET: openssl rand -base64 32
npm install                     # also generates the Prisma client
npx prisma migrate deploy
npm run seed

# 3. Run (production mode, as in the demo)
npm run build && npm start      # http://localhost:3000
```

### Demo logins

Password for all: `Demo@12345`

| Role | Email |
|---|---|
| Admin | admin@brightloop.test |
| Staff | staff@brightloop.test |
| Customer | customer@brightloop.test |

### Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` | Route types + `tsc` |
| `npm test` | Vitest (money, dates, billing logic) |
| `npm run db:migrate` | Create/apply migrations |
| `npm run seed` | Demo data (safe to re-run) |
| `npm run seed:bulk` | ~10k subscriptions for the performance check |
| `npm run demo:reset` | Reset DB, then demo + bulk seed |

## Stack

Next.js 16 (App Router, Server Components, Server Actions) · TypeScript · PostgreSQL + Prisma 7 · Better Auth · Tailwind + shadcn/ui · Zod · Vitest.

Money is stored as integer minor units and percentages as basis points, so there are no floats. Business dates are date-only and "today" uses `APP_TZ`. Emails always land in the in-app Outbox; SMTP is optional.

## Architecture

_To be completed in Phase 8: ER diagram, billing-run design, page timings._
