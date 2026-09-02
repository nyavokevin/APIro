import { useEffect, useState } from 'react';
import { Plus, Trash2, Save, Eye, EyeOff, Check, Upload, Download, Copy, Layers, Globe, Shield, Palette, Search } from 'lucide-react';
import type { Environment, EnvironmentVariable } from '@shared/types/request';
import { useEnvironmentStore } from '../stores/environmentStore';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { EnvironmentImportModal } from '../components/environments/EnvironmentImportModal';
import { EnvironmentExportModal } from '../components/environments/EnvironmentExportModal';
import { uid } from '../lib/id';

export function Environments() {
  const { environments, load, create, update, remove, setActive, activeId } = useEnvironmentStore();
  const [newName, setNewName] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exportEnv, setExportEnv] = useState<Environment | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => { if (environments.length === 0) void load(); }, [environments.length, load]);

  const selected = environments.find((e) => e.id === activeId) ?? environments[0];
  const filtered = environments.filter(e => !search || e.name.toLowerCase().includes(search.toLowerCase()) || e.variables.some(v=>v.key.toLowerCase().includes(search.toLowerCase())));

  const doDuplicate = async (id: string) => {
    const src = environments.find(e=>e.id===id);
    if (!src) return;
    await create(`${src.name} copy`, src.variables.map(v=>({ ...v, id: uid() })));
    void load();
  };

  return (
    <div className="flex h-full flex-col bg-[var(--bg-primary)]">
      {/* Toolbar — like Workspace RequestBuilder */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-secondary)] p-2">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-[var(--accent)]" />
          <span className="text-sm font-semibold text-[var(--text-primary)]">Environments</span>
          <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-xs text-[var(--text-secondary)]">{environments.length}</span>
          <span className="hidden text-xs text-[var(--text-secondary)] sm:inline">• Workspace-scoped • Collection-local overrides workspace</span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative hidden sm:block">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search envs or keys…" className="w-44 rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] py-1.5 pl-7 pr-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] placeholder:text-[var(--text-secondary)]" />
          </div>
          <Button variant="secondary" onClick={()=>setImportOpen(true)}>
            <Upload size={14}/> Import
          </Button>
          <div className="flex items-center gap-1">
            <input
              value={newName}
              onChange={e=>setNewName(e.target.value)}
              placeholder="New environment name"
              onKeyDown={e=>{ if(e.key==='Enter'&&newName.trim()){ void create(newName.trim()).then(()=>{setNewName(''); void load();}); }}}
              className="w-44 rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] placeholder:text-[var(--text-secondary)]"
            />
            <Button variant="primary" disabled={!newName.trim()} onClick={async()=>{ if(!newName.trim())return; await create(newName.trim()); setNewName(''); void load(); }}>
              <Plus size={14}/> Add
            </Button>
          </div>
        </div>
      </div>

      {/* Resolution strip — compact, like Workspace tabs bar */}
      <div className="flex items-center gap-4 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-xs">
        <span className="flex items-center gap-1.5 text-[var(--text-secondary)]"><span className="flex h-5 w-5 items-center justify-center rounded bg-[var(--accent-subtle)] text-[var(--accent)]"><Globe size={12}/></span> Workspace <span className="hidden text-[var(--text-muted)] sm:inline">environments/*.env.yaml</span></span>
        <span className="text-[var(--border)]">›</span>
        <span className="flex items-center gap-1.5 text-[var(--text-secondary)]"><Layers size={12}/> Collection-local</span>
        <span className="text-[var(--border)]">›</span>
        <span className="flex items-center gap-1.5 text-[var(--text-secondary)]"><Shield size={12}/> Global</span>
        <span className="ml-auto hidden text-[10px] uppercase tracking-wide text-[var(--text-secondary)] sm:inline">Resolution: Collection-local › Workspace › Global</span>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* List — fixed sidebar like Collections tree */}
        <div className="flex w-[320px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Environments</span>
            <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-xs text-[var(--text-secondary)]">{filtered.length}</span>
          </div>
          <div className="flex-1 overflow-auto p-2">
            {filtered.length===0 ? (
              <div className="py-10 text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"><Layers size={18}/></div>
                <p className="text-sm text-[var(--text-secondary)]">{environments.length===0 ? 'No environments yet.' : 'No matches.'}</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">Import from Postman, Insomnia, .env or create one.</p>
                <Button size="sm" variant="secondary" className="mt-3" onClick={()=>setImportOpen(true)}><Upload size={14}/> Import environment</Button>
              </div>
            ) : (
              <ul className="space-y-1">
                {filtered.map(env=>{
                  const isActive = activeId===env.id;
                  const secrets = env.variables.filter(v=>v.type==='secret').length;
                  return (
                    <li key={env.id} className={`group relative flex items-center gap-2 rounded px-2 py-2 ${isActive ? 'bg-[var(--accent-subtle)] ring-1 ring-[var(--accent)]' : 'hover:bg-[var(--bg-tertiary)]'}`}>
                      <button onClick={()=>setActive(env.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-[var(--border)]" style={{background: env.color ?? 'var(--text-secondary)'}} />
                        <span className={`truncate text-sm ${isActive ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-primary)]'}`}>{env.name}</span>
                        {isActive && <Check size={12} className="shrink-0 text-[var(--accent)]" />}
                      </button>
                      <span className="shrink-0 rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">{env.variables.length}</span>
                      {secrets>0 && <span title={`${secrets} secrets`} className="shrink-0 text-warning"><Shield size={12}/></span>}
                      <div className="flex items-center gap-1 opacity-40 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:opacity-100">
                        <button type="button" onClick={()=>setExportEnv(env)} className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]" title="Export" aria-label={`Export ${env.name}`}><Download size={14}/></button>
                        <button type="button" onClick={()=>void doDuplicate(env.id)} className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]" title="Duplicate" aria-label={`Duplicate ${env.name}`}><Copy size={14}/></button>
                        <button type="button" onClick={()=>setConfirmId(env.id)} className="rounded p-1 text-[var(--text-secondary)] hover:text-danger" title="Delete" aria-label={`Delete ${env.name}`}><Trash2 size={14}/></button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="border-t border-[var(--border)] p-2 text-[10px] text-[var(--text-secondary)]">
            Tip: <span className="font-mono text-[var(--text-primary)]">{'{{baseUrl}}'}</span> resolves via active env.
          </div>
        </div>

        {/* Detail — full remaining space */}
        <div className="flex min-w-0 flex-1 flex-col bg-[var(--bg-primary)]">
          {selected ? (
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
                <div className="flex items-center gap-2">
                  <input type="color" value={selected.color ?? '#ff5c00'} onChange={e=>update(selected.id, { color: e.target.value } as any)} className="h-6 w-6 cursor-pointer rounded border border-[var(--border)] bg-transparent p-0" title="Environment color" />
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{selected.name}</span>
                  {selected.meta?.imported_from && <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">{selected.meta.imported_from}</span>}
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={()=>setExportEnv(selected)}><Download size={14}/> Export</Button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-3">
                <EnvironmentEditor key={selected.id} envId={selected.id} variables={selected.variables} onSave={vars=>update(selected.id, { variables: vars })} />
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"><Palette size={20}/></div>
              <p className="text-sm font-medium text-[var(--text-primary)]">No environment selected</p>
              <p className="mt-1 max-w-sm text-xs text-[var(--text-secondary)]">Create an environment to store variables like <span className="font-mono text-[var(--accent)]">{'{{baseUrl}}'}</span>, <span className="font-mono text-[var(--accent)]">{'{{apiKey}}'}</span> and share across collections.</p>
              <div className="mt-4 flex gap-2">
                <Button variant="primary" onClick={()=>setImportOpen(true)}><Upload size={14}/> Import</Button>
                <Button variant="secondary" onClick={()=>{ const name=prompt('Environment name'); if(name) void create(name).then(()=>void load()); }}>New Environment</Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <EnvironmentImportModal open={importOpen} onClose={()=>setImportOpen(false)} onImported={()=>void load()} />
      <EnvironmentExportModal open={!!exportEnv} onClose={()=>setExportEnv(null)} env={exportEnv} />

      <Modal open={confirmId!==null} onClose={()=>setConfirmId(null)} title="Delete environment" footer={<><Button variant="ghost" onClick={()=>setConfirmId(null)}>Cancel</Button><Button variant="danger" onClick={()=>{ if(confirmId) void remove(confirmId); setConfirmId(null); }}>Delete</Button></>}>
        <p className="text-sm text-[var(--text-primary)]">Delete “{environments.find(e=>e.id===confirmId)?.name}”? Variables will be lost.</p>
      </Modal>
    </div>
  );
}

interface EditorProps { envId: string; variables: EnvironmentVariable[]; onSave: (variables: EnvironmentVariable[])=>void; }

function EnvironmentEditor({ variables, onSave }: EditorProps) {
  const [vars, setVars] = useState<EnvironmentVariable[]>(variables);
  const [revealed, setRevealed] = useState<Record<string,boolean>>({});
  const [saved, setSaved] = useState(false);

  const update = (id:string, patch:Partial<EnvironmentVariable>)=> setVars(v=>v.map(x=>x.id===id?{...x,...patch}:x));

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[22px_140px_1fr_110px_56px_32px] gap-2 px-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
        <span title="Enabled" className="text-center">✓</span><span>Key</span><span>Value</span><span>Type</span><span className="text-center">On</span><span/>
      </div>
      {vars.length===0 && <p className="py-4 text-center text-sm text-[var(--text-secondary)]">No variables yet. Add one or import.</p>}
      {vars.map(v=>(
        <div key={v.id} className={`grid grid-cols-[22px_140px_1fr_110px_56px_32px] items-center gap-2 rounded px-1 py-1 ${v.enabled===false ? 'opacity-50' : ''}`}>
          <input type="checkbox" checked={v.enabled!==false} onChange={e=>update(v.id,{enabled:e.target.checked})} className="h-3.5 w-3.5 accent-[var(--accent)]" title="Enabled" />
          <input value={v.key} onChange={e=>update(v.id,{key:e.target.value})} placeholder="key" className="rounded border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1 text-sm outline-none focus:border-[var(--accent)]" />
          <div className="flex items-center gap-1">
            {v.type==='boolean' ? (
              <button onClick={()=>update(v.id,{value: v.value==='true'?'false':'true'})} className={`h-6 w-10 rounded-full p-0.5 transition-colors ${v.value==='true' ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`}>
                <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${v.value==='true' ? 'translate-x-4' : ''}`} />
              </button>
            ) : (
              <input type={v.type==='secret' && !revealed[v.id] ? 'password' : 'text'} value={v.value} onChange={e=>update(v.id,{value:e.target.value})} placeholder={v.type==='dynamic' ? '{{$randomUUID}}' : 'value'} className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1 text-sm outline-none focus:border-[var(--accent)]" />
            )}
            {v.type==='secret' && (
              <button type="button" onClick={()=>setRevealed(r=>({...r,[v.id]:!r[v.id]}))} className="shrink-0 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">{revealed[v.id]?<EyeOff size={14}/>:<Eye size={14}/>}</button>
            )}
          </div>
          <select value={v.type} onChange={e=>update(v.id,{type:e.target.value as EnvironmentVariable['type']})} className="rounded border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1 text-sm outline-none focus:border-[var(--accent)]" aria-label="Type">
            <option value="string">string</option><option value="number">number</option><option value="boolean">boolean</option><option value="secret">secret</option><option value="dynamic">dynamic</option>
          </select>
          <span className={`text-center text-xs ${v.enabled===false ? 'text-[var(--text-secondary)]' : v.type==='secret' ? 'text-warning' : 'text-success'}`}>{v.enabled===false ? 'off' : 'on'}</span>
          <button onClick={()=>setVars(list=>list.filter(x=>x.id!==v.id))} className="text-[var(--text-secondary)] hover:text-danger" aria-label="Remove"><Trash2 size={14}/></button>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-2">
        <Button variant="ghost" onClick={()=>setVars(v=>[...v,{ id: uid(), key:'', value:'', type:'string', enabled:true }])}><Plus size={14}/> Add variable</Button>
        <Button variant="primary" onClick={()=>{ onSave(vars); setSaved(true); window.setTimeout(()=>setSaved(false),1400); }}><Save size={14}/>{saved?'Saved':'Save'}</Button>
        {saved && <span className="text-xs text-success">Saved</span>}
      </div>
      <p className="text-xs text-[var(--text-secondary)]">Tip: use <span className="font-mono text-[var(--accent)]">{'{{key}}'}</span> in requests • <span className="font-mono text-[var(--accent)]">{'{{$randomUUID}}'}</span> for dynamic values.</p>
    </div>
  );
}
