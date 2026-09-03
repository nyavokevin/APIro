import { useEffect, useState, type ReactNode } from 'react';
import { Command } from 'cmdk';
import {
  Search,
  Plus,
  Globe,
  ScanLine,
  Server,
  Settings as SettingsIcon,
  FileDown,
  Network,
  LayoutDashboard,
  Code2,
  Folder,
} from 'lucide-react';

import { Clock, FlaskConical, Shield } from 'lucide-react';
import { useUiStore } from '../stores/uiStore';
import { useRequestStore } from '../stores/requestStore';
import { useCollectionStore } from '../stores/collectionStore';
import { ExportDialog } from './pdf/ExportDialog';
import { Button } from './ui/Button';

export function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen, setActivePage } = useUiStore();
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
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)' }}>
        <div className="absolute inset-0" onClick={close} style={{ background: 'rgba(0,0,0,0.8)' }} />
        <div className="relative z-10 w-full max-w-md bg-[#121212] p-6 text-sm text-[#E2E8F0]" style={{ border: '1px solid #262626', borderRadius: '0px' }}>
          <p className="mb-3 font-semibold text-[#E2E8F0]" style={{ fontSize: '18px', fontWeight: 600 }}>Export Documentation</p>
          <p className="mb-3 text-[#8F909E]" style={{ fontSize: '13px' }}>
            Choose a collection to export.
          </p>
          <div className="mb-3 max-h-48 space-y-1 overflow-auto">
            {collections.map((c) => (
              <button
                key={c.id}
                onClick={() => setExportCollectionId(c.id)}
                className="block w-full px-3 py-2 text-left text-[#E2E8F0] hover:bg-[#1A1A1A]"
                style={{ borderRadius: '0px', borderLeft: '2px solid transparent', fontSize: '13px' }}
              >
                {c.name}
              </button>
            ))}
            {collections.length === 0 && (
              <p className="text-[#8F909E]">No collections yet.</p>
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
    <div className="fixed inset-0 z-50 flex justify-center" style={{ background: 'rgba(0,0,0,0.8)', paddingTop: '15vh' }}>
      <div className="absolute inset-0" onClick={close} style={{ background: 'rgba(0,0,0,0.8)' }} />
      <Command.Dialog
        open
        onOpenChange={(o) => !o && close()}
        label="Command Palette"
        className="relative z-10 w-full max-w-[640px] overflow-hidden bg-[#121212]"
        style={{ border: '1px solid #262626', borderRadius: '0px', height: 'fit-content', maxHeight: '60vh' }}
      >
        <div className="flex items-center gap-3 px-4" style={{ borderBottom: '1px solid #262626', padding: '16px' }}>
          <Search size={16} className="text-[#8F909E] shrink-0" />
          <Command.Input
            autoFocus
            placeholder="Type a command..."
            className="w-full bg-transparent text-[#E2E8F0] outline-none placeholder:text-[#8F909E]"
            style={{ fontSize: '15px', lineHeight: '22px' }}
          />
        </div>
        <Command.List className="max-h-72 overflow-auto p-2">
          <Command.Empty className="px-2 py-3 text-center text-xs text-[#8F909E]">
            No commands found.
          </Command.Empty>

          <Command.Group heading="Actions" className="px-1 text-xs">
            <div className="px-2 py-1 text-xs font-medium uppercase tracking-wider text-[#8F909E]">Actions</div>
            <PaletteItem
              icon={<Plus size={14} />}
              label="New Request Tab"
              shortcut="Ctrl+N"
              onSelect={() => run(() => useRequestStore.getState().newTab())}
            />
            <PaletteItem
              icon={<FileDown size={14} />}
              label="Export Docs"
              onSelect={() => setOpenExport(true)}
            />
          </Command.Group>

          <Command.Group heading="Navigation" className="px-1 text-xs">
            <div className="px-2 py-1 text-xs font-medium uppercase tracking-wider text-[#8F909E]">Navigation</div>
            <PaletteItem
              icon={<LayoutDashboard size={14} />}
              label="Open Dashboard"
              onSelect={() => run(() => setActivePage('dashboard'))}
            />
            <PaletteItem
              icon={<Code2 size={14} />}
              label="Open Workspace"
              onSelect={() => run(() => setActivePage('workspace'))}
            />
            <PaletteItem
              icon={<Folder size={14} />}
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
              icon={<Shield size={14} />}
              label="Open Security"
              onSelect={() => run(() => setActivePage('security'))}
            />
            <PaletteItem
              icon={<SettingsIcon size={14} />}
              label="Open Settings"
              onSelect={() => run(() => setActivePage('settings'))}
            />
          </Command.Group>
        </Command.List>
        <p className="px-3 py-2 text-xs text-[#8F909E]" style={{ borderTop: '1px solid #262626', fontSize: '11px' }}>
          ↑↓ to navigate · Enter to run · Esc to close
        </p>
      </Command.Dialog>
    </div>
  );
}

function PaletteItem({
  icon,
  label,
  shortcut,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm text-[#8F909E] data-[selected=true]:bg-[rgba(139,92,246,0.10)] data-[selected=true]:text-[#8B5CF6]"
      style={{ borderRadius: '0px', borderLeft: '2px solid transparent' }}
    >
      <span className="text-[#8F909E] data-[selected=true]:text-[#8B5CF6]">{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut && <span className="font-mono text-xs text-[#8F909E]">{shortcut}</span>}
    </Command.Item>
  );
}
