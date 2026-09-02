import { useEffect, useMemo, useState } from 'react';
import { Plus, FolderTree, Upload, FileDown, Network, Search, Folder, FileCode, Trash2, FolderOpen, ArrowRight, Layers } from 'lucide-react';
import { useCollectionStore } from '../stores/collectionStore';
import { useRequestStore } from '../stores/requestStore';
import { useUiStore } from '../stores/uiStore';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
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
    <div className="flex h-full min-h-0 bg-[var(--bg-primary)]">
      {/* ── Internal sidebar: per-collection menu ── */}
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)]">
        {/* Header */}
        <div className="border-b border-[var(--border)] p-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <FolderTree size={16} className="text-[var(--accent)]" /> Collections
            </h2>
            <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-xs font-mono text-[var(--text-secondary)]">
              {collections.length} · {totalRequests}
            </span>
          </div>

          <div className="relative mb-2">
            <Search size={14} className="pointer-events-none absolute left-2 top-2.5 text-[var(--text-muted)]" />
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter collections…" className="pl-7" />
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <Button variant="primary" size="sm" onClick={() => setNewOpen(true)} className="w-full">
              <Plus size={14} /> New
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)} className="w-full">
              <Upload size={14} /> Import
            </Button>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <Button variant="secondary" size="sm" onClick={() => setExportOpen(true)} disabled={collections.length === 0} className="w-full">
              <FileDown size={14} /> Export
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setActivePage('flow')} className="w-full">
              <Network size={14} /> Flow
            </Button>
          </div>
        </div>

        {/* Menu list */}
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs leading-relaxed text-[var(--text-secondary)]">
              {collections.length === 0 ? 'No collections yet.' : `No match for “${filter}”.`}
              <br />
              <span className="text-[var(--text-muted)]">Create or import a collection.</span>
            </p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((col) => {
                const count = collectRequests(col).length;
                const active = col.id === selectedId;
                const isRequest = col.type === 'request';
                return (
                  <li key={col.id}>
                    <button
                      onClick={() => setSelectedId(col.id)}
                      className={`group flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm transition-colors ${
                        active ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <span className={`shrink-0 rounded p-1 ${active ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]'}`}>
                        {isRequest ? <FileCode size={13} /> : <Folder size={13} />}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{col.name}</span>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-mono ${active ? 'bg-[var(--bg-primary)] text-[var(--text-secondary)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'}`}>
                        {count}
                      </span>
                      {active && <ArrowRight size={12} className="shrink-0 text-[var(--accent)]" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-[var(--border)] p-2 text-xs text-[var(--text-muted)]">
          <span className="flex items-center gap-1.5">
            <Layers size={12} /> {totalRequests} requests total
          </span>
        </div>
      </aside>

      {/* ── Full-width detail section ── */}
      <section className="flex min-w-0 flex-1 flex-col bg-[var(--bg-primary)]">
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] p-6">
              <FolderTree size={28} className="mx-auto mb-3 text-[var(--text-muted)]" />
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">No collection selected</h3>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-[var(--text-secondary)]">
                Pick a collection on the left to inspect its folders and requests. Collections are stored as <code className="rounded bg-[var(--bg-tertiary)] px-1 py-0.5 font-mono text-[11px]">folders/*.request.yaml</code> and listed per-collection — not all at once.
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <Button variant="primary" size="sm" onClick={() => setNewOpen(true)}>
                  <Plus size={14} /> New Collection
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
                  <Upload size={14} /> Import
                </Button>
              </div>
            </div>
            <p className="text-xs text-[var(--text-muted)]">Tip: Import from Postman, Insomnia, OpenAPI, HAR or cURL.</p>
          </div>
        ) : (
          <>
            {/* Detail header — full width */}
            <div className="border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 truncate text-base font-semibold text-[var(--text-primary)]">
                    {selected.type === 'request' ? <FileCode size={16} className="text-[var(--accent)]" /> : <Folder size={16} className="text-[var(--accent)]" />}
                    <span className="truncate">{selected.name}</span>
                    <span className="shrink-0 rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-xs font-mono font-normal text-[var(--text-secondary)]">
                      {collectRequests(selected).length} requests
                    </span>
                  </h3>
                  {selected.description ? (
                    <p className="mt-1 max-w-2xl truncate text-xs text-[var(--text-secondary)]">{selected.description}</p>
                  ) : (
                    <p className="mt-1 text-xs text-[var(--text-muted)]">Folder collection — requests are grouped below. Double-click a name to rename.</p>
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
                    >
                      <FolderOpen size={14} /> Open all in Workspace
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" onClick={() => setExportOpen(true)}>
                    <FileDown size={14} /> Export
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Delete “${selected.name}” and its ${collectRequests(selected).length} request(s)?`)) {
                        void useCollectionStore.getState().remove(selected.id);
                      }
                    }}
                  >
                    <Trash2 size={14} /> Delete
                  </Button>
                </div>
              </div>
            </div>

            {/* Requests — full width */}
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {selected.type === 'request' ? (
                <div className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                  <div className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                    <FileCode size={14} className="text-[var(--accent)]" />
                    <span className="font-medium">{selected.name}</span>
                    <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-secondary)]">{selected.data?.method} {selected.data?.url}</span>
                  </div>
                  <div className="mt-3">
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
                    >
                      Open in Workspace <ArrowRight size={14} />
                    </Button>
                  </div>
                </div>
              ) : (selected.children && selected.children.length > 0) ? (
                <div className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
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
                <div className="rounded border border-dashed border-[var(--border)] bg-[var(--bg-secondary)] p-8 text-center">
                  <p className="text-sm text-[var(--text-secondary)]">This collection is empty.</p>
                  <p className="mx-auto mt-1 max-w-sm text-xs text-[var(--text-muted)]">Add requests from the Workspace or import an OpenAPI / Postman file. They will appear here grouped by folder.</p>
                </div>
              )}

              <p className="mt-3 text-xs text-[var(--text-muted)]">
                Tip: Requests open in the Workspace. Use <span className="rounded bg-[var(--bg-tertiary)] px-1 py-0.5 font-mono">Connection Flow</span> to visualise dependencies.
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
