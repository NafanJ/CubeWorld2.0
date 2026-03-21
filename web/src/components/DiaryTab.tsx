import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ChevronDown, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';

interface DiaryEntry {
  id: number;
  ts: string;
  agent_id: string;
  text: string;
}

interface DiaryTabProps {
  agentColorMap: Record<string, string>;
}

const COLOR_HEX: Record<string, string> = {
  red: '#ef4444', orange: '#f97316', green: '#22c55e', blue: '#3b82f6',
  purple: '#a855f7', teal: '#14b8a6', yellow: '#eab308', pink: '#ec4899',
  indigo: '#6366f1', lime: '#84cc16', amber: '#f59e0b', rose: '#f43f5e',
  cyan: '#06b6d4', sky: '#0ea5e9', violet: '#8b5cf6', emerald: '#10b981',
  fuchsia: '#d946ef', slate: '#64748b',
};

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
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
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

    if (error) { console.error('Error loading diary entries', error); return; }
    if (!isMounted.current || !data) return;

    const ordered = (data as DiaryEntry[]).reverse();
    setEntries(ordered);

    const dateToCount: Record<string, number> = {};
    for (const entry of ordered) {
      const dateKey = getDateKey(entry.ts);
      if (dateKey) dateToCount[dateKey] = (dateToCount[dateKey] || 0) + 1;
    }

    const dates = Object.keys(dateToCount).sort().reverse();
    setAvailableDates(dates);
    setDayEntryCounts(dateToCount);

    if (!selectedDate && dates.length > 0) setSelectedDate(dates[0]);
  }, [selectedDate]);

  useEffect(() => {
    const initialLoad = async () => {
      setLoading(true);
      await loadEntries();
      if (isMounted.current) setLoading(false);
    };
    initialLoad();
  }, []);

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

  useEffect(() => {
    const channel = supabase
      .channel('public:diary_entries')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'diary_entries' }, () => {
        loadEntries();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadEntries]);

  const filteredEntries = entries.filter((entry) => {
    const entryDate = getDateKey(entry.ts);
    if (entryDate !== selectedDate) return false;
    if (selectedAgent === 'all') return true;
    return entry.agent_id === selectedAgent;
  });

  const goToPreviousDay = useCallback(() => {
    const idx = availableDates.indexOf(selectedDate);
    if (idx < availableDates.length - 1) setSelectedDate(availableDates[idx + 1]);
  }, [availableDates, selectedDate]);

  const goToNextDay = useCallback(() => {
    const idx = availableDates.indexOf(selectedDate);
    if (idx > 0) setSelectedDate(availableDates[idx - 1]);
  }, [availableDates, selectedDate]);

  const goToToday = useCallback(() => {
    if (availableDates.length > 0) setSelectedDate(availableDates[0]);
  }, [availableDates]);

  const isToday = availableDates.length > 0 && selectedDate === availableDates[0];
  const canGoBack = availableDates.length > 0 && selectedDate !== availableDates[availableDates.length - 1];
  const canGoForward = availableDates.length > 0 && selectedDate !== availableDates[0];

  return (
    <>
      {/* Header */}
      <div className="bg-white border-b border-stone-200 px-4 py-3 flex items-center gap-3 flex-wrap flex-shrink-0">
        <div className="flex items-center gap-1.5 text-stone-600">
          <BookOpen className="w-4 h-4" />
          <span className="text-sm font-semibold text-stone-700">Agent Diaries</span>
        </div>

        {/* Date nav */}
        <div className="flex items-center gap-1">
          <button
            onClick={goToPreviousDay}
            disabled={!canGoBack}
            className="p-1 rounded text-stone-400 hover:text-stone-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {selectedDate && (
            <button
              onClick={goToToday}
              disabled={isToday}
              className="text-xs px-2 py-0.5 rounded-md text-stone-500 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isToday ? 'Today' : formatDateHeader(selectedDate)}
            </button>
          )}
          <button
            onClick={goToNextDay}
            disabled={!canGoForward}
            className="p-1 rounded text-stone-400 hover:text-stone-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {selectedDate && dayEntryCounts[selectedDate] !== undefined && (
            <span className="text-xs text-stone-400">({dayEntryCounts[selectedDate]})</span>
          )}
        </div>

        {/* Agent filter */}
        <div className="relative ml-auto">
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="appearance-none bg-white border border-stone-200 rounded-lg pl-3 pr-7 py-1.5 text-xs text-stone-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          >
            <option value="all">All agents</option>
            {Object.entries(agentMap)
              .sort((a, b) => a[1].localeCompare(b[1]))
              .map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-stone-400 pointer-events-none" />
        </div>
      </div>

      {/* Diary entries */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-stone-50">
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-stone-200 p-4 animate-pulse">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-full bg-stone-200" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3.5 bg-stone-200 rounded w-1/4" />
                    <div className="h-3 bg-stone-100 rounded w-1/6" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="h-3.5 bg-stone-100 rounded w-full" />
                  <div className="h-3.5 bg-stone-100 rounded w-5/6" />
                  <div className="h-3.5 bg-stone-100 rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {entries.length === 0 && !loading && (
          <div className="text-center py-12 text-sm text-stone-400">
            No diary entries yet. Agents will begin writing after a few ticks.
          </div>
        )}

        {entries.length > 0 && filteredEntries.length === 0 && !loading && (
          <div className="text-center py-12 text-sm text-stone-400">No diary entries on this day.</div>
        )}

        {filteredEntries.map((entry) => {
          const agentName = agentMap[entry.agent_id] || 'Unknown';
          const color = agentColorMap[entry.agent_id] || 'slate';
          const hex = COLOR_HEX[color] || '#64748b';
          const time = formatTime(entry.ts);

          return (
            <div
              key={entry.id}
              className="bg-white rounded-xl border border-stone-200 p-4 animate-slide-in"
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0"
                  style={{ backgroundColor: hex }}
                >
                  {agentName[0] || '?'}
                </div>
                <div>
                  <div className="text-sm font-semibold text-stone-800">{agentName}</div>
                  <div className="text-xs text-stone-400">{time}</div>
                </div>
              </div>
              <p className="text-sm text-stone-600 italic leading-relaxed">{entry.text}</p>
            </div>
          );
        })}
      </div>
    </>
  );
}
