import React from 'react';
import { PixelRoomGrid } from './components/PixelRoomGrid';
import { ChatPanel } from './components/ChatPanel';
export function App() {
  return <div className="w-full h-screen flex overflow-hidden" style={{ backgroundImage: 'url(/backgroundImage.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      {/* Left side - Room Grid (centered, no scroll) */}
      <div className="w-full lg:w-3/5 flex items-center justify-center p-4">
        <PixelRoomGrid />
      </div>

      {/* Right side - Chat Panel */}
      <div className="hidden lg:flex lg:w-2/5 h-screen">
        <ChatPanel />
      </div>
    </div>;
}