import React from 'react';

const COLOR_HEX: Record<string, string> = {
  red: '#ef4444', orange: '#f97316', green: '#22c55e', blue: '#3b82f6',
  purple: '#a855f7', teal: '#14b8a6', yellow: '#eab308', pink: '#ec4899',
  indigo: '#6366f1', lime: '#84cc16', amber: '#f59e0b', rose: '#f43f5e',
  cyan: '#06b6d4', sky: '#0ea5e9', violet: '#8b5cf6', emerald: '#10b981',
  fuchsia: '#d946ef', slate: '#64748b',
};

interface ElevatorCardProps {
  characters?: string[];
  usernames?: string[];
  agentIds?: string[];
  agentColorMap?: Record<string, string>;
  roomName?: string;
  backgroundImage?: string;
}

export function ElevatorCard({
  characters = [],
  usernames = [],
  agentIds = [],
  agentColorMap = {},
  backgroundImage,
}: ElevatorCardProps) {
  return (
    <div className="w-full h-full">
      <div
        className="w-full h-full relative overflow-hidden rounded-xl bg-stone-400 bg-cover bg-center"
        style={
          backgroundImage
            ? { backgroundImage: `url(${backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : undefined
        }
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />

        {/* Elevator label */}
        <div className="absolute top-1.5 left-1 right-1 flex justify-center">
          <span className="text-[8px] lg:text-[9px] font-medium text-white/70 bg-black/30 px-1 py-0.5 rounded">
            ↕
          </span>
        </div>

        {/* Stacked agent avatars */}
        {characters.length > 0 && (
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5">
            {characters.slice(0, 3).map((c, i) => {
              const agentId = agentIds[i];
              const colorName = agentId ? (agentColorMap[agentId] || 'slate') : 'slate';
              const hex = COLOR_HEX[colorName] || '#64748b';
              return (
                <div
                  key={i}
                  className="w-5 h-5 lg:w-6 lg:h-6 rounded-full flex items-center justify-center text-white text-[9px] font-semibold shadow border border-white/40"
                  style={{ backgroundColor: hex }}
                  title={usernames[i] || ''}
                >
                  {c}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
