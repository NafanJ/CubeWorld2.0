# CubeWorld2.0

A small multiplayer/world simulation project using Supabase for backend and Next.js for the web UI.

## Overview

CubeWorld2.0 combines a Next.js frontend with a Supabase backend. The repository includes:

- a Next.js app (web/) for the UI
- Supabase configuration, migrations and seed files (supabase/ and migrations/)
- an edge function (`supabase/functions/tick`) that advances the world tick and injects messages from active agents

This README explains how to run the project locally, where to find the important pieces, and how to deploy.

## Tech stack

- Frontend: Next.js (app router)
- Backend: Supabase (Postgres, Realtime, Auth, Storage)
- Edge functions: Deno-based Supabase Edge Functions (example: `tick`)

## Quick start (development)

Prerequisites:

- Node.js (recommend Node 18+)
- npm / pnpm / yarn
- Supabase CLI (for running local Supabase and deploying functions)

1. Start the Supabase local stack (from repo root):

	- Ensure you have the Supabase CLI installed. See https://supabase.com/docs/guides/cli
	- Start the local Supabase services (this will start the database, API and Studio):

	  supabase start

	NOTE: `supabase/config.toml` in the repo configures local ports (API: 54321, DB: 54322, Studio: 54323).

2. Apply migrations and seeds (if using the Supabase migration flow):

	- Use the Supabase CLI to push migrations: `supabase db push` or run the repo's migration workflow.
	- If you want to reset and run seeds locally, use the CLI's reset commands per Supabase docs.

3. Run the frontend (web):

	cd web
	npm install
	npm run dev

	The app will be available at http://localhost:3000 by default.

4. Run or deploy the edge function (tick):

	- For local testing, you can run Supabase functions locally (see Supabase docs):
	  `supabase functions serve tick`

	- The included `tick` function (under `supabase/functions/tick/index.ts`) is a Deno-based edge function that:
	  - reads active agents from the `agents` table
	  - inserts short, friendly messages into `messages`
	  - updates `world_state.tick`

	- When deploying to Supabase, use `supabase functions deploy tick` (see Supabase docs for auth and project flags).

5. Environment variables

	- For local development, the edge function expects environment variables such as `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or the CLI will inject them when serving/deploying).
	- When running the function in Deno or other contexts, ensure the correct service role key is available for write operations.

## Project layout

- `web/` — Next.js frontend. Main scripts in `web/package.json` include `dev`, `build`, `start`, and `lint`.
- `supabase/` — Supabase project configuration (config.toml), functions and other Supabase-related files.
- `migrations/` — SQL migrations for the database schema.
- `public/` — Static assets served by Next.js.

## Key files

- `supabase/config.toml` — local Supabase configuration (ports, features).
- `supabase/functions/tick/index.ts` — edge function that advances the world tick and posts messages from agents.
- `web/src/app/page.tsx` — default Next.js app entry page (edit this to start building the UI).

## How the `tick` function works (summary)

- The `tick` function queries the `agents` table for active agents.
- It selects a friendly message per active agent and inserts a new row into `messages` with `from_agent` and `room_id`.
- It then updates the `world_state` (e.g. `tick` timestamp) so the system can track progress.

This is a small helper function designed to demonstrate scheduled/edge logic; adapt it to your game's rules.

## Deployment

- Frontend: Deploy the `web/` Next.js app to Vercel, Netlify, or your favorite host. `web/package.json` provides `build` and `start` scripts.
- Backend: Deploy Supabase changes (migrations, functions) using the Supabase CLI and the Supabase dashboard.

## Contributing

- If you'd like to contribute, open issues or PRs. For code changes, follow the Next.js/TypeScript style in the `web/` app.
- Add tests or small examples when introducing non-trivial logic.

## Notes & next steps

- The repo already contains a simple edge function and Supabase config; you can extend the `tick` logic to use LLMs or more sophisticated world simulation later.
- Consider adding a `README.dev.md` with development checks, or a `Makefile`/`dev` script to orchestrate supabase + web startup.

## License

MIT — change as appropriate.

---

If you want, I can also:

- add a small `dev` script at repo root to start Supabase and the web app together,
- create a `README.dev.md` with explicit commands and environment variables, or
- add a short CONTRIBUTING.md template.

Tell me which of these you'd like next.