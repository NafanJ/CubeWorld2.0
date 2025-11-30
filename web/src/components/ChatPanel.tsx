import { useEffect, useState, useCallback, useRef } from 'react';
import { ChatMessage } from './ChatMessage';
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef<boolean>(true);
  const initialLoadRef = useRef<boolean>(true);
  const messagesRef = useRef<SupaMessage[]>([]);
  const hasScrolledRef = useRef<boolean>(false);
  const [newMessageCount, setNewMessageCount] = useState(0);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = messagesContainerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior });
    }
  }, []);

  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    // consider "near bottom" within 120px
    const atBottom = distanceFromBottom <= 120;
    isAtBottomRef.current = atBottom;
  // mark that the user has scrolled if they are not at the bottom (covers top and any scroll away from bottom)
  hasScrolledRef.current = !atBottom;
    if (atBottom) {
      setNewMessageCount(0);
      hasScrolledRef.current = false;
    }
  }, []);

  // Helper function to reload messages from the database
  const loadMessages = useCallback(async (): Promise<SupaMessage[] | null> => {
    const { data, error } = await supabase
      .from('messages')
      .select('id, content, from_agent, ts')
      .order('ts', { ascending: false })
      .limit(50);

    if (error) {
      // eslint-disable-next-line no-console
      console.error('Error reloading messages', error);
      return null;
    }

    if (data) {
      const ordered = (data as SupaMessage[]).reverse();
      setMessages(ordered);
      return ordered;
    }
    return null;
  }, []);

  useEffect(() => {
    setLoading(true);
    loadMessages();
    setLoading(false);

    return () => {
      // cleanup
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
        async () => {
          // eslint-disable-next-line no-console
          console.log('[ChatPanel] New message detected, reloading...');
          const prevLen = messagesRef.current.length;
          const newData = await loadMessages();
          if (newData) {
            const added = newData.length - prevLen;
            if (added > 0) {
              // Check current scroll position at time of arrival to avoid relying solely on scroll handler
              const el = messagesContainerRef.current;
              let atBottom = isAtBottomRef.current;
              if (el) {
                const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
                atBottom = distanceFromBottom <= 120;
                isAtBottomRef.current = atBottom;
              }

              // show indicator if the user has scrolled at all (even a little)
              if (hasScrolledRef.current || !atBottom) {
                setNewMessageCount((c) => c + added);
              } else {
                setNewMessageCount(0);
              }
            }
          }
        }
      )
      .on('system', {}, (msg: any) => {
        if (msg.event === 'SUBSCRIBED') {
          // eslint-disable-next-line no-console
          console.log('[ChatPanel] Subscribed to messages channel');
        }
      })
      .subscribe((status: any) => {
        // eslint-disable-next-line no-console
        console.log('[ChatPanel] Subscription status:', status);
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadMessages]);

  // Apply agent filter to messages for display
  const filteredMessages = messages.filter((msg) => {
    if (selectedAgent === 'all') return true;
    if (selectedAgent === 'anon') return !msg.from_agent;
    return msg.from_agent === selectedAgent;
  });

  // Smart auto-scroll:
  // - on initial load, jump to bottom
  // - on subsequent message changes, only auto-scroll if user is near the bottom
  useEffect(() => {
    if (messages.length === 0) return;

    if (initialLoadRef.current) {
      // defer until after render
      setTimeout(() => {
        scrollToBottom('auto');
        initialLoadRef.current = false;
      }, 0);
      return;
    }

    if (isAtBottomRef.current) {
      // smooth scroll for new messages when user is at bottom
      setTimeout(() => scrollToBottom('smooth'), 0);
    }
  }, [messages.length, scrollToBottom]);

  // attach scroll listener to messages container
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    // initialize position
    handleScroll();
    return () => void el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // keep a ref copy of messages for use inside subscription handlers
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  return (
    <div className="relative flex flex-col h-full bg-gradient-to-br from-indigo-100 to-purple-100 border-l-8 border-indigo-500">
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
  <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-2 border-b-8 border-indigo-500">
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
        <div ref={messagesEndRef} />
      </div>

      {/* New-message indicator (fixed inside panel so position is stable) */}
      {newMessageCount > 0 && (
        <div className="absolute bottom-20 right-6 z-50 flex items-center">
          <div className="relative">
            {/* animated ping dot */}
            <span className="absolute -top-2 -right-3 inline-flex">
              <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-indigo-400 opacity-60"></span>
              <span className="relative inline-flex h-3 w-3 rounded-full bg-indigo-600 border border-white"></span>
            </span>
            <button
              onClick={() => {
                scrollToBottom('smooth');
                setNewMessageCount(0);
              }}
              className="bg-indigo-600 text-white px-3 py-1 rounded-full text-sm shadow-lg border-2 border-indigo-800 flex items-center gap-2"
            >
              <span className="font-bold">{newMessageCount}</span>
              <span className="text-[11px]">new</span>
            </button>
          </div>
        </div>
      )}


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