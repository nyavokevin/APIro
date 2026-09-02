import { useState, useRef, useCallback } from 'react';
import { Upload, FileJson, Clipboard, AlertTriangle, Lock, Sparkles } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { api } from '../../services/api';
import { parseEnvironment, detectEnvFormat } from '@main/services/environment-parsers';
import type { Environment } from '@shared/types/request';

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

type Detected = { format: string; env: Environment | Environment[]; secrets: number };

export function EnvironmentImportModal({ open, onClose, onImported }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [raw, setRaw] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | undefined>();
  const [detected, setDetected] = useState<Detected | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paste, setPaste] = useState('');
  const [encrypt, setEncrypt] = useState(true);
  const [autoDetect, setAutoDetect] = useState(true);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const analyze = useCallback((content: string, name?: string) => {
    setRaw(content);
    setFilename(name);
    setError(null);
    try {
      const fmt = detectEnvFormat(content, name);
      const parsed = parseEnvironment(content, fmt as any, name);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      const secrets = arr.reduce((acc: number, e: Environment) => acc + e.variables.filter((v) => v.type === 'secret').length, 0);
      // store first for preview, but keep all for import
      setDetected({ format: fmt, env: parsed, secrets });
    } catch (e) {
      setDetected(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const onFile = async (f: File) => {
    const text = await f.text();
    analyze(text, f.name);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) void onFile(f);
  };

  const doImport = async () => {
    if (!raw) return;
    setImporting(true);
    try {
      // For openapi which yields multiple envs, import each
      const fmt = detected?.format;
      if (fmt === 'openapi' && Array.isArray(detected?.env)) {
        for (const env of detected.env as Environment[]) {
          await api.environments.create({ name: env.name, variables: env.variables, color: env.color, description: env.description });
        }
      } else {
        await api.environmentsImport.importRaw({ content: raw, filename, encryptSecrets: encrypt });
      }
      onImported();
      setRaw(null); setDetected(null); setError(null); setPaste('');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setImporting(false); }
  };

  const handlePasteImport = () => {
    if (!paste.trim()) return;
    analyze(paste, 'clipboard.txt');
  };

  if (!open) return null;

  const hasContent = !!raw;
  const previewEnvs: Environment[] = detected ? (Array.isArray(detected.env) ? detected.env as Environment[] : [detected.env as Environment]) : [];

  return (
    <Modal open={open} onClose={onClose} title="Import Environment" className="max-w-xl">
      <div className="space-y-4">
        {/* Drop zone */}
        <div
          onDragOver={e=>{e.preventDefault(); setDragOver(true);}}
          onDragLeave={()=>setDragOver(false)}
          onDrop={onDrop}
          onClick={()=>fileRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-6 py-8 text-center transition-colors ${dragOver ? 'border-[var(--accent)] bg-[var(--accent-subtle)]' : 'border-[var(--border)] bg-[var(--bg-tertiary)] hover:border-[var(--border-strong)]'}`}
        >
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded bg-[var(--bg-secondary)] text-[var(--accent)]">
            <Upload size={20} />
          </div>
          <p className="text-sm font-medium text-[var(--text-primary)]">Drag & drop or click to browse</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Supported: .env, .json, .yaml, .csv, Postman, Insomnia</p>
          <div className="mt-3 flex gap-1.5">
            {['Postman','Insomnia','.env','OpenAPI','CSV'].map(f=>(
              <span key={f} className="rounded bg-[var(--bg-secondary)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">{f}</span>
            ))}
          </div>
          <input ref={fileRef} type="file" accept=".env,.json,.yaml,.yml,.csv,.txt" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if(f) void onFile(f); e.currentTarget.value=''; }} />
        </div>

        {/* Paste */}
        <div className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
            <Clipboard size={14} className="text-[var(--text-secondary)]" /> Paste from clipboard
          </div>
          <textarea value={paste} onChange={e=>setPaste(e.target.value)} placeholder="Paste JSON, YAML or .env content here..." className="min-h-[72px] w-full resize-none rounded border border-[var(--border)] bg-[var(--bg-tertiary)] p-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="secondary" onClick={handlePasteImport} disabled={!paste.trim()}>
              Detect
            </Button>
          </div>
        </div>

        {/* Detected preview */}
        {error && (
          <div className="flex gap-2 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            <AlertTriangle size={16} className="shrink-0" /> <span>{error}</span>
          </div>
        )}

        {detected && previewEnvs.length>0 && (
          <div className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
            <div className="mb-2 flex items-center gap-2">
              <FileJson size={14} className="text-[var(--accent)]" />
              <span className="text-sm font-medium text-[var(--text-primary)]">Detected: {detected.format}</span>
              <span className="text-xs text-[var(--text-secondary)]">• {previewEnvs.length} environment(s)</span>
            </div>
            {previewEnvs.map(env=>(
              <div key={env.id} className="mb-2 flex items-center justify-between rounded bg-[var(--bg-tertiary)] px-3 py-2 last:mb-0">
                <div className="flex items-center gap-2">
                  {env.color && <span className="h-3 w-3 rounded-full" style={{background: env.color}} />}
                  <span className="text-sm font-medium text-[var(--text-primary)]">{env.name}</span>
                  <span className="text-xs text-[var(--text-secondary)]">{env.variables.length} variables</span>
                </div>
                {env.variables.some((v) =>v.type==='secret') && <span className="flex items-center gap-1 text-xs text-warning"><Lock size={12}/> secrets</span>}
              </div>
            ))}
            {detected.secrets>0 && (
              <div className="mt-2 flex gap-2 rounded bg-warning/10 px-3 py-2 text-xs text-warning">
                <Lock size={14} className="shrink-0" /> {detected.secrets} secret(s) detected — will be encrypted in OS keyring if enabled.
              </div>
            )}
            <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-primary)]">
                <input type="checkbox" checked={encrypt} onChange={e=>setEncrypt(e.target.checked)} className="accent-[var(--accent)]" />
                <Lock size={14}/> Encrypt secrets in OS keyring
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-primary)]">
                <input type="checkbox" checked={autoDetect} onChange={e=>setAutoDetect(e.target.checked)} className="accent-[var(--accent)]" />
                <Sparkles size={14}/> Auto-detect variable types
              </label>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!hasContent || !!error || importing} onClick={doImport}>
            {importing ? 'Importing…' : hasContent ? 'Import & Review' : 'Import & Review'}
          </Button>
        </div>

        <p className="text-center text-[10px] text-[var(--text-secondary)]">Workspace-scoped by default — all collections can access imported environments.</p>
      </div>
    </Modal>
  );
}
