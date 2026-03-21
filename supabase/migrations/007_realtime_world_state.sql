-- Add world_state to Realtime publication so tick updates are pushed live
ALTER PUBLICATION supabase_realtime ADD TABLE world_state;

-- Ensure UPDATE events include full row data for realtime subscriptions
ALTER TABLE agents REPLICA IDENTITY FULL;
ALTER TABLE world_state REPLICA IDENTITY FULL;
