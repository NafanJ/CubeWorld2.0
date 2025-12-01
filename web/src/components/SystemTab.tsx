import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type WorldState = {
  id: number;
  tick: number;
  rules: any;
};

export function SystemTab() {
  const [worldState, setWorldState] = useState<WorldState | null>(null);
  const [totalMessages, setTotalMessages] = useState(0);
  const [totalAgents, setTotalAgents] = useState(0);
  const [activeAgents, setActiveAgents] = useState(0);

  useEffect(() => {
    let mounted = true;
    const loadSystemData = async () => {
      const [worldStateRes, messageCountRes, agentsRes] = await Promise.all([
        supabase.from('world_state').select('*').eq('id', 1).single(),
        supabase.from('messages').select('id', { count: 'exact', head: true }),
        supabase.from('agents').select('id, is_active')
      ]);
      
      if (!mounted) return;
      
      if (worldStateRes.data) {
        setWorldState(worldStateRes.data as WorldState);
      }
      
      if (messageCountRes.count !== null) {
        setTotalMessages(messageCountRes.count);
      }
      
      if (agentsRes.data) {
        setTotalAgents(agentsRes.data.length);
        setActiveAgents(agentsRes.data.filter((a: any) => a.is_active).length);
      }
    };

    loadSystemData();

    const channel = supabase
      .channel('public:world_state')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'world_state' },
        () => {
          loadSystemData();
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Statistics */}
      <div className="bg-white border-4 border-indigo-300 rounded-lg p-4 pixel-border-sm animate-slide-in">
        <h3 className="pixel-text text-sm font-bold text-indigo-900 mb-3">STATISTICS</h3>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-700 font-semibold">Current Tick:</span>
            <span className="text-xs text-gray-900 font-bold">
              {worldState?.tick?.toLocaleString() || 0}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-700 font-semibold">Total Messages:</span>
            <span className="text-xs text-gray-900 font-bold">
              {totalMessages.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-700 font-semibold">Total Agents:</span>
            <span className="text-xs text-gray-900 font-bold">{totalAgents}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-700 font-semibold">Active Agents:</span>
            <span className="text-xs text-gray-900 font-bold">{activeAgents}</span>
          </div>
        </div>
      </div>
      
      {/* World Rules */}
      <div className="bg-white border-4 border-indigo-300 rounded-lg p-4 pixel-border-sm animate-slide-in">
        <h3 className="pixel-text text-sm font-bold text-indigo-900 mb-3">WORLD RULES</h3>
        <div className="bg-gray-50 border border-gray-300 rounded p-2 max-h-64 overflow-auto">
          <pre className="text-xs text-gray-700 whitespace-pre-wrap break-words">
            {worldState?.rules && Object.keys(worldState.rules).length > 0
              ? JSON.stringify(worldState.rules, null, 2)
              : '{}'}
          </pre>
        </div>
      </div>
    </div>
  );
}
