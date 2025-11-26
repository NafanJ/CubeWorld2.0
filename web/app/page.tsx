"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../src/lib/supabase";
import RoomCard from "../src/components/RoomCard";

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

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // 2 columns × 3 rows: sort once and render in a 2-col grid
  const sortedRooms = [...rooms].sort(
    (a, b) => a.y - b.y || a.x - b.x
  );

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-slate-100 flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-6xl flex flex-col gap-10">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Cozy Village
            </h1>
            <p className="text-sm text-slate-300">
              A tiny 2×3 apartment block of LLM villagers quietly living their
              lives.
            </p>
          </div>
          <div className="text-xs text-slate-400">
            {loading ? "Loading village state…" : "Live tick running"}
          </div>
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,4fr)_minmax(260px,2fr)] gap-12 items-start">
          {/* Apartment block */}
          <div className="flex flex-col gap-6 items-center">
            <div className="text-xs uppercase tracking-[0.25em] text-slate-400">
              Apartment block
            </div>

            <div className="flex gap-8 items-start">
              {/* 2 columns × 3 rows */}
              <div className="grid grid-cols-2 gap-6 w-full">
                {sortedRooms.map((room) => (
                  <RoomCard key={room.id} room={room} />
                ))}
              </div>

              {/* Ladder on the right */}
              <div className="hidden md:flex">
                <Ladder />
              </div>
            </div>
          </div>

          {/* Village log */}
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

function Ladder() {
  return (
    <div className="relative w-10 h-64 rounded-3xl border border-slate-800 bg-slate-950/90 flex flex-col items-center justify-center py-5 shadow-xl shadow-black/40">
      <div className="w-full h-full flex flex-row justify-center gap-4 px-3">
        <div className="w-[3px] h-full rounded-full bg-slate-600" />
        <div className="w-[3px] h-full rounded-full bg-slate-600" />
      </div>
      <div className="pointer-events-none absolute inset-y-6 flex flex-col justify-between items-center">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="w-7 h-[3px] rounded-full bg-slate-500/90" />
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
    <aside className="rounded-3xl bg-slate-950/90 border border-slate-800/80 p-4 shadow-xl shadow-black/40 h-[28rem] flex flex-col">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-slate-400">
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
              className="rounded-2xl bg-slate-900/90 border border-slate-800 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] text-slate-300">
                  {agent ? agent.name : "Unknown"}
                  {room && (
                    <span className="text-slate-500">
                      {" "}
                      · {room.name || "Room"}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-500">{timeStr}</div>
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
