import { PixelRoomGrid } from './components/PixelRoomGrid';
import { ChatPanel } from './components/ChatPanel';

export function App() {

  return (
    <div
      className="w-screen h-screen flex flex-col lg:flex-row overflow-hidden"
      style={{ backgroundImage: 'url(/backgroundImage.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      {/* Room Grid */}
      <div className="w-full lg:w-3/5 flex-1 min-h-0 flex flex-col items-center justify-center p-4 overflow-auto">
        <h1
          className="pixel-text text-white text-xl mb-4 tracking-widest"
          style={{ textShadow: '3px 3px 0 #000, -1px -1px 0 #000' }}
        >
          CUBE WORLD
        </h1>
        <PixelRoomGrid />
      </div>

      {/* Chat Panel - side by side on large screens, stacked below on mobile */}
      <div className="w-full lg:w-2/5 lg:h-full h-[50vh] flex-shrink-0">
        <ChatPanel />
      </div>
    </div>
  );
}