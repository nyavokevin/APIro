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
    <div className="flex items-stretch bg-[#070709] shrink-0" style={{ borderBottom: '1px solid #232329' }} role="tablist">
      <div className="flex flex-1 items-stretch overflow-x-auto scrollbar-thin">
        {tabs.map((t) => {
          const active = t.id === activeTabId;
          const renaming = t.id === renamingId;
          const hasResponse = !!t.response && !t.response.error;
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
              } — double-click to rename · middle-click to close`}
              className="group flex min-w-[124px] max-w-[220px] cursor-pointer items-center gap-1.5 px-3 py-2.5 text-xs outline-none transition-colors"
              style={{
                borderRight: '1px solid #232329',
                borderBottom: active ? '2px solid #8B5CF6' : '2px solid transparent',
                marginBottom: '-1px',
                background: active ? '#121215' : 'transparent',
                color: active ? '#E6E8F0' : '#7A7F93',
                borderRadius: '0px',
                boxShadow: active ? 'inset 0 -6px 12px rgba(139,92,246,0.06)' : 'none',
              }}
            >
              <span
                className="shrink-0 font-mono font-bold tracking-wide"
                style={{ color: METHOD_COLORS[t.request.method], fontSize: '10px', letterSpacing: '0.04em' }}
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
                  className="min-w-0 flex-1 bg-[#000000] px-1 py-0.5 text-xs text-[#E2E8F0] outline-none"
                  style={{ border: '1px solid #8B5CF6', borderRadius: '0px' }}
                  aria-label="Tab name"
                />
              ) : (
                <span className="flex-1 truncate">{tabLabel(t.request)}</span>
              )}
              {t.loading && (
                <span className="h-1.5 w-1.5 shrink-0 animate-pulse bg-[#8B5CF6] shadow-[0_0_6px_rgba(139,92,246,0.5)]" style={{ borderRadius: '9999px' }} />
              )}
              {hasResponse && !t.loading && (
                <span className="h-1.5 w-1.5 shrink-0 bg-[#10B981] rounded-full" style={{ boxShadow: '0 0 6px rgba(16,185,129,0.35)' }} aria-hidden />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.id);
                }}
                className="ml-0.5 shrink-0 p-1 text-[#7A7F93] opacity-60 hover:opacity-100 hover:text-[#E6E8F0] hover:bg-[#232329] active:scale-90 group-hover:opacity-100 focus-visible:opacity-100 transition-all"
                style={{ borderRadius: '0px' }}
                aria-label={`Close ${t.request.name}`}
              >
                <X size={12} strokeWidth={2} />
              </button>
            </div>
          );
        })}
        <button
          onClick={() => newTab()}
          className="flex w-9 shrink-0 items-center justify-center text-[#7A7F93] hover:bg-[#121215] hover:text-[#E6E8F0] active:scale-95 transition-all border-r border-[#232329]"
          style={{ borderRadius: '0px' }}
          aria-label="New request tab"
          title="New tab (Ctrl+N)"
        >
          <Plus size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
