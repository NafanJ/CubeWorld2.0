import { useState } from 'react';
import { PixelRoomGrid } from './components/PixelRoomGrid';
import { ChatPanel } from './components/ChatPanel';

type MobileView = 'village' | 'chat' | 'diary' | 'status';

export function App() {
  const [mobileView, setMobileView] = useState<MobileView>('village');

  // Map mobile view to ChatPanel tab
  const chatPanelTab = mobileView === 'diary' ? 'diary'
    : mobileView === 'status' ? 'status'
    : 'chat';

  const showChatPanel = mobileView !== 'village';

  return (
    <div
      className="w-screen h-screen flex flex-col lg:flex-row overflow-hidden"
      style={{ backgroundImage: 'url(/backgroundImage.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      {/* Room Grid */}
      <div
        className={`w-full lg:w-3/5 flex-1 min-h-0 flex items-center justify-center p-2 lg:p-4 overflow-auto ${
          showChatPanel ? 'hidden lg:flex' : ''
        }`}
      >
        <PixelRoomGrid />
      </div>

      {/* Chat Panel */}
      <div
        className={`w-full lg:w-2/5 lg:h-full flex-1 lg:flex-shrink-0 min-h-0 ${
          !showChatPanel ? 'hidden lg:block' : ''
        }`}
      >
        <ChatPanel mobileTab={chatPanelTab} />
      </div>

      {/* Mobile bottom navigation - pixel art themed */}
      <nav className="lg:hidden flex-shrink-0 mobile-bottom-nav">
        <button
          onClick={() => setMobileView('village')}
          className={`mobile-nav-btn ${mobileView === 'village' ? 'active' : ''}`}
        >
          <span className="mobile-nav-icon">
            <svg viewBox="0 0 16 16" className="w-5 h-5" fill="currentColor">
              <rect x="1" y="8" width="14" height="7" rx="1" />
              <polygon points="8,1 1,8 15,8" />
              <rect x="6" y="10" width="4" height="5" />
            </svg>
          </span>
          <span className="mobile-nav-label">VILLAGE</span>
        </button>
        <button
          onClick={() => setMobileView('chat')}
          className={`mobile-nav-btn ${mobileView === 'chat' ? 'active' : ''}`}
        >
          <span className="mobile-nav-icon">
            <svg viewBox="0 0 16 16" className="w-5 h-5" fill="currentColor">
              <rect x="1" y="2" width="14" height="9" rx="2" />
              <polygon points="4,11 4,15 8,11" />
              <rect x="4" y="5" width="2" height="2" fill="currentColor" className="text-indigo-300" />
              <rect x="7" y="5" width="2" height="2" fill="currentColor" className="text-indigo-300" />
              <rect x="10" y="5" width="2" height="2" fill="currentColor" className="text-indigo-300" />
            </svg>
          </span>
          <span className="mobile-nav-label">CHAT</span>
        </button>
        <button
          onClick={() => setMobileView('diary')}
          className={`mobile-nav-btn ${mobileView === 'diary' ? 'active' : ''}`}
        >
          <span className="mobile-nav-icon">
            <svg viewBox="0 0 16 16" className="w-5 h-5" fill="currentColor">
              <rect x="3" y="1" width="11" height="14" rx="1" />
              <rect x="1" y="1" width="3" height="14" rx="0.5" opacity="0.7" />
              <rect x="6" y="4" width="6" height="1.5" fill="currentColor" className="text-amber-200" />
              <rect x="6" y="7" width="6" height="1.5" fill="currentColor" className="text-amber-200" />
              <rect x="6" y="10" width="4" height="1.5" fill="currentColor" className="text-amber-200" />
            </svg>
          </span>
          <span className="mobile-nav-label">DIARY</span>
        </button>
        <button
          onClick={() => setMobileView('status')}
          className={`mobile-nav-btn ${mobileView === 'status' ? 'active' : ''}`}
        >
          <span className="mobile-nav-icon">
            <svg viewBox="0 0 16 16" className="w-5 h-5" fill="currentColor">
              <circle cx="8" cy="5" r="3.5" />
              <rect x="3" y="10" width="10" height="5" rx="2" />
              <circle cx="6" cy="4.5" r="0.8" fill="currentColor" className="text-indigo-300" />
              <circle cx="10" cy="4.5" r="0.8" fill="currentColor" className="text-indigo-300" />
            </svg>
          </span>
          <span className="mobile-nav-label">STATUS</span>
        </button>
      </nav>
    </div>
  );
}
