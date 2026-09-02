import { useEffect, useRef, useState } from 'react';
import { Globe, Check } from 'lucide-react';
import { useEnvironmentStore } from '../../stores/environmentStore';

export function EnvironmentSelector() {
  const { environments, activeId, setActive, load } = useEnvironmentStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (environments.length === 0) void load();
  }, [environments.length, load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = environments.find((e) => e.id === activeId);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <Globe size={14} />
        {active ? active.name : 'No environment'}
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-48 rounded border border-[var(--border)] bg-[var(--bg-secondary)] py-1" role="menu">
          <button
            onClick={() => {
              setActive('');
              setOpen(false);
            }}
            role="menuitem"
            className="flex w-full items-center justify-between px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
          >
            No environment
            {!activeId && <Check size={14} />}
          </button>
          {environments.map((env) => (
            <button
              key={env.id}
              onClick={() => {
                void setActive(env.id);
                setOpen(false);
              }}
              role="menuitem"
              className="flex w-full items-center justify-between px-3 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
            >
              {env.name}
              {activeId === env.id && <Check size={14} className="text-[var(--accent)]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
