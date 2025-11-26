import React from 'react';
import { RoomCard } from './RoomCard';
const rooms = [{
  color: 'red',
  character: '🧑',
  username: 'Alex',
  status: 'online',
  backgroundImage: '/rooms/room1.png'
}, {
  color: 'orange',
  character: '👨',
  username: 'Jordan',
  status: 'online',
  backgroundImage: ''
}, {
  color: 'green',
  character: '👩',
  username: 'Sam',
  status: 'online',
  backgroundImage: ''
}, {
  color: 'blue',
  character: '🧑',
  username: 'Casey',
  status: 'online',
  backgroundImage: ''
}, {
  color: 'purple',
  character: '👨',
  username: 'Riley',
  status: 'online',
  backgroundImage: ''
}, {
  color: 'teal',
  character: '👩',
  username: 'Morgan',
  status: 'online',
  backgroundImage: ''
}];
export function PixelRoomGrid() {
  return <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 max-w-5xl w-full auto-rows-fr">
      {rooms.map((room, index) => <RoomCard key={index} color={room.color} character={room.character} username={room.username} status={room.status} backgroundImage={room.backgroundImage} />)}
    </div>;
}