create or replace function increment_tick_count()
returns void language sql security definer as $$
  update world_state set tick = tick + 1 where id = 1;
$$;
