import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Activity, MessageSquare, Users, Zap } from 'lucide-react';

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
  const [tickLoading, setTickLoading] = useState(false);
  const [tickResult, setTickResult] = useState<'success' | 'error' | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadSystemData = async () => {
      const [worldStateRes, messageCountRes, agentsRes] = await Promise.all([
        supabase.from('world_state').select('*').eq('id', 1).single(),
        supabase.from('messages').select('id', { count: 'exact', head: true }),
        supabase.from('agents').select('id, is_active'),
      ]);

      if (!mounted) return;

      if (worldStateRes.data) setWorldState(worldStateRes.data as WorldState);
      if (messageCountRes.count !== null) setTotalMessages(messageCountRes.count);
      if (agentsRes.data) {
        setTotalAgents(agentsRes.data.length);
        setActiveAgents(agentsRes.data.filter((a: any) => a.is_active).length);
      }
    };

    loadSystemData();

    const channel = supabase
      .channel('public:world_state')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'world_state' }, () => {
        loadSystemData();
      })
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  const handleRunTick = async () => {
    setTickLoading(true);
    setTickResult(null);
    try {
      const { error } = await supabase.functions.invoke('tick', { method: 'POST' });
      if (error) throw error;
      setTickResult('success');
      setTimeout(() => setTickResult(null), 2000);
    } catch (err) {
      console.error('Tick failed', err);
      setTickResult('error');
      setTimeout(() => setTickResult(null), 3000);
    } finally {
      setTickLoading(false);
    }
  };

  const stats = [
    {
      label: 'Current Tick',
      value: worldState?.tick?.toLocaleString() || '0',
      icon: Activity,
      color: '#059669',
      bg: '#ecfdf5',
    },
    {
      label: 'Total Messages',
      value: totalMessages.toLocaleString(),
      icon: MessageSquare,
      color: '#0ea5e9',
      bg: '#f0f9ff',
    },
    {
      label: 'Active Agents',
      value: `${activeAgents} / ${totalAgents}`,
      icon: Users,
      color: '#8b5cf6',
      bg: '#f5f3ff',
    },
    {
      label: 'Simulation',
      value: 'Running',
      icon: Zap,
      color: '#f59e0b',
      bg: '#fffbeb',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 bg-stone-50">
      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div
            key={label}
            className="bg-white rounded-xl border border-stone-200 p-4 flex items-start gap-3 animate-slide-in"
          >
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: bg }}
            >
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
            <div>
              <p className="text-xs text-stone-500 mb-0.5">{label}</p>
              <p className="text-lg font-semibold text-stone-900 leading-tight">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl border border-stone-200 p-5 mb-5 animate-slide-in">
        <h3 className="text-sm font-semibold text-stone-700 mb-3">Simulation Controls</h3>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRunTick}
            disabled={tickLoading}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: tickLoading ? '#6ee7b7' : '#059669' }}
          >
            {tickLoading ? 'Running…' : 'Run Tick'}
          </button>
          {tickResult === 'success' && (
            <span className="text-sm font-medium text-emerald-600">Tick completed!</span>
          )}
          {tickResult === 'error' && (
            <span className="text-sm font-medium text-red-500">Tick failed</span>
          )}
        </div>
      </div>

      {/* World Rules */}
      <div className="bg-white rounded-xl border border-stone-200 p-5 animate-slide-in">
        <h3 className="text-sm font-semibold text-stone-700 mb-3">World Rules</h3>
        <div className="bg-stone-50 rounded-lg p-3 max-h-64 overflow-auto border border-stone-100">
          <pre className="text-xs text-stone-600 font-mono whitespace-pre-wrap break-words leading-relaxed">
            {worldState?.rules && Object.keys(worldState.rules).length > 0
              ? JSON.stringify(worldState.rules, null, 2)
              : '{}'}
          </pre>
        </div>
      </div>
    </div>
  );
}
