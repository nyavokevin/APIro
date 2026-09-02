import { useState, useEffect } from 'react';
import { Download, FileJson, FileText, Code2, Braces } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import type { Collection } from '@shared/types/request';
import { api } from '../../services/api';
import { isTauri } from '../../services/tauri';

type Format = 'yaml'|'postman'|'openapi'|'har'|'markdown'|'html';

const FORMATS: { id: Format; label: string; ext: string; desc: string; icon: any }[] = [
  { id: 'yaml', label: 'APIForge Native', ext: '.yaml', desc: 'Dossier + collection.yaml + *.request.yaml', icon: FileText },
  { id: 'postman', label: 'Postman v2.1', ext: '.postman_collection.json', desc: 'Compatible Postman', icon: Braces },
  { id: 'openapi', label: 'OpenAPI 3.1', ext: '.openapi.json', desc: 'Paths → folders', icon: Code2 },
  { id: 'har', label: 'HAR', ext: '.har', desc: 'HTTP Archive', icon: FileJson },
  { id: 'markdown', label: 'Markdown', ext: '.md', desc: 'Docs lisibles', icon: FileText },
  { id: 'html', label: 'HTML', ext: '.html', desc: 'Export imprimable', icon: FileText },
];

export function CollectionShareExportModal({ open, onClose, collections }: { open: boolean; onClose: () => void; collections: Collection[] }) {
  const [selectedId, setSelectedId] = useState<string>(collections[0]?.id ?? '');
  const [format, setFormat] = useState<Format>('postman');
  const [preview, setPreview] = useState<string|null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);

  useEffect(()=>{ if(collections.length>0 && !selectedId) setSelectedId(collections[0].id); }, [collections, selectedId]);
  useEffect(()=>{ if(open) setError(null); }, [open, format]);

  const target = collections.find(c=>c.id===selectedId) ?? collections[0] ?? null;

  const doPreview = async () => {
    if (!target) return;
    setLoading(true); setError(null);
    try {
      // For new formats use collectionsExport, for pdf-exporter formats use pdfExport
      if (['yaml','postman','openapi','har'].includes(format)) {
        const r = await api.collectionsExport.export({ collectionId: target.id, format });
        setPreview(r.content);
      } else {
        const r = await api.pdfExport.generate(target, { format: format as any, title: target.name });
        setPreview(r.content);
      }
    } catch(e){ setError(e instanceof Error? e.message:String(e)); }
    finally{ setLoading(false); }
  };

  const doDownload = async () => {
    console.log('[collection export] click', { target: target?.id, format });
    if (!target) { setError('No collection selected'); return; }
    try {
      let content: string | null = null;
      let filename = `${target.name}.${format}`;
      if (['yaml','postman','openapi','har'].includes(format)) {
        const r = await api.collectionsExport.export({ collectionId: target.id, format });
        console.log('[collection export] got', r.filename);
        content = r.content; filename = r.filename;
      } else {
        const r = await api.pdfExport.generate(target, { format: format as any, title: target.name });
        content = r.content; filename = `${target.name}.${format==='markdown'?'md':format}`;
      }
      const canUseTauriFs = isTauri();
      if (canUseTauriFs) {
        try {
          const { writeTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
          await writeTextFile(filename, content!, { baseDir: BaseDirectory.Download });
          setPreview((content?.slice(0,4000) ?? '') + '\n\n— saved to Downloads/' + filename);
          setError(null);
          return;
        } catch (e) { console.warn('[collection export] tauri write failed', e); }
      }
      const mime = format==='yaml' ? 'text/yaml' : format==='postman' || format==='openapi' || format==='har' ? 'application/json' : 'text/plain';
      const blob = new Blob([content!], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      console.log('[collection export] triggering download', filename);
      a.click();
      setTimeout(()=>{ a.remove(); URL.revokeObjectURL(url); }, 1500);
      setPreview(content?.slice(0,4000) ?? null);
      setError(null);
    } catch(e){ console.error('[collection export] failed', e); setError(e instanceof Error? e.message:String(e)); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Export Collection" className="max-w-lg">
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Collection</span>
          <select value={selectedId} onChange={e=>setSelectedId(e.target.value)} className="w-full rounded border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]">
            {collections.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}
            {collections.length===0 && <option value="">No collections</option>}
          </select>
        </label>

        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">Format</p>
          <div className="grid grid-cols-2 gap-2">
            {FORMATS.map(f=>{
              const Icon = f.icon;
              const active = format===f.id;
              return (
                <button key={f.id} onClick={()=>{setFormat(f.id); setPreview(null);}} className={`flex items-start gap-2 rounded border p-3 text-left ${active ? 'border-[var(--accent)] bg-[var(--accent-subtle)]' : 'border-[var(--border)] bg-[var(--bg-tertiary)] hover:border-[var(--border-strong)]'}`}>
                  <Icon size={16} className={active ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'} />
                  <div>
                    <div className="text-sm font-medium text-[var(--text-primary)]">{f.label}</div>
                    <div className="text-xs text-[var(--text-secondary)]">{f.desc}</div>
                    <div className="font-mono text-[10px] text-[var(--text-secondary)]">{f.ext}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {preview && <div className="rounded border border-[var(--border)] bg-[var(--bg-tertiary)] p-2"><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-[var(--text-primary)]">{preview.slice(0,3000)}{preview.length>3000?'…':''}</pre></div>}
        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" onClick={doPreview} disabled={!target || loading}>{loading?'…':'Preview'}</Button>
          <Button variant="primary" onClick={doDownload} disabled={!target}><Download size={14}/> Export to File</Button>
        </div>
      </div>
    </Modal>
  );
}
