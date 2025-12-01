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
    red: 'bg-red-100 border-red-500',
    orange: 'bg-orange-100 border-orange-500',
    green: 'bg-green-100 border-green-500',
    blue: 'bg-blue-100 border-blue-500',
    purple: 'bg-purple-100 border-purple-500',
    teal: 'bg-teal-100 border-teal-500'
  };
  // Extended palette to allow more unique agent colors
  const extended = {
    yellow: 'bg-yellow-100 border-yellow-500',
    pink: 'bg-pink-100 border-pink-500',
    indigo: 'bg-indigo-100 border-indigo-500',
    lime: 'bg-lime-100 border-lime-500',
    amber: 'bg-amber-100 border-amber-500',
    rose: 'bg-rose-100 border-rose-500',
    cyan: 'bg-cyan-100 border-cyan-500',
    sky: 'bg-sky-100 border-sky-500',
    violet: 'bg-violet-100 border-violet-500',
    emerald: 'bg-emerald-100 border-emerald-500',
    fuchsia: 'bg-fuchsia-100 border-fuchsia-500',
    slate: 'bg-slate-100 border-slate-500'
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
          <span className="pixel-text text-xs lg:text-sm font-bold text-gray-900">
            {username}
          </span>
          <span className="pixel-text text-[8px] lg:text-[10px] text-gray-500">
            {timestamp}
          </span>
        </div>
        <div className={`${allColorClasses[color as keyof typeof allColorClasses]} border-4 rounded-lg px-3 py-2 pixel-border-sm`}>
          <p className="pixel-text text-xs lg:text-sm text-gray-900">{message}</p>
        </div>
      </div>
    </div>;
}