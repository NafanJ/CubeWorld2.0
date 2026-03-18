import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

interface DiaryEntry {
  id: number;
  ts: string;
  agent_id: string;
  text: string;
}

interface DiaryTabProps {
  agentColorMap: Record<string, string>;
}

function formatTime(iso?: string) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function formatDateHeader(dateKey: string): string {
  try {
    const date = new Date(dateKey + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return dateKey;
  }
}

function getDateKey(iso: string): string {
  try {
    return iso.split('T')[0];
  } catch {
    return '';
  }
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

export function DiaryTab({ agentColorMap }: DiaryTabProps) {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [agentMap, setAgentMap] = useState<Record<string, string>>({});
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [dayEntryCounts, setDayEntryCounts] = useState<Record<string, number>>({});
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const loadEntries = useCallback(async () => {
    const { data, error } = await supabase
      .from('diary_entries')
      .select('id, ts, agent_id, text')
      .order('ts', { ascending: false });

    if (error) {
      console.error('Error loading diary entries', error);
      return;
    }

    if (!isMounted.current || !data) return;

    const ordered = (data as DiaryEntry[]).reverse();
    setEntries(ordered);

    const dateToCount: Record<string, number> = {};
    for (const entry of ordered) {
      const dateKey = getDateKey(entry.ts);
      if (dateKey) {
        dateToCount[dateKey] = (dateToCount[dateKey] || 0) + 1;
      }
    }

    const dates = Object.keys(dateToCount).sort().reverse();
    setAvailableDates(dates);
    setDayEntryCounts(dateToCount);

    if (!selectedDate && dates.length > 0) {
      setSelectedDate(dates[0]);
    }
  }, [selectedDate]);

  useEffect(() => {
    const initialLoad = async () => {
      setLoading(true);
      await loadEntries();
      if (isMounted.current) setLoading(false);
    };
    initialLoad();
  }, []);

  // Load agent names
  useEffect(() => {
    let mounted = true;
    const loadAgents = async () => {
      const { data, error } = await supabase.from('agents').select('id, name');
      if (error || !mounted || !data) return;

      const map: Record<string, string> = {};
      for (const a of data as Array<{ id: string; name: string }>) {
        if (a?.id && a?.name) map[a.id] = a.name;
      }
      setAgentMap(map);
    };

    loadAgents();
    return () => { mounted = false; };
  }, []);

  // Realtime subscription for new diary entries
  useEffect(() => {
    const channel = supabase
      .channel('public:diary_entries')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'diary_entries' },
        () => {
          loadEntries();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadEntries]);

  const filteredEntries = entries.filter((entry) => {
    const entryDate = getDateKey(entry.ts);
    if (entryDate !== selectedDate) return false;
    if (selectedAgent === 'all') return true;
    return entry.agent_id === selectedAgent;
  });

  const goToPreviousDay = useCallback(() => {
    const idx = availableDates.indexOf(selectedDate);
    if (idx < availableDates.length - 1) {
      setSelectedDate(availableDates[idx + 1]);
    }
  }, [availableDates, selectedDate]);

  const goToNextDay = useCallback(() => {
    const idx = availableDates.indexOf(selectedDate);
    if (idx > 0) {
      setSelectedDate(availableDates[idx - 1]);
    }
  }, [availableDates, selectedDate]);

  const goToToday = useCallback(() => {
    if (availableDates.length > 0) {
      setSelectedDate(availableDates[0]);
    }
  }, [availableDates]);

  const isToday = availableDates.length > 0 && selectedDate === availableDates[0];
  const canGoBack = availableDates.length > 0 && selectedDate !== availableDates[availableDates.length - 1];
  const canGoForward = availableDates.length > 0 && selectedDate !== availableDates[0];

  return (
    <>
      {/* Header */}
      <div className="bg-gray-800 p-3 border-b-4 border-gray-700">
        {selectedDate && (
          <div className="mb-3 inline-block bg-amber-700 text-amber-100 px-3 py-1 rounded-md border-2 border-amber-800 pixel-text text-xs">
            Viewing: {formatDateHeader(selectedDate)}
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={goToPreviousDay}
              disabled={!canGoBack}
              className="px-2 py-1 bg-gray-700 text-gray-200 border-2 border-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600 text-xs"
            >
              ← Prev
            </button>
            <button
              onClick={goToToday}
              disabled={isToday}
              className="px-2 py-1 bg-gray-700 text-gray-200 border-2 border-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600 text-xs"
            >
              Today
            </button>
            <button
              onClick={goToNextDay}
              disabled={!canGoForward}
              className="px-2 py-1 bg-gray-700 text-gray-200 border-2 border-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600 text-xs"
            >
              Next →
            </button>
            {selectedDate && dayEntryCounts[selectedDate] !== undefined && (
              <span className="pixel-text text-gray-400 text-xs ml-2">
                ({dayEntryCounts[selectedDate]} entr{dayEntryCounts[selectedDate] === 1 ? 'y' : 'ies'})
              </span>
            )}
          </div>
          <div className="ml-auto">
            <label className="pixel-text text-gray-300 text-xs mr-2">Filter:</label>
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="text-xs px-2 py-1 rounded-md bg-gray-700 text-gray-200 border-2 border-gray-600"
            >
              <option value="all">All agents</option>
              {Object.entries(agentMap)
                .sort((a, b) => a[1].localeCompare(b[1]))
                .map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>

      {/* Diary Entries */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-gray-800 border-4 border-gray-700 rounded-lg p-3 animate-pulse">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-700" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-gray-700 rounded w-1/4" />
                    <div className="h-4 bg-gray-700 rounded w-full" />
                    <div className="h-4 bg-gray-700 rounded w-3/4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {entries.length === 0 && !loading && (
          <div className="text-xs text-gray-400">No diary entries yet. Agents will begin writing after a few ticks.</div>
        )}

        {entries.length > 0 && filteredEntries.length === 0 && !loading && (
          <div className="text-xs text-gray-400">No diary entries on this day.</div>
        )}

        {filteredEntries.map((entry) => {
          const agentName = agentMap[entry.agent_id] || 'Unknown';
          const color = agentColorMap[entry.agent_id] || 'slate';
          const avatar = agentName[0] || '?';
          const time = formatTime(entry.ts);

          return (
            <div
              key={entry.id}
              className="bg-amber-950/30 border-4 border-amber-800/50 rounded-lg p-3 pixel-border-sm animate-slide-in"
            >
              <div className="flex items-start gap-3">
                {/* Agent Avatar */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0 border-2"
                  style={{
                    backgroundColor: getColorValue(color, 500),
                    borderColor: getColorValue(color, 700),
                  }}
                >
                  {avatar}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="pixel-text text-xs font-bold text-amber-200">
                      {agentName}&apos;s Diary
                    </span>
                    <span className="pixel-text text-[8px] text-gray-400">
                      {time}
                    </span>
                  </div>
                  <p className="pixel-text text-xs text-gray-200 italic leading-relaxed">
                    {entry.text}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
