import { useEffect, useState, type ReactNode } from 'react';
import { Command } from 'cmdk';
import {
  Search,
  Plus,
  SunMoon,
  Globe,
  ScanLine,
  Server,
  Settings as SettingsIcon,
  FileDown,
  Network,
} from 'lucide-react';

import { Clock, FlaskConical } from 'lucide-react';
import { useUiStore } from '../stores/uiStore';
import { useRequestStore } from '../stores/requestStore';
import { useCollectionStore } from '../stores/collectionStore';
import { ExportDialog } from './pdf/ExportDialog';
import { Button } from './ui/Button';

export function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen, toggleTheme, setActivePage } = useUiStore();
  const collections = useCollectionStore((s) => s.collections);
  const [openExport, setOpenExport] = useState(false);
  const [exportCollectionId, setExportCollectionId] = useState<string | null>(null);

  useEffect(() => {
    if (commandPaletteOpen) {
      setOpenExport(false);
      setExportCollectionId(null);
    }
  }, [commandPaletteOpen]);

  const close = () => setCommandPaletteOpen(false);

  const run = (fn: () => void) => {
    fn();
    close();
  };

  if (!commandPaletteOpen) return null;

  if (openExport) {
    if (exportCollectionId) {
      const col = collections.find((c) => c.id === exportCollectionId) ?? null;
      return (
        <ExportDialog
          open
          onClose={() => {
            setExportCollectionId(null);
            setOpenExport(false);
            close();
          }}
          collection={col}
          collections={collections}
        />
      );
    }
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/60" onClick={close} />
        <div className="relative z-10 w-full max-w-md rounded border border-[var(--border)] bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-primary)]">
          <p className="mb-3 font-medium">Export Documentation</p>
          <p className="mb-3 text-[var(--text-secondary)]">
            Choose a collection to export, or open the Collections page for more options.
          </p>
          <div className="mb-3 max-h-48 space-y-1 overflow-auto">
            {collections.map((c) => (
              <button
                key={c.id}
                onClick={() => setExportCollectionId(c.id)}
                className="block w-full rounded px-2 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
              >
                {c.name}
              </button>
            ))}
            {collections.length === 0 && (
              <p className="text-[var(--text-secondary)]">No collections yet.</p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpenExport(false)}>
              Back
            </Button>
            <Button variant="secondary" onClick={close}>
              Close
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={close} />
      <Command.Dialog
        open
        onOpenChange={(o) => !o && close()}
        label="Command Palette"
        className="relative z-10 w-full max-w-xl overflow-hidden rounded border border-[var(--border)] bg-[var(--bg-secondary)]"
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
          <Search size={16} className="text-[var(--text-secondary)]" />
          <Command.Input
            autoFocus
            placeholder="Type a command..."
            className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)]"
          />
        </div>
        <Command.List className="max-h-72 overflow-auto p-2">
          <Command.Empty className="px-2 py-3 text-center text-xs text-[var(--text-secondary)]">
            No commands found.
          </Command.Empty>

          <Command.Group heading="Actions" className="px-1 text-xs text-[var(--text-secondary)]">
            <PaletteItem
              icon={<Plus size={14} />}
              label="New Request Tab"
              onSelect={() => run(() => useRequestStore.getState().newTab())}
            />
            <PaletteItem
              icon={<FileDown size={14} />}
              label="Export Docs"
              onSelect={() => setOpenExport(true)}
            />
            <PaletteItem
              icon={<SunMoon size={14} />}
              label="Switch Theme"
              onSelect={() => run(toggleTheme)}
            />
          </Command.Group>

          <Command.Group heading="Navigation" className="px-1 text-xs text-[var(--text-secondary)]">
            <PaletteItem
              icon={<Search size={14} />}
              label="Open Collections"
              onSelect={() => run(() => setActivePage('collections'))}
            />
            <PaletteItem
              icon={<Network size={14} />}
              label="Open Connection Flow"
              onSelect={() => run(() => setActivePage('flow'))}
            />
            <PaletteItem
              icon={<Clock size={14} />}
              label="Open History"
              onSelect={() => run(() => setActivePage('history'))}
            />
            <PaletteItem
              icon={<Globe size={14} />}
              label="Open Environments"
              onSelect={() => run(() => setActivePage('environments'))}
            />
            <PaletteItem
              icon={<ScanLine size={14} />}
              label="Open Route Scanner"
              onSelect={() => run(() => setActivePage('scanner'))}
            />
            <PaletteItem
              icon={<Server size={14} />}
              label="Open Mock Servers"
              onSelect={() => run(() => setActivePage('mocks'))}
            />
            <PaletteItem
              icon={<FlaskConical size={14} />}
              label="Open Testing"
              onSelect={() => run(() => setActivePage('testing'))}
            />
            <PaletteItem
              icon={<SettingsIcon size={14} />}
              label="Open Settings"
              onSelect={() => run(() => setActivePage('settings'))}
            />
          </Command.Group>
        </Command.List>
        <p className="border-t border-[var(--border)] px-3 py-2 text-[11px] text-[var(--text-secondary)]">
          ↑↓ to navigate · Enter to run · Esc to close
        </p>
      </Command.Dialog>
    </div>
  );
}

function PaletteItem({
  icon,
  label,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--text-primary)] data-[selected=true]:bg-[var(--bg-tertiary)]"
    >
      {icon}
      {label}
    </Command.Item>
  );
}
