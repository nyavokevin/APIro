import { useEffect, useState } from 'react';
import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import type { Environment, EnvironmentVariable, VariableType } from '@shared/types/request';

import { useEnvironmentStore } from '../../stores/environmentStore';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { uid } from '../../lib/id';

interface EnvironmentModalProps {
  open: boolean;
  onClose: () => void;
  environment?: Environment | null;
}

const TYPES: VariableType[] = ['string', 'number', 'secret', 'dynamic'];

function blankVar(): EnvironmentVariable {
  return { id: uid(), key: '', value: '', type: 'string', enabled: true, description: '' };
}

export function EnvironmentModal({ open, onClose, environment }: EnvironmentModalProps) {
  const [name, setName] = useState('');
  const [variables, setVariables] = useState<EnvironmentVariable[]>([]);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const createEnvironment = useEnvironmentStore((s) => s.createEnvironment);
  const updateEnvironment = useEnvironmentStore((s) => s.updateEnvironment);

  useEffect(() => {
    if (open) {
      setName(environment?.name ?? '');
      setVariables(environment?.variables ?? [blankVar()]);
      setRevealed({});
    }
  }, [open, environment]);

  const update = (id: string, patch: Partial<EnvironmentVariable>) =>
    setVariables((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)));

  const save = async () => {
    const cleaned = variables.filter((v) => v.key.trim());
    if (environment) {
      await updateEnvironment(environment.id, { name, variables: cleaned });
    } else {
      await createEnvironment(name, cleaned);
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={environment ? 'Edit Environment' : 'New Environment'}
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={!name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input
          autoFocus
          placeholder="Environment name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="grid grid-cols-[1fr_90px_1fr_28px] gap-2 px-1 text-[11px] font-medium uppercase tracking-widest" style={{ color: '#7A7F93', letterSpacing: '0.08em' }}>
          <span>Key</span>
          <span>Type</span>
          <span>Value</span>
          <span />
        </div>
        <div className="max-h-72 space-y-1.5 overflow-auto">
          {variables.map((v) => (
            <div key={v.id} className="grid grid-cols-[1fr_90px_1fr_28px] items-center gap-2">
              <Input
                value={v.key}
                placeholder="key"
                onChange={(e) => update(v.id, { key: e.target.value })}
              />
              <select
                value={v.type}
                onChange={(e) => update(v.id, { type: e.target.value as VariableType })}
                className="border bg-[#121215] px-2 py-1.5 text-xs outline-none hover:border-[#2E2E36] focus:border-[#8B5CF6] transition-colors"
                style={{ borderColor: '#232329', borderRadius: '0px', color: '#E6E8F0' }}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {v.type === 'secret' ? (
                <div className="flex items-center gap-1 border bg-[#121215] px-2 transition-colors hover:border-[#2E2E36] focus-within:border-[#8B5CF6]" style={{ borderColor: '#232329', borderRadius: '0px' }}>
                  <input
                    type={revealed[v.id] ? 'text' : 'password'}
                    value={v.value}
                    placeholder="value"
                    onChange={(e) => update(v.id, { value: e.target.value })}
                    className="w-full bg-transparent py-1.5 text-sm outline-none placeholder:text-[#5A5E6E]"
                    style={{ color: '#E6E8F0' }}
                  />
                  <button
                    type="button"
                    onClick={() => setRevealed((r) => ({ ...r, [v.id]: !r[v.id] }))}
                    className="p-1 hover:text-[#E6E8F0] transition-colors"
                    style={{ color: '#7A7F93', borderRadius: '0px' }}
                  >
                    {revealed[v.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              ) : (
                <Input
                  value={v.value}
                  placeholder="value"
                  onChange={(e) => update(v.id, { value: e.target.value })}
                />
              )}
              <button
                onClick={() => setVariables((vs) => vs.filter((x) => x.id !== v.id))}
                className="p-1 hover:text-[#EF4444] hover:bg-[rgba(239,68,68,0.10)] transition-colors"
                style={{ color: '#7A7F93', borderRadius: '0px' }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setVariables((vs) => [...vs, blankVar()])}
        >
          <Plus size={14} /> Add Variable
        </Button>
      </div>
    </Modal>
  );
}
