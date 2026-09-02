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
        <span className="flex flex-col">
          <span className="font-medium">{preset.name}</span>
          {preset.description && (
            <span className="text-xs text-[var(--text-secondary)]">{preset.description}</span>
          )}
        </span>
      ),
    })),
  }));

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center gap-2">
        <Dropdown
          trigger={
            <Button variant="ghost" size="sm">
              <ListPlus size={14} /> Presets
            </Button>
          }
          groups={presetGroups}
          className="max-h-[320px] overflow-auto"
        />

        <Button variant="ghost" size="sm" onClick={() => setShowHidden((s) => !s)}>
          {showHidden ? <EyeOff size={14} /> : <Eye size={14} />}
          {autoHeaders.length} hidden headers
        </Button>

        <span className="text-xs text-[var(--text-secondary)]">
          {request.headers.filter((h) => h.enabled && h.key).length} active
        </span>
      </div>

      <KeyValueEditor
        items={request.headers}
        onChange={(headers) => onChange({ headers })}
        keyPlaceholder="Header"
        valuePlaceholder="Value"
        keySuggestions={ALL_HEADER_NAMES}
      />

      {showHidden && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-semibold text-[var(--text-secondary)]">
            Auto-generated — added at send time unless overridden above
          </div>
          <div className="space-y-1">
            {autoHeaders.map((h) => (
              <div
                key={h.id}
                className="grid grid-cols-[1fr_1fr] items-start gap-2 rounded border border-dashed border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1"
              >
                <span className="text-sm font-medium text-[var(--text-secondary)]">{h.key}</span>
                <span className="text-sm text-[var(--text-secondary)]">
                  {h.value}
                  {h.description && (
                    <span className="block text-xs text-[var(--text-secondary)] opacity-70">
                      {h.description}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
