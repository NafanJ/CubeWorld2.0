import { useEffect, useState, useCallback, useRef } from 'react';
import { ChatMessage } from './ChatMessage';
import { supabase } from '../lib/supabase';
import { PALETTE } from '../lib/colorUtils';
import { ArrowLeft, ChevronDown, Send, ChevronLeft, ChevronRight } from 'lucide-react';

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
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
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
  dmAgentId?: string | null;
  dmAgentName?: string | null;
  onBack?: () => void;
}

type RoomInfo = { id: string; name: string };

type MentionOption = {
  label: string;
  value: string;
  type: 'everyone' | 'agent' | 'room';
};

const COLOR_HEX: Record<string, string> = {
  red: '#ef4444', orange: '#f97316', green: '#22c55e', blue: '#3b82f6',
  purple: '#a855f7', teal: '#14b8a6', yellow: '#eab308', pink: '#ec4899',
  indigo: '#6366f1', lime: '#84cc16', amber: '#f59e0b', rose: '#f43f5e',
  cyan: '#06b6d4', sky: '#0ea5e9', violet: '#8b5cf6', emerald: '#10b981',
  fuchsia: '#d946ef', slate: '#64748b',
};

export function ChatLogTab({ agentColorMap: parentAgentColorMap, agentNameMap, dmAgentId, dmAgentName, onBack }: ChatLogTabProps) {
  const isDM = Boolean(dmAgentId);
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
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionAnchorIndex, setMentionAnchorIndex] = useState(0);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
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
      if (error) return;
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, (payload: any) => {
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
          setAgentMap((prev) => { const copy = { ...prev }; delete copy[oldRow.id]; return copy; });
          setAgentColorMap((prev) => { const copy = { ...prev }; delete copy[oldRow.id]; return copy; });
        }
      })
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadRooms = async () => {
      const { data, error } = await supabase.from('rooms').select('id, name').order('name', { ascending: true });
      if (error || !mounted || !data) return;
      const roomList = (data as RoomInfo[]).filter((r) => !r.name.startsWith('Elevator'));
      setRooms(roomList);
    };
    loadRooms();
    return () => { mounted = false; };
  }, []);

  const allMentionOptions: MentionOption[] = (() => {
    const options: MentionOption[] = [{ label: 'Everyone', value: 'everyone', type: 'everyone' }];
    const sortedAgents = Object.entries(agentNameMap).sort((a, b) => a[1].localeCompare(b[1]));
    for (const [, name] of sortedAgents) {
      options.push({ label: name, value: name.toLowerCase(), type: 'agent' });
    }
    for (const room of rooms) {
      options.push({ label: room.name, value: room.name.toLowerCase(), type: 'room' });
    }
    return options;
  })();

  const filteredMentionOptions = allMentionOptions.filter((opt) =>
    opt.value.startsWith(mentionQuery.toLowerCase()) || opt.label.toLowerCase().startsWith(mentionQuery.toLowerCase())
  );

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart ?? val.length;
    setUserInput(val);

    const textBeforeCursor = val.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex >= 0) {
      const query = textBeforeCursor.slice(lastAtIndex + 1);
      setShowMentionMenu(true);
      setMentionQuery(query);
      setMentionAnchorIndex(lastAtIndex);
      setSelectedMentionIndex(0);
    } else {
      setShowMentionMenu(false);
      setMentionQuery('');
    }
  }, []);

  const selectMention = useCallback((option: MentionOption) => {
    const before = userInput.slice(0, mentionAnchorIndex);
    const after = userInput.slice(mentionAnchorIndex + 1 + mentionQuery.length);
    const newVal = `${before}@${option.label} ${after}`;
    setUserInput(newVal);
    setShowMentionMenu(false);
    setMentionQuery('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [userInput, mentionAnchorIndex, mentionQuery]);

  const parseMentions = useCallback((text: string): { agents: string[]; rooms: string[] } => {
    const lower = text.toLowerCase();
    if (/@everyone\b/i.test(lower)) return { agents: ['everyone'], rooms: [] };

    const agents: string[] = [];
    const roomMentions: string[] = [];
    const agentNames = Object.values(agentNameMap).map((n) => n.toLowerCase());
    const roomNames = rooms.map((r) => r.name.toLowerCase());
    const allNames = [
      ...roomNames.map((n) => ({ name: n, type: 'room' as const })),
      ...agentNames.map((n) => ({ name: n, type: 'agent' as const })),
    ].sort((a, b) => b.name.length - a.name.length);

    for (const { name, type } of allNames) {
      const pattern = new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (pattern.test(lower)) {
        if (type === 'agent' && !agents.includes(name)) agents.push(name);
        else if (type === 'room' && !roomMentions.includes(name)) roomMentions.push(name);
      }
    }
    return { agents, rooms: roomMentions };
  }, [agentNameMap, rooms]);

  const handleSendMessage = async () => {
    const text = userInput.trim();
    if (!text || sending) return;

    setSending(true);
    setUserInput('');
    try {
      let sendText = text;
      if (isDM && dmAgentName) {
        const alreadyMentioned = new RegExp(`@${dmAgentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
        if (!alreadyMentioned) sendText = `@${dmAgentName} ${text}`;
      }

      const mentions = parseMentions(sendText);
      const hasMentions = mentions.agents.length > 0 || mentions.rooms.length > 0;

      if (hasMentions) {
        const { error } = await supabase.functions.invoke('reply', { body: { content: sendText, mentions } });
        if (error) {
          console.error('Error sending message:', error);
          await supabase.from('messages').insert({ content: sendText, room_id: rooms.length > 0 ? rooms[0].id : null, from_agent: null });
        }
      } else {
        const { error } = await supabase.from('messages').insert({ content: sendText, room_id: rooms.length > 0 ? rooms[0].id : null, from_agent: null });
        if (error) console.error('Error sending message:', error);
      }
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    const channel = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async () => {
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
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [loadMessages]);

  const filteredMessages = messages.filter((msg) => {
    if (isDM && dmAgentId && dmAgentName) {
      if (msg.from_agent === dmAgentId) return true;
      if (!msg.from_agent) return msg.content.toLowerCase().includes('@' + dmAgentName.toLowerCase());
      return false;
    }
    const msgDate = getDateKey(msg.ts);
    if (msgDate !== selectedDate) return false;
    if (selectedAgent === 'all') return true;
    if (selectedAgent === 'anon') return !msg.from_agent;
    return msg.from_agent === selectedAgent;
  });

  const goToPreviousDay = useCallback(() => {
    const idx = availableDates.indexOf(selectedDate);
    if (idx < availableDates.length - 1) { setSelectedDate(availableDates[idx + 1]); initialLoadRef.current = true; }
  }, [availableDates, selectedDate]);

  const goToNextDay = useCallback(() => {
    const idx = availableDates.indexOf(selectedDate);
    if (idx > 0) { setSelectedDate(availableDates[idx - 1]); initialLoadRef.current = true; }
  }, [availableDates, selectedDate]);

  const goToToday = useCallback(() => {
    if (availableDates.length > 0) { setSelectedDate(availableDates[0]); initialLoadRef.current = true; }
  }, [availableDates]);

  useEffect(() => {
    if (messages.length === 0) return;
    if (initialLoadRef.current) {
      setTimeout(() => { scrollToBottom('auto'); initialLoadRef.current = false; }, 0);
      return;
    }
    if (isAtBottomRef.current) setTimeout(() => scrollToBottom('smooth'), 0);
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => void el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const isToday = availableDates.length > 0 && selectedDate === availableDates[0];
  const canGoBack = availableDates.length > 0 && selectedDate !== availableDates[availableDates.length - 1];
  const canGoForward = availableDates.length > 0 && selectedDate !== availableDates[0];

  return (
    <>
      {/* Header */}
      <div className="bg-white border-b border-stone-200 px-4 py-3 flex-shrink-0">
        {isDM && dmAgentId && dmAgentName ? (
          <div className="flex items-center gap-2.5">
            {onBack && (
              <button
                onClick={onBack}
                className="p-1 rounded-md text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0"
              style={{ backgroundColor: COLOR_HEX[agentColorMap[dmAgentId] || 'slate'] || '#64748b' }}
            >
              {dmAgentName[0]}
            </div>
            <span className="font-semibold text-stone-900 text-sm">{dmAgentName}</span>
          </div>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            {onBack && (
              <button
                onClick={onBack}
                className="p-1 rounded-md text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <span className="font-semibold text-stone-900 text-sm">Group Chat</span>

            {/* Date nav */}
            <div className="flex items-center gap-1 ml-2">
              <button
                onClick={goToPreviousDay}
                disabled={!canGoBack}
                className="p-1 rounded text-stone-400 hover:text-stone-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {selectedDate && (
                <button
                  onClick={goToToday}
                  disabled={isToday}
                  className="text-xs px-2 py-0.5 rounded-md text-stone-500 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {isToday ? 'Today' : formatDateHeader(selectedDate)}
                </button>
              )}
              <button
                onClick={goToNextDay}
                disabled={!canGoForward}
                className="p-1 rounded text-stone-400 hover:text-stone-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              {selectedDate && dayMessageCounts[selectedDate] !== undefined && (
                <span className="text-xs text-stone-400">
                  ({dayMessageCounts[selectedDate]})
                </span>
              )}
            </div>

            {/* Agent filter */}
            <div className="relative ml-auto">
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="appearance-none bg-white border border-stone-200 rounded-lg pl-3 pr-7 py-1.5 text-xs text-stone-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              >
                <option value="all">All agents</option>
                <option value="anon">Visitors</option>
                {Object.entries(agentMap)
                  .sort((a, b) => a[1].localeCompare(b[1]))
                  .map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-stone-400 pointer-events-none" />
            </div>
          </div>
        )}
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto bg-white"
      >
        {loading && (
          <div className="p-4 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-start gap-3 animate-pulse px-4">
                <div className="w-8 h-8 rounded-full bg-stone-200 flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-stone-200 rounded w-1/4" />
                  <div className="h-4 bg-stone-100 rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {messages.length === 0 && !loading && (
          <div className="p-8 text-center text-sm text-stone-400">No messages yet.</div>
        )}

        {messages.length > 0 && filteredMessages.length === 0 && (
          <div className="p-8 text-center text-sm text-stone-400">No messages on this day.</div>
        )}

        <div className="py-2">
          {filteredMessages.map((msg) => {
            const isVisitor = !msg.from_agent;
            const raw = msg.from_agent || '';
            const username = isVisitor ? 'Visitor' : ((raw && agentMap[raw]) || raw || 'Anon');
            const avatar = isVisitor ? '?' : (username ? username[0] : '?');
            const time = formatTime(msg.ts);
            let color = 'slate';
            if (!isVisitor && msg.from_agent && agentColorMap[msg.from_agent]) {
              color = agentColorMap[msg.from_agent];
            } else if (!isVisitor) {
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
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="bg-white border-t border-stone-200 px-4 py-3 flex-shrink-0 relative">
        {sending && (
          <p className="text-xs text-emerald-600 mb-2 animate-pulse">Villagers are thinking…</p>
        )}
        {userInput.length >= 150 && (
          <p className={`text-xs font-medium mb-1.5 text-right ${userInput.length >= 190 ? 'text-red-500' : 'text-amber-500'}`}>
            {200 - userInput.length} characters left
          </p>
        )}

        {/* @mention dropdown */}
        {showMentionMenu && filteredMentionOptions.length > 0 && (
          <div className="absolute bottom-full left-4 right-4 mb-1 bg-white border border-stone-200 rounded-xl shadow-lg max-h-48 overflow-y-auto z-50">
            {filteredMentionOptions.map((option, idx) => {
              const isSelected = idx === selectedMentionIndex;
              let avatarChar = '?';
              let avatarColor = '#64748b';
              if (option.type === 'everyone') {
                avatarChar = '✦';
                avatarColor = '#059669';
              } else if (option.type === 'agent') {
                avatarChar = option.label[0];
                const agentId = Object.entries(agentNameMap).find(([, n]) => n.toLowerCase() === option.value)?.[0];
                if (agentId && parentAgentColorMap[agentId]) {
                  avatarColor = COLOR_HEX[parentAgentColorMap[agentId]] || '#64748b';
                }
              } else {
                avatarChar = '#';
                avatarColor = '#f59e0b';
              }

              return (
                <div
                  key={`${option.type}-${option.value}`}
                  className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ${
                    isSelected ? 'bg-stone-50' : 'hover:bg-stone-50'
                  }`}
                  onMouseDown={(e) => { e.preventDefault(); selectMention(option); }}
                  onMouseEnter={() => setSelectedMentionIndex(idx)}
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                    style={{ backgroundColor: avatarColor }}
                  >
                    {avatarChar}
                  </div>
                  <span className="text-sm text-stone-800">{option.label}</span>
                  <span className="text-xs text-stone-400 ml-auto capitalize">{option.type}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={userInput}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (showMentionMenu && filteredMentionOptions.length > 0) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedMentionIndex((prev) => prev < filteredMentionOptions.length - 1 ? prev + 1 : 0); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedMentionIndex((prev) => prev > 0 ? prev - 1 : filteredMentionOptions.length - 1); return; }
                if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectMention(filteredMentionOptions[selectedMentionIndex]); return; }
                if (e.key === 'Escape') { e.preventDefault(); setShowMentionMenu(false); return; }
              }
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
            }}
            onBlur={() => { setTimeout(() => setShowMentionMenu(false), 150); }}
            placeholder={isDM && dmAgentName ? `Message ${dmAgentName}…` : 'Say something… use @ to mention'}
            className="flex-1 px-3.5 py-2 bg-stone-50 text-stone-800 border border-stone-200 rounded-xl text-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-all"
            disabled={sending}
            maxLength={200}
          />
          <button
            onClick={handleSendMessage}
            disabled={!userInput.trim() || sending}
            className="px-3.5 py-2 rounded-xl text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#059669' }}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* New message badge */}
      {newMessageCount > 0 && (
        <div className="absolute bottom-20 right-6 z-50">
          <button
            onClick={() => { scrollToBottom('smooth'); setNewMessageCount(0); }}
            className="bg-emerald-600 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg flex items-center gap-1.5"
          >
            <span>{newMessageCount} new</span>
            <ChevronRight className="w-3 h-3 rotate-90" />
          </button>
        </div>
      )}
    </>
  );
}
