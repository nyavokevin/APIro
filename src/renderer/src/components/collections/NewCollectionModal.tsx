import { useState } from 'react';

import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { useCollectionStore } from '../../stores/collectionStore';
import type { RequestData } from '@shared/types/request';
import { createEmptyRequest } from '../../lib/request';

interface NewCollectionModalProps {
  open: boolean;
  onClose: () => void;
  parentId?: string;
  defaultType?: 'folder' | 'request';
}

export function NewCollectionModal({
  open,
  onClose,
  parentId,
  defaultType = 'folder',
}: NewCollectionModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'folder' | 'request'>(defaultType);
  const createCollection = useCollectionStore((s) => s.createCollection);

  const reset = () => {
    setName('');
    setType(defaultType);
  };

  const submit = async () => {
    if (!name.trim()) return;
    const data: RequestData | undefined =
      type === 'request' ? { ...createEmptyRequest(name), name } : undefined;
    await createCollection({ name, type, parentId, data });
    reset();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={parentId ? 'New Item' : 'New Collection'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim()}>
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          {(['folder', 'request'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium capitalize ${
                type === t ? 'border-accent bg-accent-subtle text-content' : 'border-border text-muted'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <Input
          autoFocus
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </div>
    </Modal>
  );
}
