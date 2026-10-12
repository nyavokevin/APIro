import { useState } from 'react';

import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { useCollectionStore } from '../../stores/collectionStore';
import type { RequestData } from '@shared/types/request';
import { createEmptyRequest } from '../../lib/request';
import { useTierGate } from '../../hooks/useTierGate';
import { TierLimitBanner } from '../license/TierLimitBanner';
import { useGateToast } from '../../hooks/useGateToast';

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
  const { checkGate } = useTierGate();
  const showGateToast = useGateToast();
  const [gateDenied, setGateDenied] = useState<import('../../hooks/useTierGate').GateResult | null>(null);

  const reset = () => {
    setName('');
    setType(defaultType);
    setGateDenied(null);
  };

  const submit = async () => {
    if (!name.trim()) return;
    // Only gate top-level collections (parentId == null) — subfolders/requests inside a collection don't count
    if (!parentId) {
      const result = await checkGate('CreateCollection');
      if (result.type === 'Denied') {
        setGateDenied(result);
        showGateToast(result);
        return;
      }
    }
    const data: RequestData | undefined =
      type === 'request' ? { ...createEmptyRequest(name), name } : undefined;
    try {
      await createCollection({ name, type, parentId, data });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes('Free plan allows') || msg.includes('collections')) {
        // Backend guard denied — construct a denied result for banner
        const fallback: import('../../hooks/useTierGate').GateResult = {
          type: 'Denied',
          reason: { type: 'collectionLimitReached', current: 3, max: 3 },
          currentTier: 'free',
          upgradeHint: 'Upgrade to Pro for unlimited collections',
        };
        setGateDenied(fallback);
        showGateToast(fallback as any);
        return;
      }
      throw e;
    }
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
        {gateDenied && gateDenied.type === 'Denied' && (
          <TierLimitBanner result={gateDenied} onDismiss={() => setGateDenied(null)} />
        )}
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
