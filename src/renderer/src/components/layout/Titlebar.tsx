import { useEffect, useState } from 'react';
import { Minus, Square, Copy, X, Boxes } from 'lucide-react';
import { isTauri } from '../../services/tauri';

const TITLEBAR_HEIGHT = '36px';
const WINDOW_CONTROL_WIDTH = '46px';

async function getWindow() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}

function useIsMaximized() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let mounted = true;
    (async () => {
      try {
        const win = await getWindow();
        const isMax = await win.isMaximized();
        if (mounted) setMaximized(isMax);
        unlisten = await win.onResized(async () => {
          try {
            const v = await win.isMaximized();
            setMaximized(v);
          } catch {
            /* ignore */
          }
        });
      } catch {
        /* not in Tauri or failed */
      }
    })();
    return () => {
      mounted = false;
      if (unlisten) unlisten();
    };
  }, []);
  return maximized;
}

type WindowControlVariant = 'default' | 'danger';

function WindowControlButton({
  onClick,
  ariaLabel,
  title,
  variant = 'default',
  children,
}: {
  onClick: () => void;
  ariaLabel: string;
  title: string;
  variant?: WindowControlVariant;
  children: React.ReactNode;
}) {
  const hover =
    variant === 'danger'
      ? 'hover:bg-[#EF4444] hover:text-white focus-visible:ring-[#EF4444]/40 group-hover:text-white'
      : 'hover:bg-[#16161A] hover:text-[#E6E8F0] focus-visible:ring-[#8B5CF6]/40 group-hover:text-[#E6E8F0]';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      className={`group flex items-center justify-center border-l transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0 ${hover}`}
      style={{
        width: WINDOW_CONTROL_WIDTH,
        borderLeftColor: '#232329',
        borderLeftWidth: '1px',
        borderTop: 'none',
        borderRight: 'none',
        borderBottom: 'none',
        borderRadius: '0px',
        background: 'transparent',
        color: '#7A7F93',
      }}
    >
      <span className="transition-colors duration-200">{children}</span>
    </button>
  );
}

export function Titlebar() {
  const isMax = useIsMaximized();

  // Hide completely in browser preview — no window controls needed
  if (!isTauri()) return null;

  const handleMinimize = async () => {
    try {
      const win = await getWindow();
      await win.minimize();
    } catch (e) {
      console.error('[titlebar] minimize failed', e);
    }
  };

  const handleMaximize = async () => {
    try {
      const win = await getWindow();
      await win.toggleMaximize();
    } catch (e) {
      console.error('[titlebar] toggleMaximize failed', e);
    }
  };

  const handleClose = async () => {
    try {
      const win = await getWindow();
      await win.close();
    } catch (e) {
      console.error('[titlebar] close failed', e);
    }
  };

  const handleDragDoubleClick = async () => {
    // Windows convention: double-click titlebar toggles maximize
    await handleMaximize();
  };

  return (
    <div
      className="flex shrink-0 select-none items-stretch overflow-hidden"
      style={{
        height: TITLEBAR_HEIGHT,
        minHeight: TITLEBAR_HEIGHT,
        background: '#070709',
        borderBottom: '1px solid #232329',
      }}
      role="banner"
      aria-label="Window title bar"
    >
      {/* Draggable region: icon + title. Controls are excluded. */}
      <div
        className="flex flex-1 items-center gap-3 pl-3 pr-2"
        style={{ minWidth: 0 }}
        data-tauri-drag-region
        onDoubleClick={handleDragDoubleClick}
      >
        {/* App mark — same language as Sidebar logo */}
        <span
          className="flex h-[22px] w-[22px] items-center justify-center text-white shrink-0"
          style={{
            background: '#8B5CF6',
            borderRadius: '0px',
            boxShadow: '0 0 12px rgba(139,92,246,0.22), inset 0 1px 0 rgba(255,255,255,0.14)',
          }}
          aria-hidden
          data-tauri-drag-region
        >
          <Boxes size={12} strokeWidth={1.9} />
        </span>
        <span
          className="truncate"
          data-tauri-drag-region
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12.5px',
            lineHeight: '16px',
            fontWeight: 650,
            color: '#E6E8F0',
            letterSpacing: '-0.025em',
          }}
        >
          APIro
        </span>
        <span
          className="hidden sm:inline-flex items-center gap-1.5 tabular-nums"
          data-tauri-drag-region
          style={{
            marginLeft: '10px',
            fontSize: '11px',
            lineHeight: '14px',
            fontWeight: 500,
            color: '#5A5E6E',
            letterSpacing: '0.02em',
          }}
          aria-hidden
        >
          <span className="h-1 w-1 rounded-full bg-[#232329]" />
          Local · Offline
        </span>
        {/* Fill remainder for drag */}
        <div className="flex-1 self-stretch" data-tauri-drag-region aria-hidden />
      </div>

      {/* Window controls — same design system as app buttons */}
      <div className="flex shrink-0 items-stretch" aria-label="Window controls">
        <WindowControlButton onClick={handleMinimize} ariaLabel="Minimize window" title="Minimize">
          <Minus size={14} strokeWidth={1.9} aria-hidden />
        </WindowControlButton>

        <WindowControlButton
          onClick={handleMaximize}
          ariaLabel={isMax ? 'Restore window' : 'Maximize window'}
          title={isMax ? 'Restore' : 'Maximize'}
        >
          {isMax ? (
            <Copy size={12.5} strokeWidth={1.9} className="translate-y-[0.5px]" aria-hidden />
          ) : (
            <Square size={12.5} strokeWidth={1.9} aria-hidden />
          )}
        </WindowControlButton>

        <WindowControlButton onClick={handleClose} ariaLabel="Close window" title="Close" variant="danger">
          <X size={14} strokeWidth={1.9} aria-hidden />
        </WindowControlButton>
      </div>
    </div>
  );
}
