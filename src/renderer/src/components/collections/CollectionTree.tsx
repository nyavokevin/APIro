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
    return <p className="px-2 text-xs text-[var(--text-secondary)]">No collections yet.</p>;
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
    <ul className="space-y-0.5">
      {nodes.map((node) => (
        <TreeItem key={node.id} node={node} depth={0} onRemove={remove} onUpdate={update} onOpen={openById} />
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
        className="group flex items-center gap-1 rounded px-1 py-1 text-sm hover:bg-[var(--bg-tertiary)]"
        style={{ paddingLeft: depth * 12 + 4 }}
      >
        {hasChildren ? (
          <button onClick={() => setOpen(!open)} className="text-[var(--text-secondary)]">
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-3.5" />
        )}

        {isRequest ? (
          <FileCode size={14} className="text-[var(--accent)]" />
        ) : (
          <Folder size={14} className="text-[var(--text-secondary)]" />
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
            className="min-w-0 flex-1 rounded border border-[var(--accent)] bg-[var(--bg-primary)] px-1 py-0.5 text-sm text-[var(--text-primary)] outline-none"
            aria-label="Rename"
          />
        ) : (
          <button
            className="flex-1 truncate text-left text-[var(--text-primary)]"
            onClick={() => (isRequest ? onOpen(node.id) : setOpen(!open))}
            onDoubleClick={startRenaming}
            title={isRequest ? 'Open in a workspace tab (double-click to rename)' : 'Double-click to rename'}
          >
            {node.name}
          </button>
        )}

        <button
          onClick={startRenaming}
          className="text-[var(--text-secondary)] opacity-0 hover:text-[var(--accent)] group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
          aria-label="Rename"
          title="Rename"
        >
          <Pencil size={13} />
        </button>

        {/* Open every request in this collection as its own workspace tab. */}
        {!isRequest && requestCount > 0 && (
          <button
            onClick={() => {
              for (const r of collectRequests(node)) onOpen(r.id);
            }}
            className="text-[var(--text-secondary)] opacity-0 hover:text-[var(--accent)] group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
            aria-label={`Open all ${requestCount} request(s)`}
            title={`Open all ${requestCount} request(s) in tabs`}
          >
            <FolderOpen size={13} />
          </button>
        )}

        {!isRequest && (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-[var(--text-secondary)] opacity-0 hover:text-danger group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
            aria-label="Delete"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {hasChildren && open && (
        <ul className="space-y-0.5">
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
        <p className="text-sm text-[var(--text-primary)]">
          Delete “{node.name}”{requestCount > 0 ? ` and its ${requestCount} request(s)` : ''}?
        </p>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">This cannot be undone.</p>
      </Modal>
    </li>
  );
}
