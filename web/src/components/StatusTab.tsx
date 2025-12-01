import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Agent = {
  id: string;
  name: string;
  mood: number;
  energy: number;
  room_id: string | null;
  persona: any;
  provider: string;
  model: string;
  is_active: boolean;
};

interface StatusTabProps {
  agentColorMap: Record<string, string>;
}

function getColorValue(color: string, shade: number): string {
  const colorMap: Record<string, Record<number, string>> = {
    red: { 500: '#ef4444', 700: '#b91c1c' },
    orange: { 500: '#f97316', 700: '#c2410c' },
    green: { 500: '#22c55e', 700: '#15803d' },
    blue: { 500: '#3b82f6', 700: '#1d4ed8' },
    purple: { 500: '#a855f7', 700: '#7e22ce' },
    teal: { 500: '#14b8a6', 700: '#0f766e' },
    yellow: { 500: '#eab308', 700: '#a16207' },
    pink: { 500: '#ec4899', 700: '#be185d' },
    indigo: { 500: '#6366f1', 700: '#4338ca' },
    lime: { 500: '#84cc16', 700: '#4d7c0f' },
    amber: { 500: '#f59e0b', 700: '#b45309' },
    rose: { 500: '#f43f5e', 700: '#be123c' },
    cyan: { 500: '#06b6d4', 700: '#0e7490' },
    sky: { 500: '#0ea5e9', 700: '#0369a1' },
    violet: { 500: '#8b5cf6', 700: '#6d28d9' },
    emerald: { 500: '#10b981', 700: '#047857' },
    fuchsia: { 500: '#d946ef', 700: '#a21caf' },
    slate: { 500: '#64748b', 700: '#334155' },
  };
  
  return colorMap[color]?.[shade] || colorMap.slate[shade];
}

function getMoodColor(mood: number): string {
  if (mood <= 3) return '#ef4444'; // red
  if (mood <= 5) return '#f97316'; // orange
  if (mood <= 7) return '#eab308'; // yellow
  return '#22c55e'; // green
}

export function StatusTab({ agentColorMap }: StatusTabProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [rooms, setRooms] = useState<Record<string, string>>({});

  useEffect(() => {
    let mounted = true;
    const loadAgentDetails = async () => {
      const { data, error } = await supabase
        .from('agents')
        .select('id, name, mood, energy, room_id, persona, provider, model, is_active')
        .order('name', { ascending: true });
      
      if (error) {
        console.error('Error loading agent details', error);
        return;
      }
      
      if (!mounted || !data) return;
      setAgents(data as Agent[]);
    };

    loadAgentDetails();

    const channel = supabase
      .channel('public:agents:details')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agents' },
        () => {
          loadAgentDetails();
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadRooms = async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('id, name');
      
      if (error) {
        console.error('Error loading rooms', error);
        return;
      }
      
      if (!mounted || !data) return;
      const roomMap: Record<string, string> = {};
      for (const room of data as Array<{ id: string; name: string }>) {
        roomMap[room.id] = room.name;
      }
      setRooms(roomMap);
    };

    loadRooms();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {agents.length === 0 ? (
        <div className="text-xs text-gray-500">No agents yet.</div>
      ) : (
        agents.map((agent) => {
          const color = agentColorMap[agent.id] || 'slate';
          const roomName = agent.room_id ? rooms[agent.room_id] || 'Unknown' : 'No room';
          const traits = agent.persona?.traits || [];
          
          return (
            <div
              key={agent.id}
              className="bg-white border-4 border-indigo-300 rounded-lg p-3 pixel-border-sm"
            >
              <div className="flex items-start gap-3">
                {/* Agent Avatar */}
                <div
                  className={`w-12 h-12 rounded-full bg-${color}-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0 border-2 border-${color}-700`}
                  style={{
                    backgroundColor: getColorValue(color, 500),
                    borderColor: getColorValue(color, 700),
                  }}
                >
                  {agent.name[0]}
                </div>
                
                <div className="flex-1 min-w-0">
                  {/* Agent Name and Status */}
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="pixel-text text-sm font-bold text-indigo-900 truncate">
                      {agent.name}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        agent.is_active
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-400 text-gray-700'
                      }`}
                    >
                      {agent.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>
                  
                  {/* Mood Bar */}
                  <div className="mb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-gray-700">Mood:</span>
                      <span className="text-xs text-gray-600">{agent.mood}/10</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 border border-gray-300">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${(agent.mood / 10) * 100}%`,
                          backgroundColor: getMoodColor(agent.mood),
                        }}
                      />
                    </div>
                  </div>
                  
                  {/* Energy Bars */}
                  <div className="mb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-gray-700">Energy:</span>
                      <span className="text-xs text-gray-600">{agent.energy}/5</span>
                    </div>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((level) => (
                        <div
                          key={level}
                          className={`flex-1 h-3 rounded border border-gray-300 ${
                            level <= agent.energy
                              ? 'bg-yellow-400'
                              : 'bg-gray-200'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  
                  {/* Room Location */}
                  <div className="text-xs text-gray-600 mb-1">
                    <span className="font-semibold">Room:</span> {roomName}
                  </div>
                  
                  {/* Provider/Model */}
                  <div className="text-xs text-gray-600 mb-1">
                    <span className="font-semibold">Model:</span> {agent.provider}/{agent.model}
                  </div>
                  
                  {/* Traits */}
                  {traits.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {traits.slice(0, 5).map((trait: string, idx: number) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] border border-purple-300"
                        >
                          {trait.charAt(0).toUpperCase() + trait.slice(1)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
