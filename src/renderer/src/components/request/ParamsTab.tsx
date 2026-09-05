import type { RequestData, KeyValuePair } from '@shared/types/request';
import { buildUrlFromParams } from '../../lib/urlParams';
import { KeyValueEditor } from '../ui/KeyValueEditor';

interface ParamsTabProps {
  request: RequestData;
  onChange: (patch: Partial<RequestData>) => void;
}

export function ParamsTab({ request, onChange }: ParamsTabProps) {
  const handleParamsChange = (params: KeyValuePair[]) => {
    // Auto-sync: enabled, non-empty params are reflected back into the
    // URL's query string so both views always stay in step.
    const newUrl = buildUrlFromParams(request.url, params);
    onChange({ params, url: newUrl });
  };

  const activeCount = request.params.filter((p) => p.enabled && p.key).length;

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Meta bar — type pill + count */}
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 border bg-[#121215] px-2 py-1 text-[11px] font-medium tracking-[-0.01em] text-[#9FA3B5]"
          style={{ borderColor: '#232329', letterSpacing: '-0.01em' }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#8B5CF6]" aria-hidden />
          Query Params
        </span>
        <span
          className="inline-flex items-center rounded-full bg-[#0E0E10] px-2 py-0.5 text-xs font-medium tabular-nums"
          style={{ border: '1px solid #232329', color: activeCount ? '#E6E8F0' : '#7A7F93' }}
        >
          {activeCount} active
        </span>
        <span className="text-xs tabular-nums" style={{ color: '#5A5E6E' }}>
          · {request.params.length} total
        </span>
        <span className="ml-auto hidden text-xs sm:inline" style={{ color: '#5A5E6E' }}>
          Syncs to URL query
        </span>
      </div>

      <KeyValueEditor
        items={request.params}
        onChange={handleParamsChange}
        keyPlaceholder="Parameter"
        valuePlaceholder="Value"
      />
    </div>
  );
}
