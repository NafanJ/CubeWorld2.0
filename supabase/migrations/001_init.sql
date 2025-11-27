create extension if not exists pgcrypto;

create table rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  x int not null,
  y int not null,
  theme text default 'neutral'
);

create table agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  provider text not null check (provider in ('openai','anthropic','cohere','mistral','other')),
  model text not null,
  room_id uuid references rooms(id) on delete set null,
  persona jsonb not null default '{}',
  mood int not null default 0,          -- -5..5
  energy int not null default 5,        -- 0..5 (UI shows 5 bars)
  memory jsonb not null default '[]',   -- recent snippets
  last_tick_at timestamptz,
  is_active boolean not null default true
);

create table messages (
  id bigserial primary key,
  ts timestamptz not null default now(),
  from_agent uuid references agents(id) on delete set null,
  room_id uuid references rooms(id) on delete set null,
  content text not null,
  mood_tag text
);

create table diary_entries (
  id bigserial primary key,
  ts timestamptz not null default now(),
  agent_id uuid references agents(id) on delete cascade,
  text text not null
);

create table relationships (
  id bigserial primary key,
  a uuid references agents(id) on delete cascade,
  b uuid references agents(id) on delete cascade,
  affinity int not null default 0,
  unique (a,b)
);

create table world_state (
  id int primary key check (id=1),
  tick bigint not null default 0,
  rules jsonb not null default '{}'
);
insert into world_state(id) values (1) on conflict do nothing;

-- RLS
alter table rooms enable row level security;
alter table agents enable row level security;
alter table messages enable row level security;
alter table diary_entries enable row level security;
alter table relationships enable row level security;
alter table world_state enable row level security;

create policy "read_all" on rooms for select using (true);
create policy "read_all" on agents for select using (true);
create policy "read_all" on messages for select using (true);
create policy "read_all" on diary_entries for select using (true);
create policy "read_all" on relationships for select using (true);
create policy "read_all" on world_state for select using (true);

-- Enable Realtime for specific tables
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table agents;
create policy "no_client_inserts" on diary_entries for insert with check (false);
create policy "no_client_updates_agents" on agents for update with check (false);
create policy "no_client_updates_world" on world_state for update with check (false);

create or replace function upsert_affinity(a_id uuid, b_id uuid, d int)
returns void language plpgsql as $$
begin
  insert into relationships(a,b,affinity) values (a_id,b_id,d)
  on conflict (a,b) do update set affinity = relationships.affinity + excluded.affinity;
end $$;
