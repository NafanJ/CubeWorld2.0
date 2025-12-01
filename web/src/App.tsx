import { PixelRoomGrid } from './components/PixelRoomGrid';
import { ChatPanel } from './components/ChatPanel';

export function App() {

  return (
    <div
      className="w-screen h-screen flex flex-col lg:flex-row overflow-hidden"
      style={{ backgroundImage: 'url(/backgroundImage.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      {/* Room Grid */}
      <div className="w-full lg:w-3/5 flex-1 min-h-0 flex items-center justify-center p-4 overflow-auto">
        <PixelRoomGrid />
      </div>

      {/* Chat Panel - side by side on large screens, stacked below on mobile */}
      <div className="w-full lg:w-2/5 lg:h-full h-[35vh] flex-shrink-0 overflow-hidden">
        <ChatPanel />
      </div>
    </div>
  );
}