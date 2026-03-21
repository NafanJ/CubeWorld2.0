import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { MapPin, Zap, Heart } from 'lucide-react';

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

const COLOR_HEX: Record<string, string> = {
  red: '#ef4444', orange: '#f97316', green: '#22c55e', blue: '#3b82f6',
  purple: '#a855f7', teal: '#14b8a6', yellow: '#eab308', pink: '#ec4899',
  indigo: '#6366f1', lime: '#84cc16', amber: '#f59e0b', rose: '#f43f5e',
  cyan: '#06b6d4', sky: '#0ea5e9', violet: '#8b5cf6', emerald: '#10b981',
  fuchsia: '#d946ef', slate: '#64748b',
};

const COLOR_BG_LIGHT: Record<string, string> = {
  red: '#fef2f2', orange: '#fff7ed', green: '#f0fdf4', blue: '#eff6ff',
  purple: '#faf5ff', teal: '#f0fdfa', yellow: '#fefce8', pink: '#fdf2f8',
  indigo: '#eef2ff', lime: '#f7fee7', amber: '#fffbeb', rose: '#fff1f2',
  cyan: '#ecfeff', sky: '#f0f9ff', violet: '#f5f3ff', emerald: '#ecfdf5',
  fuchsia: '#fdf4ff', slate: '#f8fafc',
};

function normalizeMood(mood: number): number {
  return mood + 5;
}

function getMoodColor(normalizedMood: number): string {
  if (normalizedMood <= 3) return '#ef4444';
  if (normalizedMood <= 5) return '#f97316';
  if (normalizedMood <= 7) return '#eab308';
  return '#22c55e';
}

function getStatusLabel(agent: Agent): { label: string; color: string } {
  if (!agent.is_active) return { label: 'Inactive', color: 'bg-stone-200 text-stone-600' };
  if (agent.energy === 0) return { label: 'Resting', color: 'bg-stone-100 text-stone-600' };
  if (agent.mood >= 2 && agent.energy >= 3) return { label: 'Socializing', color: 'bg-amber-100 text-amber-700' };
  if (agent.energy >= 4) return { label: 'Active', color: 'bg-emerald-100 text-emerald-700' };
  return { label: 'Idle', color: 'bg-stone-100 text-stone-500' };
}

export function StatusTab({ agentColorMap }: StatusTabProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [rooms, setRooms] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadAgentDetails = async () => {
      const { data, error } = await supabase
        .from('agents')
        .select('id, name, mood, energy, room_id, persona, provider, model, is_active')
        .order('name', { ascending: true });

      if (error) {
        console.error('Error loading agent details', error);
        if (mounted) setIsLoading(false);
        return;
      }

      if (!mounted || !data) return;
      setAgents(data as Agent[]);
      if (mounted) setIsLoading(false);
    };

    loadAgentDetails();

    const channel = supabase
      .channel('public:agents:details')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, () => {
        loadAgentDetails();
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
      const { data, error } = await supabase.from('rooms').select('id, name');
      if (error || !mounted || !data) return;
      const roomMap: Record<string, string> = {};
      for (const room of data as Array<{ id: string; name: string }>) {
        roomMap[room.id] = room.name;
      }
      setRooms(roomMap);
    };

    loadRooms();
    return () => { mounted = false; };
  }, []);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) || null;

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-stone-200 p-4 animate-pulse">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full bg-stone-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-stone-200 rounded w-1/2" />
                  <div className="h-3 bg-stone-100 rounded w-1/3" />
                </div>
              </div>
              <div className="h-2 bg-stone-100 rounded w-full mb-2" />
              <div className="h-2 bg-stone-100 rounded w-3/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden">
      {/* Agent grid */}
      <div
        className={`overflow-y-auto p-4 lg:p-6 ${selectedAgent ? 'hidden lg:block lg:w-3/5' : 'w-full'}`}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl lg:max-w-none">
          {agents.length === 0 ? (
            <p className="text-sm text-stone-400">No agents yet.</p>
          ) : (
            agents.map((agent) => {
              const color = agentColorMap[agent.id] || 'slate';
              const hex = COLOR_HEX[color] || '#64748b';
              const bgLight = COLOR_BG_LIGHT[color] || '#f8fafc';
              const roomName = agent.room_id ? rooms[agent.room_id] || 'Unknown' : '—';
              const traits = agent.persona?.traits || [];
              const status = getStatusLabel(agent);
              const normalMood = normalizeMood(agent.mood);
              const isSelected = selectedAgentId === agent.id;

              return (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgentId(isSelected ? null : agent.id)}
                  className={`text-left bg-white rounded-xl border p-4 transition-all animate-slide-in hover:shadow-md ${
                    isSelected ? 'border-emerald-400 ring-2 ring-emerald-200 shadow-sm' : 'border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold text-base flex-shrink-0"
                      style={{ backgroundColor: hex }}
                    >
                      {agent.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-stone-900 text-sm truncate">{agent.name}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <MapPin className="w-3 h-3 text-stone-400 flex-shrink-0" />
                        <span className="text-xs text-stone-500 truncate">{roomName}</span>
                      </div>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${status.color}`}>
                      {status.label}
                    </span>
                  </div>

                  {/* Mood bar */}
                  <div className="mb-2">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1">
                        <Heart className="w-3 h-3 text-stone-400" />
                        <span className="text-[10px] text-stone-500">Mood</span>
                      </div>
                      <span className="text-[10px] text-stone-400">{agent.mood}</span>
                    </div>
                    <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${(normalMood / 10) * 100}%`, backgroundColor: getMoodColor(normalMood) }}
                      />
                    </div>
                  </div>

                  {/* Energy bars */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1">
                        <Zap className="w-3 h-3 text-stone-400" />
                        <span className="text-[10px] text-stone-500">Energy</span>
                      </div>
                      <span className="text-[10px] text-stone-400">{agent.energy}/5</span>
                    </div>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((level) => (
                        <div
                          key={level}
                          className="flex-1 h-1.5 rounded-sm"
                          style={{ backgroundColor: level <= agent.energy ? hex : '#e7e5e4' }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Traits */}
                  {traits.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {traits.slice(0, 3).map((trait: string, idx: number) => (
                        <span
                          key={idx}
                          className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: bgLight, color: hex }}
                        >
                          {trait.charAt(0).toUpperCase() + trait.slice(1)}
                        </span>
                      ))}
                      {traits.length > 3 && (
                        <span className="text-[10px] text-stone-400">+{traits.length - 3}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Agent detail panel — desktop only */}
      {selectedAgent && (
        <div className="hidden lg:flex lg:w-2/5 border-l border-stone-200 bg-white overflow-y-auto flex-col">
          {(() => {
            const agent = selectedAgent;
            const color = agentColorMap[agent.id] || 'slate';
            const hex = COLOR_HEX[color] || '#64748b';
            const bgLight = COLOR_BG_LIGHT[color] || '#f8fafc';
            const roomName = agent.room_id ? rooms[agent.room_id] || 'Unknown' : '—';
            const traits = agent.persona?.traits || [];
            const quirks = agent.persona?.quirks || [];
            const interests = agent.persona?.interests || [];
            const background = agent.persona?.background || '';
            const normalMood = normalizeMood(agent.mood);
            const status = getStatusLabel(agent);

            return (
              <div className="p-6">
                {/* Close button */}
                <button
                  onClick={() => setSelectedAgentId(null)}
                  className="mb-4 text-xs text-stone-400 hover:text-stone-600 flex items-center gap-1 transition-colors"
                >
                  ← Back to directory
                </button>

                {/* Avatar + name */}
                <div className="flex items-center gap-4 mb-5">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-2xl flex-shrink-0"
                    style={{ backgroundColor: hex }}
                  >
                    {agent.name[0]}
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-stone-900">{agent.name}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${status.color}`}>
                        {status.label}
                      </span>
                      <div className="flex items-center gap-1 text-xs text-stone-400">
                        <MapPin className="w-3 h-3" />
                        {roomName}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mood + Energy */}
                <div className="bg-stone-50 rounded-xl p-4 mb-5">
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <Heart className="w-3.5 h-3.5 text-stone-400" />
                        <span className="text-xs font-medium text-stone-600">Mood</span>
                      </div>
                      <span className="text-xs text-stone-500">{agent.mood} / 5</span>
                    </div>
                    <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${(normalMood / 10) * 100}%`, backgroundColor: getMoodColor(normalMood) }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-stone-400" />
                        <span className="text-xs font-medium text-stone-600">Energy</span>
                      </div>
                      <span className="text-xs text-stone-500">{agent.energy} / 5</span>
                    </div>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((level) => (
                        <div
                          key={level}
                          className="flex-1 h-2 rounded-sm"
                          style={{ backgroundColor: level <= agent.energy ? hex : '#e7e5e4' }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bio */}
                {background && (
                  <div className="mb-5">
                    <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Bio</h3>
                    <p className="text-sm text-stone-600 leading-relaxed">{background}</p>
                  </div>
                )}

                {/* Traits */}
                {traits.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Traits</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {traits.map((trait: string, idx: number) => (
                        <span
                          key={idx}
                          className="text-xs font-medium px-2.5 py-1 rounded-full"
                          style={{ backgroundColor: bgLight, color: hex }}
                        >
                          {trait.charAt(0).toUpperCase() + trait.slice(1)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Interests */}
                {interests.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Interests</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {interests.map((interest: string, idx: number) => (
                        <span key={idx} className="text-xs px-2.5 py-1 bg-stone-100 text-stone-600 rounded-full">
                          {interest.charAt(0).toUpperCase() + interest.slice(1)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quirks */}
                {quirks.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Quirks</h3>
                    <ul className="space-y-1">
                      {quirks.map((quirk: string, idx: number) => (
                        <li key={idx} className="text-xs text-stone-500 flex items-start gap-1.5">
                          <span className="text-stone-300 mt-0.5">•</span>
                          {quirk.charAt(0).toUpperCase() + quirk.slice(1)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Model info */}
                <div className="mt-4 pt-4 border-t border-stone-100">
                  <p className="text-[10px] text-stone-400 font-medium uppercase tracking-wider">
                    {agent.provider} · {agent.model}
                  </p>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
