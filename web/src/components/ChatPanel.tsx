import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ChatLogTab } from './ChatLogTab';
import { StatusTab } from './StatusTab';
import { SystemTab } from './SystemTab';

// Shared palette for agent colors
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

type TabType = 'chat' | 'status' | 'system';

export function ChatPanel() {
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [agentColorMap, setAgentColorMap] = useState<Record<string, string>>({});

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

      const map: Record<string, string> = {};
      for (const a of data as Array<{ id: string; name: string }>) {
        if (a?.id && a?.name) map[a.id] = a.name;
      }
      
      // Assign unique colors to agents (deterministic and stable)
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

    // Subscribe to agent changes
    const channel = supabase
      .channel('public:agents:colors')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agents' },
        (payload: any) => {
          const newRow = payload.new as { id: string; name?: string } | null;
          if (newRow && newRow.id && newRow.name) {
            setAgentColorMap((prev) => {
              if (prev[newRow.id]) return prev;
              const used = new Set(Object.values(prev));
              const c = PALETTE.find((p: string) => !used.has(p)) || PALETTE[Object.keys(prev).length % PALETTE.length];
              return { ...prev, [newRow.id]: c };
            });
          } else if (payload.event === 'DELETE' && payload.old) {
            const oldRow = payload.old as { id: string };
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
    <div className="relative flex flex-col h-full bg-gradient-to-br from-indigo-100 to-purple-100 border-l-8 border-indigo-500">
      {/* Tab Navigation Header */}
      <div className="bg-indigo-500 border-b-8 border-indigo-700 p-4 pixel-border-bottom">
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-4 py-2 rounded-md pixel-text text-xs font-bold transition-colors ${
              activeTab === 'chat'
                ? 'bg-indigo-700 text-white border-2 border-indigo-900'
                : 'bg-indigo-400 text-indigo-900 border-2 border-indigo-600 hover:bg-indigo-500'
            }`}
          >
            CHAT LOG
          </button>
          <button
            onClick={() => setActiveTab('status')}
            className={`px-4 py-2 rounded-md pixel-text text-xs font-bold transition-colors ${
              activeTab === 'status'
                ? 'bg-indigo-700 text-white border-2 border-indigo-900'
                : 'bg-indigo-400 text-indigo-900 border-2 border-indigo-600 hover:bg-indigo-500'
            }`}
          >
            STATUS
          </button>
          <button
            onClick={() => setActiveTab('system')}
            className={`px-4 py-2 rounded-md pixel-text text-xs font-bold transition-colors ${
              activeTab === 'system'
                ? 'bg-indigo-700 text-white border-2 border-indigo-900'
                : 'bg-indigo-400 text-indigo-900 border-2 border-indigo-600 hover:bg-indigo-500'
            }`}
          >
            SYSTEM
          </button>
        </div>
        
        {/* Status Tab Header */}
        {activeTab === 'status' && (
          <h2 className="pixel-text text-white text-lg font-bold">AGENT STATUS</h2>
        )}
        
        {/* System Tab Header */}
        {activeTab === 'system' && (
          <h2 className="pixel-text text-white text-lg font-bold">SYSTEM</h2>
        )}
      </div>

      {/* Lazy render only the active tab to prevent unnecessary data fetches */}
      {activeTab === 'chat' && <ChatLogTab agentColorMap={agentColorMap} />}
      {activeTab === 'status' && <StatusTab agentColorMap={agentColorMap} />}
      {activeTab === 'system' && <SystemTab />}
    </div>
  );
}
