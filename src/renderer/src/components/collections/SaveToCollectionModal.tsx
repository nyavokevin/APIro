import { useEffect, useState } from 'react';
import type { RequestData } from '@shared/types/request';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { useCollectionStore } from '../../stores/collectionStore';
import { useRequestStore } from '../../stores/requestStore';

interface SaveToCollectionModalProps {
  open: boolean;
  onClose: () => void;
  /** The active request to save into the new collection. */
  request: RequestData | null;
}

/**
 * Creates a new collection and saves the active request as a request item
 * inside it. Both the collection and the request are named in the modal.
 */
export function SaveToCollectionModal({ open, onClose, request }: SaveToCollectionModalProps) {
  const [collectionName, setCollectionName] = useState('');
  const [requestName, setRequestName] = useState('');
  const [saving, setSaving] = useState(false);
  const create = useCollectionStore((s) => s.create);
  const updateRequest = useRequestStore((s) => s.updateRequest);

  // Re-seed the form each time the modal opens for a given request.
  useEffect(() => {
    if (open && request) {
      setRequestName(request.name);
      setCollectionName('');
    }
  }, [open, request]);

  const canSave = Boolean(open && request && !saving && collectionName.trim() && requestName.trim());

  const submit = async () => {
    if (!canSave || !request) return;
    setSaving(true);
    try {
      const name = requestName.trim();
      const collection = await create({ name: collectionName.trim(), type: 'folder' });
      await create({
        name,
        type: 'request',
        parentId: collection.id,
        data: { ...request, name },
      });
      // Keep the tab label in sync with the saved request name.
      updateRequest(request.id, { name });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Save to new collection"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={!canSave}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input
          label="Collection name"
          autoFocus
          placeholder="e.g. My API"
          value={collectionName}
          onChange={(e) => setCollectionName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
        />
        <Input
          label="Request name"
          placeholder="Request name"
          value={requestName}
          onChange={(e) => setRequestName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
        />
        <p className="text-xs text-[var(--text-secondary)]">
          Creates a new collection containing this request ({request?.method}{' '}
          {request?.url || '— no URL yet'}).
        </p>
      </div>
    </Modal>
  );
}