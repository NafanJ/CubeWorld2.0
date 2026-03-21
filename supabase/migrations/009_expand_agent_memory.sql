-- 009_expand_agent_memory.sql
-- Initialize journal and facts arrays in existing agent memory objects.
-- Backward-compatible: existing code that reads alone_ticks is unaffected.

UPDATE agents SET memory = jsonb_build_object(
  'alone_ticks', COALESCE((memory->>'alone_ticks')::int, 0),
  'journal', '[]'::jsonb,
  'facts', '[]'::jsonb
)
WHERE memory IS NULL
   OR NOT (memory ? 'journal');
