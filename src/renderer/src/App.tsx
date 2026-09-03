import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { MainLayout } from './components/layout/MainLayout';
import { Dashboard } from './pages/Dashboard';
import { Workspace } from './pages/Workspace';
import { Collections } from './pages/Collections';
import { Flow } from './pages/Flow';
import { Environments } from './pages/Environments';
import { RouteScanner } from './pages/RouteScanner';
import { MockServers } from './pages/MockServers';
import { Testing } from './pages/Testing';
import { SecurityPage } from './pages/SecurityPage';
import { Settings } from './pages/Settings';
import { CommandPalette } from './components/CommandPalette';
import { History } from './pages/History';
import { Toaster } from './components/ui/Toast';
import { useUiStore } from './stores/uiStore';
import { useRequestStore } from './stores/requestStore';
import { useWorkspaceStore } from './stores/workspaceStore';

export default function App() {
  const page = useUiStore((s) => s.activePage);
  const { setTheme } = useUiStore();
  const openRequest = useRequestStore((s) => s.openRequest);

  useEffect(() => {
    // APIro is dark-only — force dark on mount
    setTheme('dark');
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
    // re-apply persisted code font prefs
    const s = useUiStore.getState();
    document.documentElement.style.setProperty(
      '--font-mono',
      s.codeFontFamily === 'jetbrains'
        ? "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace"
        : s.codeFontFamily === 'fira'
          ? "'Fira Code', ui-monospace, Menlo, Consolas, monospace"
          : s.codeFontFamily === 'sfmono'
            ? "'SF Mono', ui-monospace, Menlo, Consolas, monospace"
            : s.codeFontFamily === 'menlo'
              ? 'Menlo, ui-monospace, Consolas, monospace'
              : "ui-monospace, 'Cascadia Code', Menlo, Consolas, monospace"
    );
    document.documentElement.style.setProperty('--code-font-size', s.codeFontSize);
    void useWorkspaceStore.getState().loadWorkspace();
    if (useRequestStore.getState().tabs.length === 0) openRequest();
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
      <MainLayout>
        {page === 'dashboard' && <Dashboard />}
        {page === 'workspace' && <Workspace />}
        {page === 'collections' && <Collections />}
        {page === 'flow' && <Flow />}
        {page === 'history' && <History />}
        {page === 'environments' && <Environments />}
        {page === 'scanner' && <RouteScanner />}
        {page === 'mocks' && <MockServers />}
        {page === 'testing' && <Testing />}
        {page === 'security' && <SecurityPage />}
        {page === 'settings' && <Settings />}
      </MainLayout>
      <CommandPalette />
      <Toaster />
    </BrowserRouter>
  );
}
