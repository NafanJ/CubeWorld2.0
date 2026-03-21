-- Add channel column to messages for group chat vs DM routing
-- 'group' = main shared chat, 'dm:<agent_uuid>' = private DM with agent
ALTER TABLE messages ADD COLUMN channel text NOT NULL DEFAULT 'group';
CREATE INDEX idx_messages_channel ON messages (channel);
