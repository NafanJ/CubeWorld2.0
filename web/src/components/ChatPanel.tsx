import { useEffect, useState } from 'react';
import { ChatMessage } from './ChatMessage';
import { SendIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';

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

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-indigo-100 to-purple-100 border-l-8 border-indigo-500">
      {/* Header */}
      <div className="bg-indigo-500 border-b-8 border-indigo-700 p-4 pixel-border-bottom">
        <h2 className="pixel-text text-white text-lg font-bold">CHAT LOG</h2>
        <p className="pixel-text text-indigo-200 text-xs mt-1">
          {loading ? 'Connecting…' : `${messages.length} messages`}
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 && !loading && (
          <div className="text-xs text-gray-500">No messages yet.</div>
        )}

        {messages.map((msg) => {
          const username = msg.from_agent || 'Anon';
          const avatar = username ? username[0] : '🙂';
          const time = formatTime(msg.ts);
          // pick a color deterministically from username
          const colors = ['red', 'orange', 'green', 'blue', 'purple', 'teal'];
          const color = colors[Math.abs(hashString(username)) % colors.length];

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