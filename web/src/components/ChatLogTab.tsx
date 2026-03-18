import { useEffect, useState, useCallback, useRef } from 'react';
import { ChatMessage } from './ChatMessage';
import { supabase } from '../lib/supabase';
import { PALETTE } from '../lib/colorUtils';

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

function getDateKey(iso: string): string {
  try {
    return iso.split('T')[0];
  } catch {
    return '';
  }
}

function formatDateHeader(dateKey: string): string {
  try {
    const date = new Date(dateKey + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'short', 
      day: 'numeric' 
    });
  } catch {
    return dateKey;
  }
}

function hashString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}

interface ChatLogTabProps {
  agentColorMap: Record<string, string>;
  agentNameMap: Record<string, string>;
}

type RoomInfo = { id: string; name: string };

export function ChatLogTab({ agentColorMap: parentAgentColorMap, agentNameMap }: ChatLogTabProps) {
  const [messages, setMessages] = useState<SupaMessage[]>([]);
  const [agentMap, setAgentMap] = useState<Record<string, string>>({});
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [agentColorMap, setAgentColorMap] = useState<Record<string, string>>(parentAgentColorMap);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [dayMessageCounts, setDayMessageCounts] = useState<Record<string, number>>({});
  const [userInput, setUserInput] = useState('');
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef<boolean>(true);
  const initialLoadRef = useRef<boolean>(true);
  const messagesRef = useRef<SupaMessage[]>([]);
  const hasScrolledRef = useRef<boolean>(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

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
    const atBottom = distanceFromBottom <= 120;
    isAtBottomRef.current = atBottom;
    hasScrolledRef.current = !atBottom;
    if (atBottom) {
      setNewMessageCount(0);
      hasScrolledRef.current = false;
    }
  }, []);

  const loadMessages = useCallback(async (): Promise<SupaMessage[] | null> => {
    const { data, error } = await supabase
      .from('messages')
      .select('id, content, from_agent, ts')
      .order('ts', { ascending: false });

    if (error) {
      console.error('Error reloading messages', error);
      return null;
    }

    if (data) {
      const ordered = (data as SupaMessage[]).reverse();

      if (!isMounted.current) return null;
      setMessages(ordered);

      const dateToCount: Record<string, number> = {};
      for (const msg of ordered) {
        const dateKey = getDateKey(msg.ts);
        if (dateKey) {
          dateToCount[dateKey] = (dateToCount[dateKey] || 0) + 1;
        }
      }

      const dates = Object.keys(dateToCount).sort().reverse();
      setAvailableDates(dates);
      setDayMessageCounts(dateToCount);

      if (!selectedDate && dates.length > 0) {
        setSelectedDate(dates[0]);
      }

      return ordered;
    }
    return null;
  }, [selectedDate]);

  useEffect(() => {
    const initialLoad = async () => {
      setLoading(true);
      await loadMessages();
      if (isMounted.current) setLoading(false);
    };
    initialLoad();
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadAgents = async () => {
      const { data, error } = await supabase.from('agents').select('id, name');
      if (error) {
        console.error('Error loading agents', error);
        return;
      }

      if (!mounted || !data) return;

      const map: Record<string, string> = {};
      for (const a of data as Array<{ id: string; name: string }>) {
        if (a?.id && a?.name) map[a.id] = a.name;
      }
      setAgentMap(map);
      
      const ids = Object.keys(map).sort((a, b) => map[a].localeCompare(map[b]));
      const colorMap: Record<string, string> = { ...parentAgentColorMap };
      const used = new Set<string>(Object.values(parentAgentColorMap));
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        if (!colorMap[id]) {
          const c = PALETTE.find((p: string) => !used.has(p)) || PALETTE[i % PALETTE.length];
          colorMap[id] = c;
          used.add(c);
        }
      }
      setAgentColorMap(colorMap);
    };

    loadAgents();

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
              if (prev[newRow.id] || parentAgentColorMap[newRow.id]) return { ...prev, ...parentAgentColorMap };
              const used = new Set(Object.values({ ...prev, ...parentAgentColorMap }));
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

  // Load rooms for @room mentions
  useEffect(() => {
    let mounted = true;
    const loadRooms = async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('id, name')
        .order('name', { ascending: true });
      if (error || !mounted || !data) return;

      const roomList = (data as RoomInfo[]).filter((r) => !r.name.startsWith('Elevator'));
      setRooms(roomList);
    };
    loadRooms();
    return () => { mounted = false; };
  }, []);

  // Parse @mentions from input text
  const parseMentions = useCallback((text: string): { agents: string[]; rooms: string[] } => {
    const agents: string[] = [];
    const roomMentions: string[] = [];

    // Build lookup maps
    const agentNames = Object.values(agentNameMap).map((n) => n.toLowerCase());
    const roomNames = rooms.map((r) => r.name.toLowerCase());

    // Sort by length descending so "Garden Nook" matches before "Garden"
    const allNames = [
      ...roomNames.map((n) => ({ name: n, type: 'room' as const })),
      ...agentNames.map((n) => ({ name: n, type: 'agent' as const })),
    ].sort((a, b) => b.name.length - a.name.length);

    const lower = text.toLowerCase();

    for (const { name, type } of allNames) {
      // Match @name (case-insensitive), supporting multi-word names like "@Garden Nook"
      const pattern = new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (pattern.test(lower)) {
        if (type === 'agent' && !agents.includes(name)) {
          agents.push(name);
        } else if (type === 'room' && !roomMentions.includes(name)) {
          roomMentions.push(name);
        }
      }
    }

    return { agents, rooms: roomMentions };
  }, [agentNameMap, rooms]);

  const handleSendMessage = async () => {
    const text = userInput.trim();
    if (!text || sending) return;

    setSending(true);
    try {
      const mentions = parseMentions(text);
      const hasMentions = mentions.agents.length > 0 || mentions.rooms.length > 0;

      if (hasMentions) {
        // Call the reply edge function for instant agent responses
        const { error } = await supabase.functions.invoke('reply', {
          body: { content: text, mentions },
        });
        if (error) {
          console.error('Error sending message:', error);
        } else {
          setUserInput('');
        }
      } else {
        // No mentions — just insert as a regular visitor message
        const { error } = await supabase.from('messages').insert({
          content: text,
          room_id: rooms.length > 0 ? rooms[0].id : null,
          from_agent: null,
        });
        if (error) {
          console.error('Error sending message:', error);
        } else {
          setUserInput('');
        }
      }
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    const channel = supabase
      .channel('public:messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async () => {
          console.log('[ChatLogTab] New message detected, reloading...');
          const prevLen = messagesRef.current.length;
          const newData = await loadMessages();
          if (!isMounted.current || !newData) return;
          const added = newData.length - prevLen;
          if (added > 0) {
            const el = messagesContainerRef.current;
            let atBottom = isAtBottomRef.current;
            if (el) {
              const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
              atBottom = distanceFromBottom <= 120;
              isAtBottomRef.current = atBottom;
            }

            if (hasScrolledRef.current || !atBottom) {
              setNewMessageCount((c) => c + added);
            } else {
              setNewMessageCount(0);
            }
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadMessages]);

  const filteredMessages = messages.filter((msg) => {
    const msgDate = getDateKey(msg.ts);
    if (msgDate !== selectedDate) return false;
    
    if (selectedAgent === 'all') return true;
    if (selectedAgent === 'anon') return !msg.from_agent;
    return msg.from_agent === selectedAgent;
  });

  const goToPreviousDay = useCallback(() => {
    const idx = availableDates.indexOf(selectedDate);
    if (idx < availableDates.length - 1) {
      setSelectedDate(availableDates[idx + 1]);
      initialLoadRef.current = true;
    }
  }, [availableDates, selectedDate]);

  const goToNextDay = useCallback(() => {
    const idx = availableDates.indexOf(selectedDate);
    if (idx > 0) {
      setSelectedDate(availableDates[idx - 1]);
      initialLoadRef.current = true;
    }
  }, [availableDates, selectedDate]);

  const goToToday = useCallback(() => {
    if (availableDates.length > 0) {
      setSelectedDate(availableDates[0]);
      initialLoadRef.current = true;
    }
  }, [availableDates]);

  useEffect(() => {
    if (messages.length === 0) return;

    if (initialLoadRef.current) {
      setTimeout(() => {
        scrollToBottom('auto');
        initialLoadRef.current = false;
      }, 0);
      return;
    }

    if (isAtBottomRef.current) {
      setTimeout(() => scrollToBottom('smooth'), 0);
    }
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => void el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const isToday = availableDates.length > 0 && selectedDate === availableDates[0];
  const canGoBack = availableDates.length > 0 && selectedDate !== availableDates[availableDates.length - 1];
  const canGoForward = availableDates.length > 0 && selectedDate !== availableDates[0];

  return (
    <>
      {/* Header Content */}
      <div className="bg-indigo-50 p-3 border-b-4 border-indigo-300">
        {selectedDate && (
          <div className="mb-3 inline-block bg-indigo-700 text-indigo-100 px-3 py-1 rounded-md border-2 border-indigo-800 pixel-text text-xs">
            Viewing: {formatDateHeader(selectedDate)}
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={goToPreviousDay}
              disabled={!canGoBack}
              className="px-2 py-1 bg-indigo-600 text-white border-2 border-indigo-800 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700 text-xs"
              title="View previous day"
            >
              ← Prev
            </button>
            <button
              onClick={goToToday}
              disabled={isToday}
              className="px-2 py-1 bg-indigo-600 text-white border-2 border-indigo-800 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700 text-xs"
              title="Jump to today"
            >
              Today
            </button>
            <button
              onClick={goToNextDay}
              disabled={!canGoForward}
              className="px-2 py-1 bg-indigo-600 text-white border-2 border-indigo-800 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700 text-xs"
              title="View next day"
            >
              Next →
            </button>
            {selectedDate && dayMessageCounts[selectedDate] !== undefined && (
              <span className="pixel-text text-indigo-700 text-xs ml-2">
                ({dayMessageCounts[selectedDate]} message{dayMessageCounts[selectedDate] === 1 ? '' : 's'})
              </span>
            )}
          </div>
          <div className="ml-auto">
            <label className="pixel-text text-indigo-900 text-xs mr-2">Filter:</label>
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

      {/* Messages Content */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-2 border-b-8 border-indigo-500">
        {loading && (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-10 h-10 rounded-lg bg-gray-300" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-300 rounded w-1/4" />
                  <div className="h-8 bg-gray-300 rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        )}
        {messages.length === 0 && !loading && (
          <div className="text-xs text-gray-500">No messages yet.</div>
        )}

        {messages.length > 0 && filteredMessages.length === 0 && (
          <div className="text-xs text-gray-500">No messages on this day.</div>
        )}

        {filteredMessages.map((msg) => {
          const isVisitor = !msg.from_agent;
          const raw = msg.from_agent || '';
          const username = isVisitor ? 'Visitor' : ((raw && agentMap[raw]) || raw || 'Anon');
          const avatar = isVisitor ? '👤' : (username ? username[0] : '🙂');
          const time = formatTime(msg.ts);
          let color = 'slate';
          if (isVisitor) {
            color = 'slate';
          } else if (msg.from_agent && agentColorMap[msg.from_agent]) {
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

      {/* User message input */}
      <div className="bg-indigo-50 p-3 border-t-4 border-indigo-300">
        {sending && (
          <div className="pixel-text text-[10px] text-indigo-500 mb-1 animate-pulse">
            Villagers are thinking...
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Say something... use @name or @room"
            className="flex-1 px-3 py-2 bg-white text-gray-800 border-2 border-indigo-300 rounded-md pixel-text text-xs placeholder-gray-400 focus:outline-none focus:border-indigo-500"
            disabled={sending}
            maxLength={200}
          />
          <button
            onClick={handleSendMessage}
            disabled={!userInput.trim() || sending}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md pixel-text text-xs font-bold border-2 border-indigo-800 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            SEND
          </button>
        </div>
      </div>

      {/* New-message indicator */}
      {newMessageCount > 0 && (
        <div className="absolute bottom-20 right-6 z-50 flex items-center">
          <div className="relative">
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
    </>
  );
}
