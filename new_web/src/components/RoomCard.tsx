import React from 'react';
interface RoomCardProps {
  color: string;
  character: string;
  username: string;
  status: string;
}
export function RoomCard({
  color,
  character,
  username,
  status
}: RoomCardProps) {
  const colorClasses = {
    red: 'bg-red-500 border-red-700',
    orange: 'bg-orange-400 border-orange-600',
    green: 'bg-green-500 border-green-700',
    blue: 'bg-blue-500 border-blue-700',
    purple: 'bg-purple-500 border-purple-700',
    teal: 'bg-teal-500 border-teal-700'
  };
  const roomBgs = {
    red: 'bg-amber-800',
    orange: 'bg-orange-200',
    green: 'bg-green-200',
    blue: 'bg-slate-700',
    purple: 'bg-orange-300',
    teal: 'bg-teal-200'
  };
  return <div className={`${colorClasses[color as keyof typeof colorClasses]} border-8 rounded-2xl p-2 pixel-border`}>
      <div className={`${roomBgs[color as keyof typeof roomBgs]} rounded-lg border-4 border-black relative overflow-hidden aspect-[4/3] pixel-room`}>
        {/* Room decorations based on color theme */}
        <div className="absolute inset-0 p-4">
          {color === 'red' && <>
              <div className="absolute top-4 left-4 w-12 h-8 bg-blue-400 border-2 border-black"></div>
              <div className="absolute top-4 right-4 w-16 h-12 bg-amber-600 border-2 border-black"></div>
              <div className="absolute bottom-4 right-4 w-8 h-12 bg-yellow-600 border-2 border-black"></div>
            </>}
          {color === 'orange' && <>
              <div className="absolute top-4 left-4 w-16 h-10 bg-green-600 border-2 border-black"></div>
              <div className="absolute top-4 right-4 w-12 h-16 bg-amber-700 border-2 border-black"></div>
              <div className="absolute bottom-4 left-4 w-10 h-8 bg-red-500 border-2 border-black"></div>
            </>}
          {color === 'green' && <>
              <div className="absolute top-4 left-4 w-8 h-12 bg-green-700 border-2 border-black"></div>
              <div className="absolute top-4 right-4 w-8 h-12 bg-green-700 border-2 border-black"></div>
              <div className="absolute bottom-4 right-4 w-12 h-8 bg-amber-600 border-2 border-black"></div>
            </>}
          {color === 'blue' && <>
              <div className="absolute top-4 left-4 w-16 h-12 bg-cyan-400 border-2 border-black"></div>
              <div className="absolute top-4 right-4 w-12 h-8 bg-slate-600 border-2 border-black"></div>
              <div className="absolute bottom-4 left-4 w-10 h-10 bg-slate-500 border-2 border-black"></div>
            </>}
          {color === 'purple' && <>
              <div className="absolute top-4 left-4 w-12 h-10 bg-purple-600 border-2 border-black"></div>
              <div className="absolute top-4 right-4 w-14 h-12 bg-amber-700 border-2 border-black"></div>
              <div className="absolute bottom-4 right-4 w-8 h-8 bg-purple-700 border-2 border-black"></div>
            </>}
          {color === 'teal' && <>
              <div className="absolute top-4 left-4 w-16 h-10 bg-amber-600 border-2 border-black"></div>
              <div className="absolute top-4 right-4 w-12 h-12 bg-green-600 border-2 border-black"></div>
              <div className="absolute bottom-4 left-4 w-10 h-8 bg-teal-700 border-2 border-black"></div>
            </>}
        </div>

        {/* Animated Character */}
        <div className="character-walk absolute bottom-6" style={{
        animationDelay: `${Math.random() * 3}s`
      }}>
          <div className="text-4xl pixel-character">{character}</div>
        </div>

        {/* Username label */}
        <div className="absolute bottom-2 left-2 bg-black bg-opacity-70 px-2 py-1 rounded border border-white">
          <p className="text-white text-[8px] pixel-text">{username}</p>
        </div>

        {/* Status indicator */}
        <div className="absolute top-2 right-2 flex items-center gap-1">
          <div className={`w-2 h-2 rounded-full ${status === 'online' ? 'bg-green-400' : 'bg-gray-400'} border border-black`}></div>
        </div>
      </div>
    </div>;
}