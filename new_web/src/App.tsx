import React from 'react';
import { PixelRoomGrid } from './components/PixelRoomGrid';
import { ChatPanel } from './components/ChatPanel';
export function App() {
  return <div className="w-full h-screen bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 flex overflow-hidden">
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