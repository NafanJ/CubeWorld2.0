import { useState } from 'react';
import { PixelRoomGrid } from './components/PixelRoomGrid';
import { ChatPanel } from './components/ChatPanel';

type MobileView = 'grid' | 'chat';

export function App() {
  const [mobileView, setMobileView] = useState<MobileView>('grid');

  return (
    <div
      className="w-screen h-screen flex flex-col lg:flex-row overflow-hidden"
      style={{ backgroundImage: 'url(/backgroundImage.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      {/* Room Grid */}
      <div
        className={`w-full lg:w-3/5 flex-1 min-h-0 flex items-start lg:items-center justify-center p-2 lg:p-4 overflow-auto pt-3 lg:pt-4 ${
          mobileView !== 'grid' ? 'hidden lg:flex' : ''
        }`}
      >
        <PixelRoomGrid />
      </div>

      {/* Chat Panel */}
      <div
        className={`w-full lg:w-2/5 lg:h-full flex-1 lg:flex-shrink-0 min-h-0 ${
          mobileView !== 'chat' ? 'hidden lg:block' : ''
        }`}
      >
        <ChatPanel />
      </div>

      {/* Mobile bottom tab bar */}
      <div className="lg:hidden flex-shrink-0 flex border-t-4 border-indigo-700 bg-indigo-600 safe-area-inset-bottom">
        <button
          onClick={() => setMobileView('grid')}
          className={`flex-1 py-4 pixel-text text-sm font-bold transition-colors ${
            mobileView === 'grid'
              ? 'bg-indigo-800 text-white'
              : 'bg-indigo-600 text-indigo-200 hover:bg-indigo-700'
          }`}
        >
          VILLAGE
        </button>
        <button
          onClick={() => setMobileView('chat')}
          className={`flex-1 py-4 pixel-text text-sm font-bold transition-colors ${
            mobileView === 'chat'
              ? 'bg-indigo-800 text-white'
              : 'bg-indigo-600 text-indigo-200 hover:bg-indigo-700'
          }`}
        >
          CHAT
        </button>
      </div>
    </div>
  );
}