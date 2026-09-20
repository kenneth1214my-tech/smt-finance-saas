# 财务分析平台 SaaS (Finance SaaS Platform)

Multi-tenant finance analysis platform. Next.js 16 (App Router) + TypeScript + Prisma + PostgreSQL, custom JWT-cookie auth, 5-language i18n (zh / en / zh-Hant / ms / id).

Forked from a single-company production build ([hongrui-finance-platform](../hongrui-finance-platform)) to serve multiple, fully isolated companies from one deployment.

## Multi-tenancy model

- Every business-data table (`Subsidiary`, `MonthlyFinancial`, `Budget`, `BankAccount`, `ARCustomer`, `Project`, `RiskAlert`, `ReportDoc`, `ExchangeRate`, etc.) carries an `organizationId` and every query is scoped by it — one company can never see or touch another's data.
- The generic admin CRUD factory (`src/lib/admin/crudHandlers.ts`) enforces this centrally: every list/create/update/delete route filters and injects `organizationId` from the caller's session automatically, so individual routes can't forget it.
- A handful of custom routes (access-request approval, user enable/disable, CSV import) do their own explicit `organizationId` ownership checks — see the comments in those files.
- `User.email` is unique **platform-wide**, not per-org: one login belongs to exactly one company. Someone working with two client companies needs two separate accounts.

## Onboarding

- **Create a company** (`/register`, "创建新公司" tab): collects a company name + the founder's name/email/password, creates the `Organization` and an `ADMIN` user immediately (no approval needed — there's no existing admin to approve them), and signs them in.
- **Join a company** (`/register`, "加入已有公司" tab): requires an **invite code** (visible to any admin at Settings → 集团设置 → 邀请码) to resolve which organization the request is for, then goes through the normal admin-approval queue.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` — a Neon Postgres **pooled** connection string
   - `DIRECT_URL` — the same database's **direct** (non-pooled) connection string (same host without the `-pooler` suffix). Used only by `prisma migrate`, so migrations don't run over pgbouncer's connection pool and get stuck on a leaked advisory lock.
   - `JWT_SECRET`
3. Run migrations:
   ```bash
   npx prisma migrate dev --name init
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000/register to create the first company.

## What's real vs. not yet built

- **Real**: all 11 dashboard modules read live, per-organization data from Postgres via Prisma. Multi-company signup/approval flow, role-based access (`ADMIN`/`DIRECTOR` can approve & disable users within their own org; others cannot), 5-language i18n, full admin CRUD for every entity, self-service profile + password change, CSV bulk import with per-row validation and an import audit log, admin-configurable base currency + exchange rates with FX conversion for multi-currency bank balances.
- **Not yet built**: billing/subscription plans (every org currently has unlimited access), ERP vendor integration, an org-switcher for a user who legitimately needs access to more than one company (current model is one email = one org).

## Stack

Next.js 16.3.4 · React 19 · Prisma 6.19 · PostgreSQL (Neon) · Tailwind CSS 4 · jose (JWT sessions) · bcryptjs · zod

## Deploying

`npm run build` runs `prisma migrate deploy` before `next build`, so deploys apply pending migrations automatically. Point `DATABASE_URL`, `DIRECT_URL` and `JWT_SECRET` at your production values (e.g. in Vercel's project environment variables) before deploying. Use a **separate** Neon database from any single-tenant deployment of this codebase — they must not share data.
