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
  ];

  return (
    <div className="mx-auto max-w-4xl p-6 bg-[#000000] min-h-full">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[#E2E8F0]">
        <SettingsIcon size={18} className="text-[#8B5CF6]" /> Settings
      </h2>

      <section className="mb-6 max-w-md">
        <h2 className="mb-2 text-sm font-semibold text-[#E2E8F0]">Appearance</h2>
        <div className="bg-[#121212] p-4" style={{ border: '1px solid #262626', borderRadius: '0px' }}>
          <p className="mb-2 text-xs text-[#8F909E]">Theme — APIro is dark-native only</p>
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
          <p className="mt-3 text-xs text-[#8F909E]">
            Current: <span className="capitalize text-[#E2E8F0]">{theme}</span> — dark-native, zero light mode.
          </p>
        </div>
      </section>

      <section className="mb-6 max-w-md">
        <h2 className="mb-2 text-sm font-semibold text-[#E2E8F0]">Fonts</h2>
        <div className="bg-[#121212] p-4 space-y-2" style={{ border: '1px solid #262626', borderRadius: '0px' }}>
          <label className="flex items-center justify-between text-sm text-[#E2E8F0]">
            <span>Monospace (code &amp; responses)</span>
            <select
              value={codeFontFamily}
              onChange={(e) => setCodeFontFamily(e.target.value as CodeFontFamily)}
              className="bg-[#121212] px-2 py-1 text-sm outline-none"
              style={{ border: '1px solid #262626', borderRadius: '0px', color: '#E2E8F0' }}
            >
              <option value="system">System default</option>
              <option value="jetbrains">JetBrains Mono</option>
              <option value="fira">Fira Code</option>
              <option value="sfmono">SF Mono</option>
              <option value="menlo">Menlo</option>
            </select>
          </label>
          <label className="flex items-center justify-between text-sm text-[#E2E8F0]">
            <span>Font size</span>
            <select
              value={codeFontSize}
              onChange={(e) => setCodeFontSize(e.target.value as CodeFontSize)}
              className="bg-[#121212] px-2 py-1 text-sm outline-none"
              style={{ border: '1px solid #262626', borderRadius: '0px', color: '#E2E8F0' }}
            >
              <option value="12px">12px</option>
              <option value="13px">13px</option>
              <option value="14px">14px</option>
              <option value="16px">16px</option>
            </select>
          </label>
        </div>
      </section>

      <section className="mb-6 max-w-md">
        <div className="bg-[#121212] p-4" style={{ border:'1px solid #262626', borderLeft:'2px solid #10B981', borderRadius:'0px' }}>
          <p className="text-sm font-semibold text-[#E2E8F0]">Aucun compte requis, jamais. <span className="text-[#10B981]">0 forced cloud</span></p>
          <p className="mt-1 text-xs leading-relaxed text-[#8F909E]">APIro s’ouvre directement sur ton dernier workspace local. Pas de login Postman, pas de “Create workspace” obligatoire. Principe non-négociable — offline-first, 100% local, diffable Git.</p>
          <p className="mt-2 text-xs font-medium text-[#8F909E]">0 dépendance tierce exécutée dans les tests — moteur Rust <span className="text-[#8B5CF6]">rhai</span> prévu (Phase 4A), zéro <code className="bg-[#000000] px-1" style={{border:'1px solid #262626'}}>npm install</code> pour tester.</p>
        </div>
      </section>

      <section className="max-w-md">
        <h2 className="mb-2 text-sm font-semibold text-[#E2E8F0]">About</h2>
        <div className="bg-[#121212] p-4 text-sm text-[#8F909E]" style={{ border: '1px solid #262626', borderRadius: '0px' }}>
          <p className="text-[#E2E8F0] font-medium">APIro</p>
          <p className="text-xs text-[#8F909E]">API Management, Reimagined — formerly APIForge</p>
          <p className="mt-1">Version 0.1.0</p>
          <p>Local-first, offline-capable API client and backend explorer.</p>
          <p className="mt-2">
            Built with Tauri v2, React 19, TypeScript (strict), Tailwind CSS v4.
          </p>
        </div>
      </section>
    </div>
  );
}
