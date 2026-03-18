-- Enable Realtime on diary_entries and relationships tables
alter publication supabase_realtime add table diary_entries;
alter publication supabase_realtime add table relationships;

-- Allow anonymous users to insert messages where from_agent IS NULL (visitor messages)
create policy "allow_anon_user_messages" on messages
  for insert
  with check (from_agent is null);
