-- Add typing indicator column to agents
ALTER TABLE agents ADD COLUMN typing_as_of timestamptz DEFAULT NULL;
