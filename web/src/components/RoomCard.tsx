import React from "react";

type Agent = {
  id: string;
  name: string;
  provider: string;
  model: string | null;
  room_id: string | null;
  mood: number | null;
  is_active: boolean | null;
};

type RoomWithAgent = {
  id: string;
  name: string | null;
  x: number;
  y: number;
  theme: string | null;
  agent?: Agent;
};

function moodLabel(mood: number | null | undefined): string {
  if (mood == null) return "Unknown";
  if (mood <= -2) return "Low";
  if (mood === -1) return "Tired";
  if (mood === 0) return "Neutral";
  if (mood === 1) return "Bright";
  return "Buoyant";
}

export default function RoomCard({ room }: { room: RoomWithAgent }) {
  const agent = room.agent;

  const themeKey = (room.theme || room.name || "").toLowerCase();

  // Default frame
  let frameClasses =
    "border-slate-600/80 bg-slate-900/60 shadow-black/40 shadow-xl";

  // Map your six rooms to strong colours
  if (themeKey.includes("garden") || themeKey.includes("nook")) {
    frameClasses =
      "border-emerald-500/80 bg-emerald-900/40 shadow-emerald-900/60 shadow-xl";
  } else if (themeKey.includes("studio")) {
    frameClasses =
      "border-orange-400/80 bg-orange-900/40 shadow-orange-900/60 shadow-xl";
  } else if (themeKey.includes("library")) {
    frameClasses =
      "border-rose-500/80 bg-rose-900/40 shadow-rose-900/60 shadow-xl";
  } else if (themeKey.includes("workshop")) {
    frameClasses =
      "border-fuchsia-500/80 bg-fuchsia-900/40 shadow-fuchsia-900/60 shadow-xl";
  } else if (themeKey.includes("square") || themeKey.includes("porch")) {
    frameClasses =
      "border-sky-500/80 bg-sky-900/40 shadow-sky-900/60 shadow-xl";
  }

  return (
    <div
      className={[
        "relative aspect-[5/4] rounded-3xl border-4 overflow-hidden p-[6px]",
        frameClasses,
      ].join(" ")}
    >
      {/* Inner room surface */}
      <div className="h-full w-full rounded-2xl bg-slate-950/90 border border-white/10 px-3 py-2 flex flex-col justify-between">
        {/* Header: room + villager + avatar */}
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
              {room.name || "Unnamed room"}
            </p>

            {room.theme && (
              <p className="text-[10px] text-slate-500">{room.theme}</p>
            )}

            {agent ? (
              <p className="text-sm font-semibold text-slate-50">
                {agent.name}
                <span className="ml-1 text-[11px] font-normal text-slate-300">
                  · {moodLabel(agent.mood)}
                </span>
              </p>
            ) : (
              <p className="text-[11px] text-slate-500 italic">Empty room</p>
            )}
          </div>

          {/* Tiny avatar bubble (swap later for sprites if you like) */}
          <div className="h-8 w-8 rounded-full bg-slate-800/90 border border-white/10 flex items-center justify-center text-xs">
            <span>🙂</span>
          </div>
        </div>

        {/* Little activity text – we can wire this up to last message later */}
        <div className="mt-2 text-[11px] text-slate-200 leading-snug">
          {agent
            ? "Quietly pottering about the room."
            : "Lights off, everything still for now."}
        </div>

        {/* Floor strip */}
        <div className="mt-2 h-3 rounded-xl bg-slate-800/90 border border-white/5" />
      </div>
    </div>
  );
}
