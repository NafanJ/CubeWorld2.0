import React, { useEffect, useState } from 'react';
import { RoomCard } from './RoomCard';
import { ElevatorCard } from './ElevatorCard';
import { supabase } from '../lib/supabase';

interface RoomUI {
  id: string;
  roomName: string;
  backgroundImage?: string;
  characters: string[];
  usernames: string[];
  agentIds: string[];
  isElevator: boolean;
}

interface PixelRoomGridProps {
  agentColorMap?: Record<string, string>;
  onRoomSelect?: () => void;
}

export const PixelRoomGrid: React.FC<PixelRoomGridProps> = ({ agentColorMap = {}, onRoomSelect }) => {
  const [rooms, setRooms] = useState<RoomUI[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
    let mounted = true;

    const load = async () => {
      try {
        const { data: roomsData, error: rErr } = await supabase
          .from('rooms')
          .select('id, name, theme, x, y')
          .order('y', { ascending: true })
          .order('x', { ascending: true });
        if (rErr) {
          console.error('Error loading rooms', rErr);
          if (mounted) setIsLoading(false);
          return;
        }

        const { data: agentsData, error: aErr } = await supabase.from('agents').select('id, name, room_id');
        if (aErr) {
          console.error('Error loading agents', aErr);
          if (mounted) setIsLoading(false);
          return;
        }

        const agents = (agentsData ?? []) as Array<{ id: string; name?: string; room_id?: string | null }>;
        const roomsArr = (roomsData ?? []) as Array<{ id: string; name?: string; theme?: string; x?: number }>;

        const uiRooms: RoomUI[] = roomsArr.map((r, idx) => {
          const inRoom = agents.filter((ag) => ag.room_id === r.id);
          const chars = inRoom.map((ag) => (ag.name ? ag.name.charAt(0) : ''));
          const usernames = inRoom.map((ag) => ag.name || 'Anon');
          const agentIds = inRoom.map((ag) => ag.id);
          const bg = roomImages[idx % roomImages.length];
          const isElevator = r.x === 1;
          return {
            id: r.id,
            roomName: r.name || `Room ${idx + 1}`,
            backgroundImage: bg,
            characters: chars,
            usernames,
            agentIds,
            isElevator,
          };
        });

        const imagePromises = roomImages.map((src) => {
          return new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = src;
          });
        });

        await Promise.all(imagePromises);

        if (!mounted) return;
        setRooms(uiRooms);
        setIsLoading(false);
      } catch (err) {
        console.error('Error loading room data:', err);
        if (mounted) setIsLoading(false);
      }
    };

    load();

    const channel = supabase
      .channel('public:agents-rooms')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, () => {
        if (mounted) void load();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => {
        if (mounted) void load();
      })
      .subscribe();

    // Poll as fallback for UPDATE events that Realtime may miss
    const poll = setInterval(() => { if (mounted) void load(); }, 30000);

    return () => {
      mounted = false;
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, []);

  const nonElevatorRooms = rooms.filter((r) => !r.isElevator);

  if (isLoading) {
    return (
      <>
        {/* Mobile skeleton */}
        <div className="lg:hidden w-full h-full grid grid-cols-2 grid-rows-3 gap-2 p-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-stone-200 rounded-xl animate-pulse" />
          ))}
        </div>
        {/* Desktop skeleton */}
        <div className="hidden lg:grid grid-cols-7 grid-rows-3 gap-3 w-full h-full max-h-full">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => {
            const isElevatorPos = i === 2 || i === 5 || i === 8;
            return (
              <div key={i} className={isElevatorPos ? 'col-span-1 min-h-0' : 'col-span-3 min-h-0'}>
                <div className="w-full h-full bg-stone-200 rounded-xl animate-pulse" />
              </div>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <>
      {/* Mobile: 2×3 grid */}
      <div className="lg:hidden w-full h-full grid grid-cols-2 grid-rows-3 gap-2 p-2">
        {nonElevatorRooms.map((room) => (
          <div key={room.id} className="relative rounded-xl overflow-hidden">
            <RoomCard
              characters={room.characters}
              usernames={room.usernames}
              agentIds={room.agentIds}
              agentColorMap={agentColorMap}
              roomName={room.roomName}
              backgroundImage={room.backgroundImage}
              onClick={onRoomSelect}
            />
          </div>
        ))}
      </div>

      {/* Desktop: 7-column grid with elevator columns */}
      <div className="hidden lg:grid grid-cols-7 grid-rows-3 gap-3 w-full h-full max-h-full">
        {rooms.map((room) => (
          <div key={room.id} className={room.isElevator ? 'col-span-1 min-h-0' : 'col-span-3 min-h-0'}>
            {room.isElevator ? (
              <ElevatorCard
                characters={room.characters}
                usernames={room.usernames}
                agentIds={room.agentIds}
                agentColorMap={agentColorMap}
                roomName={room.roomName}
                backgroundImage={room.backgroundImage}
              />
            ) : (
              <RoomCard
                characters={room.characters}
                usernames={room.usernames}
                agentIds={room.agentIds}
                agentColorMap={agentColorMap}
                roomName={room.roomName}
                backgroundImage={room.backgroundImage}
                onClick={onRoomSelect}
              />
            )}
          </div>
        ))}
      </div>
    </>
  );
};
