import React from 'react';
import { RoomCard } from './RoomCard';
const rooms = [{
  color: 'red',
  character: '🧑',
  username: 'Alex',
  status: 'online'
}, {
  color: 'orange',
  character: '👨',
  username: 'Jordan',
  status: 'online'
}, {
  color: 'green',
  character: '👩',
  username: 'Sam',
  status: 'online'
}, {
  color: 'blue',
  character: '🧑',
  username: 'Casey',
  status: 'online'
}, {
  color: 'purple',
  character: '👨',
  username: 'Riley',
  status: 'online'
}, {
  color: 'teal',
  character: '👩',
  username: 'Morgan',
  status: 'online'
}];
export function PixelRoomGrid() {
  return <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 max-w-5xl w-full">
      {rooms.map((room, index) => <RoomCard key={index} color={room.color} character={room.character} username={room.username} status={room.status} />)}
    </div>;
}