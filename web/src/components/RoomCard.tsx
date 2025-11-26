import React from 'react';
interface RoomCardProps {
  color: string;
  character: string;
  username: string;
  roomName?: string;
  status: string;
  backgroundImage?: string;
}
export function RoomCard({
  color,
  character,
  username,
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
        className={`${!backgroundImage ? roomBgs[color as keyof typeof roomBgs] : ''} w-full h-full relative overflow-hidden pixel-room`}
        style={backgroundImage ? { backgroundImage: `url(${backgroundImage})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' } : undefined}
      >
        {/* Animated Character Sprite */}
        <div className="character-walk absolute bottom-6" style={{
        animationDelay: `${Math.random() * 3}s`
      }}>
          <img 
            src={character} 
            alt="character sprite" 
            className="pixel-character sprite-walking"
            style={{
              width: '48px',
              height: '48px',
              imageRendering: 'pixelated',
              display: 'block'
            }}
          />
        </div>

        {/* Room name label (top-left) */}
        {roomName && (
          <div className="absolute top-2 left-2 bg-black bg-opacity-70 px-2 py-1 rounded border border-white">
            <p className="text-white text-[8px] pixel-text">{roomName}</p>
          </div>
        )}

        {/* Username label (bottom-left) */}
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