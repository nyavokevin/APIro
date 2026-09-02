import { useState } from 'react';
import { FolderPlus, Sun, Moon, Monitor } from 'lucide-react';
import { useUiStore } from '../../stores/uiStore';
import { useRequestStore } from '../../stores/requestStore';
import { EnvironmentSelector } from '../environments/EnvironmentSelector';
import { SaveToCollectionModal } from '../collections/SaveToCollectionModal';
import { Button } from '../ui/Button';
import { ModeBadge } from '../ModeBadge';

export function Header() {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const setCommandPalette = useUiStore((s) => s.setCommandPalette);
  const activeTab = useRequestStore((s) => s.getActiveTab());
  const [saveOpen, setSaveOpen] = useState(false);
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
  const paletteLabel = isMac ? '⌘ K' : 'Ctrl K';

  return (
    <header className="flex h-12 items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-[var(--text-secondary)]">
          {activeTab ? activeTab.request.name : 'APIForge'}
        </span>
        <ModeBadge />
      </div>
      <div className="flex items-center gap-2">
        <EnvironmentSelector />
        <Button
          variant="ghost"
          onClick={() => setSaveOpen(true)}
          disabled={!activeTab}
          title="Save the active request into a new collection"
        >
          <FolderPlus size={14} /> Save to new collection
        </Button>
        <Button variant="ghost" onClick={() => setCommandPalette(true)} aria-label="Open command palette" title="Command palette (Ctrl+K)">
          {paletteLabel}
        </Button>
        <Button variant="ghost" onClick={toggleTheme} aria-label={`Theme: ${theme} — click to cycle`} title={`Theme: ${theme}`}>
          {theme === 'dark' ? <Moon size={14} /> : theme === 'light' ? <Sun size={14} /> : <Monitor size={14} />}
        </Button>
      </div>
      <SaveToCollectionModal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        request={activeTab?.request ?? null}
      />
    </header>
  );
}
