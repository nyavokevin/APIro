import { useId, useMemo } from 'react';
import { Plus, Trash2, Sparkles, Table2 } from 'lucide-react';
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

  const allEnabled = items.length > 0 && items.every((i) => i.enabled);
  const someEnabled = items.some((i) => i.enabled);
  const toggleAll = () => {
    const next = !allEnabled;
    onChange(items.map((i) => ({ ...i, enabled: next })));
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Header — sticky, subtle, letter-spaced */}
      <div
        className="sticky top-0 z-[1] grid grid-cols-[28px_1fr_1fr_36px] items-center gap-2 border-b bg-[#121215] px-1 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.06em]"
        style={{ borderColor: '#232329', color: '#7A7F93', letterSpacing: '0.06em' }}
      >
        <span className="flex items-center justify-center">
          <input
            type="checkbox"
            checked={allEnabled}
            ref={(el) => {
              if (el) el.indeterminate = !allEnabled && someEnabled;
            }}
            onChange={toggleAll}
            className="h-[14px] w-[14px] accent-[#8B5CF6] cursor-pointer rounded-none border border-[#232329] bg-[#0E0E10]"
            aria-label="Select all"
            title={allEnabled ? 'Deselect all' : 'Select all'}
          />
        </span>
        <span className="px-2 text-left normal-case tracking-[-0.01em] text-[12px] font-medium" style={{ color: '#9FA3B5' }}>
          {keyPlaceholder}
        </span>
        <span className="px-2 text-left normal-case tracking-[-0.01em] text-[12px] font-medium" style={{ color: '#9FA3B5' }}>
          {valuePlaceholder}
        </span>
        <span />
      </div>

      {/* Rows */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 border border-dashed bg-[#0E0E10]/60 px-6 py-9 text-center" style={{ borderColor: '#232329' }}>
          <div className="flex h-9 w-9 items-center justify-center border bg-[#121215] text-[#7A7F93]" style={{ borderColor: '#232329' }}>
            <Table2 size={16} strokeWidth={1.7} />
          </div>
          <div>
            <p className="text-[13px] font-medium tracking-[-0.01em]" style={{ color: '#E6E8F0' }}>
              No {keyPlaceholder.toLowerCase()}s yet
            </p>
            <p className="mt-1 max-w-[260px] text-xs leading-relaxed" style={{ color: '#7A7F93' }}>
              Add a row to send {keyPlaceholder.toLowerCase()}–{valuePlaceholder.toLowerCase()} pairs with this request.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={add}
            className="mt-1 gap-1.5 border-dashed bg-transparent hover:bg-[#16161A] hover:border-[#2E2E36] hover:text-[#E6E8F0]"
            style={{ borderStyle: 'dashed' }}
          >
            <Plus size={14} /> Add {keyPlaceholder.toLowerCase()}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-[6px]">
          {items.map((item) => (
            <div
              key={item.id}
              className="group grid grid-cols-[28px_1fr_1fr_36px] items-center gap-2 border bg-[#0E0E10] px-1.5 py-1.5 transition-all duration-200"
              style={{
                borderColor: '#232329',
                background: item.enabled ? '#0E0E10' : 'rgba(14,14,16,0.55)',
                opacity: item.enabled ? 1 : 0.72,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = '#2E2E36';
                (e.currentTarget as HTMLDivElement).style.background = '#16161A';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = '#232329';
                (e.currentTarget as HTMLDivElement).style.background = item.enabled ? '#0E0E10' : 'rgba(14,14,16,0.55)';
              }}
            >
              <span className="flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={item.enabled}
                  onChange={(e) => update(item.id, { enabled: e.target.checked })}
                  className="h-[14px] w-[14px] accent-[#8B5CF6] cursor-pointer rounded-none"
                  aria-label="Enabled"
                />
              </span>

              <input
                value={item.key}
                placeholder={keyPlaceholder}
                list={hasSuggestions ? listId : undefined}
                onChange={(e) => update(item.id, { key: e.target.value })}
                className="w-full border bg-[#121215] px-2.5 font-mono text-[13px] leading-none text-[#E6E8F0] placeholder:text-[#5A5E6E] outline-none transition-all duration-200 hover:border-[#2E2E36] focus:border-[#8B5CF6] focus:bg-[#0E0E10]"
                style={{
                  borderColor: '#232329',
                  borderRadius: '0px',
                  height: '32px',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#8B5CF6';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.10)';
                  const row = e.currentTarget.closest('.group') as HTMLElement | null;
                  if (row) row.style.borderColor = '#2E2E36';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#232329';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />

              <div className="flex items-center gap-1">
                <input
                  value={item.value}
                  placeholder={valuePlaceholder}
                  onChange={(e) => update(item.id, { value: e.target.value })}
                  className="w-full border bg-[#121215] px-2.5 font-mono text-[13px] leading-none text-[#E6E8F0] placeholder:text-[#5A5E6E] outline-none transition-all duration-200 hover:border-[#2E2E36] focus:border-[#8B5CF6] focus:bg-[#0E0E10] tabular-nums"
                  style={{
                    borderColor: '#232329',
                    borderRadius: '0px',
                    height: '32px',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#8B5CF6';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.10)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#232329';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <button
                  title="Generate random value — seed for this key (e.g. email → random email)"
                  aria-label={`Generate random value for ${item.key || 'field'}`}
                  onClick={async () => {
                    const { generateFieldValue } = await import('@main/services/seed-generator');
                    const v = generateFieldValue(item.key || 'value');
                    update(item.id, { value: v });
                    const { useNotificationStore } = await import('../../stores/notificationStore');
                    useNotificationStore.getState().addToast({ variant: 'info', title: 'Seeded', description: `${item.key || 'field'} → ${v}` });
                  }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center border bg-[#121215] text-[#7A7F93] transition-all duration-200 hover:border-[#8B5CF6] hover:bg-[rgba(139,92,246,0.10)] hover:text-[#8B5CF6] active:scale-[0.96]"
                  style={{ borderColor: '#232329', borderRadius: '0px' }}
                >
                  <Sparkles size={13} strokeWidth={1.9} aria-hidden />
                </button>
              </div>

              <button
                onClick={() => remove(item.id)}
                className="flex h-8 w-8 items-center justify-center border border-transparent bg-transparent text-[#7A7F93] transition-all duration-200 hover:border-[rgba(239,68,68,0.22)] hover:bg-[rgba(239,68,68,0.10)] hover:text-[#EF4444] active:scale-[0.96]"
                aria-label="Remove row"
                title="Remove row"
                style={{ borderRadius: '0px' }}
              >
                <Trash2 size={14} strokeWidth={1.8} />
              </button>
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <div className="flex items-center gap-2 pt-1">
          <Button
            variant="secondary"
            onClick={add}
            size="sm"
            className="gap-1.5 border-dashed bg-transparent text-[#9FA3B5] hover:border-[#8B5CF6] hover:bg-[rgba(139,92,246,0.08)] hover:text-[#8B5CF6]"
            style={{ borderStyle: 'dashed', borderColor: '#2E2E36' }}
          >
            <Plus size={14} strokeWidth={2} /> Add {keyPlaceholder.toLowerCase()}
          </Button>
          <span className="text-xs tabular-nums" style={{ color: '#5A5E6E' }}>
            {items.filter((i) => i.enabled && i.key).length} active · {items.length} total
          </span>
        </div>
      )}

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
