# CareerBridge SA

CareerBridge SA helps South African job seekers improve their CV, find relevant local roles, practise interviews, and apply for human career coaching.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/careerbridge-sa/src/App.tsx` — routed web experience for landing, diagnostics, job matches, interview practice, and coaching.
- `artifacts/careerbridge-sa/src/index.css` — CareerBridge visual tokens and global styling.
- `artifacts/api-server/src/routes/career.ts` — career API routes and seeded job feed.
- `lib/api-spec/openapi.yaml` — source-of-truth API contract; regenerate clients after changes.
- `lib/db/src/schema/career.ts` — Drizzle schema for jobs, diagnostic reports, and coaching applications.

## Architecture decisions

- The frontend uses generated React Query hooks from the shared OpenAPI contract rather than hand-written API types.
- Job matches are seeded on first request so the first experience is useful while the schema remains ready for persisted records.
- CV uploads currently persist the file name and diagnostic report; document-byte storage/parsing can be added without changing the report contract.
- Coaching applications are saved to PostgreSQL and return a confirmation message directly to the applicant.

## Product

- Evidence-based CV diagnostic report with authenticity and ATS signals.
- South African job feed with location and sector filtering.
- Interview practice prompts tied to measurable CV claims.
- 12-week coaching program with payment-plan selection and intake submission.

## User preferences

No additional preferences recorded.

## Gotchas

- Run `pnpm --filter @workspace/api-spec run codegen` after editing `lib/api-spec/openapi.yaml`.
- The generated client uses `Headers.entries()`, so `DOM.Iterable` must remain in the shared client TypeScript libs.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
