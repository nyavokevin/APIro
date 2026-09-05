import { useEffect, useMemo, useState } from 'react';
import { Plus, FolderTree, Upload, FileDown, Network, Search, Folder, FileCode, Trash2, FolderOpen, ArrowRight, Layers } from 'lucide-react';
import { useCollectionStore } from '../stores/collectionStore';
import { useRequestStore } from '../stores/requestStore';
import { useUiStore } from '../stores/uiStore';
import { Button } from '../components/ui/Button';
import { CollectionTree } from '../components/collections/CollectionTree';
import { NewCollectionModal } from '../components/collections/NewCollectionModal';
import { CollectionShareImportModal } from '../components/collections/CollectionShareImportModal';
import { CollectionShareExportModal } from '../components/collections/CollectionShareExportModal';
import type { Collection } from '@shared/types/request';

function collectRequests(node: Collection): Collection[] {
  const out: Collection[] = [];
  const walk = (n: Collection) => {
    if (n.type === 'request') out.push(n);
    for (const c of n.children ?? []) walk(c);
  };
  walk(node);
  return out;
}

export function Collections() {
  const { collections, load } = useCollectionStore();
  const openRequest = useRequestStore((s) => s.openRequest);
  const setActivePage = useUiStore((s) => s.setActivePage);
  const [importOpen, setImportOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (collections.length === 0) void load();
  }, [collections.length, load]);

  // Auto-select first collection when data arrives and nothing selected
  useEffect(() => {
    if (collections.length > 0 && !selectedId) {
      setSelectedId(collections[0].id);
    }
    // If selected was deleted, pick first remaining
    if (selectedId && !collections.find((c) => c.id === selectedId)) {
      setSelectedId(collections[0]?.id ?? null);
    }
  }, [collections, selectedId]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return collections;
    return collections.filter((c) => c.name.toLowerCase().includes(q) || collectRequests(c).some((r) => r.name.toLowerCase().includes(q)));
  }, [collections, filter]);

  const selected = useMemo(() => collections.find((c) => c.id === selectedId) ?? null, [collections, selectedId]);

  const totalRequests = useMemo(() => collections.reduce((acc, c) => acc + collectRequests(c).length, 0), [collections]);

  return (
    <div className="flex h-full min-h-0 bg-[#070709]">
      {/* ── Internal sidebar: per-collection menu ── */}
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-[#232329] bg-[#0E0E10]">
        {/* Header */}
        <div className="relative shrink-0 border-b border-[#232329] bg-[#0E0E10] p-[14px]">
          <div className="mb-3.5 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-[-0.02em] text-[#E6E8F0]">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center border border-[#232329] bg-[#121215] text-[#8B5CF6]">
                <FolderTree size={14} strokeWidth={1.75} />
              </span>
              Collections
            </h2>
            <span className="inline-flex shrink-0 items-center gap-1 border border-[#232329] bg-[#121215] px-1.5 py-1 font-mono text-[11px] tabular-nums leading-none text-[#9FA3B5]">
              <span className="tracking-[-0.02em]">{collections.length}</span>
              <span className="text-[#2E2E36]">·</span>
              <span className="tracking-[-0.02em]">{totalRequests}</span>
            </span>
          </div>

          <div className="relative mb-3">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7A7F93]" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter collections…"
              className="h-[34px] w-full border border-[#232329] bg-[#121215] py-1 pl-8 pr-3 text-[13px] tracking-[-0.01em] text-[#E6E8F0] placeholder:text-[#5A5E6E] outline-none transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-[#2E2E36] hover:bg-[#16161A] focus:border-[#8B5CF6] focus:shadow-[0_0_0_3px_rgba(139,92,246,0.12)]"
              style={{ borderRadius: '0px' }}
            />
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setNewOpen(true)}
              className="w-full hover:-translate-y-[1px] hover:shadow-[0_4px_12px_rgba(139,92,246,0.2)] active:translate-y-0 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.35)] focus-visible:ring-offset-0"
            >
              <Plus size={14} /> New
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setImportOpen(true)}
              className="w-full hover:-translate-y-[1px] hover:border-[#2E2E36] hover:bg-[#1E1E24] hover:shadow-[0_2px_8px_rgba(0,0,0,0.35)] active:translate-y-0 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.3)] focus-visible:ring-offset-0"
            >
              <Upload size={14} /> Import
            </Button>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setExportOpen(true)}
              disabled={collections.length === 0}
              className="w-full hover:-translate-y-[1px] hover:border-[#2E2E36] hover:bg-[#1E1E24] active:translate-y-0 active:scale-[0.98] disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              <FileDown size={14} /> Export
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setActivePage('flow')}
              className="w-full hover:-translate-y-[1px] hover:border-[#2E2E36] hover:bg-[#1E1E24] hover:shadow-[0_2px_8px_rgba(0,0,0,0.35)] active:translate-y-0 active:scale-[0.98]"
            >
              <Network size={14} /> Flow
            </Button>
          </div>

          {/* subtle divider gradient */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-[#232329] via-[#2E2E36]/60 to-transparent" />
        </div>

        {/* Menu list */}
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="animate-fadeUp mx-1 mt-2 border border-dashed border-[#232329] bg-[#121215]/50 p-6 text-center">
              <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center border border-[#232329] bg-[#0E0E10] text-[#7A7F93]">
                <Folder size={14} />
              </div>
              <p className="text-[13px] font-medium tracking-[-0.02em] text-[#E6E8F0]">
                {collections.length === 0 ? 'No collections yet' : `No match for “${filter}”`}
              </p>
              <p className="mx-auto mt-1 max-w-[20ch] text-xs leading-relaxed tracking-[-0.01em] text-[#7A7F93]">
                {collections.length === 0 ? 'Create a new collection or import from Postman / OpenAPI.' : 'Try a different search term.'}
              </p>
              <p className="mt-3 text-[11px] font-mono tabular-nums tracking-wide text-[#5A5E6E]">Create or import a collection</p>
            </div>
          ) : (
            <ul className="space-y-1">
              {filtered.map((col, idx) => {
                const count = collectRequests(col).length;
                const active = col.id === selectedId;
                const isRequest = col.type === 'request';
                return (
                  <li
                    key={col.id}
                    className="animate-fadeUp"
                    style={{ animationDelay: `${idx * 32}ms`, animationFillMode: 'both' }}
                  >
                    <button
                      onClick={() => setSelectedId(col.id)}
                      className={`group flex w-full items-center gap-2.5 border px-2.5 py-2 text-left text-[13px] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.35)] focus-visible:ring-offset-0 focus-visible:ring-offset-[#0E0E10] ${
                        active
                          ? 'border-[#232329] bg-[#121215] text-[#E6E8F0] shadow-[0_1px_2px_rgba(0,0,0,0.45),0_0_0_1px_rgba(139,92,246,0.08),0_0_16px_rgba(139,92,246,0.06)]'
                          : 'border-transparent bg-transparent text-[#9FA3B5] hover:border-[#2E2E36] hover:bg-[#121215] hover:text-[#E6E8F0] hover:shadow-[0_1px_3px_rgba(0,0,0,0.4)]'
                      }`}
                      style={{ borderRadius: '0px' }}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center border transition-colors duration-200 ${
                          active
                            ? 'border-[rgba(139,92,246,0.18)] bg-[rgba(139,92,246,0.10)] text-[#8B5CF6] shadow-[0_0_10px_rgba(139,92,246,0.12)]'
                            : 'border-[#232329] bg-[#121215] text-[#7A7F93] group-hover:border-[#2E2E36] group-hover:bg-[#16161A] group-hover:text-[#9FA3B5]'
                        }`}
                        style={{ borderRadius: '0px' }}
                      >
                        {isRequest ? <FileCode size={13} strokeWidth={1.75} /> : <Folder size={13} strokeWidth={1.75} />}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium tracking-[-0.02em]">{col.name}</span>
                      <span
                        className={`shrink-0 border px-1.5 py-1 font-mono text-[11px] tabular-nums leading-none tracking-[-0.01em] transition-colors ${
                          active
                            ? 'border-[#232329] bg-[#070709] text-[#9FA3B5]'
                            : 'border-transparent bg-[#121215] text-[#7A7F93] group-hover:border-[#232329] group-hover:text-[#9FA3B5]'
                        }`}
                        style={{ borderRadius: '0px' }}
                      >
                        {count}
                      </span>
                      {active && <ArrowRight size={12} className="shrink-0 text-[#8B5CF6]" strokeWidth={2} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="relative shrink-0 border-t border-[#232329] bg-[#0E0E10] px-[14px] py-2.5">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-[#232329] via-[#2E2E36]/40 to-transparent opacity-60" />
          <span className="flex items-center gap-1.5 font-mono text-[11px] tabular-nums tracking-wide text-[#7A7F93]">
            <Layers size={12} className="text-[#5A5E6E]" /> {totalRequests} requests total
          </span>
        </div>
      </aside>

      {/* ── Full-width detail section ── */}
      <section className="flex min-w-0 flex-1 flex-col bg-[#070709]">
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <div className="card-spotlight w-full max-w-[420px] border border-[#232329] bg-[#0E0E10] p-[14px] shadow-[0_8px_24px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.03)]">
              <div className="flex flex-col items-center border border-[#232329] bg-[#121215] p-6">
                <span className="mb-3 flex h-10 w-10 items-center justify-center border border-[#232329] bg-[#0E0E10] text-[#7A7F93]">
                  <FolderTree size={20} strokeWidth={1.5} />
                </span>
                <h3 className="text-[13px] font-semibold tracking-[-0.02em] text-[#E6E8F0]">No collection selected</h3>
                <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed tracking-[-0.01em] text-[#9FA3B5]">
                  Pick a collection on the left to inspect its folders and requests. Collections are stored as{' '}
                  <code className="border border-[#232329] bg-[#070709] px-1 py-0.5 font-mono text-[11px] tabular-nums text-[#9FA3B5]">folders/*.request.yaml</code>{' '}
                  and listed per-collection — not all at once.
                </p>
                <div className="mt-4 flex justify-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setNewOpen(true)}
                    className="hover:-translate-y-[1px] hover:shadow-[0_4px_12px_rgba(139,92,246,0.2)] active:scale-[0.98]"
                  >
                    <Plus size={14} /> New Collection
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setImportOpen(true)}
                    className="hover:-translate-y-[1px] hover:border-[#2E2E36] active:scale-[0.98]"
                  >
                    <Upload size={14} /> Import
                  </Button>
                </div>
              </div>
            </div>
            <p className="mt-3 font-mono text-[11px] tracking-wide text-[#5A5E6E]">Tip: Import from Postman, Insomnia, OpenAPI, HAR or cURL.</p>
          </div>
        ) : (
          <>
            {/* Detail header — full width */}
            <div className="relative shrink-0 border-b border-[#232329] bg-[#0E0E10] px-[14px] py-[14px]">
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-[#232329] via-[#2E2E36]/50 to-transparent" />
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="flex flex-wrap items-center gap-2.5 text-[15px] font-semibold tracking-[-0.02em] text-[#E6E8F0]">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-[#232329] bg-[#121215] text-[#8B5CF6]">
                      {selected.type === 'request' ? <FileCode size={15} strokeWidth={1.75} /> : <Folder size={15} strokeWidth={1.75} />}
                    </span>
                    <span className="truncate tracking-[-0.02em]">{selected.name}</span>
                    <span className="shrink-0 border border-[#232329] bg-[#121215] px-2 py-0.5 font-mono text-[11px] font-normal tabular-nums tracking-[-0.01em] text-[#9FA3B5]">
                      {collectRequests(selected).length} requests
                    </span>
                  </h3>
                  {selected.description ? (
                    <p className="mt-1.5 max-w-2xl truncate text-[12px] leading-relaxed tracking-[-0.01em] text-[#9FA3B5]">{selected.description}</p>
                  ) : (
                    <p className="mt-1.5 text-[12px] leading-relaxed tracking-[-0.01em] text-[#7A7F93]">
                      Folder collection — requests are grouped below. Double-click a name to rename.
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {selected.type !== 'request' && collectRequests(selected).length > 0 && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        for (const r of collectRequests(selected)) {
                          const data = useCollectionStore.getState().getById(r.id)?.data;
                          if (data) {
                            openRequest(data);
                          }
                        }
                        setActivePage('workspace');
                      }}
                      className="hover:-translate-y-[1px] hover:border-[#2E2E36] hover:shadow-[0_2px_8px_rgba(0,0,0,0.35)] active:scale-[0.98]"
                    >
                      <FolderOpen size={14} /> Open all in Workspace
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setExportOpen(true)}
                    className="hover:-translate-y-[1px] hover:border-[#2E2E36] active:scale-[0.98]"
                  >
                    <FileDown size={14} /> Export
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      if (confirm(`Delete “${selected.name}” and its ${collectRequests(selected).length} request(s)?`)) {
                        try { await useCollectionStore.getState().remove(selected.id); const { useNotificationStore } = await import('../stores/notificationStore'); useNotificationStore.getState().addToast({ variant:'success', title:'Deleted', description:selected.name }); } catch(e){ const { useNotificationStore } = await import('../stores/notificationStore'); useNotificationStore.getState().addToast({ variant:'error', title:'Delete failed', description: String(e) }); }
                      }
                    }}
                    className="hover:-translate-y-[1px] hover:bg-[#121215] hover:text-[#EF4444] active:scale-[0.98]"
                  >
                    <Trash2 size={14} /> Delete
                  </Button>
                </div>
              </div>
            </div>

            {/* Requests — full width */}
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#070709] p-[14px]">
              {selected.type === 'request' ? (
                <div className="card-spotlight border border-[#232329] bg-[#121215] p-[14px] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-[#2E2E36] hover:shadow-[0_4px_16px_rgba(0,0,0,0.35)]">
                  <div className="flex flex-wrap items-center gap-2 text-[13px] tracking-[-0.02em] text-[#E6E8F0]">
                    <span className="flex h-7 w-7 items-center justify-center border border-[rgba(139,92,246,0.18)] bg-[rgba(139,92,246,0.10)] text-[#8B5CF6]">
                      <FileCode size={14} strokeWidth={1.75} />
                    </span>
                    <span className="font-medium tracking-[-0.02em]">{selected.name}</span>
                    <span className="border border-[#232329] bg-[#0E0E10] px-2 py-1 font-mono text-xs tabular-nums tracking-[-0.01em] text-[#9FA3B5]">
                      {selected.data?.method} {selected.data?.url}
                    </span>
                  </div>
                  <div className="mt-4">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        const data = useCollectionStore.getState().getById(selected.id)?.data;
                        if (data) {
                          openRequest(data);
                          setActivePage('workspace');
                        }
                      }}
                      className="hover:-translate-y-[1px] hover:shadow-[0_4px_12px_rgba(139,92,246,0.2)] active:scale-[0.98]"
                    >
                      Open in Workspace <ArrowRight size={14} />
                    </Button>
                  </div>
                </div>
              ) : selected.children && selected.children.length > 0 ? (
                <div className="card-spotlight border border-[#232329] bg-[#121215] p-[14px] transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-[#2E2E36]">
                  <CollectionTree
                    nodes={selected.children ?? []}
                    onOpenRequest={(id) => {
                      const req = useCollectionStore.getState().getById(id)?.data;
                      if (req) {
                        openRequest(req);
                        setActivePage('workspace');
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="card-spotlight flex flex-col items-center justify-center border border-dashed border-[#232329] bg-[#0E0E10] p-8 text-center">
                  <div className="mb-3 flex h-9 w-9 items-center justify-center border border-[#232329] bg-[#121215] text-[#7A7F93]">
                    <Folder size={16} />
                  </div>
                  <p className="text-[13px] font-medium tracking-[-0.02em] text-[#E6E8F0]">This collection is empty</p>
                  <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed tracking-[-0.01em] text-[#7A7F93]">
                    Add requests from the Workspace or import an OpenAPI / Postman file. They will appear here grouped by folder.
                  </p>
                </div>
              )}

              <p className="mt-3 flex flex-wrap items-center gap-1.5 font-mono text-[11px] tracking-wide text-[#5A5E6E]">
                Tip: Requests open in the Workspace. Use{' '}
                <span className="border border-[#232329] bg-[#121215] px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-[#9FA3B5]">Connection Flow</span> to visualise
                dependencies.
              </p>
            </div>
          </>
        )}
      </section>

      {/* Modals (portal) */}
      <NewCollectionModal open={newOpen} onClose={() => setNewOpen(false)} />
      <CollectionShareImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={() => void load()} />
      <CollectionShareExportModal open={exportOpen} onClose={() => setExportOpen(false)} collections={collections} />
    </div>
  );
}
