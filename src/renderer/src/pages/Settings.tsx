import { Settings as SettingsIcon } from 'lucide-react';
import { useUiStore, type Theme, type CodeFontFamily, type CodeFontSize } from '../stores/uiStore';
import { Button } from '../components/ui/Button';

export function Settings() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const codeFontFamily = useUiStore((s) => s.codeFontFamily);
  const setCodeFontFamily = useUiStore((s) => s.setCodeFontFamily);
  const codeFontSize = useUiStore((s) => s.codeFontSize);
  const setCodeFontSize = useUiStore((s) => s.setCodeFontSize);

  const themes: { value: Theme; label: string }[] = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
    { value: 'system', label: 'System' },
  ];

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]">
        <SettingsIcon size={18} className="text-[var(--accent)]" /> Settings
      </h2>

      <section className="mb-6 max-w-md">
        <h2 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Appearance</h2>
        <div className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
          <p className="mb-2 text-xs text-[var(--text-secondary)]">Theme</p>
          <div className="flex gap-2">
            {themes.map((t) => (
              <Button
                key={t.value}
                size="sm"
                variant={theme === t.value ? 'primary' : 'secondary'}
                onClick={() => setTheme(t.value)}
              >
                {t.label}
              </Button>
            ))}
          </div>
          <p className="mt-3 text-xs text-[var(--text-secondary)]">
            Current: <span className="capitalize text-[var(--text-primary)]">{theme}</span>
          </p>
        </div>
      </section>

      <section className="mb-6 max-w-md">
        <h2 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Fonts</h2>
        <div className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-4 space-y-2">
          <label className="flex items-center justify-between text-sm text-[var(--text-primary)]">
            <span>Monospace (code &amp; responses)</span>
            <select
              value={codeFontFamily}
              onChange={(e) => setCodeFontFamily(e.target.value as CodeFontFamily)}
              className="rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1 text-sm outline-none focus:border-[var(--accent)]"
            >
              <option value="system">System default</option>
              <option value="jetbrains">JetBrains Mono</option>
              <option value="fira">Fira Code</option>
              <option value="sfmono">SF Mono</option>
              <option value="menlo">Menlo</option>
            </select>
          </label>
          <label className="flex items-center justify-between text-sm text-[var(--text-primary)]">
            <span>Font size</span>
            <select
              value={codeFontSize}
              onChange={(e) => setCodeFontSize(e.target.value as CodeFontSize)}
              className="rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1 text-sm outline-none focus:border-[var(--accent)]"
            >
              <option value="12px">12px</option>
              <option value="13px">13px</option>
              <option value="14px">14px</option>
              <option value="16px">16px</option>
            </select>
          </label>
        </div>
      </section>

      <section className="max-w-md">
        <h2 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">About</h2>
        <div className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-secondary)]">
          <p className="text-[var(--text-primary)] font-medium">APIForge</p>
          <p>Version 0.1.0</p>
          <p>Local-first, offline-capable API client and backend explorer.</p>
          <p className="mt-2">
            Built with Tauri, React, TypeScript, Vite, Tailwind and Zustand.
          </p>
        </div>
      </section>
    </div>
  );
}
