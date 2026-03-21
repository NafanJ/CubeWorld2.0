import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { PALETTE, buildAgentColorMap } from '../lib/colorUtils';
import { ChatLogTab } from './ChatLogTab';
import { ConversationList } from './ConversationList';
import { StatusTab } from './StatusTab';
import { SystemTab } from './SystemTab';
import { DiaryTab } from './DiaryTab';
import { PixelRoomGrid } from './PixelRoomGrid';
import type { ActiveTab } from '../App';

type LogsSubTab = 'chat' | 'diary';

interface ChatPanelProps {
  activeSection: ActiveTab;
}

export function ChatPanel({ activeSection }: ChatPanelProps) {
  const [agentColorMap, setAgentColorMap] = useState<Record<string, string>>({});
  const [agentNameMap, setAgentNameMap] = useState<Record<string, string>>({});
  const [logsSubTab, setLogsSubTab] = useState<LogsSubTab>('chat');
  // null = conversation list, 'group' = group chat thread, agentId = DM thread
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);

  // Load agents to build color map for consistency across all sections
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
    <div className="flex flex-col h-full">
      {/* Overview — room grid */}
      <div
        style={{ display: activeSection === 'overview' ? 'flex' : 'none' }}
        className="flex-1 min-h-0 overflow-auto bg-stone-50 items-start lg:items-center justify-center p-4 lg:p-8"
      >
        <PixelRoomGrid agentColorMap={agentColorMap} />
      </div>

      {/* Directory — villager cards */}
      <div
        style={{ display: activeSection === 'directory' ? 'flex' : 'none' }}
        className="flex-1 min-h-0 flex flex-col overflow-hidden"
      >
        <StatusTab agentColorMap={agentColorMap} />
      </div>

      {/* Logs — chat + diary */}
      <div
        style={{ display: activeSection === 'logs' ? 'flex' : 'none' }}
        className="flex-1 min-h-0 flex flex-col overflow-hidden"
      >
        {/* Logs sub-tab nav */}
        <div className="flex border-b border-stone-200 bg-white px-4 flex-shrink-0">
          <button
            onClick={() => setLogsSubTab('chat')}
            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              logsSubTab === 'chat'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setLogsSubTab('diary')}
            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              logsSubTab === 'diary'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            Diary
          </button>
        </div>

        {/* Chat sub-section */}
        <div
          style={{ display: logsSubTab === 'chat' ? 'flex' : 'none' }}
          className="flex-1 min-h-0 flex flex-col overflow-hidden"
        >
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

        {/* Diary sub-section */}
        <div
          style={{ display: logsSubTab === 'diary' ? 'flex' : 'none' }}
          className="flex-1 min-h-0 flex flex-col overflow-hidden"
        >
          <DiaryTab agentColorMap={agentColorMap} />
        </div>
      </div>

      {/* System — stats + controls */}
      <div
        style={{ display: activeSection === 'system' ? 'flex' : 'none' }}
        className="flex-1 min-h-0 flex flex-col overflow-hidden"
      >
        <SystemTab />
      </div>
    </div>
  );
}
