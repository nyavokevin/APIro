import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { METHOD_COLORS } from '@shared/constants/methods';
import { useRequestStore } from '../../stores/requestStore';
import { tabLabel } from '../../lib/tabLabel';

export function RequestTabBar() {
  const tabs = useRequestStore((s) => s.tabs);
  const activeTabId = useRequestStore((s) => s.activeTabId);
  const setActiveTab = useRequestStore((s) => s.setActiveTab);
  const newTab = useRequestStore((s) => s.newTab);
  const closeTab = useRequestStore((s) => s.closeTab);
  const updateRequest = useRequestStore((s) => s.updateRequest);

  // Inline tab renaming: double-click a tab to edit its name (Enter commits,
  // Escape cancels, blur commits).
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const startRenaming = (id: string, name: string) => {
    setRenamingId(id);
    setDraft(name);
  };

  const commitRename = () => {
    if (renamingId) {
      const trimmed = draft.trim();
      if (trimmed) updateRequest(renamingId, { name: trimmed });
    }
    setRenamingId(null);
  };

  return (
    <div className="flex items-stretch border-b border-[var(--border)] bg-[var(--bg-secondary)]" role="tablist">
      <div className="flex flex-1 items-stretch overflow-x-auto">
        {tabs.map((t) => {
          const active = t.id === activeTabId;
          const renaming = t.id === renamingId;
          return (
            <div
              key={t.id}
              role="tab"
              aria-selected={active}
              tabIndex={0}
              onClick={() => setActiveTab(t.id)}
              onDoubleClick={() => startRenaming(t.id, t.request.name)}
              onAuxClick={(e) => {
                if (e.button === 1) closeTab(t.id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setActiveTab(t.id);
              }}
              title={`${t.request.method} ${t.request.url || t.request.name}${
                t.response && !t.response.error ? ` · ${t.response.responseTime} ms` : ''
              } — double-click to rename`}
              className={`group flex min-w-[120px] max-w-[200px] cursor-pointer items-center gap-1.5 border-r border-[var(--border)] px-3 py-2 text-xs outline-none ${
                active
                  ? '-mb-px border-b-2 border-b-[var(--accent)] bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                  : '-mb-px border-b-2 border-b-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span
                className="shrink-0 font-mono text-[10px] font-semibold"
                style={{ color: METHOD_COLORS[t.request.method] }}
              >
                {t.request.method}
              </span>
              {renaming ? (
                <input
                  value={draft}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setDraft(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                  className="min-w-0 flex-1 rounded border border-[var(--accent)] bg-[var(--bg-primary)] px-1 py-0.5 text-xs text-[var(--text-primary)] outline-none"
                  aria-label="Tab name"
                />
              ) : (
                <span className="flex-1 truncate">{tabLabel(t.request)}</span>
              )}
              {t.loading && (
                <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.id);
                }}
                className="ml-1 shrink-0 rounded p-0.5 text-[var(--text-secondary)] opacity-0 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Close ${t.request.name}`}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
        <button
          onClick={() => newTab()}
          className="flex w-9 shrink-0 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
          aria-label="New request tab"
          title="New tab (Ctrl+N)"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}