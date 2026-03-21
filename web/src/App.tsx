import { useState } from 'react';
import { ChatPanel } from './components/ChatPanel';
import { LayoutGrid, Users, MessageSquare, Settings } from 'lucide-react';

export type ActiveTab = 'overview' | 'directory' | 'logs' | 'system';

const NAV_ITEMS: { id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'directory', label: 'Directory', icon: Users },
  { id: 'logs', label: 'Logs', icon: MessageSquare },
  { id: 'system', label: 'System', icon: Settings },
];

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  return (
    <div className="flex h-screen bg-stone-50 overflow-hidden">
      {/* Sidebar — desktop only */}
      <aside
        className="hidden lg:flex flex-col w-56 flex-shrink-0"
        style={{ backgroundColor: '#2B4A35' }}
      >
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-base leading-none"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
            >
              🏘
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white tracking-wide leading-tight">CubeWorld</h1>
              <p className="text-[10px] mt-0.5" style={{ color: '#9ECBA9' }}>
                AI Village Simulation
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                activeTab === id
                  ? 'text-white'
                  : 'hover:text-white'
              }`}
              style={{
                backgroundColor: activeTab === id ? 'rgba(255,255,255,0.18)' : undefined,
                color: activeTab === id ? undefined : '#9ECBA9',
              }}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-white/10">
          <p className="text-xs" style={{ color: '#6B9B77' }}>
            CubeWorld 2.0
          </p>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Mobile header */}
        <header
          className="lg:hidden flex items-center px-4 py-3 flex-shrink-0"
          style={{ backgroundColor: '#2B4A35' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">🏘</span>
            <h1 className="text-sm font-semibold text-white">CubeWorld</h1>
          </div>
          <span className="ml-auto text-xs capitalize" style={{ color: '#9ECBA9' }}>
            {activeTab}
          </span>
        </header>

        {/* Desktop tab nav */}
        <div className="hidden lg:flex items-center border-b border-stone-200 bg-white px-6 flex-shrink-0">
          {NAV_ITEMS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-4 py-3.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === id
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content area */}
        <main className="flex-1 min-h-0 overflow-hidden">
          <ChatPanel activeSection={activeTab} onRoomSelect={() => setActiveTab('logs')} />
        </main>

        {/* Mobile bottom nav */}
        <nav className="lg:hidden flex border-t border-stone-200 bg-white flex-shrink-0">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors ${
                activeTab === id ? 'text-emerald-700' : 'text-stone-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
