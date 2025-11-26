import React, { useEffect, useState } from 'react'; // React is used for JSX
import { RoomCard } from './RoomCard';
import { supabase } from '../lib/supabase';

interface Room {
  color: string;
  character: string;
  status: string;
  backgroundImage: string;
  username?: string; // Optional username property
  roomName?: string;
}

const initialRooms: Room[] = [{
  color: 'red',
  character: '/sprites/homer.png',
  status: 'online',
  backgroundImage: '/rooms/room1.png'
}, {
  color: 'orange',
  character: '/sprites/homer.png',
  status: 'online',
  backgroundImage: '/rooms/room1.png'
}, {
  color: 'green',
  character: '/sprites/homer.png',
  status: 'online',
  backgroundImage: '/rooms/room1.png'
}, {
  color: 'blue',
  character: '/sprites/homer.png',
  status: 'online',
  backgroundImage: '/rooms/room1.png'
}, {
  color: 'purple',
  character: '/sprites/homer.png',
  status: 'online',
  backgroundImage: '/rooms/room1.png'
}, {
  color: 'teal',
  character: '/sprites/homer.png',
  status: 'online',
  backgroundImage: '/rooms/room1.png'
}];

export const PixelRoomGrid: React.FC = () => {
  const [rooms, setRooms] = useState<Room[]>(initialRooms);

  useEffect(() => {
    const fetchUsernames = async () => {
      const { data, error } = await supabase
        .from('agents')
        .select('name');

      if (error) {
        console.error('Error fetching usernames:', error);
        return;
      }

      const names = (data as Array<{ name?: string }> | null)?.map((a) => a?.name || '') || [];

      setRooms((prevRooms) =>
        prevRooms.map((room, index) => ({
          ...room,
          username: names[index] || room.username || `Agent ${index + 1}`,
        }))
      );
    };

    fetchUsernames();
  }, []);

  // Fetch room names and attach them to rooms (top-left label)
  useEffect(() => {
    const fetchRoomNames = async () => {
      const { data, error } = await supabase.from('rooms').select('name');
      if (error) {
        console.error('Error fetching room names:', error);
        return;
      }

      const names = (data as Array<{ name?: string }> | null)?.map((r) => r?.name || '') || [];

      setRooms((prevRooms) =>
        prevRooms.map((room, index) => ({
          ...room,
          roomName: names[index] || room.roomName || `Room ${index + 1}`,
        }))
      );
    };

    fetchRoomNames();
  }, []);

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 max-w-5xl w-full auto-rows-fr">
        {rooms.map((room, index) => (
          <RoomCard
            key={index}
            color={room.color}
            character={room.character}
            username={room.username || 'Guest'}
            roomName={room.roomName || `Room ${index + 1}`}
            status={room.status}
            backgroundImage={room.backgroundImage}
          />
        ))}
      </div>
    </>
  );
};