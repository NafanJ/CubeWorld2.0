import React, { useEffect, useState } from 'react';
import { RoomCard } from './RoomCard';
import { supabase } from '../lib/supabase';

interface RoomUI {
  id: string;
  roomName: string;
  status: string;
  backgroundImage?: string;
  characters: string[]; // avatars (initials)
  usernames: string[];
}

export const PixelRoomGrid: React.FC = () => {
  const [rooms, setRooms] = useState<RoomUI[]>([]);
  // List of available room images
  const roomImages = [
    '/rooms/Room1.jpg',
    '/rooms/Room2.jpg',
    '/rooms/Room3.jpg',
    '/rooms/Room4.jpg',
    '/rooms/Room5.jpg',
    '/rooms/Room6.jpg'
  ];

  useEffect(() => {
    const load = async () => {
      const { data: roomsData, error: rErr } = await supabase.from('rooms').select('id, name, theme');
      if (rErr) {
        console.error('Error loading rooms', rErr);
        return;
      }

      const { data: agentsData, error: aErr } = await supabase.from('agents').select('id, name, room_id');
      if (aErr) {
        console.error('Error loading agents', aErr);
        return;
      }

      const agents = (agentsData ?? []) as Array<{ id: string; name?: string; room_id?: string | null }>;
      const roomsArr = (roomsData ?? []) as Array<{ id: string; name?: string; theme?: string }>;

      const uiRooms: RoomUI[] = roomsArr.map((r, idx) => {
        const inRoom = agents.filter((ag) => ag.room_id === r.id);
        const chars = inRoom.map((ag) => (ag.name ? ag.name.charAt(0) : '🙂'));
        const usernames = inRoom.map((ag) => ag.name || 'Anon');
        // Cycle through available room images by index
        const bg = roomImages[idx % roomImages.length];
        return {
          id: r.id,
          roomName: r.name || `Room ${idx + 1}`,
          status: 'online',
          backgroundImage: bg,
          characters: chars,
          usernames
        };
      });

      setRooms(uiRooms);
    };

    load();
    // subscribe to agents/rooms changes so UI updates when agents move
    const channel = supabase
      .channel('public:agents-rooms')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agents' },
        () => {
          void load();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms' },
        () => {
          void load();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 max-w-5xl w-full auto-rows-fr">
        {rooms.map((room) => (
          <RoomCard
            key={room.id}
            color="teal"
            characters={room.characters}
            usernames={room.usernames}
            roomName={room.roomName}
            status={room.status}
            backgroundImage={room.backgroundImage}
          />
        ))}
      </div>
    </>
  );
};