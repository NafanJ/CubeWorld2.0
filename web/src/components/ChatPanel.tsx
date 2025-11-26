import { useEffect, useState } from 'react';
import { ChatMessage } from './ChatMessage';
import { SendIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Shared palette for agent colors (kept at module scope so hooks don't need it as a dependency)
const PALETTE = [
  'red',
  'orange',
  'green',
  'blue',
  'purple',
  'teal',
  'yellow',
  'pink',
  'indigo',
  'lime',
  'amber',
  'rose',
  'cyan',
  'sky',
  'violet',
  'emerald',
  'fuchsia',
  'slate'
];

type SupaMessage = {
  id: number;
  content: string;
  from_agent?: string | null;
  ts: string;
};

function formatTime(iso?: string) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return iso;
  }
}

export function ChatPanel() {
  const [messages, setMessages] = useState<SupaMessage[]>([]);
  const [agentMap, setAgentMap] = useState<Record<string, string>>({});
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [agentColorMap, setAgentColorMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('messages')
        .select('id, content, from_agent, ts')
        .order('ts', { ascending: false })
        .limit(50);

      if (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading messages', error);
      } else if (mounted && data) {
        setMessages((data as SupaMessage[]).reverse());
      }
      setLoading(false);
    };

    load();

    return () => {
      mounted = false;
    };
  }, []);

  // Load agents and keep a simple id->name map so the chat shows names instead of uuids
  useEffect(() => {
    let mounted = true;
    const loadAgents = async () => {
      const { data, error } = await supabase.from('agents').select('id, name');
      if (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading agents', error);
        return;
      }

      if (!mounted || !data) return;

      const map: Record<string, string> = {};
      for (const a of data as Array<{ id: string; name: string }>) {
        if (a?.id && a?.name) map[a.id] = a.name;
      }
      setAgentMap(map);
      // assign unique colors to agents (deterministic and stable)
      const ids = Object.keys(map).sort((a, b) => map[a].localeCompare(map[b]));
      const colorMap: Record<string, string> = {};
      const used = new Set<string>();
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const c = PALETTE.find((p: string) => !used.has(p)) || PALETTE[i % PALETTE.length];
        colorMap[id] = c;
        used.add(c);
      }
      setAgentColorMap(colorMap);
    };

    loadAgents();

    // subscribe to agent changes so names update live
    const channel = supabase
      .channel('public:agents')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agents' },
        (payload: any) => {
          const newRow = payload.new as { id: string; name?: string } | null;
          const oldRow = payload.old as { id: string } | null;
          if (newRow && newRow.id && newRow.name) {
            setAgentMap((prev) => ({ ...prev, [newRow.id]: newRow.name as string }));
            setAgentColorMap((prev) => {
              if (prev[newRow.id]) return prev; // already assigned
              const used = new Set(Object.values(prev));
              const c = PALETTE.find((p: string) => !used.has(p)) || PALETTE[Object.keys(prev).length % PALETTE.length];
              return { ...prev, [newRow.id]: c };
            });
          } else if (oldRow && oldRow.id && payload.event === 'DELETE') {
            setAgentMap((prev) => {
              const copy = { ...prev };
              delete copy[oldRow.id];
              return copy;
            });
            setAgentColorMap((prev) => {
              const copy = { ...prev };
              delete copy[oldRow.id];
              return copy;
            });
          }
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('public:messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload: any) => {
          const m = payload.new as SupaMessage;
          setMessages((prev) => [...prev, m].slice(-100));
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // Apply agent filter to messages for display
  const filteredMessages = messages.filter((msg) => {
    if (selectedAgent === 'all') return true;
    if (selectedAgent === 'anon') return !msg.from_agent;
    return msg.from_agent === selectedAgent;
  });

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-indigo-100 to-purple-100 border-l-8 border-indigo-500">
      {/* Header */}
      <div className="bg-indigo-500 border-b-8 border-indigo-700 p-4 pixel-border-bottom">
        <h2 className="pixel-text text-white text-lg font-bold">CHAT LOG</h2>
        <div className="flex items-center gap-3 mt-1">
          <p className="pixel-text text-indigo-200 text-xs">
            {loading ? 'Connecting…' : `${filteredMessages.length} / ${messages.length} messages`}
          </p>
          <div className="ml-auto">
            <label className="pixel-text text-indigo-100 text-xs mr-2">Filter:</label>
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="text-xs px-2 py-1 rounded-md bg-indigo-600 text-white border-2 border-indigo-800"
            >
              <option value="all">All agents</option>
              {Object.entries(agentMap)
                .sort((a, b) => a[1].localeCompare(b[1]))
                .map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 && !loading && (
          <div className="text-xs text-gray-500">No messages yet.</div>
        )}

  {filteredMessages.map((msg) => {
          // If from_agent is an id that exists in our agentMap, use the agent name.
          // Otherwise, fall back to the value in the message (in case it's already a name) or 'Anon'.
          const raw = msg.from_agent || '';
          const username = (raw && agentMap[raw]) || raw || 'Anon';
          const avatar = username ? username[0] : '🙂';
          const time = formatTime(msg.ts);
          // choose a color: prefer agent id's assigned unique color, otherwise fallback to deterministic pick
          let color = 'slate';
          if (msg.from_agent && agentColorMap[msg.from_agent]) {
            color = agentColorMap[msg.from_agent];
          } else {
            color = PALETTE[Math.abs(hashString(username)) % PALETTE.length];
          }

          return (
            <ChatMessage
              key={msg.id}
              username={username}
              message={msg.content}
              timestamp={time}
              color={color}
              avatar={avatar}
            />
          );
        })}
      </div>

      {/* Input (UI only) */}
      <div className="p-4 bg-white border-t-8 border-indigo-500">
        <div className="flex gap-2">
          <input type="text" placeholder="Type a message..." className="flex-1 px-4 py-3 border-4 border-gray-800 rounded-lg pixel-text text-sm focus:outline-none focus:border-indigo-500 bg-gray-50" />
          <button className="bg-indigo-500 hover:bg-indigo-600 border-4 border-indigo-700 rounded-lg px-4 py-3 transition-all hover:scale-105 active:scale-95">
            <SendIcon className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}

function hashString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}