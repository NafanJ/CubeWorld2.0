import { PixelRoomGrid } from './components/PixelRoomGrid';
import { ChatPanel } from './components/ChatPanel';

export function App() {

  return (
    <div
      className="w-full h-screen flex flex-col lg:flex-row overflow-hidden"
      style={{ backgroundImage: 'url(/backgroundImage.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      {/* Room Grid */}
      <div className="w-full lg:w-3/5 flex-1 flex items-center justify-center p-4">
        <PixelRoomGrid />
      </div>

      {/* Chat Panel - side by side on large screens, stacked below on mobile */}
      <div className="w-full lg:w-2/5 lg:h-screen h-[35vh]">
        <ChatPanel />
      </div>
    </div>
  );
}