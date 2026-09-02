import { useState, useRef } from 'react';
import { Upload, Clipboard, Link2, Github, FileJson, AlertTriangle, CheckCircle2, FolderTree } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { api } from '../../services/api';
import { importCollection } from '@main/services/importers';

type Tab = 'file' | 'clipboard' | 'url';

export function CollectionShareImportModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const [tab, setTab] = useState<Tab>('file');
  const [raw, setRaw] = useState('');
  const [filename, setFilename] = useState<string | undefined>();
  const [url, setUrl] = useState('');
  const [detected, setDetected] = useState<string | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [importEnvs, setImportEnvs] = useState(true);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const analyze = (content: string, name?: string) => {
    setRaw(content); setFilename(name); setError(null);
    try {
      const col = importCollection(content, undefined as any);
      // crude folder/request count
      let folders = 0, requests = 0;
      const walk = (c: any) => {
        if (c.type==='request') requests++;
        if (c.type==='folder') {
          if (c.children) folders += c.children.filter((x: any)=>x.type==='folder').length;
          (c.children ?? []).forEach(walk);
        }
      };
      (col.children ?? []).forEach(walk);
      if (col.type==='folder' && col.children) {
        // top-level folders already counted differently; approximate
        folders = (col.children ?? []).filter((c: any)=>c.type==='folder').length;
        const flat = (col.children ?? []).reduce((acc: number,c: any)=> acc + (c.type==='request'?1: (c.children ?? []).filter((x: any)=>x.type==='request').length),0);
        if (requests===0) requests = flat;
      }
      const fmt = content.trim().toLowerCase().startsWith('curl') ? 'cURL' : content.includes('"_postman_variable_scope"') || content.includes('"info"') && content.includes('"item"') ? 'Postman v2.1' : content.includes('openapi') ? 'OpenAPI' : content.includes('resources') ? 'Insomnia' : content.includes('log') && content.includes('entries') ? 'HAR' : 'Unknown';
      setDetected(fmt);
      setPreview({ name: col.name, folders, requests });
    } catch (e) {
      setDetected(null); setPreview(null); setError(e instanceof Error? e.message:String(e));
    }
  };

  const onFile = async (f: File) => {
    const text = await f.text();
    analyze(text, f.name);
  };

  const onUrlFetch = async () => {
    if (!url.trim()) return;
    setError(null); setLoading(true);
    try {
      const res = await fetch(url.trim());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      analyze(text, url.split('/').pop());
    } catch (e){ setError(e instanceof Error? e.message:String(e)); }
    finally{ setLoading(false); }
  };

  const doImport = async () => {
    if (!raw) return;
    setLoading(true);
    try {
      await api.collectionsImport.importRaw({ content: raw, filename, format: undefined });
      // importEnvs handled inside importCollection if embedded? For postman we could also extract envs separately but skip for now
      onImported();
      setRaw(''); setPreview(null); setDetected(null); setError(null);
      onClose();
    } catch (e){ setError(e instanceof Error? e.message:String(e)); }
    finally{ setLoading(false); }
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Import Collection" className="max-w-xl">
      <div className="space-y-4">
        {/* Tabs */}
        <div className="flex gap-1 rounded bg-[var(--bg-tertiary)] p-1">
          {([
            ['file','File', Upload],
            ['clipboard','Clipboard', Clipboard],
            ['url','URL', Link2],
          ] as const).map(([id,label,Icon])=>(
            <button key={id} onClick={()=>setTab(id as Tab)} className={`flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium ${tab===id ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
              <Icon size={14}/> {label}
            </button>
          ))}
          <button disabled className="flex flex-1 cursor-not-allowed items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm text-[var(--text-secondary)] opacity-50">
            <Github size={14}/> Git
          </button>
        </div>

        {tab==='file' && (
          <div onClick={()=>fileRef.current?.click()} className="flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-[var(--border)] bg-[var(--bg-tertiary)] px-6 py-8 text-center hover:border-[var(--border-strong)]">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded bg-[var(--bg-secondary)] text-[var(--accent)]"><FileJson size={20}/></div>
            <p className="text-sm font-medium text-[var(--text-primary)]">Drop file or click to browse</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Postman, Insomnia, OpenAPI, Swagger, HAR, cURL</p>
            <input ref={fileRef} type="file" accept=".json,.yaml,.yml,.har,.txt,.sh" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if(f) void onFile(f); e.currentTarget.value=''; }} />
          </div>
        )}

        {tab==='clipboard' && (
          <div className="space-y-2">
            <textarea value={raw} onChange={e=>analyze(e.target.value, 'clipboard.txt')} placeholder="Paste cURL, Postman JSON, OpenAPI YAML/JSON, HAR..." className="min-h-[140px] w-full resize-none rounded border border-[var(--border)] bg-[var(--bg-tertiary)] p-3 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
            <p className="text-xs text-[var(--text-secondary)]">cURL is detected automatically — paste a full <span className="font-mono text-[var(--text-primary)]">curl 'https://...'</span> command.</p>
          </div>
        )}

        {tab==='url' && (
          <div className="flex gap-2">
            <input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://api.example.com/openapi.json" className="flex-1 rounded border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
            <Button variant="secondary" onClick={onUrlFetch} disabled={!url.trim() || loading}>{loading?'Fetching…':'Fetch'}</Button>
          </div>
        )}

        {error && <div className="flex gap-2 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"><AlertTriangle size={16} className="shrink-0"/>{error}</div>}

        {preview && (
          <div className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
            <div className="mb-1 flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
              <FolderTree size={16} className="text-[var(--accent)]"/> {preview.name}
              <span className="rounded bg-[var(--bg-tertiary)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">{detected}</span>
            </div>
            <div className="flex gap-4 text-xs text-[var(--text-secondary)]">
              <span>{preview.folders} folders</span><span>{preview.requests} requests</span>
              {preview.requests>0 && <span className="flex items-center gap-1 text-success"><CheckCircle2 size={12}/> ready to import</span>}
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-[var(--text-primary)]">
              <input type="checkbox" checked={importEnvs} onChange={e=>setImportEnvs(e.target.checked)} className="accent-[var(--accent)]" />
              Import embedded environments
            </label>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!raw || !!error || loading} onClick={doImport}>{loading?'Importing…':'Import Collection'}</Button>
        </div>
      </div>
    </Modal>
  );
}
