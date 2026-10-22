# RESQ-ROUTE

RESQ-ROUTE is a disaster-response coordination platform for residents and emergency response teams. It combines a React web dashboard, a Flutter mobile app, a FastAPI backend, and a PostgreSQL/Supabase database.

## Project components

| Directory | Purpose |
| --- | --- |
| `dashboard-web/` | React + Vite dashboard and public landing page for coordinators, center coordinators, and citizens |
| `mobile-app/` | Flutter mobile application |
| `backend-api/` | FastAPI API, WebSocket service, and SQLModel database access |
| `database/migrations/` | Ordered PostgreSQL schema migrations |
| `db/` | Database setup and inventory SQL helpers |

## Main capabilities

- Emergency alerts, incident and hazard reporting, shelter discovery, and routing
- Coordinator dashboards for response operations, center occupancy, inventory, and shipments
- Center coordinator assignments and center-scoped evacuee/inventory workflows
- Citizen account settings and household management
- Citizen evacuation check-in QR codes and coordinator scanning/check-in to the singular `public.evacuee` table
- Responsive public landing page and authenticated dashboard views
- JWT-authenticated API endpoints and WebSocket telemetry

## Requirements

- Python 3.10 or newer
- Node.js 18 or newer and npm
- PostgreSQL compatible with the supplied schema, or a configured Supabase PostgreSQL project
- Flutter SDK for the mobile app

Python dependencies are listed in `backend-api/requirements.txt`; the root `requirements.txt` includes that file for convenience. Dashboard dependencies are declared and locked in `dashboard-web/package.json` and `dashboard-web/package-lock.json`.

## Setup

### 1. Configure the backend

Create a virtual environment and install dependencies:

```powershell
cd backend-api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Create `backend-api/.env` with the required settings:

```env
DATABASE_URL=postgresql+asyncpg://USER:PASSWORD@HOST:PORT/DATABASE
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_KEY=YOUR_SERVER_SIDE_SUPABASE_KEY
SECRET_KEY=GENERATE_A_LONG_RANDOM_SECRET
BREVO_API_KEY=YOUR_BREVO_API_KEY
BREVO_API_URL=YOUR_BREVO_API_ENDPOINT
EMAILS_FROM_EMAIL=YOUR_SENDER_EMAIL
```

Optional backend settings include `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `CORS_ORIGINS`, `EMAILS_FROM_NAME`, `VALHALLA_URL`, `OSRM_URL`, `GRAPHHOPPER_URL`, and `GRAPHHOPPER_API_KEY`. Keep secrets in local environment files or a secret manager; do not commit them.

### 2. Apply database migrations

Apply migrations in numeric order from the repository root. For a fresh database, apply every migration from `001_initial_schema.sql` through the latest migration. Existing databases should apply only migrations not yet applied, also in numeric order.

Example using `psql` and a `DATABASE_URL` environment variable:

```powershell
psql "postgresql://USER:PASSWORD@HOST:PORT/DATABASE" -v ON_ERROR_STOP=1 -f database/migrations/001_initial_schema.sql
```

Repeat for each migration through `022_add_household_check_in_fields.sql`. Migrations `019`–`022` add shipment, center-coordinator assignment, household, and household check-in support. Ensure the database role used by the API has the expected access; the household and shipment migrations grant table access to Supabase `service_role`.

The API also initializes SQLModel-declared tables at startup. This does not replace applying the SQL migrations, which contain required indexes, constraints, enum changes, and policies/grants.

### 3. Configure and run the dashboard

Create `dashboard-web/.env.local`:

```env
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
VITE_MAP_STYLE_URL=YOUR_MAP_STYLE_URL
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Install the locked frontend dependencies and run the development server:

```powershell
cd dashboard-web
npm ci
npm run dev
```

The dashboard is served at `http://localhost:3000`. Build it for production with `npm run build`; preview the production build with `npm run preview`.

### 4. Run the backend

From `backend-api/`, start the API:

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The interactive API documentation is available at `http://localhost:8000/docs`; the health endpoint is `http://localhost:8000/health`.

### 5. Run the mobile app

Install Flutter dependencies and start the app on a connected device or emulator:

```powershell
cd mobile-app
flutter pub get
flutter run
```

## Dependency manifests

- Root `requirements.txt`: convenience include for the backend Python requirements.
- `backend-api/requirements.txt`: backend runtime dependencies.
- `dashboard-web/package.json`: frontend runtime and development dependencies.
- `dashboard-web/package-lock.json`: exact npm dependency resolution; use `npm ci` for reproducible installs.
- `mobile-app/pubspec.yaml`: Flutter dependencies.

## Development checks

```powershell
cd dashboard-web
npm run build
```

Run API checks with the configured backend virtual environment. Database-dependent behavior requires a reachable PostgreSQL/Supabase instance with all applicable migrations applied.
