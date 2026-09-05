import { useEffect, useState } from 'react';
import {
  Plus,
  Trash2,
  Save,
  Eye,
  EyeOff,
  Check,
  Upload,
  Download,
  Copy,
  Layers,
  Globe,
  Shield,
  Palette,
  Search,
  Boxes,
  Sparkles,
  X,
} from 'lucide-react';
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

  useEffect(() => {
    if (environments.length === 0) void load();
  }, [environments.length, load]);

  const selected = environments.find((e) => e.id === activeId) ?? environments[0];
  const filtered = environments.filter(
    (e) =>
      !search ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.variables.some((v) => v.key.toLowerCase().includes(search.toLowerCase()))
  );

  const doDuplicate = async (id: string) => {
    const src = environments.find((e) => e.id === id);
    if (!src) return;
    await create(
      `${src.name} copy`,
      src.variables.map((v) => ({ ...v, id: uid() }))
    );
    void load();
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#070709]">
      {/* Toolbar — polished like Dashboard, sharp, 200ms spring */}
      <div
        className="flex flex-wrap items-center gap-3 shrink-0"
        style={{
          padding: '16px 24px 14px 24px',
          background: '#070709',
          borderBottom: '1px solid #1E1E24',
        }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center bg-[#8B5CF6] text-white shrink-0"
            style={{ boxShadow: '0 0 14px rgba(139,92,246,0.28)', borderRadius: '0px' }}
          >
            <Layers size={16} strokeWidth={1.9} />
          </span>
          <div className="flex flex-col">
            <span
              className="text-sm font-semibold leading-none"
              style={{ color: '#E6E8F0', letterSpacing: '-0.02em', fontFamily: 'var(--font-sans)' }}
            >
              Environments
            </span>
            <span className="hidden text-[11px] sm:inline" style={{ color: '#7A7F93' }}>
              Workspace-scoped • Collection-local overrides workspace
            </span>
          </div>
          <span
            className="ml-1 hidden items-center rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums sm:inline-flex"
            style={{
              background: '#121215',
              borderColor: '#232329',
              color: '#E6E8F0',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#8B5CF6] mr-1.5" style={{ boxShadow: '0 0 6px rgba(139,92,246,0.4)' }} />
            {environments.length}
          </span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative hidden sm:block">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
              style={{ color: '#7A7F93' }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search envs or keys…"
              className="w-56 border bg-[#121215] py-1.5 pl-8 pr-8 text-sm outline-none transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] placeholder:text-[#5A5E6E] hover:border-[#2E2E36] focus:border-[#8B5CF6]"
              style={{
                borderColor: '#232329',
                borderRadius: '0px',
                color: '#E6E8F0',
                height: '36px',
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center text-[#7A7F93] hover:bg-[#1E1E24] hover:text-[#E6E8F0] transition-colors"
                aria-label="Clear search"
                style={{ borderRadius: '0px' }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          <Button variant="secondary" onClick={() => setImportOpen(true)} className="gap-1.5">
            <Upload size={14} /> Import
          </Button>

          <div className="flex items-center gap-1.5">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New environment name"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newName.trim()) {
                  void create(newName.trim()).then(() => {
                    setNewName('');
                    void load();
                  });
                }
              }}
              className="w-48 border bg-[#121215] px-3 text-sm outline-none transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] placeholder:text-[#5A5E6E] hover:border-[#2E2E36] focus:border-[#8B5CF6]"
              style={{
                borderColor: '#232329',
                borderRadius: '0px',
                color: '#E6E8F0',
                height: '36px',
              }}
            />
            <Button
              variant="primary"
              disabled={!newName.trim()}
              onClick={async () => {
                if (!newName.trim()) return;
                await create(newName.trim());
                setNewName('');
                void load();
              }}
              className="gap-1.5 shadow-[0_0_12px_rgba(139,92,246,0.22)]"
            >
              <Plus size={14} /> Add
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile search */}
      <div className="sm:hidden border-b border-[#1E1E24] bg-[#070709] px-4 py-2.5">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7A7F93]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search envs or keys…"
            className="w-full border bg-[#121215] py-2 pl-8 pr-8 text-sm outline-none placeholder:text-[#5A5E6E] hover:border-[#2E2E36] focus:border-[#8B5CF6]"
            style={{ borderColor: '#232329', borderRadius: '0px', color: '#E6E8F0', height: '36px' }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center text-[#7A7F93] hover:text-[#E6E8F0]"
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Resolution strip — compact, polished */}
      <div
        className="flex flex-wrap items-center gap-3 border-b px-4 py-2 text-xs"
        style={{ background: '#0E0E10', borderColor: '#232329' }}
      >
        <span className="flex items-center gap-1.5" style={{ color: '#9FA3B5' }}>
          <span
            className="flex h-6 w-6 items-center justify-center border"
            style={{ background: 'rgba(139,92,246,0.10)', borderColor: 'rgba(139,92,246,0.18)', color: '#8B5CF6', borderRadius: '0px' }}
          >
            <Globe size={12} />
          </span>
          <span className="font-medium" style={{ color: '#E6E8F0' }}>
            Workspace
          </span>
          <span className="hidden font-mono text-[11px] sm:inline" style={{ color: '#7A7F93' }}>
            environments/*.env.yaml
          </span>
        </span>
        <span style={{ color: '#2E2E36' }}>›</span>
        <span className="flex items-center gap-1.5" style={{ color: '#9FA3B5' }}>
          <Layers size={12} /> Collection-local
        </span>
        <span style={{ color: '#2E2E36' }}>›</span>
        <span className="flex items-center gap-1.5" style={{ color: '#9FA3B5' }}>
          <Shield size={12} /> Global
        </span>
        <span className="ml-auto hidden items-center gap-1.5 text-[10px] uppercase tracking-widest sm:inline-flex" style={{ color: '#5A5E6E' }}>
          <Sparkles size={10} className="text-[#8B5CF6]" />
          Resolution: Collection-local › Workspace › Global
        </span>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden bg-[#070709]">
        {/* List — sidebar with card-like rows + fadeUp stagger */}
        <div className="flex w-[340px] shrink-0 flex-col border-r bg-[#0E0E10] max-md:hidden" style={{ borderColor: '#232329' }}>
          <div
            className="flex items-center justify-between border-b px-4 py-3"
            style={{ borderColor: '#232329', background: '#0E0E10' }}
          >
            <span
              className="text-[11px] font-semibold uppercase tracking-widest"
              style={{ color: '#9FA3B5', letterSpacing: '0.08em' }}
            >
              Environments
            </span>
            <span
              className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums"
              style={{
                background: '#121215',
                borderColor: '#232329',
                color: '#E6E8F0',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {filtered.length}
            </span>
          </div>

          <div className="flex-1 overflow-auto p-3">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center animate-fadeUp">
                {/* Composed illustration */}
                <div className="relative mb-4">
                  <div
                    className="absolute inset-0 translate-x-1 rotate-3 border"
                    style={{ background: '#121215', borderColor: '#232329', borderRadius: '0px' }}
                  />
                  <div
                    className="absolute inset-0 -rotate-2 border"
                    style={{ background: '#16161A', borderColor: '#1E1E24', borderRadius: '0px' }}
                  />
                  <div
                    className="relative flex h-14 w-14 items-center justify-center border"
                    style={{
                      background: '#121215',
                      borderColor: '#232329',
                      borderRadius: '0px',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.22), 0 0 0 1px rgba(255,255,255,0.03)',
                    }}
                  >
                    <Layers size={20} className="text-[#7A7F93]" strokeWidth={1.6} />
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#8B5CF6] text-white border-2 border-[#0E0E10]">
                      <Plus size={8} strokeWidth={2.5} />
                    </span>
                  </div>
                </div>
                <p className="text-sm font-semibold" style={{ color: '#E6E8F0', letterSpacing: '-0.015em' }}>
                  {environments.length === 0 ? 'No environments yet' : 'No matches'}
                </p>
                <p className="mt-1 max-w-[24ch] text-xs leading-relaxed" style={{ color: '#7A7F93' }}>
                  {environments.length === 0
                    ? 'Import from Postman, Insomnia, .env or create one to get started.'
                    : `No environments match “${search}”. Try a different key.`}
                </p>
                <Button size="sm" variant="secondary" className="mt-4 gap-1.5" onClick={() => setImportOpen(true)}>
                  <Upload size={14} /> Import environment
                </Button>
                {environments.length === 0 && (
                  <p className="mt-3 text-[11px]" style={{ color: '#5A5E6E' }}>
                    Tip: <span className="font-mono" style={{ color: '#8B5CF6' }}>{'{{baseUrl}}'}</span> resolves via active env
                  </p>
                )}
              </div>
            ) : (
              <ul className="space-y-2">
                {filtered.map((env, idx) => {
                  const isActive = activeId === env.id;
                  const secrets = env.variables.filter((v) => v.type === 'secret').length;
                  return (
                    <li
                      key={env.id}
                      className="group relative flex items-center gap-2 border px-2.5 py-2.5 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] active:translate-y-[0px] active:scale-[0.99]"
                      style={{
                        background: isActive ? 'rgba(139,92,246,0.10)' : '#121215',
                        borderColor: isActive ? '#8B5CF6' : '#232329',
                        borderLeft: isActive ? '2px solid #8B5CF6' : '1px solid #232329',
                        borderRadius: '0px',
                        boxShadow: isActive
                          ? '0 0 0 1px rgba(139,92,246,0.12), 0 4px 12px rgba(0,0,0,0.18)'
                          : '0 1px 2px rgba(0,0,0,0.14)',
                        animation: `fadeUp 0.45s cubic-bezier(0.16,1,0.3,1) both`,
                        animationDelay: `${idx * 28}ms`,
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.borderColor = '#2E2E36';
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.borderColor = '#232329';
                      }}
                    >
                      <button
                        onClick={() => setActive(env.id)}
                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full border"
                          style={{
                            background: env.color ?? (isActive ? '#8B5CF6' : '#232329'),
                            borderColor: isActive ? 'rgba(139,92,246,0.35)' : '#2E2E36',
                            boxShadow: isActive ? '0 0 8px rgba(139,92,246,0.45)' : 'none',
                          }}
                        />
                        <span
                          className="truncate text-[13.5px] font-medium"
                          style={{
                            color: '#E6E8F0',
                            fontFamily: 'var(--font-sans)',
                            letterSpacing: '-0.015em',
                            fontWeight: isActive ? 600 : 500,
                          }}
                          title={env.name}
                        >
                          {env.name}
                        </span>
                        {isActive && <Check size={12} className="shrink-0 text-[#8B5CF6]" strokeWidth={2.2} />}
                      </button>

                      <span
                        className="shrink-0 rounded-full border px-1.5 py-0.5 text-[11px] font-medium tabular-nums"
                        style={{
                          background: '#0E0E10',
                          borderColor: '#232329',
                          color: '#E6E8F0',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {env.variables.length}
                      </span>
                      {secrets > 0 && (
                        <span
                          title={`${secrets} secret${secrets === 1 ? '' : 's'}`}
                          className="shrink-0 text-[#FBBF24]"
                        >
                          <Shield size={12} />
                        </span>
                      )}

                      <div className="flex items-center gap-0.5 opacity-40 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <button
                          type="button"
                          onClick={() => setExportEnv(env)}
                          className="rounded p-1 hover:bg-[#1E1E24] hover:text-[#E6E8F0] transition-colors"
                          style={{ color: '#7A7F93', borderRadius: '0px' }}
                          title="Export"
                          aria-label={`Export ${env.name}`}
                        >
                          <Download size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void doDuplicate(env.id)}
                          className="rounded p-1 hover:bg-[#1E1E24] hover:text-[#E6E8F0] transition-colors"
                          style={{ color: '#7A7F93', borderRadius: '0px' }}
                          title="Duplicate"
                          aria-label={`Duplicate ${env.name}`}
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmId(env.id)}
                          className="rounded p-1 hover:bg-[rgba(239,68,68,0.10)] hover:text-[#EF4444] transition-colors"
                          style={{ color: '#7A7F93', borderRadius: '0px' }}
                          title="Delete"
                          aria-label={`Delete ${env.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t p-3 text-[11px] leading-relaxed" style={{ borderColor: '#232329', color: '#5A5E6E' }}>
            Tip: <span className="font-mono" style={{ color: '#E6E8F0', fontFamily: 'var(--font-mono)' }}>{'{{baseUrl}}'}</span>{' '}
            resolves via active env.
            <span className="ml-2 hidden xl:inline" style={{ color: '#7A7F93' }}>
              · <span className="tabular-nums">{environments.length}</span> total
            </span>
          </div>
        </div>

        {/* Mobile count + list as card grid with stagger */}
        <div className="flex min-w-0 flex-1 flex-col bg-[#070709] overflow-hidden">
          {/* Mobile env cards grid (visible on small screens, also as overview) */}
          <div className="md:hidden border-b bg-[#0E0E10] p-3" style={{ borderColor: '#232329' }}>
            {filtered.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm" style={{ color: '#9FA3B5' }}>
                  {environments.length === 0 ? 'No environments yet.' : 'No matches.'}
                </p>
              </div>
            ) : (
              <div className="grid gap-2">
                {filtered.map((env, idx) => {
                  const isActive = activeId === env.id;
                  return (
                    <button
                      key={env.id}
                      onClick={() => setActive(env.id)}
                      className="flex items-center gap-2.5 border px-3 py-2.5 text-left transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-[#2E2E36] hover:-translate-y-[1px] active:scale-[0.98]"
                      style={{
                        background: isActive ? 'rgba(139,92,246,0.10)' : '#121215',
                        borderColor: isActive ? '#8B5CF6' : '#232329',
                        borderRadius: '0px',
                        animation: `fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) both`,
                        animationDelay: `${idx * 26}ms`,
                      }}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: env.color ?? (isActive ? '#8B5CF6' : '#2E2E36') }}
                      />
                      <span className="truncate text-sm font-medium" style={{ color: '#E6E8F0' }}>
                        {env.name}
                      </span>
                      {isActive && (
                        <span
                          className="ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                          style={{
                            background: 'rgba(139,92,246,0.10)',
                            borderColor: 'rgba(139,92,246,0.18)',
                            color: '#8B5CF6',
                          }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-[#8B5CF6]" /> Active
                        </span>
                      )}
                      <span
                        className="ml-auto tabular-nums rounded-full border px-1.5 py-0.5 text-[11px]"
                        style={{ background: '#0E0E10', borderColor: '#232329', color: '#9FA3B5' }}
                      >
                        {env.variables.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selected ? (
            <div className="flex h-full flex-col">
              <div
                className="flex items-center justify-between gap-3 border-b px-4 py-3"
                style={{ borderColor: '#232329', background: '#0E0E10' }}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={selected.color ?? '#8B5CF6'}
                    onChange={(e) => update(selected.id, { color: e.target.value } as any)}
                    className="h-7 w-7 cursor-pointer border bg-transparent p-0"
                    style={{ borderColor: '#232329', borderRadius: '0px' }}
                    title="Environment color"
                  />
                  <span
                    className="text-[14.5px] font-semibold"
                    style={{ color: '#E6E8F0', letterSpacing: '-0.02em', fontFamily: 'var(--font-sans)' }}
                  >
                    {selected.name}
                  </span>
                  {selected.meta?.imported_from && (
                    <span
                      className="rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                      style={{
                        background: '#121215',
                        borderColor: '#232329',
                        color: '#9FA3B5',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {selected.meta.imported_from}
                    </span>
                  )}
                  <span
                    className="hidden items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums sm:inline-flex"
                    style={{
                      background: 'rgba(139,92,246,0.08)',
                      borderColor: 'rgba(139,92,246,0.14)',
                      color: '#9FA3B5',
                    }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-[#8B5CF6]" />
                    {selected.variables.length} vars
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => setExportEnv(selected)} className="gap-1.5">
                    <Download size={14} /> Export
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-4 sm:p-5">
                <EnvironmentEditor
                  key={selected.id}
                  envId={selected.id}
                  variables={selected.variables}
                  onSave={(vars) => update(selected.id, { variables: vars })}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center bg-[#070709]">
              {/* Composed illustration for empty selection */}
              <div className="relative mb-6">
                <div className="absolute inset-0 translate-x-1.5 rotate-2 border opacity-60" style={{ background: '#121215', borderColor: '#1E1E24', borderRadius: '0px' }} />
                <div className="absolute inset-0 -rotate-1 border opacity-80" style={{ background: '#16161A', borderColor: '#232329', borderRadius: '0px' }} />
                <div
                  className="relative flex h-16 w-16 items-center justify-center border"
                  style={{
                    background: '#121215',
                    borderColor: '#232329',
                    borderRadius: '0px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.24), 0 0 0 1px rgba(255,255,255,0.04)',
                  }}
                >
                  <Palette size={22} className="text-[#7A7F93]" strokeWidth={1.6} />
                </div>
                <span
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#8B5CF6] text-white border-2"
                  style={{ borderColor: '#070709', boxShadow: '0 2px 8px rgba(139,92,246,0.4)' }}
                >
                  <Sparkles size={10} />
                </span>
              </div>

              <p className="text-sm font-semibold" style={{ color: '#E6E8F0', letterSpacing: '-0.02em' }}>
                No environment selected
              </p>
              <p className="mt-1.5 max-w-sm text-xs leading-relaxed" style={{ color: '#7A7F93' }}>
                Create an environment to store variables like{' '}
                <span className="font-mono" style={{ color: '#8B5CF6', fontFamily: 'var(--font-mono)' }}>
                  {'{{baseUrl}}'}
                </span>
                ,{' '}
                <span className="font-mono" style={{ color: '#8B5CF6', fontFamily: 'var(--font-mono)' }}>
                  {'{{apiKey}}'}
                </span>{' '}
                and share across collections.
              </p>

              {/* Card grid preview as illustration — fadeUp stagger */}
              {environments.length > 0 && (
                <div className="mt-6 grid w-full max-w-[520px] grid-cols-1 gap-2 sm:grid-cols-2">
                  {environments.slice(0, 4).map((env, idx) => (
                    <div
                      key={env.id}
                      className="flex items-center gap-2.5 border px-3 py-2.5 text-left"
                      style={{
                        background: '#121215',
                        borderColor: '#232329',
                        borderRadius: '0px',
                        animation: `fadeUp 0.45s cubic-bezier(0.16,1,0.3,1) both`,
                        animationDelay: `${idx * 32}ms`,
                      }}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: env.color ?? '#2E2E36' }} />
                      <span className="truncate text-sm font-medium" style={{ color: '#E6E8F0' }}>
                        {env.name}
                      </span>
                      <span className="ml-auto text-xs tabular-nums" style={{ color: '#7A7F93' }}>
                        {env.variables.length}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <Button variant="primary" onClick={() => setImportOpen(true)} className="gap-1.5">
                  <Upload size={14} /> Import
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const name = prompt('Environment name');
                    if (name) void create(name).then(() => void load());
                  }}
                >
                  New Environment
                </Button>
              </div>

              <p className="mt-4 text-[11px]" style={{ color: '#5A5E6E' }}>
                Supports Postman, Insomnia, .env, OpenAPI, CSV • secrets encrypted in OS keyring
              </p>
            </div>
          )}
        </div>
      </div>

      <EnvironmentImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={() => void load()} />
      <EnvironmentExportModal open={!!exportEnv} onClose={() => setExportEnv(null)} env={exportEnv} />

      <Modal
        open={confirmId !== null}
        onClose={() => setConfirmId(null)}
        title="Delete environment"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirmId) void remove(confirmId);
                setConfirmId(null);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed" style={{ color: '#E6E8F0' }}>
          Delete “<span className="font-semibold">{environments.find((e) => e.id === confirmId)?.name}</span>”? Variables
          will be lost.
        </p>
        <p className="mt-2 text-xs" style={{ color: '#9FA3B5' }}>
          This cannot be undone. Export first if you need a backup.
        </p>
      </Modal>
    </div>
  );
}

interface EditorProps {
  envId: string;
  variables: EnvironmentVariable[];
  onSave: (variables: EnvironmentVariable[]) => void;
}

function EnvironmentEditor({ variables, onSave }: EditorProps) {
  const [vars, setVars] = useState<EnvironmentVariable[]>(variables);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);

  const update = (id: string, patch: Partial<EnvironmentVariable>) =>
    setVars((v) => v.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  return (
    <div className="space-y-3">
      <div
        className="grid grid-cols-[22px_140px_1fr_110px_56px_32px] gap-2 px-1 text-[11px] font-medium uppercase tracking-widest max-lg:hidden"
        style={{ color: '#7A7F93', letterSpacing: '0.08em' }}
      >
        <span title="Enabled" className="text-center">
          ✓
        </span>
        <span>Key</span>
        <span>Value</span>
        <span>Type</span>
        <span className="text-center">On</span>
        <span />
      </div>

      {vars.length === 0 && (
        <div
          className="flex flex-col items-center justify-center border border-dashed py-10 text-center"
          style={{ background: '#0E0E10', borderColor: '#232329', borderRadius: '0px' }}
        >
          <div
            className="mb-3 flex h-10 w-10 items-center justify-center border"
            style={{ background: '#121215', borderColor: '#232329', borderRadius: '0px' }}
          >
            <Boxes size={18} className="text-[#7A7F93]" />
          </div>
          <p className="text-sm font-medium" style={{ color: '#E6E8F0' }}>
            No variables yet
          </p>
          <p className="mt-1 text-xs" style={{ color: '#7A7F93' }}>
            Add one manually or import from file.
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-3 gap-1.5"
            onClick={() => setVars((v) => [...v, { id: uid(), key: '', value: '', type: 'string', enabled: true }])}
          >
            <Plus size={14} /> Add variable
          </Button>
        </div>
      )}

      {vars.map((v, idx) => (
        <div
          key={v.id}
          className="group grid grid-cols-1 gap-2 border px-2 py-2 transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-[#2E2E36] lg:grid-cols-[22px_140px_1fr_110px_56px_32px] lg:items-center"
          style={{
            background: '#121215',
            borderColor: '#232329',
            borderRadius: '0px',
            opacity: v.enabled === false ? 0.55 : 1,
            animation: `fadeUp 0.35s cubic-bezier(0.16,1,0.3,1) both`,
            animationDelay: `${idx * 18}ms`,
          }}
        >
          <div className="flex items-center justify-between lg:justify-center">
            <span className="text-[11px] font-medium uppercase tracking-wide lg:hidden" style={{ color: '#7A7F93' }}>
              Enabled
            </span>
            <input
              type="checkbox"
              checked={v.enabled !== false}
              onChange={(e) => update(v.id, { enabled: e.target.checked })}
              className="h-3.5 w-3.5 accent-[#8B5CF6]"
              title="Enabled"
              style={{ accentColor: '#8B5CF6' }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide lg:hidden" style={{ color: '#7A7F93' }}>
              Key
            </span>
            <input
              value={v.key}
              onChange={(e) => update(v.id, { key: e.target.value })}
              placeholder="key"
              className="rounded-none border bg-[#0E0E10] px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-[#5A5E6E] hover:border-[#2E2E36] focus:border-[#8B5CF6]"
              style={{
                borderColor: '#232329',
                borderRadius: '0px',
                color: '#E6E8F0',
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
              }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide lg:hidden" style={{ color: '#7A7F93' }}>
              Value
            </span>
            <div className="flex items-center gap-1">
              {v.type === 'boolean' ? (
                <button
                  onClick={() => update(v.id, { value: v.value === 'true' ? 'false' : 'true' })}
                  className="h-7 w-11 rounded-full p-0.5 transition-colors duration-200"
                  style={{ background: v.value === 'true' ? '#8B5CF6' : '#232329' }}
                  aria-label="Toggle boolean"
                >
                  <span
                    className="block h-5 w-5 rounded-full bg-white transition-transform duration-200"
                    style={{ transform: v.value === 'true' ? 'translateX(20px)' : 'translateX(0)' }}
                  />
                </button>
              ) : (
                <input
                  type={v.type === 'secret' && !revealed[v.id] ? 'password' : 'text'}
                  value={v.value}
                  onChange={(e) => update(v.id, { value: e.target.value })}
                  placeholder={v.type === 'dynamic' ? '{{$randomUUID}}' : 'value'}
                  className="min-w-0 flex-1 rounded-none border bg-[#0E0E10] px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-[#5A5E6E] hover:border-[#2E2E36] focus:border-[#8B5CF6]"
                  style={{
                    borderColor: '#232329',
                    borderRadius: '0px',
                    color: '#E6E8F0',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '13px',
                  }}
                />
              )}
              {v.type === 'secret' && (
                <button
                  type="button"
                  onClick={() => setRevealed((r) => ({ ...r, [v.id]: !r[v.id] }))}
                  className="shrink-0 p-1.5 hover:bg-[#1E1E24] hover:text-[#E6E8F0] transition-colors"
                  style={{ color: '#7A7F93', borderRadius: '0px' }}
                  aria-label={revealed[v.id] ? 'Hide value' : 'Show value'}
                >
                  {revealed[v.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide lg:hidden" style={{ color: '#7A7F93' }}>
              Type
            </span>
            <select
              value={v.type}
              onChange={(e) => update(v.id, { type: e.target.value as EnvironmentVariable['type'] })}
              className="rounded-none border bg-[#0E0E10] px-2.5 py-2 text-sm outline-none transition-colors hover:border-[#2E2E36] focus:border-[#8B5CF6]"
              style={{
                borderColor: '#232329',
                borderRadius: '0px',
                color: '#E6E8F0',
                height: '36px',
              }}
              aria-label="Type"
            >
              <option value="string">string</option>
              <option value="number">number</option>
              <option value="boolean">boolean</option>
              <option value="secret">secret</option>
              <option value="dynamic">dynamic</option>
            </select>
          </div>

          <span
            className="hidden text-center text-xs font-medium tabular-nums lg:block"
            style={{
              color: v.enabled === false ? '#7A7F93' : v.type === 'secret' ? '#FBBF24' : '#10B981',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {v.enabled === false ? 'off' : 'on'}
          </span>

          <button
            onClick={() => setVars((list) => list.filter((x) => x.id !== v.id))}
            className="self-end p-1.5 hover:bg-[rgba(239,68,68,0.10)] hover:text-[#EF4444] transition-colors lg:self-auto"
            style={{ color: '#7A7F93', borderRadius: '0px' }}
            aria-label="Remove"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <Button
          variant="ghost"
          onClick={() => setVars((v) => [...v, { id: uid(), key: '', value: '', type: 'string', enabled: true }])}
          className="gap-1.5"
        >
          <Plus size={14} /> Add variable
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            onSave(vars);
            setSaved(true);
            window.setTimeout(() => setSaved(false), 1400);
          }}
          className="gap-1.5 shadow-[0_0_12px_rgba(139,92,246,0.22)]"
        >
          <Save size={14} />
          {saved ? 'Saved' : 'Save'}
        </Button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: '#10B981' }}>
            <Check size={12} /> Saved
          </span>
        )}
        <span className="ml-auto hidden text-xs sm:inline" style={{ color: '#5A5E6E' }}>
          Tip: use{' '}
          <span className="font-mono" style={{ color: '#8B5CF6', fontFamily: 'var(--font-mono)' }}>
            {'{{key}}'}
          </span>{' '}
          in requests •{' '}
          <span className="font-mono" style={{ color: '#8B5CF6', fontFamily: 'var(--font-mono)' }}>
            {'{{$randomUUID}}'}
          </span>{' '}
          for dynamic values
        </span>
      </div>
      <p className="text-xs sm:hidden" style={{ color: '#5A5E6E' }}>
        Tip: use <span className="font-mono" style={{ color: '#8B5CF6' }}>{'{{key}}'}</span> in requests •{' '}
        <span className="font-mono" style={{ color: '#8B5CF6' }}>{'{{$randomUUID}}'}</span> for dynamic values.
      </p>
    </div>
  );
}
