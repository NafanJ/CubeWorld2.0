import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { PALETTE, buildAgentColorMap } from '../lib/colorUtils';
import { ChatLogTab } from './ChatLogTab';
import { ConversationList } from './ConversationList';
import { StatusTab } from './StatusTab';
import { SystemTab } from './SystemTab';
import { AgentLogsTab } from './DiaryTab';
import { PixelRoomGrid } from './PixelRoomGrid';
import type { ActiveTab } from '../App';

type LogsSubTab = 'chat' | 'logs';

interface ChatPanelProps {
  activeSection: ActiveTab;
  onRoomSelect?: () => void;
}

export function ChatPanel({ activeSection, onRoomSelect }: ChatPanelProps) {
  const [agentColorMap, setAgentColorMap] = useState<Record<string, string>>({});
  const [agentNameMap, setAgentNameMap] = useState<Record<string, string>>({});
  const [logsSubTab, setLogsSubTab] = useState<LogsSubTab>('chat');
  // null = conversation list, 'group' = group chat thread, agentId = DM thread
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [animatingSection, setAnimatingSection] = useState<ActiveTab | null>(null);
  const prevSectionRef = useRef<ActiveTab>(activeSection);

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

  useEffect(() => {
    if (prevSectionRef.current !== activeSection) {
      prevSectionRef.current = activeSection;
      setAnimatingSection(activeSection);
      const t = setTimeout(() => setAnimatingSection(null), 220);
      return () => clearTimeout(t);
    }
  }, [activeSection]);

  const handleRoomSelect = useCallback(() => {
    setSelectedConversation('group');
    onRoomSelect?.();
  }, [onRoomSelect]);

  return (
    <div className="flex flex-col h-full">
      {/* Overview — room grid */}
      <div
        style={{ display: activeSection === 'overview' ? 'flex' : 'none' }}
        className={`flex-1 min-h-0 overflow-hidden bg-stone-50 items-start lg:items-center justify-center p-4 lg:p-6${animatingSection === 'overview' ? ' tab-content-enter' : ''}`}
      >
        <PixelRoomGrid agentColorMap={agentColorMap} onRoomSelect={handleRoomSelect} />
      </div>

      {/* Directory — villager cards */}
      <div
        style={{ display: activeSection === 'directory' ? 'flex' : 'none' }}
        className={`flex-1 min-h-0 flex flex-col overflow-hidden${animatingSection === 'directory' ? ' tab-content-enter' : ''}`}
      >
        <StatusTab agentColorMap={agentColorMap} />
      </div>

      {/* Chats — chat + agent logs */}
      <div
        style={{ display: activeSection === 'logs' ? 'flex' : 'none' }}
        className={`flex-1 min-h-0 flex flex-col overflow-hidden${animatingSection === 'logs' ? ' tab-content-enter' : ''}`}
      >
        {/* Chats sub-tab nav */}
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
            onClick={() => setLogsSubTab('logs')}
            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              logsSubTab === 'logs'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            Activity
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

        {/* Agent logs sub-section */}
        <div
          style={{ display: logsSubTab === 'logs' ? 'flex' : 'none' }}
          className="flex-1 min-h-0 flex flex-col overflow-hidden"
        >
          <AgentLogsTab agentColorMap={agentColorMap} />
        </div>
      </div>

      {/* System — stats + controls */}
      <div
        style={{ display: activeSection === 'system' ? 'flex' : 'none' }}
        className={`flex-1 min-h-0 flex flex-col overflow-hidden${animatingSection === 'system' ? ' tab-content-enter' : ''}`}
      >
        <SystemTab />
      </div>
    </div>
  );
}
