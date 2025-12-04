import React, { useEffect, useState } from 'react';
import { RoomCard } from './RoomCard';
import { ElevatorCard } from './ElevatorCard';
import { supabase } from '../lib/supabase';

interface RoomUI {
  id: string;
  roomName: string;
  status: string;
  backgroundImage?: string;
  characters: string[]; // avatars (initials)
  usernames: string[];
  isElevator: boolean;
}

export const PixelRoomGrid: React.FC = () => {
  const [rooms, setRooms] = useState<RoomUI[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // List of available room images
  const roomImages = [
    '/rooms/Room1.jpg',
    '/rooms/Elevator.png',
    '/rooms/Room2.jpg',
    '/rooms/Room3.jpg',
    '/rooms/Elevator.png',
    '/rooms/Room4.jpg',
    '/rooms/Room5.jpg',
    '/rooms/Elevator.png',
    '/rooms/Room6.jpg'
  ];

  useEffect(() => {
    const load = async () => {
      try {
        // Fetch data from Supabase
        const { data: roomsData, error: rErr } = await supabase
          .from('rooms')
          .select('id, name, theme, x, y')
          .order('y', { ascending: true })
          .order('x', { ascending: true });
        if (rErr) {
          console.error('Error loading rooms', rErr);
          setIsLoading(false);
          return;
        }

        const { data: agentsData, error: aErr } = await supabase.from('agents').select('id, name, room_id');
        if (aErr) {
          console.error('Error loading agents', aErr);
          setIsLoading(false);
          return;
        }

        const agents = (agentsData ?? []) as Array<{ id: string; name?: string; room_id?: string | null }>;
        const roomsArr = (roomsData ?? []) as Array<{ id: string; name?: string; theme?: string; x?: number }>;

        const uiRooms: RoomUI[] = roomsArr.map((r, idx) => {
          const inRoom = agents.filter((ag) => ag.room_id === r.id);
          const chars = inRoom.map((ag) => (ag.name ? ag.name.charAt(0) : '🙂'));
          const usernames = inRoom.map((ag) => ag.name || 'Anon');
          // Cycle through available room images by index
          const bg = roomImages[idx % roomImages.length];
          // Elevators are at x=1
          const isElevator = r.x === 1;
          return {
            id: r.id,
            roomName: r.name || `Room ${idx + 1}`,
            status: 'online',
            backgroundImage: bg,
            characters: chars,
            usernames,
            isElevator
          };
        });

        // Preload all room images before showing the UI
        const imagePromises = roomImages.map((src) => {
          return new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => resolve(); // Continue even if an image fails
            img.src = src;
          });
        });

        await Promise.all(imagePromises);

        setRooms(uiRooms);
        setIsLoading(false);
      } catch (err) {
        console.error('Error loading room data:', err);
        setIsLoading(false);
      }
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

  // Skeleton UI while loading
  if (isLoading) {
    return (
      <div className="grid grid-cols-7 gap-3 max-w-5xl w-full auto-rows-fr">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => {
          // Columns: 3 (left apt) + 1 (elevator) + 3 (right apt) = 7
          // Positions 2, 5, 8 are elevators (indices 1, 4, 7)
          const isElevatorPos = i === 2 || i === 5 || i === 8;
          return (
            <div key={i} className={isElevatorPos ? 'col-span-1' : 'aspect-video col-span-3'}>
              <div className="w-full h-full bg-gray-300 rounded-lg animate-pulse" />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-7 gap-3 max-w-5xl w-full auto-rows-fr">
        {rooms.map((room) => (
          <div key={room.id} className={room.isElevator ? 'col-span-1' : 'aspect-video col-span-3'}>
            {room.isElevator ? (
              <ElevatorCard
                characters={room.characters}
                usernames={room.usernames}
                roomName={room.roomName}
                backgroundImage={room.backgroundImage}
              />
            ) : (
              <RoomCard
                color="teal"
                characters={room.characters}
                usernames={room.usernames}
                roomName={room.roomName}
                status={room.status}
                backgroundImage={room.backgroundImage}
              />
            )}
          </div>
        ))}
      </div>
    </>
  );
};