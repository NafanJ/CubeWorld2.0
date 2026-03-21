-- Remove old table from Realtime publication before rename
ALTER PUBLICATION supabase_realtime DROP TABLE diary_entries;

-- Rename diary_entries to agent_logs (used for movement & rest activity logs)
ALTER TABLE diary_entries RENAME TO agent_logs;

-- Add renamed table back to Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE agent_logs;
