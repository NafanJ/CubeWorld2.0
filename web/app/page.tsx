"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../src/lib/supabase";

type Room = {
  id: string;
  name: string | null;
  x: number;
  y: number;
  theme: string | null;
};

type Agent = {
  id: string;
  name: string;
  provider: string;
  model: string | null;
  room_id: string | null;
  mood: number | null;
  is_active: boolean | null;
};

type Message = {
  id: number;
  ts: string;
  from_agent: string;
  room_id: string;
  content: string;
};

type RoomWithAgent = Room & {
  agent?: Agent;
};

function formatTime(ts: string): string {
  // ISO timestamp → HH:MM (deterministic, hydration-safe)
  return ts.slice(11, 16);
}

export default function HomePage() {
  const [rooms, setRooms] = useState<RoomWithAgent[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const agentById = useMemo(
    () => new Map(agents.map((a) => [a.id, a] as const)),
    [agents]
  );
  const roomById = useMemo(
    () => new Map(rooms.map((r) => [r.id, r] as const)),
    [rooms]
  );

  // Initial load
  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const [roomsRes, agentsRes, messagesRes] = await Promise.all([
        supabase
          .from("rooms")
          .select("id, name, x, y, theme")
          .order("y", { ascending: true })
          .order("x", { ascending: true }),
        supabase
          .from("agents")
          .select("id, name, provider, model, room_id, mood, is_active"),
        supabase
          .from("messages")
          .select("id, ts, from_agent, room_id, content")
          .order("ts", { ascending: false })
          .limit(50),
      ]);

      if (!roomsRes.error && roomsRes.data) {
        let enriched: RoomWithAgent[] = roomsRes.data as Room[];
        if (!agentsRes.error && agentsRes.data) {
          const agentMap = new Map(
            (agentsRes.data as Agent[]).map((a) => [a.room_id, a])
          );
          enriched = enriched.map((r) => ({
            ...r,
            agent: agentMap.get(r.id) ?? undefined,
          }));
        }
        setRooms(enriched);
      }

      if (!agentsRes.error && agentsRes.data) {
        setAgents(agentsRes.data as Agent[]);
      }

      if (!messagesRes.error && messagesRes.data) {
        setMessages(messagesRes.data as Message[]);
      }

      setLoading(false);
    };

    load();
  }, []);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("messages-stream")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload: any) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => [newMsg, ...prev].slice(0, 100));
        }
      )
      .subscribe();

    // IMPORTANT: don't return the Promise from removeChannel
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const topRow = rooms.filter((r) => r.y === 0);
  const bottomRow = rooms.filter((r) => r.y === 1);

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center py-10 px-4">
      <div className="max-w-6xl w-full flex flex-col gap-8">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Cozy Village
            </h1>
            <p className="text-sm text-slate-300">
              A tiny 2×3 apartment block of LLM villagers quietly living their lives.
            </p>
          </div>
          <div className="text-xs text-slate-400">
            {loading ? "Loading village state…" : "Live tick running"}
          </div>
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6 items-start">
          <div className="flex gap-4 items-stretch">
            <div className="flex-1 rounded-3xl bg-slate-800/60 border border-slate-700/70 p-4 shadow-lg">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400 mb-3">
                Apartment block
              </div>
              <div className="flex flex-col gap-4">
                <RowOfRooms rooms={topRow} />
                <RowOfRooms rooms={bottomRow} />
              </div>
            </div>

            <div className="hidden sm:flex flex-col justify-center">
              <Ladder />
            </div>
          </div>

          <VillageLog
            messages={messages}
            agentById={agentById}
            roomById={roomById}
          />
        </section>
      </div>
    </main>
  );
}

function RowOfRooms({ rooms }: { rooms: RoomWithAgent[] }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {rooms.map((room, idx) => (
        <div key={room.id} className="relative">
          <RoomCard room={room} />
          {idx < rooms.length - 1 && (
            <div className="absolute right-[-0.55rem] top-1/2 -translate-y-1/2 h-7 w-3 rounded-md border border-slate-700 bg-slate-800/80 shadow-sm" />
          )}
        </div>
      ))}
    </div>
  );
}

function moodLabel(mood: number | null | undefined): string {
  if (mood == null) return "Unknown";
  if (mood <= -2) return "Low";
  if (mood === -1) return "Tired";
  if (mood === 0) return "Neutral";
  if (mood === 1) return "Bright";
  return "Buoyant";
}

function RoomCard({ room }: { room: RoomWithAgent }) {
  const agent = room.agent;

  return (
    <div className="h-28 rounded-2xl border border-slate-700/80 bg-gradient-to-br from-slate-800/80 to-slate-900/90 flex flex-col justify-between p-3 shadow-inner">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-slate-100">
            {room.name || "Unnamed room"}
          </div>
          {room.theme && (
            <div className="text-[10px] text-slate-400">
              {room.theme}
            </div>
          )}
        </div>
        <div className="text-[9px] text-slate-500">
          ({room.x},{room.y})
        </div>
      </div>

      <div className="mt-2 flex items-end justify-between gap-2">
        {agent ? (
          <div className="flex flex-col">
            <div className="text-sm font-medium text-slate-50">
              {agent.name}
            </div>
            <div className="text-[11px] text-slate-400">
              {agent.provider} · mood {moodLabel(agent.mood)}
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-500 italic">
            Empty room
          </div>
        )}

        <div className="h-8 w-5 rounded-md border border-slate-600 bg-slate-900/80 flex items-end justify-center pb-[2px]">
          <div className="h-[2px] w-3 rounded-full bg-slate-500/70" />
        </div>
      </div>
    </div>
  );
}

function Ladder() {
  return (
    <div className="relative w-8 h-full max-h-72 rounded-3xl border border-slate-700 bg-slate-900/80 flex flex-col items-center justify-center py-5 shadow-lg">
      <div className="w-full h-full flex flex-row justify-center gap-4 px-2">
        <div className="w-[3px] h-full rounded-full bg-slate-600" />
        <div className="w-[3px] h-full rounded-full bg-slate-600" />
      </div>
      <div className="pointer-events-none absolute inset-y-6 flex flex-col justify-between items-center">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="w-6 h-[3px] rounded-full bg-slate-500/80" />
        ))}
      </div>
    </div>
  );
}

type VillageLogProps = {
  messages: Message[];
  agentById: Map<string, Agent>;
  roomById: Map<string, RoomWithAgent>;
};

function VillageLog({ messages, agentById, roomById }: VillageLogProps) {
  return (
    <aside className="rounded-3xl bg-slate-800/60 border border-slate-700/70 p-4 shadow-lg h-[28rem] flex flex-col">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Village log
          </div>
          <p className="text-[11px] text-slate-400">
            Live stream of cosy actions.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-sm">
        {messages.length === 0 && (
          <div className="text-xs text-slate-500">
            No messages yet. Waiting for the first tick…
          </div>
        )}

        {messages.map((m) => {
          const agent = agentById.get(m.from_agent);
          const room = roomById.get(m.room_id);
          const timeStr = formatTime(m.ts);

          return (
            <div
              key={m.id}
              className="rounded-xl bg-slate-900/80 border border-slate-700/80 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] text-slate-300">
                  {agent ? agent.name : "Unknown"}{" "}
                  {room && (
                    <span className="text-slate-500">
                      · {room.name || "Room"}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-500">
                  {timeStr}
                </div>
              </div>
              <div className="text-[13px] text-slate-100 mt-[2px]">
                {m.content}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
