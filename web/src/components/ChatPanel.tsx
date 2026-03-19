import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { PALETTE, buildAgentColorMap } from '../lib/colorUtils';
import { ChatLogTab } from './ChatLogTab';
import { ConversationList } from './ConversationList';
import { StatusTab } from './StatusTab';
import { SystemTab } from './SystemTab';
import { DiaryTab } from './DiaryTab';

type TabType = 'chat' | 'status' | 'diary' | 'system';

interface ChatPanelProps {
  mobileTab?: 'chat' | 'diary' | 'status';
}

export function ChatPanel({ mobileTab }: ChatPanelProps) {
  const [desktopTab, setDesktopTab] = useState<TabType>('chat');
  const [agentColorMap, setAgentColorMap] = useState<Record<string, string>>({});
  const [agentNameMap, setAgentNameMap] = useState<Record<string, string>>({});
  const [isMobile, setIsMobile] = useState(false);
  // null = conversation list, 'group' = group chat thread, agentId = DM thread
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const activeTab = isMobile ? (mobileTab || 'chat') : desktopTab;

  // Load agents to build color map for consistency across tabs
  useEffect(() => {
    let mounted = true;
    const loadAgents = async () => {
      const { data, error } = await supabase.from('agents').select('id, name');
      if (error) {
        console.error('Error loading agents', error);
        return;
      }

      if (!mounted || !data) return;

      const agents = (data as Array<{ id: string; name: string }>).filter((a) => a?.id && a?.name);
      setAgentColorMap(buildAgentColorMap(agents));
      const nameMap: Record<string, string> = {};
      for (const a of agents) nameMap[a.id] = a.name;
      setAgentNameMap(nameMap);
    };

    loadAgents();

    // Subscribe to agent changes
    const channel = supabase
      .channel('public:agents:colors')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agents' },
        (payload: any) => {
          const newRow = payload.new as { id: string; name?: string } | null;
          if (newRow && newRow.id && newRow.name) {
            setAgentNameMap((prev) => ({ ...prev, [newRow.id]: newRow.name as string }));
            setAgentColorMap((prev) => {
              if (prev[newRow.id]) return prev;
              const used = new Set(Object.values(prev));
              const c = PALETTE.find((p: string) => !used.has(p)) || PALETTE[Object.keys(prev).length % PALETTE.length];
              return { ...prev, [newRow.id]: c };
            });
          } else if (payload.event === 'DELETE' && payload.old) {
            const oldRow = payload.old as { id: string };
            setAgentNameMap((prev) => {
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

  return (
    <div className="relative flex flex-col h-full bg-gradient-to-br from-indigo-100 to-purple-100 lg:border-l-8 lg:border-indigo-500">
      {/* Tab Navigation Header - desktop only */}
      <div className="hidden lg:block bg-indigo-500 border-b-8 border-indigo-700 p-4 pixel-border-bottom">
        <div className="flex gap-1 mb-3">
          <button
            onClick={() => setDesktopTab('chat')}
            className={`flex-1 px-1 py-2 rounded-md pixel-text text-xs font-bold transition-colors ${
              desktopTab === 'chat'
                ? 'bg-indigo-700 text-white border-2 border-indigo-900'
                : 'bg-indigo-400 text-indigo-900 border-2 border-indigo-600 hover:bg-indigo-500'
            }`}
          >
            <span className="hidden sm:inline">MESSAGES</span>
            <span className="sm:hidden">MSG</span>
          </button>
          <button
            onClick={() => setDesktopTab('status')}
            className={`flex-1 px-1 py-2 rounded-md pixel-text text-xs font-bold transition-colors ${
              desktopTab === 'status'
                ? 'bg-indigo-700 text-white border-2 border-indigo-900'
                : 'bg-indigo-400 text-indigo-900 border-2 border-indigo-600 hover:bg-indigo-500'
            }`}
          >
            STATUS
          </button>
          <button
            onClick={() => setDesktopTab('diary')}
            className={`flex-1 px-1 py-2 rounded-md pixel-text text-xs font-bold transition-colors ${
              desktopTab === 'diary'
                ? 'bg-amber-700 text-white border-2 border-amber-900'
                : 'bg-indigo-400 text-indigo-900 border-2 border-indigo-600 hover:bg-indigo-500'
            }`}
          >
            DIARY
          </button>
          <button
            onClick={() => setDesktopTab('system')}
            className={`flex-1 px-1 py-2 rounded-md pixel-text text-xs font-bold transition-colors ${
              desktopTab === 'system'
                ? 'bg-indigo-700 text-white border-2 border-indigo-900'
                : 'bg-indigo-400 text-indigo-900 border-2 border-indigo-600 hover:bg-indigo-500'
            }`}
          >
            <span className="hidden sm:inline">SYSTEM</span>
            <span className="sm:hidden">SYS</span>
          </button>
        </div>

        {/* Status Tab Header */}
        {desktopTab === 'status' && (
          <h2 className="pixel-text text-white text-lg font-bold">AGENT STATUS</h2>
        )}

        {/* Diary Tab Header */}
        {desktopTab === 'diary' && (
          <h2 className="pixel-text text-white text-lg font-bold">AGENT DIARIES</h2>
        )}

        {/* System Tab Header */}
        {desktopTab === 'system' && (
          <h2 className="pixel-text text-white text-lg font-bold">SYSTEM</h2>
        )}
      </div>

      {/* Keep all tabs mounted but hidden to preserve state */}
      <div style={{ display: activeTab === 'chat' ? 'flex' : 'none' }} className="flex flex-col flex-1 min-h-0">
        {selectedConversation === null ? (
          <ConversationList
            agentColorMap={agentColorMap}
            agentNameMap={agentNameMap}
            onSelect={setSelectedConversation}
          />
        ) : (
          <ChatLogTab
            agentColorMap={agentColorMap}
            agentNameMap={agentNameMap}
            dmAgentId={selectedConversation === 'group' ? null : selectedConversation}
            dmAgentName={selectedConversation === 'group' ? null : agentNameMap[selectedConversation]}
            onBack={() => setSelectedConversation(null)}
          />
        )}
      </div>
      <div style={{ display: activeTab === 'status' ? 'flex' : 'none' }} className="flex-1 min-h-0 flex flex-col">
        <StatusTab agentColorMap={agentColorMap} />
      </div>
      <div style={{ display: activeTab === 'diary' ? 'flex' : 'none' }} className="flex-1 min-h-0 flex flex-col">
        <DiaryTab agentColorMap={agentColorMap} />
      </div>
      <div style={{ display: activeTab === 'system' ? 'flex' : 'none' }} className="flex-1 min-h-0 flex flex-col">
        <SystemTab />
      </div>
    </div>
  );
}
