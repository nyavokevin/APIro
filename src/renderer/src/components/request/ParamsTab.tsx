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

  return (
    <div className="p-3">
      <KeyValueEditor
        items={request.params}
        onChange={handleParamsChange}
        keyPlaceholder="Parameter"
        valuePlaceholder="Value"
      />
    </div>
  );
}
