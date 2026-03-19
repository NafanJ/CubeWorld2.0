import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

interface ConversationListProps {
  agentColorMap: Record<string, string>;
  agentNameMap: Record<string, string>;
  onSelect: (conversationId: string) => void;
}

type LastMessage = {
  content: string;
  ts: string;
};

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  } catch {
    return '';
  }
}

function truncate(text: string, max = 38): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '…';
}

const COLOR_HEX: Record<string, string> = {
  red: '#ef4444', orange: '#f97316', green: '#22c55e', blue: '#3b82f6',
  purple: '#a855f7', teal: '#14b8a6', yellow: '#eab308', pink: '#ec4899',
  indigo: '#6366f1', lime: '#84cc16', amber: '#f59e0b', rose: '#f43f5e',
  cyan: '#06b6d4', sky: '#0ea5e9', violet: '#8b5cf6', emerald: '#10b981',
  fuchsia: '#d946ef', slate: '#64748b',
};

const COLOR_BG_LIGHT: Record<string, string> = {
  red: 'bg-red-100', orange: 'bg-orange-100', green: 'bg-green-100',
  blue: 'bg-blue-100', purple: 'bg-purple-100', teal: 'bg-teal-100',
  yellow: 'bg-yellow-100', pink: 'bg-pink-100', indigo: 'bg-indigo-100',
  lime: 'bg-lime-100', amber: 'bg-amber-100', rose: 'bg-rose-100',
  cyan: 'bg-cyan-100', sky: 'bg-sky-100', violet: 'bg-violet-100',
  emerald: 'bg-emerald-100', fuchsia: 'bg-fuchsia-100', slate: 'bg-slate-100',
};

export function ConversationList({ agentColorMap, agentNameMap, onSelect }: ConversationListProps) {
  const [lastMessages, setLastMessages] = useState<Record<string, LastMessage>>({});
  const [loading, setLoading] = useState(true);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const computeLastMessages = (msgs: Array<{ id: number; content: string; ts: string; from_agent?: string | null }>) => {
    const result: Record<string, LastMessage> = {};
    // Iterate oldest-to-newest so latest wins
    for (const msg of msgs) {
      const preview = { content: msg.content, ts: msg.ts };
      // Group chat: track the very latest regardless of sender
      result['group'] = preview;
      // Per-agent: track latest from that agent
      if (msg.from_agent) {
        result[msg.from_agent] = preview;
      }
    }
    return result;
  };

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('messages')
        .select('id, content, ts, from_agent')
        .order('ts', { ascending: true })
        .limit(500);

      if (!mounted) return;
      if (!error && data) {
        setLastMessages(computeLastMessages(data as Array<{ id: number; content: string; ts: string; from_agent?: string | null }>));
      }
      setLoading(false);
    };
    load();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('conv-list:messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload: any) => {
          const msg = payload.new as { id: number; content: string; ts: string; from_agent?: string | null };
          if (!isMounted.current) return;
          const preview = { content: msg.content, ts: msg.ts };
          setLastMessages((prev) => {
            const next = { ...prev, group: preview };
            if (msg.from_agent) next[msg.from_agent] = preview;
            return next;
          });
        }
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, []);

  // Sort agents alphabetically (same as color assignment order)
  const sortedAgents = Object.entries(agentNameMap).sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="bg-indigo-500 px-4 py-3 border-b-4 border-indigo-700">
        <h2 className="pixel-text text-white text-sm font-bold">MESSAGES</h2>
      </div>

      {/* Conversation rows */}
      <div className="flex-1 overflow-y-auto bg-gradient-to-br from-indigo-50 to-purple-50">
        {loading && (
          <div className="space-y-1 p-2">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
                <div className="w-11 h-11 rounded-xl bg-gray-300 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-300 rounded w-1/3" />
                  <div className="h-2 bg-gray-200 rounded w-2/3" />
                </div>
                <div className="h-2 bg-gray-200 rounded w-6" />
              </div>
            ))}
          </div>
        )}

        {!loading && (
          <>
            {/* Group Chat row */}
            <button
              onClick={() => onSelect('group')}
              className="w-full flex items-center gap-3 px-4 py-3 border-b-2 border-indigo-200 hover:bg-indigo-100 transition-colors text-left"
            >
              <div className="w-11 h-11 rounded-xl bg-indigo-500 flex items-center justify-center flex-shrink-0 border-2 border-indigo-700 text-xl">
                🌐
              </div>
              <div className="flex-1 min-w-0">
                <div className="pixel-text text-xs text-indigo-900 font-bold mb-1">GROUP CHAT</div>
                <div className="pixel-text text-[9px] text-gray-500 truncate leading-relaxed">
                  {lastMessages['group']
                    ? truncate(lastMessages['group'].content)
                    : 'No messages yet'}
                </div>
              </div>
              {lastMessages['group'] && (
                <div className="pixel-text text-[9px] text-gray-400 flex-shrink-0 self-start pt-0.5">
                  {timeAgo(lastMessages['group'].ts)}
                </div>
              )}
            </button>

            {/* Per-agent rows */}
            {sortedAgents.map(([agentId, name]) => {
              const colorName = agentColorMap[agentId] || 'slate';
              const hex = COLOR_HEX[colorName] || '#64748b';
              const bgLight = COLOR_BG_LIGHT[colorName] || 'bg-slate-100';
              const last = lastMessages[agentId];

              return (
                <button
                  key={agentId}
                  onClick={() => onSelect(agentId)}
                  className={`w-full flex items-center gap-3 px-4 py-3 border-b-2 border-indigo-100 hover:${bgLight} transition-colors text-left`}
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border-2 text-white font-bold text-base pixel-text"
                    style={{ backgroundColor: hex, borderColor: hex }}
                  >
                    {name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="pixel-text text-xs text-gray-900 font-bold mb-1">{name}</div>
                    <div className="pixel-text text-[9px] text-gray-500 truncate leading-relaxed">
                      {last ? truncate(last.content) : 'No messages yet'}
                    </div>
                  </div>
                  {last && (
                    <div className="pixel-text text-[9px] text-gray-400 flex-shrink-0 self-start pt-0.5">
                      {timeAgo(last.ts)}
                    </div>
                  )}
                </button>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
