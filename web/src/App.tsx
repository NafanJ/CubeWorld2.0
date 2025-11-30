import { useState, useRef, useEffect } from 'react';
import { PixelRoomGrid } from './components/PixelRoomGrid';
import { ChatPanel } from './components/ChatPanel';

export function App() {
  // two-step state to animate the sheet on mount/unmount
  const [isChatMounted, setIsChatMounted] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const timers = useRef<number[]>([]);
  const ANIMATION_MS = 300;

  useEffect(() => {
    return () => {
      // clear any pending timers on unmount
      timers.current.forEach((id) => clearTimeout(id));
      timers.current = [];
    };
  }, []);

  const openMobileChat = () => {
    setIsChatMounted(true);
    // slight delay so we can transition from translate-y-full -> translate-y-0
    const id = window.setTimeout(() => setIsChatOpen(true), 20);
    timers.current.push(id);
  };

  const closeMobileChat = () => {
    setIsChatOpen(false);
    // wait for animation to finish before removing from DOM
    const id = window.setTimeout(() => setIsChatMounted(false), ANIMATION_MS);
    timers.current.push(id);
  };

  // Focus management
  const openButtonRef = useRef<HTMLButtonElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (isChatOpen) {
      // focus the close button when opened
      closeBtnRef.current?.focus();

      const handleKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeMobileChat();
          return;
        }

        if (e.key === 'Tab') {
          // trap focus within the sheet
          const el = sheetRef.current;
          if (!el) return;
          const focusable = Array.from(
            el.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
            )
          ).filter(Boolean) as HTMLElement[];
          if (focusable.length === 0) return;

          const first = focusable[0];
          const last = focusable[focusable.length - 1];

          if (e.shiftKey) {
            if (document.activeElement === first) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      };

      document.addEventListener('keydown', handleKey);
      return () => document.removeEventListener('keydown', handleKey);
    } else {
      // when closed, return focus to the open button
      const id = window.setTimeout(() => openButtonRef.current?.focus(), ANIMATION_MS + 10);
      timers.current.push(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChatOpen]);

  return (
    <div
      className="w-full h-screen flex overflow-hidden"
      style={{ backgroundImage: 'url(/backgroundImage.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      {/* Left side - Room Grid (centered, no scroll) */}
      <div className="w-full lg:w-3/5 flex items-center justify-center p-4">
        <PixelRoomGrid />
      </div>

      {/* Right side - Chat Panel for large screens */}
      <div className="hidden lg:flex lg:w-2/5 h-screen">
        <ChatPanel />
      </div>

      {/* Mobile chat toggle button (visible on small screens). Hidden while sheet is mounted. */}
      <button
        ref={openButtonRef}
        onClick={openMobileChat}
        className={"lg:hidden fixed bottom-4 right-4 z-50 bg-indigo-600 text-white rounded-full px-4 py-3 shadow-lg " + (isChatMounted ? 'hidden' : '')}
        aria-label="Open chat"
      >
        Chat
      </button>

      {/* Mobile chat bottom sheet (mounted while isChatMounted). Animates using translate-y. */}
      {isChatMounted && (
        <div className="lg:hidden fixed inset-0 z-40 flex items-end">
          {/* backdrop (fades in) */}
          <div
            className={"absolute inset-0 transition-opacity " + (isChatOpen ? 'bg-black/40 opacity-100' : 'bg-black/0 opacity-0')}
            onClick={closeMobileChat}
            aria-hidden
          />

          <div
            ref={sheetRef}
            className={
              'relative w-full bg-white rounded-t-xl max-h-[70%] overflow-hidden transform transition-transform duration-300 ease-out ' +
              (isChatOpen ? 'translate-y-0' : 'translate-y-full')
            }
            role="dialog"
            aria-modal="true"
            aria-label="Chat"
          >
            <div className="flex items-center justify-between p-3 border-b">
              <div className="font-medium">Chat</div>
              <button ref={closeBtnRef} onClick={closeMobileChat} className="text-gray-600 px-2">
                Close
              </button>
            </div>
            <div className="h-[calc(70vh-56px)] overflow-auto">
              <ChatPanel />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}