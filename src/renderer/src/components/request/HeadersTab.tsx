import { useState } from 'react';
import { Eye, EyeOff, ListPlus } from 'lucide-react';
import type { KeyValuePair, RequestData } from '@shared/types/request';
import { ALL_HEADER_NAMES, HEADER_CATEGORIES } from '@shared/constants/headers';
import { computeAutoHeaders } from '@shared/lib/auto-headers';
import { genId } from '@shared/lib/id';
import { KeyValueEditor } from '../ui/KeyValueEditor';
import { Dropdown } from '../ui/Dropdown';
import { Button } from '../ui/Button';

interface HeadersTabProps {
  request: RequestData;
  onChange: (patch: Partial<RequestData>) => void;
}

export function HeadersTab({ request, onChange }: HeadersTabProps) {
  const [showHidden, setShowHidden] = useState(false);

  // Auto-generated headers that will be added at send time (user rows win).
  const autoHeaders = computeAutoHeaders(request);

  const addPreset = (name: string, example?: string) => {
    const row: KeyValuePair = { id: genId(), key: name, value: example ?? '', enabled: true };
    onChange({ headers: [...request.headers, row] });
  };

  const presetGroups = HEADER_CATEGORIES.map((category) => ({
    label: category.name,
    items: category.headers.map((preset) => ({
      value: preset.name,
      onSelect: () => addPreset(preset.name, preset.example),
      label: (
        <span className="flex flex-col gap-0.5">
          <span className="text-[13px] font-medium tracking-[-0.01em] text-[#E6E8F0]">{preset.name}</span>
          {preset.description && (
            <span className="text-xs leading-snug text-[#7A7F93]">{preset.description}</span>
          )}
        </span>
      ),
    })),
  }));

  const activeCount = request.headers.filter((h) => h.enabled && h.key).length;

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Toolbar — presets + hidden toggle + counts */}
      <div className="flex flex-wrap items-center gap-2">
        <Dropdown
          trigger={
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5 bg-[#0E0E10] hover:bg-[#16161A] hover:border-[#2E2E36]"
              style={{ borderColor: '#232329' }}
            >
              <ListPlus size={14} strokeWidth={1.9} /> Presets
            </Button>
          }
          groups={presetGroups}
          className="max-h-[360px] overflow-auto"
        />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowHidden((s) => !s)}
          className="gap-1.5 hover:bg-[#16161A] hover:text-[#E6E8F0]"
          style={{ borderColor: 'transparent' }}
        >
          {showHidden ? <EyeOff size={14} strokeWidth={1.9} /> : <Eye size={14} strokeWidth={1.9} />}
          {autoHeaders.length} hidden
        </Button>

        <span
          className="ml-auto inline-flex items-center gap-2 text-xs tabular-nums"
          style={{ color: '#5A5E6E' }}
        >
          <span
            className="inline-flex items-center rounded-full bg-[#0E0E10] px-2 py-0.5 text-xs font-medium"
            style={{ border: '1px solid #232329', color: activeCount ? '#E6E8F0' : '#7A7F93' }}
          >
            {activeCount} active
          </span>
          · {request.headers.length} total
        </span>
      </div>

      {/* Subtle divider */}
      <div className="h-px w-full" style={{ background: '#232329' }} aria-hidden />

      <KeyValueEditor
        items={request.headers}
        onChange={(headers) => onChange({ headers })}
        keyPlaceholder="Header"
        valuePlaceholder="Value"
        keySuggestions={ALL_HEADER_NAMES}
      />

      {showHidden && (
        <div className="mt-1 flex flex-col gap-2 border-t pt-3" style={{ borderColor: '#232329' }}>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#7A7F93]" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-[0.06em]" style={{ color: '#9FA3B5', letterSpacing: '0.06em' }}>
              Auto-generated
            </span>
            <span className="text-xs" style={{ color: '#5A5E6E' }}>
              added at send time unless overridden
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {autoHeaders.length === 0 ? (
              <p className="border border-dashed bg-[#0E0E10]/50 px-3 py-3 text-center text-xs" style={{ borderColor: '#232329', color: '#7A7F93' }}>
                No auto headers for this request.
              </p>
            ) : (
              autoHeaders.map((h) => (
                <div
                  key={h.id}
                  className="grid grid-cols-[1fr_1fr] items-start gap-3 border border-dashed bg-[#0E0E10] px-3 py-2 transition-colors hover:border-[#2E2E36] hover:bg-[#121215]"
                  style={{ borderColor: '#232329' }}
                >
                  <span className="font-mono text-[13px] font-medium tracking-[-0.01em] text-[#9FA3B5]">{h.key}</span>
                  <span className="font-mono text-[13px] tabular-nums text-[#7A7F93]">
                    {h.value}
                    {h.description && (
                      <span className="mt-1 block font-sans text-xs leading-snug text-[#5A5E6E]">{h.description}</span>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
