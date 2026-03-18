import React from 'react';
interface RoomCardProps {
  color: string;
  characters?: string[]; // one-char avatars or image urls
  usernames?: string[]; // names of agents in the room
  roomName?: string;
  status: string;
  backgroundImage?: string;
}
export function RoomCard({
  color,
  characters = [],
  usernames = [],
  roomName,
  status,
  backgroundImage
}: RoomCardProps) {
  const roomBgs = {
    red: 'bg-amber-800',
    orange: 'bg-orange-200',
    green: 'bg-green-200',
    blue: 'bg-slate-700',
    purple: 'bg-orange-300',
    teal: 'bg-teal-200'
  };
  return <div className="w-full h-full">
      <div 
        className={`${!backgroundImage ? roomBgs[color as keyof typeof roomBgs] : ''} w-full h-full relative overflow-hidden pixel-room bg-cover bg-center rounded-lg`}
        style={backgroundImage ? { backgroundImage: `url(${backgroundImage})`, backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' } : undefined}
      >
        {/* Characters (multiple avatars) */}
        <div className="absolute bottom-2 lg:bottom-4 left-1/2 transform -translate-x-1/2 flex items-end gap-1 lg:gap-2">
          {characters.map((c, i) => (
            <div key={i} className={`w-7 h-7 lg:w-9 lg:h-9 rounded-full border-2 bg-white flex items-center justify-center text-xs lg:text-sm ${i > 0 ? '-ml-2' : ''}`} title={usernames[i] || ''}>
              {c}
            </div>
          ))}
        </div>

        {/* Room name label (top-left) */}
        {roomName && (
          <div className="absolute top-1 left-1 lg:top-2 lg:left-2 bg-black bg-opacity-70 px-1.5 py-0.5 lg:px-2 lg:py-1 rounded border border-white">
            <p className="text-white text-[6px] lg:text-[8px] pixel-text">{roomName}</p>
          </div>
        )}
      </div>
    </div>;
}