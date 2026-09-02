import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { Workspace } from './pages/Workspace';
import { Collections } from './pages/Collections';
import { Flow } from './pages/Flow';
import { Environments } from './pages/Environments';
import { RouteScanner } from './pages/RouteScanner';
import { MockServers } from './pages/MockServers';
import { Testing } from './pages/Testing';
import { Settings } from './pages/Settings';
import { CommandPalette } from './components/CommandPalette';
import { History } from './pages/History';
import { useUiStore } from './stores/uiStore';
import { useRequestStore } from './stores/requestStore';
import { useWorkspaceStore } from './stores/workspaceStore';

export default function App() {
  const page = useUiStore((s) => s.activePage);
  const zenMode = useUiStore((s) => s.zenMode);
  const { setTheme } = useUiStore();
  const openRequest = useRequestStore((s) => s.openRequest);

  useEffect(() => {
    const s = useUiStore.getState();
    setTheme(s.theme);
    // re-apply persisted code font prefs (persist rehydrates async)
    document.documentElement.style.setProperty('--font-mono',
      s.codeFontFamily === 'jetbrains' ? "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace"
      : s.codeFontFamily === 'fira' ? "'Fira Code', ui-monospace, Menlo, Consolas, monospace"
      : s.codeFontFamily === 'sfmono' ? "'SF Mono', ui-monospace, Menlo, Consolas, monospace"
      : s.codeFontFamily === 'menlo' ? "Menlo, ui-monospace, Consolas, monospace"
      : "ui-monospace, 'Cascadia Code', Menlo, Consolas, monospace");
    document.documentElement.style.setProperty('--code-font-size', s.codeFontSize);
    // keep system theme in sync when OS preference changes
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (useUiStore.getState().theme === 'system') setTheme('system');
    };
    mql.addEventListener('change', onChange);
    void useWorkspaceStore.getState().loadWorkspace();
    if (useRequestStore.getState().tabs.length === 0) openRequest();
    return () => mql.removeEventListener('change', onChange);
  }, [setTheme, openRequest]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useUiStore.getState().setCommandPalette(!useUiStore.getState().commandPaletteOpen);
      }
      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        useRequestStore.getState().newTab();
      }
      if (mod && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        const { activeTabId, closeTab } = useRequestStore.getState();
        if (activeTabId) closeTab(activeTabId);
      }
      if (e.ctrlKey && e.key === '\\') {
        e.preventDefault();
        useUiStore.getState().toggleZenMode();
      }
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        const { tabs, activeTabId: current, setActiveTab } = useRequestStore.getState();
        if (tabs.length < 2) return;
        const idx = tabs.findIndex((t) => t.id === current);
        const next = tabs[(idx + 1) % tabs.length];
        setActiveTab(next.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <BrowserRouter>
      <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
        {!zenMode && <Sidebar />}
        <div className="flex min-w-0 flex-1 flex-col">
          {!zenMode && <Header />}
          <main className="min-h-0 flex-1 overflow-hidden">
            {page === 'workspace' && <Workspace />}
            {page === 'collections' && <Collections />}
            {page === 'flow' && <Flow />}
            {page === 'history' && <History />}
            {page === 'environments' && <Environments />}
            {page === 'scanner' && <RouteScanner />}
            {page === 'mocks' && <MockServers />}
            {page === 'testing' && <Testing />}
            {page === 'settings' && <Settings />}
          </main>
        </div>
        <CommandPalette />
      </div>
    </BrowserRouter>
  );
}
