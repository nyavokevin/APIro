import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Sparkles, Eye, EyeOff, ExternalLink, Cpu, Shield } from 'lucide-react';
import { useUiStore, type Theme, type CodeFontFamily, type CodeFontSize } from '../stores/uiStore';
import { Button } from '../components/ui/Button';
import { getOpenRouterConfig, saveOpenRouterConfig, clearOpenRouterConfig, AVAILABLE_MODELS, DEFAULT_MODEL } from '../lib/openRouter';

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

  // OpenRouter state
  const [orKey, setOrKey] = useState('');
  const [orModel, setOrModel] = useState(DEFAULT_MODEL);
  const [orEnabled, setOrEnabled] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const cfg = getOpenRouterConfig();
    if (cfg) {
      setOrKey(cfg.apiKey);
      setOrModel(cfg.model);
      setOrEnabled(cfg.enabled);
    } else {
      // also check if still stored but disabled
      try {
        const raw = localStorage.getItem('apiro.openrouter');
        if (raw) {
          const p = JSON.parse(raw);
          setOrEnabled(p.enabled !== false);
          if (p.model) setOrModel(p.model);
        }
      } catch {}
    }
  }, []);

  const handleSaveOR = () => {
    if (!orKey.trim()) {
      clearOpenRouterConfig();
      // keep disabled state but no key
      try { localStorage.setItem('apiro.openrouter', JSON.stringify({ apiKey: '', model: orModel, enabled: false })); } catch {}
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      return;
    }
    saveOpenRouterConfig({ apiKey: orKey.trim(), model: orModel, enabled: orEnabled });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const handleClearOR = () => {
    clearOpenRouterConfig();
    setOrKey('');
    setOrEnabled(true);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="mx-auto max-w-3xl p-6 bg-[#070709] min-h-full">
      <h2 className="mb-6 flex items-center gap-2.5 text-lg font-semibold tracking-tight" style={{ color: '#E6E8F0', letterSpacing: '-0.02em' }}>
        <span className="flex h-8 w-8 items-center justify-center bg-[#8B5CF6] text-white" style={{ boxShadow: '0 0 14px rgba(139,92,246,0.28)' }}>
          <SettingsIcon size={16} strokeWidth={1.9} />
        </span>
        Settings
        <span className="ml-2 hidden sm:inline-flex items-center gap-1.5 rounded-full bg-[#121215] px-2.5 py-0.5 text-xs font-medium border border-[#232329]" style={{ color: '#7A7F93' }}>
          <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" /> Local-first
        </span>
      </h2>

      <div className="grid gap-5">
        <section className="max-w-[560px]">
          <h3 className="mb-2 text-sm font-semibold" style={{ color: '#E6E8F0', letterSpacing: '-0.01em' }}>Appearance</h3>
          <div className="bg-[#121215] p-4" style={{ border: '1px solid #232329', borderRadius: '0px', boxShadow: '0 1px 6px rgba(0,0,0,0.18)' }}>
            <p className="mb-2.5 text-xs" style={{ color: '#7A7F93' }}>Theme — APIro is dark-native only (OLED charcoal, Geist Sans)</p>
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
              <span className="ml-2 inline-flex items-center text-xs" style={{ color: '#5A5E6E' }}>Geist · JetBrains Mono · 200ms spring</span>
            </div>
            <p className="mt-3 text-xs" style={{ color: '#7A7F93' }}>
              Current: <span className="capitalize font-medium" style={{ color: '#E6E8F0' }}>{theme}</span> — dark-native, refined minimal.
            </p>
          </div>
        </section>

        <section className="max-w-[560px]">
          <h3 className="mb-2 text-sm font-semibold" style={{ color: '#E6E8F0' }}>Fonts</h3>
          <div className="bg-[#121215] p-4 space-y-3" style={{ border: '1px solid #232329', borderRadius: '0px', boxShadow: '0 1px 6px rgba(0,0,0,0.18)' }}>
            <label className="flex items-center justify-between text-sm" style={{ color: '#E6E8F0' }}>
              <span>Monospace (code &amp; responses)</span>
              <select
                value={codeFontFamily}
                onChange={(e) => setCodeFontFamily(e.target.value as CodeFontFamily)}
                className="bg-[#0E0E10] px-2.5 py-1.5 text-sm outline-none border hover:border-[#2E2E36] focus:border-[#8B5CF6]"
                style={{ borderColor: '#232329', borderRadius: '0px', color: '#E6E8F0' }}
              >
                <option value="system">System default</option>
                <option value="jetbrains">JetBrains Mono</option>
                <option value="fira">Fira Code</option>
                <option value="sfmono">SF Mono</option>
                <option value="menlo">Menlo</option>
              </select>
            </label>
            <label className="flex items-center justify-between text-sm" style={{ color: '#E6E8F0' }}>
              <span>Font size</span>
              <select
                value={codeFontSize}
                onChange={(e) => setCodeFontSize(e.target.value as CodeFontSize)}
                className="bg-[#0E0E10] px-2.5 py-1.5 text-sm outline-none border hover:border-[#2E2E36] focus:border-[#8B5CF6]"
                style={{ borderColor: '#232329', borderRadius: '0px', color: '#E6E8F0' }}
              >
                <option value="12px">12px</option>
                <option value="13px">13px (default)</option>
                <option value="14px">14px</option>
                <option value="16px">16px</option>
              </select>
            </label>
            <p className="text-xs" style={{ color: '#5A5E6E' }}>UI font is Geist Sans — headings use -0.03em tracking, tabular-nums for data.</p>
          </div>
        </section>

        <section className="max-w-[560px]">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold" style={{ color: '#E6E8F0' }}>
            <Sparkles size={14} className="text-[#8B5CF6]" /> AI · OpenRouter <span className="text-xs font-normal px-1.5 py-0.5 rounded-full bg-[rgba(139,92,246,0.10)] border border-[rgba(139,92,246,0.18)] text-[#8B5CF6]">optional</span>
          </h3>
          <div className="bg-[#121215] p-4 space-y-3" style={{ border: '1px solid #232329', borderRadius: '0px', boxShadow: '0 1px 6px rgba(0,0,0,0.18)' }}>
            <p className="text-xs leading-relaxed" style={{ color: '#9FA3B5' }}>
              By default APIro uses a <span className="font-medium" style={{ color: '#E6E8F0' }}>local heuristic</span> — no cloud, works offline. Add an OpenRouter key to enable cloud models for deeper error analysis, test generation, and explanations. Falls back to local when offline or on error.
            </p>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium" style={{ color: '#9FA3B5' }}>OpenRouter API Key</span>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={orKey}
                    onChange={(e) => setOrKey(e.target.value)}
                    placeholder="sk-or-v1-…"
                    className="w-full bg-[#0E0E10] px-3 pr-9 text-sm outline-none border placeholder:text-[#5A5E6E] focus:border-[#8B5CF6] hover:border-[#2E2E36]"
                    style={{ height: '38px', borderColor: '#232329', borderRadius: '0px', color: '#E6E8F0', fontFamily: 'var(--font-mono)', fontSize: '13px' }}
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center text-[#7A7F93] hover:text-[#E6E8F0] hover:bg-[#232329] transition-colors"
                    aria-label={showKey ? 'Hide key' : 'Show key'}
                  >
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setShowKey((v) => !v)} className="shrink-0 hidden sm:inline-flex">
                  {showKey ? 'Hide' : 'Show'}
                </Button>
              </div>
              <span className="mt-1 block text-[11px]" style={{ color: '#5A5E6E' }}>Stored locally in your browser (localStorage), never sent to APIro servers. <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-[#8B5CF6] hover:underline inline-flex items-center gap-0.5">Get a key <ExternalLink size={10} /></a></span>
            </label>

            <label className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium flex items-center gap-1.5" style={{ color: '#E6E8F0' }}><Cpu size={12} className="text-[#8B5CF6]" /> Model</span>
              <select
                value={orModel}
                onChange={(e) => setOrModel(e.target.value)}
                className="bg-[#0E0E10] px-2.5 py-1.5 text-sm outline-none border hover:border-[#2E2E36] focus:border-[#8B5CF6] min-w-[220px]"
                style={{ borderColor: '#232329', borderRadius: '0px', color: '#E6E8F0' }}
              >
                {AVAILABLE_MODELS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={orEnabled}
                onChange={(e) => setOrEnabled(e.target.checked)}
                className="h-4 w-4 accent-[#8B5CF6] bg-[#0E0E10] border-[#232329]"
              />
              <span className="text-xs font-medium group-hover:text-[#E6E8F0]" style={{ color: '#9FA3B5' }}>Enable OpenRouter when key is present</span>
              <span className={`ml-auto text-[11px] px-1.5 py-0.5 rounded-full border ${orEnabled ? 'bg-[rgba(16,185,129,0.10)] border-[rgba(16,185,129,0.18)] text-[#10B981]' : 'bg-[#0E0E10] border-[#232329] text-[#7A7F93]'}`}>
                {orEnabled ? 'Enabled' : 'Disabled — local only'}
              </span>
            </label>

            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="primary" onClick={handleSaveOR}>
                Save OpenRouter
              </Button>
              <Button size="sm" variant="ghost" onClick={handleClearOR}>
                Clear
              </Button>
              {saved && <span className="ml-2 text-xs font-medium text-[#10B981] self-center">Saved ✓</span>}
              <a href="https://openrouter.ai/models" target="_blank" rel="noreferrer" className="ml-auto self-center text-xs text-[#7A7F93] hover:text-[#9FA3B5] inline-flex items-center gap-1">
                Models <ExternalLink size={11} />
              </a>
            </div>

            <p className="text-[11px] leading-relaxed flex items-start gap-1.5 pt-1" style={{ color: '#5A5E6E' }}>
              <Shield size={11} className="shrink-0 mt-0.5 text-[#10B981]" />
              Privacy: key stays on-device, requests go directly to OpenRouter from your machine. Local heuristic remains available offline. No telemetry.
            </p>
          </div>
        </section>

        <section className="max-w-[560px]">
          <div className="bg-[#121215] p-4 flex gap-3" style={{ border:'1px solid #232329', borderLeft:'2px solid #10B981', borderRadius:'0px', boxShadow: '0 1px 6px rgba(0,0,0,0.12)' }}>
            <span className="hidden sm:flex h-8 w-8 items-center justify-center bg-[rgba(16,185,129,0.10)] text-[#10B981] border border-[rgba(16,185,129,0.18)] shrink-0">
              <Shield size={14} />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight" style={{ color: '#E6E8F0', letterSpacing: '-0.015em' }}>Aucun compte requis, jamais. <span style={{ color: '#10B981' }}>0 forced cloud</span></p>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: '#9FA3B5' }}>APIro opens directly on your last local workspace. No Postman login, no “Create workspace” gate. Offline-first, 100% local, Git-diffable.</p>
              <p className="mt-2 text-xs font-medium" style={{ color: '#7A7F93' }}>0 third-party deps at test time — Rust <span style={{ color: '#8B5CF6' }}>rhai</span> engine (Phase 4A), zero <code className="bg-[#0E0E10] px-1 py-0.5" style={{border:'1px solid #232329', fontFamily: 'var(--font-mono)', fontSize: '11px'}}>npm install</code> to test.</p>
            </div>
          </div>
        </section>

        <section className="max-w-[560px]">
          <h3 className="mb-2 text-sm font-semibold" style={{ color: '#E6E8F0' }}>About</h3>
          <div className="bg-[#121215] p-4 text-sm" style={{ border: '1px solid #232329', borderRadius: '0px', color: '#9FA3B5', boxShadow: '0 1px 6px rgba(0,0,0,0.12)' }}>
            <p style={{ color: '#E6E8F0', fontWeight: 600, letterSpacing: '-0.02em' }}>APIro 0.1.0</p>
            <p className="text-xs" style={{ color: '#7A7F93' }}>API Management, Reimagined — formerly APIForge</p>
            <p className="mt-2 text-xs leading-relaxed">Local-first, offline-capable API client and backend explorer. Design refined with Geist Sans, subtle violet depth, and Linear-inspired motion.</p>
            <p className="mt-2 text-xs" style={{ color: '#5A5E6E' }}>
              Built with Tauri v2, React 19, TypeScript strict, Tailwind CSS.
            </p>
            <div className="mt-3 flex gap-1.5">
              <span className="text-[11px] px-2 py-0.5 bg-[#0E0E10] border border-[#232329] text-[#7A7F93]">Tauri v2</span>
              <span className="text-[11px] px-2 py-0.5 bg-[#0E0E10] border border-[#232329] text-[#7A7F93]">React 19</span>
              <span className="text-[11px] px-2 py-0.5 bg-[rgba(139,92,246,0.10)] border border-[rgba(139,92,246,0.18)] text-[#8B5CF6]">Geist</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
