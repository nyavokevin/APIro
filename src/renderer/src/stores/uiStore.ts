import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'dark' | 'light' | 'system';

export type AppPage =
  | 'workspace'
  | 'collections'
  | 'flow'
  | 'history'
  | 'environments'
  | 'scanner'
  | 'mocks'
  | 'testing'
  | 'settings';

export type CodeFontFamily = 'system' | 'jetbrains' | 'fira' | 'sfmono' | 'menlo';
export type CodeFontSize = '12px' | '13px' | '14px' | '16px';

const FONT_STACKS: Record<CodeFontFamily, string> = {
  system: "ui-monospace, 'Cascadia Code', Menlo, Consolas, monospace",
  jetbrains: "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace",
  fira: "'Fira Code', ui-monospace, Menlo, Consolas, monospace",
  sfmono: "'SF Mono', ui-monospace, Menlo, Consolas, monospace",
  menlo: "Menlo, ui-monospace, Consolas, monospace",
};

function applyCodePrefs(family: CodeFontFamily, size: CodeFontSize) {
  const root = document.documentElement;
  root.style.setProperty('--font-mono', FONT_STACKS[family] ?? FONT_STACKS.system);
  root.style.setProperty('--code-font-size', size);
}

interface UiState {
  theme: Theme;
  activePage: AppPage;
  sidebarOpen: boolean;
  commandPaletteOpen: boolean;
  /** Zen Mode: hide sidebar, header and panels — URL bar + response only. */
  zenMode: boolean;
  codeFontFamily: CodeFontFamily;
  codeFontSize: CodeFontSize;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setActivePage: (page: AppPage) => void;
  toggleSidebar: () => void;
  setCommandPalette: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleZenMode: () => void;
  setCodeFontFamily: (f: CodeFontFamily) => void;
  setCodeFontSize: (s: CodeFontSize) => void;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;
  root.classList.toggle('dark', resolved === 'dark');
  root.classList.toggle('light', resolved === 'light');
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      activePage: 'workspace',
      sidebarOpen: true,
      commandPaletteOpen: false,
      zenMode: false,
      codeFontFamily: 'system' as CodeFontFamily,
      codeFontSize: '13px' as CodeFontSize,
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      toggleTheme: () => {
        const order: Theme[] = ['dark', 'light', 'system'];
        const next = order[(order.indexOf(get().theme) + 1) % order.length];
        applyTheme(next);
        set({ theme: next });
      },
      setActivePage: (page) => set({ activePage: page }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setCommandPalette: (open) => set({ commandPaletteOpen: open }),
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      toggleZenMode: () => set((state) => ({ zenMode: !state.zenMode })),
      setCodeFontFamily: (f) => {
        applyCodePrefs(f, get().codeFontSize);
        set({ codeFontFamily: f });
      },
      setCodeFontSize: (s) => {
        applyCodePrefs(get().codeFontFamily, s);
        set({ codeFontSize: s });
      },
    }),
    {
      name: 'apiforge-ui',
      partialize: (state) => ({
        theme: state.theme,
        sidebarOpen: state.sidebarOpen,
        zenMode: state.zenMode,
        codeFontFamily: state.codeFontFamily,
        codeFontSize: state.codeFontSize,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(state.theme);
          applyCodePrefs(state.codeFontFamily, state.codeFontSize);
        }
      },
    }
  )
);
