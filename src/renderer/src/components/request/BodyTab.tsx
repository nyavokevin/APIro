import { useState } from 'react';
import { Dices } from 'lucide-react';
import type { RequestBodyType, RequestData } from '@shared/types/request';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { CodeEditor } from '../ui/CodeEditor';

interface BodyTabProps {
  request: RequestData;
  onChange: (patch: Partial<RequestData>) => void;
}

const BODY_TYPES: RequestBodyType[] = [
  'none',
  'json',
  'xml',
  'text',
  'form-data',
  'urlencoded',
  'graphql',
];

export function BodyTab({ request, onChange }: BodyTabProps) {
  const [seeding, setSeeding] = useState(false);

  const seedBody = async () => {
    if (!request.body) return;
    setSeeding(true);
    try {
      const generated = await api.seed.bulk(request.body);
      onChange({ body: generated });
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-2 flex items-center gap-2">
        <select
          value={request.bodyType}
          onChange={(e) => onChange({ bodyType: e.target.value as RequestBodyType })}
          className="rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1 text-sm outline-none focus:border-[var(--accent)]"
          aria-label="Body type"
        >
          {BODY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {request.bodyType !== 'none' && (
          <Button variant="ghost" onClick={seedBody} disabled={seeding}>
            <Dices size={14} /> {seeding ? 'Seeding…' : 'Seed'}
          </Button>
        )}
      </div>
      {request.bodyType !== 'none' ? (
        <CodeEditor
          value={request.body}
          onChange={(body) => onChange({ body })}
          placeholder={
            request.bodyType === 'graphql'
              ? '{ "query": "" }'
              : request.bodyType === 'json'
                ? '{ }'
                : ''
          }
          className="flex-1"
        />
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">This request has no body.</p>
      )}
    </div>
  );
}
