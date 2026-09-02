import { useId, useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { KeyValuePair } from '@shared/types/request';
import { Button } from './Button';
import { uid } from '../../lib/id';

interface KeyValueEditorProps {
  items: KeyValuePair[];
  onChange: (items: KeyValuePair[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  /** Known key names offered as autocomplete suggestions on the key input. */
  keySuggestions?: string[];
}

export function KeyValueEditor({
  items,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  keySuggestions,
}: KeyValueEditorProps) {
  const listId = useId();
  const suggestions = useMemo(
    () => Array.from(new Set(keySuggestions ?? [])).sort((a, b) => a.localeCompare(b)),
    [keySuggestions]
  );
  const hasSuggestions = suggestions.length > 0;
  const update = (id: string, patch: Partial<KeyValuePair>) => {
    onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const add = () => {
    onChange([...items, { id: uid(), key: '', value: '', enabled: true }]);
  };

  const remove = (id: string) => {
    onChange(items.filter((i) => i.id !== id));
  };

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[24px_1fr_1fr_32px] gap-2 px-1 text-xs text-[var(--text-secondary)]">
        <span />
        <span>{keyPlaceholder}</span>
        <span>{valuePlaceholder}</span>
        <span />
      </div>
      {items.map((item) => (
        <div key={item.id} className="grid grid-cols-[24px_1fr_1fr_32px] items-center gap-2">
          <input
            type="checkbox"
            checked={item.enabled}
            onChange={(e) => update(item.id, { enabled: e.target.checked })}
            className="h-4 w-4 accent-[var(--accent)]"
            aria-label="Enabled"
          />
          <input
            value={item.key}
            placeholder={keyPlaceholder}
            list={hasSuggestions ? listId : undefined}
            onChange={(e) => update(item.id, { key: e.target.value })}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
          <input
            value={item.value}
            placeholder={valuePlaceholder}
            onChange={(e) => update(item.id, { value: e.target.value })}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
          <button
            onClick={() => remove(item.id)}
            className="flex h-7 w-7 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-danger"
            aria-label="Remove row"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <Button variant="ghost" onClick={add} className="mt-1">
        <Plus size={14} /> Add
      </Button>
      {hasSuggestions && (
        <datalist id={listId}>
          {suggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      )}
    </div>
  );
}
