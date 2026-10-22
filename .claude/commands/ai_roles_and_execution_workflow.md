# AI Persona Roles, Tools & Execution Workflow

This document outlines the specialized AI persona roles, tool assignments, system prompts, and execution rules for developing the **RESQ-ROUTE** Capstone Application.

---

## 1. System Roles & Tool Matrix

| Persona / Role | AI Engine / Command | Primary Responsibilities |
| :--- | :--- | :--- |
| **Senior System Architect & Backend Dev** | `fcc-claude` (Claude Code) | FastAPI REST API development, asyncpg, SQLModel, business logic, system architecture. |
| **Senior Frontend Dev** | `fcc-claude` (Claude Code) | React JS (Vite), Tailwind CSS dashboard layout, state management, UI component reactivity. |
| **GIS & Spatial Routing Specialist** | `fcc-claude` (`/gis`) | MapLibre GL JS integration, GeoJSON parsing, PostGIS spatial queries, dynamic routing logic. |
| **Database & Supabase Administrator** | `fcc-codex` / `fcc-claude` (`/db`) | PostgreSQL schema migrations, Row-Level Security (RLS) policies, database triggers, data seeding. |
| **Senior Mobile Developer** | `fcc-claude` (`/mobile`) | Mobile UI layouts, offline asset caching, low-latency API handling for client mobile apps. |
| **Data Science & Disaster Prediction Dev** | `fcc-claude` / GPT-4o | Machine Learning pipelines (`scikit-learn`, `xgboost`), flood/landslide hazard scoring heuristics. |
| **QA Automation & Security Auditor** | `fcc-codex` (Codex) | `pytest` test suites, edge-case validation, CORS check, SQL injection/vulnerability scanning. |
| **Documentation & Handover Lead** | Gemini (Free) | Generating `HANDOVER.md` summaries, Capstone Chapters 3 & 4 documentation, Mermaid.js diagrams. |

---

## 2. Configured Custom Commands (`.claude/commands/`)

### A. GIS Specialist (`.claude/commands/gis.md`)
```markdown
Act as a Senior GIS Software Engineer and Spatial Data Analyst.
When reviewing $ARGUMENTS:
1. Optimize MapLibre GL / Leaflet rendering performance for geospatial layers.
2. Structure dynamic routing, spatial indexing, and GeoJSON payload responses.
3. Ensure low latency and clean error handling for spatial API endpoints.
```

### B. Supabase Database Admin (`.claude/commands/db.md`)
```markdown
Act as a Lead Database Administrator for Supabase and PostgreSQL.
When reviewing $ARGUMENTS:
1. Verify clean, non-destructive SQL / SQLModel migrations.
2. Ensure correct Row-Level Security (RLS) policies and index optimization.
3. Keep database triggers and foreign key cascades safe and efficient.
```

### C. Mobile Developer (`.claude/commands/mobile.md`)
```markdown
Act as a Senior Mobile App Developer.
When reviewing $ARGUMENTS:
1. Focus on mobile-first UI responsiveness and offline data caching.
2. Optimize API fetch states and reduce client payload sizes.
3. Ensure cross-platform compatibility for mobile views.
```

---

## 3. Standard Operating Workflow

### Step 1: Pre-Execution Guardrail
Before letting the AI output large code blocks, force clarity by appending:
> *"Summarize your implementation plan in 3 concise bullet points before editing files."*

### Step 2: Running Specialized Roles in VS Code Terminal
* **Backend / Frontend / Mobile / GIS Tasks:** Run `fcc-claude` in the terminal.
  * Use slash commands as needed: `/gis <file>`, `/db <file>`, `/mobile <file>`.
* **Database Migrations / QA Audits:** Open a separate terminal tab and run `fcc-codex`.

### Step 3: Daily Session Handover (`HANDOVER.md`)
At the end of every coding sprint:
1. Copy the session terminal log or run `/compact` in Claude Code.
2. Open **Gemini Free** and submit the log with the prompt below:

> *"Act as an AI Session Summarizer. Review this terminal transcript and generate a `HANDOVER.md` file formatted as follows:*
> - **Features Completed Today:** Summary of modified endpoints, files, and UI pages.
> - **Active Bugs / Edge Cases:** Current open errors or broken functions.
> - **Next Session Priorities:** Top 3 concrete engineering tasks for the next run."*

3. Save the output to `HANDOVER.md` at the project root.
4. On the next session start, type into `fcc-claude`:
   > `"Read HANDOVER.md and summarize our next task before writing code."`