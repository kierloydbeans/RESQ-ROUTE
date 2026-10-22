# RESQ-ROUTE Handover

## Project at a glance

RESQ-ROUTE includes a Vite/React dashboard, a Flutter mobile client, a FastAPI backend, and a PostgreSQL/Supabase database. Setup and environment variable references are in [README.md](./README.md).

## Implemented workflows

- Public landing page at `/`; signed-in users retain the dashboard root route.
- Shared persisted dark/light theme across dashboard and landing page.
- Citizen profile settings, household records, and center-proximity QR generation.
- Center-coordinator role/assignment, center-scoped dashboard data, QR scanner, and household check-in to `public.evacuee`.
- Inventory shipments and arrival updates, plus coordinator dashboard statistics and exports.
- Responsive coordinator headers, profile sign-out menus, active-alert counts, and animated error/recovery screen.

## Database state and migrations

The repository contains migrations `001`–`022` under `database/migrations/`. Apply outstanding migrations in numeric order before using database-dependent features. In particular:

| Migration | Purpose |
| --- | --- |
| `019_create_inventory_shipments.sql` | Creates shipment records, constraints, indexes, and service-role access |
| `020_add_center_coordinator_assignments.sql` | Adds the center-coordinator role and assigned-center relationship |
| `021_add_citizen_households.sql` | Creates household and household-member records |
| `022_add_household_check_in_fields.sql` | Adds household/check-in fields and indexes to singular `public.evacuee` |

The application code intentionally writes check-ins to the singular `public.evacuee` table. Do not change it to `evacuees` without updating the database and all related queries together. Migration application is a deployment/database-owner operation and has not been performed by this handover.

## Local development

1. Create and configure `backend-api/.env` using the required keys in [README.md](./README.md).
2. Install backend dependencies from `backend-api/requirements.txt`.
3. Apply outstanding migrations to the configured PostgreSQL/Supabase database.
4. Configure `dashboard-web/.env.local`; install dependencies with `npm ci`.
5. Run the backend with `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000` from `backend-api/`, and run the dashboard with `npm run dev` from `dashboard-web/`.

The Vite dev server listens on port `3000` and proxies API/WebSocket traffic to the backend URL configured by `VITE_API_URL` (WebSocket URL may be set with `VITE_WS_URL`). The backend engine uses `NullPool`, disables both asyncpg/SQLAlchemy statement caches, and creates unique prepared-statement names for PgBouncer compatibility. Do not commit `.env`, `.env.local`, service-role keys, or database credentials.

## Frontend dependency notes

`dashboard-web/package.json` and `dashboard-web/package-lock.json` are the dashboard dependency manifests. Node.js 18 or newer is required. The root `package.json` is separate from the dashboard manifest; do not use it as the source of the Vite app's dependencies.

## Before handoff/deployment

- Confirm the target database has every required migration and that the backend's database/Supabase credentials are configured securely.
- Verify the dashboard's Supabase URL and public anon key, API URL, WebSocket URL, and map style URL for the target environment.
- Build the dashboard from `dashboard-web/` with `npm run build`.
- Exercise citizen settings/household save, the within-50-metre QR visibility condition, QR scanning/check-in, and center-scoped evacuee/inventory behavior against a non-production test database.
- Confirm email delivery and external routing provider configuration if those workflows are enabled in the deployment.

Database-backed workflows cannot be fully validated without the configured service and schema. Keep operational testing on test data; do not check in real resident or incident data.
