const COLOR_HEX: Record<string, string> = {
  red: '#ef4444', orange: '#f97316', green: '#22c55e', blue: '#3b82f6',
  purple: '#a855f7', teal: '#14b8a6', yellow: '#eab308', pink: '#ec4899',
  indigo: '#6366f1', lime: '#84cc16', amber: '#f59e0b', rose: '#f43f5e',
  cyan: '#06b6d4', sky: '#0ea5e9', violet: '#8b5cf6', emerald: '#10b981',
  fuchsia: '#d946ef', slate: '#64748b',
};

interface ChatMessageProps {
  username: string;
  message: string;
  timestamp: string;
  color: string;
  avatar: string;
}

export function ChatMessage({ username, message, timestamp, color, avatar }: ChatMessageProps) {
  const isVisitor = username === 'Visitor';
  const hex = isVisitor ? '#a8a29e' : (COLOR_HEX[color] || '#64748b');

  return (
    <div className="flex items-start gap-3 py-2.5 px-4 hover:bg-stone-50 transition-colors animate-slide-in group">
      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 mt-0.5"
        style={{ backgroundColor: isVisitor ? '#d6d3d1' : hex }}
      >
        {isVisitor ? '?' : (typeof avatar === 'string' && avatar.length === 1 ? avatar : username[0] || '?')}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span
            className="text-sm font-semibold"
            style={{ color: isVisitor ? '#78716c' : hex }}
          >
            {username}
          </span>
          <span className="text-xs text-stone-400">{timestamp}</span>
        </div>
        <p className={`text-sm leading-relaxed break-words ${isVisitor ? 'text-stone-400 italic' : 'text-stone-700'}`}>
          {message}
        </p>
      </div>
    </div>
  );
}
