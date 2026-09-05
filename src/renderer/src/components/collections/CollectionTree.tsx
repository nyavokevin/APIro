import { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileCode, Trash2, Pencil } from 'lucide-react';
import type { Collection } from '@shared/types/request';
import { useCollectionStore } from '../../stores/collectionStore';
import { useRequestStore } from '../../stores/requestStore';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

/** Depth-first list of every request node in a subtree (in display order). */
function collectRequests(node: Collection): Collection[] {
  const out: Collection[] = [];
  const walk = (n: Collection) => {
    if (n.type === 'request') out.push(n);
    for (const c of n.children ?? []) walk(c);
  };
  walk(node);
  return out;
}

interface CollectionTreeProps {
  nodes: Collection[];
  onOpenRequest?: (id: string) => void;
}

export function CollectionTree({ nodes, onOpenRequest }: CollectionTreeProps) {
  const remove = useCollectionStore((s) => s.remove);
  const update = useCollectionStore((s) => s.update);
  const openRequest = useRequestStore((s) => s.openRequest);

  if (nodes.length === 0) {
    return (
      <div className="border border-dashed border-[#232329] bg-[#0E0E10] px-3 py-6 text-center">
        <p className="text-[13px] font-medium tracking-[-0.02em] text-[#9FA3B5]">No collections yet</p>
        <p className="mt-1 text-xs tracking-[-0.01em] text-[#7A7F93]">Create a folder or import a collection — requests will appear here.</p>
      </div>
    );
  }

  const openById = (id: string) => {
    if (onOpenRequest) {
      onOpenRequest(id);
    } else {
      const req = useCollectionStore.getState().getById(id)?.data;
      if (req) openRequest(req);
    }
  };

  return (
    <ul className="space-y-1">
      {nodes.map((node, idx) => (
        <li
          key={node.id}
          className="animate-fadeUp"
          style={{ animationDelay: `${idx * 32}ms`, animationFillMode: 'both' }}
        >
          <TreeItem node={node} depth={0} onRemove={remove} onUpdate={update} onOpen={openById} />
        </li>
      ))}
    </ul>
  );
}

interface TreeItemProps {
  node: Collection;
  depth: number;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Collection>) => void;
  onOpen: (id: string) => void;
}

function TreeItem({ node, depth, onRemove, onUpdate, onOpen }: TreeItemProps) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const hasChildren = !!node.children && node.children.length > 0;
  const isRequest = node.type === 'request';
  const requestCount = isRequest ? 0 : collectRequests(node).length;
  const method = isRequest ? (node.data?.method as string | undefined) : undefined;

  const startRenaming = () => {
    setDraft(node.name);
    setRenaming(true);
  };

  const commitRename = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== node.name) {
      onUpdate(node.id, { name: trimmed, ...(isRequest && node.data ? { data: { ...node.data, name: trimmed } } : {}) });
      const tab = useRequestStore.getState().tabs.find((t) => t.id === node.id);
      if (isRequest && tab) useRequestStore.getState().updateRequest(node.id, { name: trimmed });
    }
    setRenaming(false);
  };

  return (
    <li>
      <div
        className="group flex items-center gap-1.5 border border-transparent px-1 py-1 text-[13px] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] hover:border-[#2E2E36] hover:bg-[#121215] hover:shadow-[0_1px_3px_rgba(0,0,0,0.4)] focus-within:border-[#2E2E36] focus-within:bg-[#121215]"
        style={{ paddingLeft: depth * 14 + 6, borderRadius: '0px' }}
      >
        {hasChildren ? (
          <button
            onClick={() => setOpen(!open)}
            className="flex h-5 w-5 shrink-0 items-center justify-center border border-transparent text-[#7A7F93] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-[#232329] hover:bg-[#0E0E10] hover:text-[#E6E8F0] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.35)]"
            style={{ borderRadius: '0px' }}
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            {open ? <ChevronDown size={13} strokeWidth={2} /> : <ChevronRight size={13} strokeWidth={2} />}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}

        {isRequest ? (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center border border-[rgba(139,92,246,0.14)] bg-[rgba(139,92,246,0.08)] text-[#8B5CF6]">
            <FileCode size={12} strokeWidth={1.75} />
          </span>
        ) : (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center border border-[#232329] bg-[#0E0E10] text-[#7A7F93] group-hover:border-[#2E2E36] group-hover:text-[#9FA3B5]">
            <Folder size={12} strokeWidth={1.75} />
          </span>
        )}

        {isRequest && method && (
          <span className="hidden shrink-0 border border-[#232329] bg-[#070709] px-1 py-0.5 font-mono text-[10px] tabular-nums leading-none tracking-wide text-[#9FA3B5] sm:inline-flex">
            {method}
          </span>
        )}

        {!isRequest && requestCount > 0 && (
          <span className="hidden shrink-0 border border-[#232329] bg-[#070709] px-1 py-0.5 font-mono text-[10px] tabular-nums leading-none tracking-[-0.01em] text-[#7A7F93] sm:inline-flex">
            {requestCount}
          </span>
        )}

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
              if (e.key === 'Escape') setRenaming(false);
            }}
            className="min-w-0 flex-1 border border-[#8B5CF6] bg-[#070709] px-2 py-1 text-[13px] tracking-[-0.02em] text-[#E6E8F0] tabular-nums outline-none placeholder:text-[#5A5E6E] focus:shadow-[0_0_0_3px_rgba(139,92,246,0.12)]"
            style={{ borderRadius: '0px' }}
            aria-label="Rename"
          />
        ) : (
          <button
            className="min-w-0 flex-1 truncate text-left tracking-[-0.02em] text-[#E6E8F0] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.35)] focus-visible:ring-offset-0"
            onClick={() => (isRequest ? onOpen(node.id) : setOpen(!open))}
            onDoubleClick={startRenaming}
            title={isRequest ? 'Open in a workspace tab (double-click to rename)' : 'Double-click to rename'}
          >
            <span className="truncate font-[450]">{node.name}</span>
            {isRequest && node.data?.url && <span className="ml-1.5 hidden font-mono text-[11px] tabular-nums tracking-[-0.01em] text-[#5A5E6E] lg:inline">{String(node.data.url).slice(0, 44)}</span>}
          </button>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <button
            onClick={startRenaming}
            className="flex h-6 w-6 items-center justify-center border border-transparent text-[#5A5E6E] opacity-0 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-[#232329] hover:bg-[#0E0E10] hover:text-[#E6E8F0] hover:shadow-[0_1px_2px_rgba(0,0,0,0.3)] active:scale-[0.98] group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.35)]"
            aria-label="Rename"
            title="Rename"
            style={{ borderRadius: '0px' }}
          >
            <Pencil size={12} strokeWidth={1.75} />
          </button>

          {/* Open every request in this collection as its own workspace tab. */}
          {!isRequest && requestCount > 0 && (
            <button
              onClick={() => {
                for (const r of collectRequests(node)) onOpen(r.id);
              }}
              className="flex h-6 w-6 items-center justify-center border border-transparent text-[#5A5E6E] opacity-0 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-[#232329] hover:bg-[#0E0E10] hover:text-[#8B5CF6] active:scale-[0.98] group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.35)]"
              aria-label={`Open all ${requestCount} request(s)`}
              title={`Open all ${requestCount} request(s) in tabs`}
              style={{ borderRadius: '0px' }}
            >
              <FolderOpen size={12} strokeWidth={1.75} />
            </button>
          )}

          {!isRequest && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex h-6 w-6 items-center justify-center border border-transparent text-[#5A5E6E] opacity-0 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-[rgba(239,68,68,0.2)] hover:bg-[rgba(239,68,68,0.10)] hover:text-[#EF4444] active:scale-[0.98] group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(239,68,68,0.35)]"
              aria-label="Delete"
              style={{ borderRadius: '0px' }}
            >
              <Trash2 size={12} strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      {hasChildren && open && (
        <ul className="mt-1 space-y-1 border-l border-[#1E1E24] pl-2" style={{ marginLeft: depth * 14 + 14 }}>
          {node.children!.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              onRemove={onRemove}
              onUpdate={onUpdate}
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete collection"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmDelete(false);
                void onRemove(node.id);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm tracking-[-0.01em] text-[#E6E8F0]">
          Delete “{node.name}”{requestCount > 0 ? ` and its ${requestCount} request(s)` : ''}?
        </p>
        <p className="mt-1.5 text-xs tracking-[-0.01em] text-[#9FA3B5]">This cannot be undone.</p>
      </Modal>
    </li>
  );
}
