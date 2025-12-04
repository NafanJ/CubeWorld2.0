import React from 'react';

interface ElevatorCardProps {
  characters?: string[]; // one-char avatars
  usernames?: string[]; // names of agents in the elevator
  roomName?: string;
  backgroundImage?: string;
}

export function ElevatorCard({
  characters = [],
  usernames = [],
  roomName,
  backgroundImage
}: ElevatorCardProps) {
  return (
    <div className="w-full h-full">
      <div 
        className="w-full h-full relative overflow-hidden pixel-room bg-cover bg-center rounded-lg bg-gray-600"
        style={backgroundImage ? { 
          backgroundImage: `url(${backgroundImage})`, 
          backgroundSize: 'cover', 
          backgroundRepeat: 'no-repeat', 
          backgroundPosition: 'center' 
        } : undefined}
      >
        {/* Characters (stacked vertically for narrow elevator) */}
        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-1">
          {characters.map((c, i) => (
            <div 
              key={i} 
              className="w-6 h-6 rounded-full border bg-white flex items-center justify-center text-xs" 
              title={usernames[i] || ''}
            >
              {c}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
