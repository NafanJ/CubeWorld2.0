# CLAUDE.md — CubeWorld2.0

AI assistant guide for understanding and developing CubeWorld2.0: an AI-driven cozy village simulation.

---

## Project Overview

CubeWorld2.0 is a real-time, multiplayer world simulation where AI agents inhabit a 3×3 grid of rooms. Each agent has a personality (traits, quirks, interests, speech patterns) and autonomously moves between rooms, interacts with other agents, and generates contextually appropriate messages. A scheduled edge function drives the simulation forward every 5 minutes. Visitors can send @mention messages that trigger instant agent replies.

**Tech Stack:**
- **Frontend**: React 18.3.1 + TypeScript 5.5 + Vite + Tailwind CSS 3.4.17
- **Backend**: Supabase (PostgreSQL, Realtime, Auth, Storage, Edge Functions)
- **Edge Runtime**: Deno 2 (Supabase Edge Functions)
- **AI**: OpenAI API (primary) + multi-LLM support (Anthropic, Cohere, Mistral)
- **CI/CD**: GitHub Actions (cron-triggered tick every 5 minutes)
- **Icons**: lucide-react 0.522.0

---

## Repository Structure

```
CubeWorld2.0/
├── .github/workflows/
│   └── cozy-village-tick.yml   # Cron job: calls /tick every 5 minutes
├── supabase/
│   ├── config.toml             # Local Supabase dev config (ports, services)
│   ├── functions/
│   │   ├── tick/
│   │   │   └── index.ts        # Core simulation engine (Deno edge function)
│   │   └── reply/
│   │       └── index.ts        # Instant @mention + DM reply handler
│   └── migrations/
│       ├── 001_init.sql        # Schema: rooms, agents, messages, agent_logs,
│       │                       #         relationships, world_state + RLS policies
│       ├── 002_seed.sql        # Seed: 9 rooms, 6 agents, initial world_state
│       ├── 003_increment_tick.sql  # increment_tick_count() security-definer function
│       ├── 004_feature_updates.sql # Realtime publication + anon visitor message policy
│       ├── 005_channel_column.sql  # Add channel column to messages (group/dm routing)
│       ├── 006_rename_diary_to_agent_logs.sql  # Rename diary_entries → agent_logs
│       └── 007_realtime_world_state.sql  # Add world_state to realtime + replica identity
└── web/
    ├── src/
    │   ├── App.tsx             # Root layout (responsive 60/40 split + mobile toggle)
    │   ├── index.tsx           # React entry point
    │   ├── index.css           # Global styles (Press Start 2P font, pixel utilities)
    │   ├── lib/
    │   │   ├── supabase.ts     # Supabase client init (VITE_SUPABASE_* env vars)
    │   │   └── colorUtils.ts   # 18-color agent palette mapping
    │   └── components/
    │       ├── PixelRoomGrid.tsx   # 3×3 room grid with agent avatars
    │       ├── RoomCard.tsx        # Individual room tile
    │       ├── ElevatorCard.tsx    # Elevator shaft visualization
    │       ├── ChatPanel.tsx       # Right-side panel with 4 tabs; owns colorMap
    │       ├── ConversationList.tsx # Group chat + per-agent DM directory
    │       ├── ChatLogTab.tsx      # Message feed (group or DM) + @mention autocomplete
    │       ├── ChatMessage.tsx     # Single message renderer
    │       ├── StatusTab.tsx       # Agent mood/energy/trait cards
    │       ├── SystemTab.tsx       # World stats + manual tick trigger button
    │       └── DiaryTab.tsx        # AgentLogsTab — movement/rest activity log viewer
    ├── vite.config.ts
    ├── tsconfig.json           # Strict mode, ES2020 target
    ├── tailwind.config.js
    ├── postcss.config.js
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
supabase db reset       # runs 001 → 002 → 003 → 004 migrations in order

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

**Required secrets for edge functions** (set in Supabase dashboard or local `.env`):
- `OPENAI_API_KEY` — Primary LLM provider
- `CRON_SECRET` — Authorization header for GitHub Actions cron call
- Other provider keys as needed (Anthropic, Cohere, Mistral)

### Running Edge Functions Locally

```bash
# Serve edge functions locally
supabase functions serve tick
supabase functions serve reply

# Invoke tick manually
curl -X POST http://localhost:54321/functions/v1/tick \
  -H "Authorization: Bearer <SUPABASE_ANON_KEY>"

# Invoke reply with an @mention
curl -X POST http://localhost:54321/functions/v1/reply \
  -H "Authorization: Bearer <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello @Mellie!", "mentions": {"agents": ["Mellie"], "rooms": []}}'
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
supabase functions deploy reply

# Deploy database changes
supabase db push

# Frontend: deploy dist/ to any static host (Vercel, Netlify, etc.)
```

---

## Key Conventions

### TypeScript / React

- **Functional components only** — no class components.
- **Hooks pattern**: `useState`, `useEffect`, `useCallback`, `useRef` are the primary hooks.
- **Mounted-ref pattern** to avoid state updates on unmounted components:
  ```ts
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);
  ```
- **Tabs are mounted but hidden** (not conditionally rendered) to preserve scroll state and cached data across tab switches. Use `style={{ display: active ? 'flex' : 'none' }}` (not conditional rendering).
- **Agent color mapping** lives in `lib/colorUtils.ts`, is built once in `ChatPanel`, and propagated as props to all child tab components. Never compute colors independently in leaf components.
- **Skeleton loading states** should be shown while initial data fetches are in-flight.

### Color System (`lib/colorUtils.ts`)

- Exports an 18-color palette and `buildAgentColorMap(agents)` utility.
- Colors are assigned by sorting agents alphabetically and cycling through the palette — produces stable, consistent colors per agent across all sessions.
- `ChatPanel` is the single owner of `colorMap` (agent_id → Tailwind color string); it passes this and `nameMap` (agent_id → name) as props to every tab.

### Supabase / Realtime

- Use `.channel('public:table').on('postgres_changes', ...)` subscriptions for live data.
- Always clean up subscriptions on unmount:
  ```ts
  useEffect(() => {
    const channel = supabase.channel(...).on(...).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);
  ```
- The **anon key** is safe for reads and for visitor message inserts (where `from_agent IS NULL`).
- **Service role key** is used exclusively inside edge functions for all DB writes — never expose it to the client.
- Realtime publication (`supabase_realtime`) includes: `messages`, `agents`, `agent_logs`, `relationships`, `world_state`.
- `agents` and `world_state` have `REPLICA IDENTITY FULL` to support UPDATE event streaming.
- Standard query pattern:
  ```ts
  const { data, error } = await supabase
    .from('table')
    .select('col1, col2, relation(*)')
    .eq('field', value)
    .order('created_at', { ascending: false })
    .limit(100);
  ```

### Database Schema Conventions

- `messages`, `agent_logs`, `relationships` use `bigserial` primary keys; all other tables use `uuid`.
- `messages` has a `channel` column: `'group'` (default) for the shared group chat, `'dm:<agent_uuid>'` for private DMs.
- Timestamps use `timestamptz default now()`.
- Flexible data is stored as `jsonb` (e.g., `persona`, `memory`, `rules`).
- Row-level security is **enabled on all tables**; anon users can `SELECT`; edge functions use service role to `INSERT`/`UPDATE`.
- Exception: anon users may insert into `messages` where `from_agent IS NULL` (visitor messages via `allow_anon_user_messages` policy).

### Edge Functions (Deno)

Located at `supabase/functions/tick/index.ts` and `supabase/functions/reply/index.ts`. Runs on Deno 2; use `deno.land/std` and `npm:` specifier for npm-compatible imports.

**Tick function — 5 phases per invocation:**
1. **Movement** — Agents follow pre-computed `persona.path` arrays, or pick new destinations (15% random, 40% toward high-affinity agents, else random avoiding disliked agents). Elevators (x=1) are never valid destinations — agents only pass through them. Movement and rest messages are logged to `agent_logs` (not the group chat). Pathfinding routes through elevator when changing floors.
2. **Affinity Updates** — Co-located agents gain +1 affinity via `upsert_affinity()` RPC.
3. **Independent Group Chat Messages** — Each agent independently posts to the shared group chat with awareness of the full recent conversation (last 30 messages from all agents). Agents write in first person. ~30% random skip per tick for natural pacing. Context includes: traits, mood, energy, current room, co-located agents + affinities. LLM returns `{"message": "...", "mood_delta": -1|0|1}`.
4. *(Reserved for idle energy recovery)*
5. **Tick Increment** — Calls `increment_tick_count()` RPC.

**Reply function flow:**
1. Receives `{content, mentions, channel}` from frontend. `channel` is `'group'` or `'dm:<agent_id>'`.
2. Inserts visitor message (`from_agent: null`) with the appropriate channel.
3. For group chat: resolves @mentions (`@everyone` → all active agents cap 6; `@agent_name` → specific agent; `@room_name` → agents in that room cap 3). For DMs: target agent resolved from channel ID.
4. Generates and inserts a reply from each targeted agent via OpenAI. DM replies include conversation history as context.

**Authorization:** `x-cron-secret` header (GitHub Actions) or `Authorization: Bearer <ANON_KEY>`.

**Rate limit handling:** OpenAI 429 errors trigger exponential backoff (500ms + jitter). Fallback cosy message used if API fails entirely.

### @Mention System (ChatLogTab)

- Dropdown triggers when user types `@` in the input.
- Lists: `@everyone`, agent names, room names with avatar color indicators.
- Names sorted by length descending to avoid partial substring matches (e.g., "Garden Nook" matched before "Garden").
- On send with mentions: POST to `/functions/v1/reply`; falls back to direct message insert if that fails.
- Keyboard navigation: Arrow keys to browse, Enter/Tab to select, Escape to dismiss.
- Max input length: 200 characters.

### Styling

- **Tailwind CSS** is the primary styling tool — avoid custom CSS unless necessary.
- **Pixel art aesthetic**: use custom classes `.pixel-text`, `.pixel-border`, `.pixel-border-sm`, `.pixel-border-bottom`, `.pixel-room`, `.pixel-character` defined in `index.css`.
- Font: **Press Start 2P** (Google Fonts) for all UI text.
- Color palette: dark backgrounds with bright accent colors per-agent.
- Layout: `App.tsx` uses a 60/40 split (room grid / chat panel) on desktop; mobile shows a toggle ("VILLAGE" / "CHAT").
- CSS animations in `index.css`: `walk`, `sprite-walk`, `slideIn`.
- **Tailwind version note**: Root `package.json` has Tailwind 4.x for the PostCSS pipeline; `web/package.json` uses Tailwind 3.4.17. The web app uses v3 config and class syntax.

### Energy / Mood System

- **Mood**: integer −5 to +5. LLM returns `mood_delta` of −1, 0, or +1 per action, clamped in tick function.
- **Energy**: integer 0–5, displayed as 5 bars in StatusTab. Costs −1 per movement and per message/conversation turn.
- **Alone penalty**: mood decreases if an agent is alone for 3+ consecutive ticks (`memory.alone_ticks`).
- **Social bonus**: mood +1 if a high-affinity agent (affinity ≥ 5) is in the same room.

### CI/CD

- `.github/workflows/cozy-village-tick.yml` runs every 5 minutes via cron.
- Calls the deployed tick edge function with `SUPABASE_ANON_KEY` and `CRON_SECRET` secrets.
- Do not modify the cron schedule without considering LLM API rate limits.

---

## Database Tables Reference

| Table | Purpose |
|---|---|
| `rooms` | 9 rooms in a 3×3 grid; includes `x`, `y`, `name`, `description`, `background_url` |
| `agents` | AI inhabitants; includes `name`, `provider` (enum: openai/anthropic/cohere/mistral/other), `model`, `current_room_id`, `persona` (jsonb), `mood`, `energy`, `memory` (jsonb), `is_active` |
| `messages` | Agent and visitor messages; `from_agent` is null for visitor messages; includes `room_id`, `content`, `mood_tag`, `channel` (text: `'group'` or `'dm:<agent_uuid>'`) |
| `agent_logs` | Agent action logs (movement, rest); `agent_id`, `text`, `ts`; displayed in AgentLogsTab |
| `relationships` | Pairwise agent affinities (−10..10); managed via `upsert_affinity()` DB function |
| `world_state` | Single-row config (enforced by `check id=1`); includes `tick` counter and `rules` (jsonb) |

**DB Functions:**
- `upsert_affinity(a_id uuid, b_id uuid, d int)` — atomically increments affinity between two agents, clamped to −10..10.
- `increment_tick_count()` — security-definer function increments `world_state.tick`; used by edge function to bypass RLS without exposing service role key in queries.

---

## World Layout

```
Floor 3:  [Garden Nook]  [Elevator 3]  [Library]   [Workshop]
Floor 2:  [Square]       [Elevator 2]  [Porch]      [Studio]
Floor 1:  (future expansion)
```

Elevators occupy grid column x=1. Pathfinding: same floor → move horizontally; different floor → move to elevator (x=1), traverse floors, then move horizontally to destination. Paths stored in `agent.persona.path` array and consumed one room per tick.

---

## Agent Personality Schema (jsonb)

The `persona` column on `agents` follows this structure:

```json
{
  "background": "Brief character backstory",
  "traits": ["curious", "witty"],
  "interests": ["books", "gardening"],
  "quirks": ["speaks in riddles", "collects pebbles"],
  "speechPatterns": ["uses ellipses often", "formal vocabulary"],
  "communicationStyle": "warm and thoughtful",
  "path": ["<room_uuid>", "<room_uuid>"]
}
```

The tick function constructs an LLM prompt using these fields plus the agent's current room, nearby agents, current mood/energy, and recent visitor messages.

### Seeded Agents

| Name | Traits (sample) |
|---|---|
| Mellie | curious, warm |
| Pip | witty, energetic |
| Kiki | shy, creative |
| Odo | calm, observant |
| Rook | bold, organised |
| Luma | poetic, dreamy |

---

## Common Pitfalls

1. **Forgetting to restart Supabase after config changes** — `supabase stop && supabase start` after editing `config.toml`.
2. **Missing env vars** — The web app silently fails if `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` are not set.
3. **Edge function writes failing** — Edge functions must use `SERVICE_ROLE_KEY` (not anon key) to bypass RLS for writes.
4. **Realtime subscriptions leaking** — Always return `() => supabase.removeChannel(channel)` from `useEffect`.
5. **Tab state loss** — Do not conditionally unmount tab components; use `style={{ display: ... }}` to hide inactive tabs while keeping them mounted.
6. **Agent color inconsistency** — Always derive colors from `colorUtils.buildAgentColorMap()` in `ChatPanel` and pass the map as props. Never recompute independently in child components.
7. **Mention partial-match errors** — Sort agent/room names by length descending before building @mention regex to prevent shorter names masking longer ones.
8. **Visitor message RLS** — Visitor messages must have `from_agent: null`; the anon insert policy only applies where `from_agent IS NULL`.
9. **Tailwind v3 vs v4** — The web app uses Tailwind 3 syntax. Do not use v4-only utilities or config format in `web/`.
10. **Realtime UPDATE events unreliable** — Supabase Realtime may not fire UPDATE events for `agents` and `world_state` even with `REPLICA IDENTITY FULL`. All components using realtime subscriptions should include a 30-second polling fallback via `setInterval`.
11. **Channel field required on messages** — All message inserts must include `channel: 'group'` or `channel: 'dm:<agent_uuid>'`. Queries should filter by channel to avoid mixing group and DM messages.
12. **Elevator rooms as destinations** — Agents must never select elevator rooms (x=1) as destinations. Filter them out using `nonElevatorRoomIds` in the tick function.
