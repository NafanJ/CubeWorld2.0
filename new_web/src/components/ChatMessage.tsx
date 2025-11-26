import React from 'react';
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
  return <div className="flex gap-3 mb-4 animate-slide-in">
      <div className="flex-shrink-0">
        <div className={`w-10 h-10 rounded-lg border-4 ${colorClasses[color as keyof typeof colorClasses]} flex items-center justify-center text-xl`}>
          {avatar}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="pixel-text text-sm font-bold text-gray-900">
            {username}
          </span>
          <span className="pixel-text text-[10px] text-gray-500">
            {timestamp}
          </span>
        </div>
        <div className={`${colorClasses[color as keyof typeof colorClasses]} border-4 rounded-lg px-3 py-2 pixel-border-sm`}>
          <p className="pixel-text text-sm text-gray-900">{message}</p>
        </div>
      </div>
    </div>;
}