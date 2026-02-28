# CLAUDE.md — CubeWorld2.0

AI assistant guide for understanding and developing CubeWorld2.0: an AI-driven cozy village simulation.

---

## Project Overview

CubeWorld2.0 is a real-time, multiplayer world simulation where AI agents inhabit a 3×3 grid of rooms. Each agent has a personality (traits, quirks, interests, speech patterns) and autonomously moves between rooms, interacts with other agents, and generates contextually appropriate messages. A scheduled edge function drives the simulation forward every 5 minutes.

**Tech Stack:**
- **Frontend**: React 18 + TypeScript 5.5 + Vite + Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Realtime, Auth, Storage, Edge Functions)
- **Edge Runtime**: Deno 2 (Supabase Edge Functions)
- **AI**: OpenAI API (primary) + multi-LLM support (Anthropic, Cohere, Mistral)
- **CI/CD**: GitHub Actions (cron-triggered tick)

---

## Repository Structure

```
CubeWorld2.0/
├── .github/workflows/
│   └── cozy-village-tick.yml   # Cron job: calls /tick every 5 minutes
├── supabase/
│   ├── config.toml             # Local Supabase dev config (ports, services)
│   ├── functions/
│   │   └── tick/
│   │       └── index.ts        # Core simulation engine (Deno edge function)
│   └── migrations/
│       ├── 001_init.sql        # Schema: rooms, agents, messages, diary_entries,
│       │                       #         relationships, world_state
│       └── 002_seed.sql        # Seed: 9 rooms, 6 agents, initial world_state
└── web/
    ├── src/
    │   ├── App.tsx             # Root layout (3-column grid)
    │   ├── index.tsx           # React entry point
    │   ├── index.css           # Global styles (Press Start 2P font, pixel utilities)
    │   ├── lib/
    │   │   └── supabase.ts     # Supabase client init (VITE_SUPABASE_* env vars)
    │   └── components/
    │       ├── App.tsx         # Layout shell
    │       ├── PixelRoomGrid.tsx   # 3×3 room grid with agent avatars
    │       ├── RoomCard.tsx        # Individual room tile
    │       ├── ElevatorCard.tsx    # Elevator shaft visualization
    │       ├── ChatPanel.tsx       # Right-side panel with 3 tabs
    │       ├── ChatLogTab.tsx      # Realtime agent message feed
    │       ├── ChatMessage.tsx     # Single message renderer
    │       ├── StatusTab.tsx       # Agent mood/energy/trait cards
    │       └── SystemTab.tsx       # World stats (tick count, rules, agent counts)
    ├── vite.config.ts
    ├── tsconfig.json
    ├── tailwind.config.js
    ├── .eslintrc.cjs
    └── package.json
```

---

## Development Workflows

### Prerequisites

- Node.js (LTS) and npm
- Supabase CLI (`npm install -g supabase` or use root-level dev dep)
- Docker (for local Supabase stack)

### Local Development

```bash
# 1. Start local Supabase stack (runs DB, Auth, Storage, Studio, Edge Runtime)
supabase start

# 2. Apply migrations and seed data
supabase db reset       # runs 001_init.sql then 002_seed.sql

# 3. Install web dependencies and start dev server
cd web
npm install
npm run dev             # Vite dev server at http://localhost:5173
```

**Required environment variables for the web app** (create `web/.env.local`):
```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<anon key from `supabase status`>
```

**Required secrets for the edge function** (set in Supabase dashboard or `.env`):
- `OPENAI_API_KEY` — Primary LLM provider
- `CRON_SECRET` — Authorization header for GitHub Actions cron call
- Other provider keys as needed (Anthropic, Cohere, Mistral)

### Running the Simulation Locally

```bash
# Invoke the tick edge function manually
supabase functions serve tick
curl -X POST http://localhost:54321/functions/v1/tick \
  -H "Authorization: Bearer <SUPABASE_ANON_KEY>"
```

### Lint

```bash
cd web
npm run lint            # ESLint with TypeScript + React Hooks rules
```

### Build

```bash
cd web
npm run build           # TypeScript compile + Vite production build → dist/
npm run preview         # Preview the production build locally
```

### Deployment

```bash
# Deploy edge functions
supabase functions deploy tick

# Deploy database changes
supabase db push

# Frontend: deploy dist/ to any static host (Vercel, Netlify, etc.)
```

---

## Key Conventions

### TypeScript / React

- **Functional components only** — no class components.
- **Hooks pattern**: `useState`, `useEffect`, `useCallback`, `useRef` are the primary hooks used.
- **Mounted-ref pattern** to avoid state updates on unmounted components:
  ```ts
  const isMounted = useRef(true);
  useEffect(() => { return () => { isMounted.current = false; }; }, []);
  ```
- **Tabs are mounted but hidden** (not conditionally rendered) to preserve scroll state and cached data across tab switches.
- **Agent color mapping** is defined once and passed down or derived consistently — always use the same color for the same agent name across all tabs.
- **Skeleton loading states** should be shown while initial data fetches are in-flight.

### Supabase / Realtime

- Use `.on('postgres_changes', ...)` subscriptions for live data (messages, agents).
- The **anon key** is safe for read operations; all writes from the frontend must be gated appropriately.
- **Service role key** is used exclusively in edge functions for DB writes — never expose it to the client.
- Query pattern:
  ```ts
  const { data, error } = await supabase
    .from('table')
    .select('col1, col2, relation(*)')
    .eq('field', value)
    .order('created_at', { ascending: false })
    .limit(100);
  ```

### Database Schema Conventions

- All tables have `id uuid primary key default gen_random_uuid()`.
- Timestamps use `timestamptz default now()`.
- Flexible/variable data is stored as `jsonb` (e.g., `persona`, `memory`, `rules`).
- Row-level security is **enabled on all tables**; anon users can `SELECT`, edge functions use service role to `INSERT`/`UPDATE`.
- Realtime is enabled on `messages` and `agents` tables.

### Edge Function (Deno)

- Located at `supabase/functions/tick/index.ts`.
- Runs on Deno 2; use `deno.land/std` and npm-compatible imports via `npm:` specifier.
- The tick function:
  1. Fetches all active agents and their current rooms.
  2. Runs a **pathfinding algorithm** that routes agents through elevators when changing floors.
  3. For each agent, generates an AI message using the agent's persona, current room context, and nearby agents.
  4. Writes new messages and updated agent positions back to the database.
- **Rate limit handling**: OpenAI API errors trigger exponential backoff with fallback messages.
- Authorization: requests must include `Authorization: Bearer <CRON_SECRET>` or the anon key.

### Styling

- **Tailwind CSS** is the primary styling tool — avoid custom CSS unless necessary.
- **Pixel art aesthetic**: use the custom classes `.pixel-text`, `.pixel-border`, `.pixel-border-sm` defined in `index.css`.
- Font: **Press Start 2P** (Google Fonts) for all UI text to maintain retro feel.
- Color palette: dark backgrounds with bright accent colors per-agent.
- Layout: 3-column desktop grid (`grid-cols-3`), stacked on mobile.

### CI/CD

- `.github/workflows/cozy-village-tick.yml` runs every 5 minutes via cron.
- It calls the deployed Supabase edge function with `SUPABASE_ANON_KEY` and `CRON_SECRET` secrets.
- Do not modify the cron schedule without considering rate limits on the LLM APIs.

---

## Database Tables Reference

| Table | Purpose |
|---|---|
| `rooms` | 9 rooms in a 3×3 grid; includes `floor`, `position`, `name`, `description`, `background_url` |
| `agents` | AI inhabitants; includes `persona` (jsonb), `current_room_id`, `mood`, `energy`, `is_active` |
| `messages` | Agent-generated messages; includes `agent_id`, `room_id`, `content`, `message_type` |
| `diary_entries` | Private agent reflections (not currently displayed in UI) |
| `relationships` | Pairwise agent affinities; managed via `upsert_affinity()` DB function |
| `world_state` | Single-row world config; includes `tick_count`, `rules` (jsonb) |

---

## World Layout

```
Floor 3:  [Garden Nook]  [Library]   [Workshop]
           [Elevator 3] (connects floors 2–3)
Floor 2:  [Square]      [Porch]     [Studio]
           [Elevator 2] (connects floors 1–2)
Floor 1:  (future expansion)
```

Elevators are special rooms that agents must pass through when moving between floors. The pathfinding logic in the tick function handles this routing automatically.

---

## Common Pitfalls

1. **Forgetting to restart Supabase after config changes** — `supabase stop && supabase start` after editing `config.toml`.
2. **Missing env vars** — The web app silently fails if `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` are not set.
3. **Edge function writes failing** — Edge functions must use the `SERVICE_ROLE_KEY` (not anon key) to bypass RLS for writes.
4. **Realtime subscriptions leaking** — Always return an unsubscribe function from `useEffect` when setting up `.on()` subscriptions.
5. **Tab state loss** — Do not conditionally unmount tab components; use CSS `display: none` or Tailwind `hidden` to hide inactive tabs while keeping them mounted.
6. **Agent color inconsistency** — Derive agent colors from a single shared mapping rather than computing them independently in each component.

---

## Agent Personality Schema (jsonb)

Agents' `persona` column follows this structure:
```json
{
  "background": "Brief character backstory",
  "traits": ["curious", "witty"],
  "interests": ["books", "gardening"],
  "quirks": ["speaks in riddles", "collects pebbles"],
  "speech_patterns": ["uses ellipses often", "formal vocabulary"],
  "relationships": {}
}
```

The tick function constructs an LLM prompt using these fields plus the agent's current room and nearby agents.
