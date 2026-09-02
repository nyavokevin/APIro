import { useState, type ReactNode } from 'react';
import { Clock, Folder, Plus, Send, Boxes, Globe, ScanLine, Code2, Server, FlaskConical, Settings, ChevronsLeft, ChevronsRight, Network } from 'lucide-react';
import { useCollectionStore } from '../../stores/collectionStore';
import { useUiStore, type AppPage } from '../../stores/uiStore';
import { useRequestStore } from '../../stores/requestStore';
import { Button } from '../ui/Button';
import { CollectionTree } from '../collections/CollectionTree';
import { NewCollectionModal } from '../collections/NewCollectionModal';
import { GitPanel } from '../git/GitPanel';

const navItems: { key: AppPage; label: string; icon: ReactNode }[] = [
  { key: 'workspace', label: 'Workspace', icon: <Code2 size={16} /> },
  { key: 'collections', label: 'Collections', icon: <Folder size={16} /> },
  { key: 'flow', label: 'Connection Flow', icon: <Network size={16} /> },
  { key: 'history', label: 'History', icon: <Clock size={16} /> },
  { key: 'environments', label: 'Environments', icon: <Globe size={16} /> },
  { key: 'scanner', label: 'Route Scanner', icon: <ScanLine size={16} /> },
  { key: 'mocks', label: 'Mock Servers', icon: <Server size={16} /> },
  { key: 'testing', label: 'Testing', icon: <FlaskConical size={16} /> },
  { key: 'settings', label: 'Settings', icon: <Settings size={16} /> },
];

export function Sidebar() {
  const { collections } = useCollectionStore();
  const activePage = useUiStore((s) => s.activePage);
  const setActivePage = useUiStore((s) => s.setActivePage);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const [newOpen, setNewOpen] = useState(false);

  if (!sidebarOpen) {
    return (
      <div className="flex w-10 flex-col items-center gap-1 border-r border-[var(--border)] bg-[var(--bg-secondary)] p-2">
        <Button variant="ghost" onClick={toggleSidebar} aria-label="Expand sidebar" title="Expand sidebar">
          <ChevronsRight size={16} />
        </Button>
        <div className="my-1 h-px w-6 bg-[var(--border)]" />
        {navItems.map((item) => (
          <Button
            key={item.key}
            variant="ghost"
            onClick={() => setActivePage(item.key)}
            aria-label={item.label}
            title={item.label}
            className={activePage === item.key ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]' : undefined}
          >
            {item.icon}
          </Button>
        ))}
      </div>
    );
  }

  return (
    <aside className="flex w-64 flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <span className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
          <Boxes size={18} className="text-[var(--accent)]" /> APIForge
        </span>
        <Button variant="ghost" onClick={toggleSidebar} aria-label="Collapse sidebar" title="Collapse sidebar">
          <ChevronsLeft size={16} />
        </Button>
      </div>

      <nav className="px-2 py-2">
        {navItems.map((item) => (
          <button
            key={item.key}
            onClick={() => setActivePage(item.key)}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
              activePage === item.key
                ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      <div className="mt-2 flex items-center justify-between px-3 py-1">
        <span className="text-xs font-semibold uppercase text-[var(--text-secondary)]">
          Collections
        </span>
        <Button variant="ghost" onClick={() => setNewOpen(true)} aria-label="New collection" title="New collection">
          <Plus size={14} />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        <CollectionTree
          nodes={collections}
          onOpenRequest={(id) => {
            const req = useCollectionStore.getState().getById(id)?.data;
            if (req) {
              // Opens a new tab (or focuses the tab already showing this
              // request) without touching any other open tab.
              useRequestStore.getState().openRequest(req);
              setActivePage('workspace');
            }
          }}
        />
      </div>

      <GitPanel />

      <div className="border-t border-[var(--border)] p-2">
        <Button
          variant="primary"
          className="w-full"
          onClick={() => {
            setActivePage('workspace');
            useRequestStore.getState().openRequest();
          }}
        >
          <Send size={14} /> New Request
        </Button>
      </div>

      <NewCollectionModal open={newOpen} onClose={() => setNewOpen(false)} />
    </aside>
  );
}
