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
  return <div className="w-full aspect-video">
      <div 
        className={`${!backgroundImage ? roomBgs[color as keyof typeof roomBgs] : ''} w-full h-full relative overflow-hidden pixel-room bg-cover bg-center rounded-lg`}
        style={backgroundImage ? { backgroundImage: `url(${backgroundImage})`, backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' } : undefined}
      >
        {/* Characters (multiple avatars) */}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-end gap-2">
          {characters.map((c, i) => (
            <div key={i} className={`w-9 h-9 rounded-full border-2 bg-white flex items-center justify-center text-sm ${i > 0 ? '-ml-2' : ''}`} title={usernames[i] || ''}>
              {c}
            </div>
          ))}
        </div>

        {/* Room name label (top-left) */}
        {roomName && (
          <div className="absolute top-2 left-2 bg-black bg-opacity-70 px-2 py-1 rounded border border-white">
            <p className="text-white text-[8px] pixel-text">{roomName}</p>
          </div>
        )}
      </div>
    </div>;
}