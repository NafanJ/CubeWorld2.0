interface ChatMessageProps {
  username: string;
  message: string;
  timestamp: string;
  color: string;
  avatar: string;
}
export function ChatMessage({
  username,
  message,
  timestamp,
  color,
  avatar
}: ChatMessageProps) {
  const colorClasses = {
    red: 'bg-red-950/70 border-red-400',
    orange: 'bg-orange-950/70 border-orange-400',
    green: 'bg-green-950/70 border-green-400',
    blue: 'bg-blue-950/70 border-blue-400',
    purple: 'bg-purple-950/70 border-purple-400',
    teal: 'bg-teal-950/70 border-teal-400'
  };
  // Extended palette to allow more unique agent colors
  const extended = {
    yellow: 'bg-yellow-950/70 border-yellow-400',
    pink: 'bg-pink-950/70 border-pink-400',
    indigo: 'bg-indigo-950/70 border-indigo-400',
    lime: 'bg-lime-950/70 border-lime-400',
    amber: 'bg-amber-950/70 border-amber-400',
    rose: 'bg-rose-950/70 border-rose-400',
    cyan: 'bg-cyan-950/70 border-cyan-400',
    sky: 'bg-sky-950/70 border-sky-400',
    violet: 'bg-violet-950/70 border-violet-400',
    emerald: 'bg-emerald-950/70 border-emerald-400',
    fuchsia: 'bg-fuchsia-950/70 border-fuchsia-400',
    slate: 'bg-slate-800 border-slate-500'
  };

  const allColorClasses = { ...colorClasses, ...extended } as Record<string, string>;
  return <div className="flex items-center gap-3 mb-4 animate-slide-in">
      <div className="flex-shrink-0">
        <div className={`w-10 h-10 rounded-lg border-4 ${allColorClasses[color as keyof typeof allColorClasses]} flex items-center justify-center text-xl`}>
          {avatar}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="pixel-text text-xs lg:text-sm font-bold text-gray-100">
            {username}
          </span>
          <span className="pixel-text text-[8px] lg:text-[10px] text-gray-400">
            {timestamp}
          </span>
        </div>
        <div className={`${allColorClasses[color as keyof typeof allColorClasses]} border-4 rounded-lg px-3 py-2 pixel-border-sm`}>
          <p className="pixel-text text-xs lg:text-sm text-gray-100">{message}</p>
        </div>
      </div>
    </div>;
}
