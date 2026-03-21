import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { MessageSquare } from 'lucide-react';

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

function truncate(text: string, max = 45): string {
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

export function ConversationList({ agentColorMap, agentNameMap, onSelect }: ConversationListProps) {
  const [lastMessages, setLastMessages] = useState<Record<string, LastMessage>>({});
  const [loading, setLoading] = useState(true);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const computeLastMessages = (msgs: Array<{ id: number; content: string; ts: string; from_agent?: string | null; channel?: string }>) => {
    const result: Record<string, LastMessage> = {};
    for (const msg of msgs) {
      const preview = { content: msg.content, ts: msg.ts };
      const ch = msg.channel ?? 'group';
      if (ch === 'group') {
        result['group'] = preview;
      } else if (ch.startsWith('dm:')) {
        const agentId = ch.replace('dm:', '');
        result[agentId] = preview;
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
        .select('id, content, ts, from_agent, channel')
        .order('ts', { ascending: true })
        .limit(500);

      if (!mounted) return;
      if (!error && data) {
        setLastMessages(computeLastMessages(data as Array<{ id: number; content: string; ts: string; from_agent?: string | null; channel?: string }>));
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
          const msg = payload.new as { id: number; content: string; ts: string; from_agent?: string | null; channel?: string };
          if (!isMounted.current) return;
          const preview = { content: msg.content, ts: msg.ts };
          const ch = msg.channel ?? 'group';
          setLastMessages((prev) => {
            const next = { ...prev };
            if (ch === 'group') {
              next['group'] = preview;
            } else if (ch.startsWith('dm:')) {
              const agentId = ch.replace('dm:', '');
              next[agentId] = preview;
            }
            return next;
          });
        }
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, []);

  const sortedAgents = Object.entries(agentNameMap).sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white">
      {/* Conversation rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-stone-100">
        {loading && (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-stone-200 flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-stone-200 rounded w-1/3" />
                  <div className="h-3 bg-stone-100 rounded w-2/3" />
                </div>
                <div className="h-3 bg-stone-100 rounded w-8" />
              </div>
            ))}
          </div>
        )}

        {!loading && (
          <>
            {/* Group Chat row */}
            <button
              onClick={() => onSelect('group')}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-stone-50 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <MessageSquare className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-stone-900 mb-0.5">Group Chat</div>
                <div className="text-xs text-stone-400 truncate">
                  {lastMessages['group'] ? truncate(lastMessages['group'].content) : 'No messages yet'}
                </div>
              </div>
              {lastMessages['group'] && (
                <div className="text-xs text-stone-400 flex-shrink-0 self-start pt-0.5">
                  {timeAgo(lastMessages['group'].ts)}
                </div>
              )}
            </button>

            {/* Per-agent rows */}
            {sortedAgents.map(([agentId, name]) => {
              const colorName = agentColorMap[agentId] || 'slate';
              const hex = COLOR_HEX[colorName] || '#64748b';
              const last = lastMessages[agentId];

              return (
                <button
                  key={agentId}
                  onClick={() => onSelect(agentId)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-stone-50 transition-colors text-left"
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white font-semibold text-sm"
                    style={{ backgroundColor: hex }}
                  >
                    {name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-stone-900 mb-0.5">{name}</div>
                    <div className="text-xs text-stone-400 truncate">
                      {last ? truncate(last.content) : 'Start a conversation'}
                    </div>
                  </div>
                  {last && (
                    <div className="text-xs text-stone-400 flex-shrink-0 self-start pt-0.5">
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
