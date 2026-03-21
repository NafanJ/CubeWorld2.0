import React from 'react';

const COLOR_HEX: Record<string, string> = {
  red: '#ef4444', orange: '#f97316', green: '#22c55e', blue: '#3b82f6',
  purple: '#a855f7', teal: '#14b8a6', yellow: '#eab308', pink: '#ec4899',
  indigo: '#6366f1', lime: '#84cc16', amber: '#f59e0b', rose: '#f43f5e',
  cyan: '#06b6d4', sky: '#0ea5e9', violet: '#8b5cf6', emerald: '#10b981',
  fuchsia: '#d946ef', slate: '#64748b',
};

interface RoomCardProps {
  characters?: string[];
  usernames?: string[];
  agentIds?: string[];
  agentColorMap?: Record<string, string>;
  roomName?: string;
  backgroundImage?: string;
  onClick?: () => void;
}

export function RoomCard({
  characters = [],
  usernames = [],
  agentIds = [],
  agentColorMap = {},
  roomName,
  backgroundImage,
  onClick,
}: RoomCardProps) {
  return (
    <div className={`w-full h-full${onClick ? ' cursor-pointer' : ''}`} onClick={onClick}>
      <div
        className={`w-full h-full relative overflow-hidden rounded-xl bg-stone-300 bg-cover bg-center transition-all duration-150${onClick ? ' hover:ring-2 hover:ring-emerald-400 hover:ring-inset hover:brightness-105' : ''}`}
        style={
          backgroundImage
            ? { backgroundImage: `url(${backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : undefined
        }
      >
        {/* Gradient overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />

        {/* Room name */}
        {roomName && (
          <div className="absolute top-2 left-2 right-2">
            <span className="inline-block bg-black/40 backdrop-blur-sm text-white text-[10px] lg:text-xs font-medium px-2 py-0.5 rounded-md">
              {roomName}
            </span>
          </div>
        )}

        {/* Agent avatars — bottom row */}
        {characters.length > 0 && (
          <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1">
            {characters.slice(0, 5).map((c, i) => {
              const agentId = agentIds[i];
              const colorName = agentId ? (agentColorMap[agentId] || 'slate') : 'slate';
              const hex = COLOR_HEX[colorName] || '#64748b';
              return (
                <div
                  key={i}
                  className="w-7 h-7 lg:w-8 lg:h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 shadow-md border-2 border-white/50"
                  style={{ backgroundColor: hex }}
                  title={usernames[i] || ''}
                >
                  {c}
                </div>
              );
            })}
            {characters.length > 5 && (
              <span className="text-[10px] text-white/80 font-medium">+{characters.length - 5}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
