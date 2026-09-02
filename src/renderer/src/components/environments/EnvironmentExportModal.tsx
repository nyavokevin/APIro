import { useState } from 'react';
import { Download, Lock, Eye, EyeOff } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import type { Environment, SecretExportMode } from '@shared/types/request';
import { api } from '../../services/api';
import { isTauri } from '../../services/tauri';

type Format = 'yaml'|'postman'|'dotenv'|'json'|'csv';

const FORMATS: { id: Format; label: string; desc: string }[] = [
  { id: 'yaml', label: 'APIForge YAML', desc: 'Native .env.yaml with metadata' },
  { id: 'postman', label: 'Postman JSON', desc: 'postman_environment.json' },
  { id: 'dotenv', label: 'Dotenv (.env)', desc: 'Flat KEY=VALUE' },
  { id: 'json', label: 'JSON Key-Value', desc: '{ variables: {...} }' },
  { id: 'csv', label: 'CSV', desc: 'key,value,type,enabled' },
];

export function EnvironmentExportModal({ open, onClose, env }: { open: boolean; onClose: () => void; env: Environment | null }) {
  const [format, setFormat] = useState<Format>('yaml');
  const [secretMode, setSecretMode] = useState<SecretExportMode>('encrypted');
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);

  // reset preview when env changes
  // eslint-disable-next-line react-hooks/rules-of-hooks
  if (!env) return null;

  const doPreview = async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.environmentsExport.export({ envId: env.id, format, secretMode });
      setPreview(res.content);
    } catch (e){ setError(e instanceof Error? e.message:String(e)); }
    finally{ setLoading(false); }
  };

  const doDownload = async () => {
    console.log('[export] click', { envId: env.id, format, secretMode });
    try {
      const r = await api.environmentsExport.export({ envId: env.id, format, secretMode });
      console.log('[export] got', r.filename, r.content?.slice(0,80));
      const content = r.content;
      const filename = r.filename;
      const canUseTauriFs = isTauri();
      if (canUseTauriFs) {
        try {
          const { writeTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
          await writeTextFile(filename, content, { baseDir: BaseDirectory.Download });
          setError(null);
          setPreview(content.slice(0,4000) + '\n\n— saved to Downloads/' + filename + ' —');
          return;
        } catch (e) {
          console.warn('[export] tauri write failed, fallback to blob', e);
        }
      }
      const mime = format==='yaml' ? 'text/yaml' : format==='json' || format==='postman' ? 'application/json' : format==='csv' ? 'text/csv' : 'text/plain';
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      console.log('[export] triggering download', filename, url);
      a.click();
      setTimeout(()=>{ a.remove(); URL.revokeObjectURL(url); }, 1500);
      setPreview(content.slice(0,4000));
      setError(null);
    } catch (e){
      console.error('[export] failed', e);
      setError(e instanceof Error? e.message:String(e));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Export "${env.name}"`} className="max-w-lg">
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          {env.color && <span className="h-3 w-3 rounded-full" style={{background:env.color}} />}
          <span className="font-medium text-[var(--text-primary)]">{env.name}</span>
          <span className="text-xs text-[var(--text-secondary)]">{env.variables.length} variables • {env.variables.filter(v=>v.type==='secret').length} secrets</span>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">Format</p>
          <div className="grid grid-cols-1 gap-1.5">
            {FORMATS.map(f=>(
              <button key={f.id} onClick={()=>{setFormat(f.id); setPreview(null);}} className={`flex items-center justify-between rounded border px-3 py-2 text-left ${format===f.id ? 'border-[var(--accent)] bg-[var(--accent-subtle)]' : 'border-[var(--border)] bg-[var(--bg-tertiary)] hover:border-[var(--border-strong)]'}`}>
                <div>
                  <div className="text-sm font-medium text-[var(--text-primary)]">{f.label}</div>
                  <div className="text-xs text-[var(--text-secondary)]">{f.desc}</div>
                </div>
                {format===f.id && <div className="h-2 w-2 rounded-full bg-[var(--accent)]" />}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">Secrets</p>
          <div className="flex gap-2">
            {(['encrypted','plaintext','omit'] as SecretExportMode[]).map(m=>(
              <button key={m} onClick={()=>{setSecretMode(m); setPreview(null);}} className={`flex-1 rounded border px-2 py-2 text-xs font-medium capitalize ${secretMode===m ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--text-primary)]' : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'}`}>
                <span className="flex items-center justify-center gap-1">{m==='encrypted'?<Lock size={12}/>:m==='plaintext'?<Eye size={12}/>:<EyeOff size={12}/>}{m}</span>
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-[var(--text-secondary)]">
            {secretMode==='encrypted' && 'Secrets = KEYRING_REF + .keyring séparé. Le plus sûr.'}
            {secretMode==='plaintext' && 'Valeurs en clair — avertissement affiché.'}
            {secretMode==='omit' && 'Secrets omis du fichier.'}
          </p>
          {format==='dotenv' && <p className="mt-1 rounded bg-warning/10 px-2 py-1 text-xs text-warning">.env ne supporte pas les types — valeurs en clair.</p>}
        </div>

        {preview && (
          <div className="rounded border border-[var(--border)] bg-[var(--bg-tertiary)] p-2">
            <div className="mb-1 flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>Preview</span><span className="font-mono">{format}</span>
            </div>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-[var(--text-primary)]">{preview.slice(0,4000)}{preview.length>4000?'…':''}</pre>
          </div>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" onClick={doPreview} disabled={loading}>{loading?'…':'Preview'}</Button>
          <Button variant="primary" onClick={doDownload}><Download size={14}/> Export to File</Button>
        </div>
      </div>
    </Modal>
  );
}
