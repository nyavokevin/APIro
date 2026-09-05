import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useUiStore, type AppPage } from '../../stores/uiStore';
import { useCollectionStore } from '../../stores/collectionStore';

const PAGE_TITLES: Record<AppPage, string> = {
  dashboard: 'Dashboard',
  workspace: 'Workspace',
  collections: 'Collections',
  flow: 'Connection Flow',
  history: 'History',
  environments: 'Environments',
  scanner: 'Route Scanner',
  mocks: 'Mock Servers',
  testing: 'Testing',
  security: 'Security',
  settings: 'Settings',
};

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const activePage = useUiStore((s) => s.activePage);
  const zenMode = useUiStore((s) => s.zenMode);
  const collections = useCollectionStore((s) => s.collections);

  const showChrome = !zenMode;
  const title = PAGE_TITLES[activePage] ?? 'APIro';

  const headerCount =
    activePage === 'dashboard' || activePage === 'collections' ? collections.length : undefined;
  const headerCountLabel =
    activePage === 'dashboard' || activePage === 'collections' ? 'APIs' : undefined;

  if (zenMode) {
    return (
      <div className="flex h-[100dvh] max-h-[100dvh] w-screen overflow-hidden bg-[#070709] text-[#E6E8F0]">
        <a href="#main-content" className="skip-link">Skip to content</a>
        <main id="main-content" className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#070709]">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] w-screen overflow-hidden bg-[#070709] text-[#E6E8F0]">
      <a href="#main-content" className="skip-link">Skip to content</a>
      {showChrome && <Sidebar />}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {showChrome && (
          <>
            <Header title={title} count={headerCount} countLabel={headerCountLabel} />
            {/* refined header separator with gradient */}
            <div className="shrink-0 mx-7" style={{ height: '1px', background: 'linear-gradient(90deg, transparent, #1E1E24 8%, #1E1E24 92%, transparent)' }} aria-hidden />
            <div className="shrink-0" style={{ height: '10px', background: '#070709' }} aria-hidden />
          </>
        )}
        <main id="main-content" className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#070709] relative">
          {/* subtle radial glow behind content for depth */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.035]"
            style={{
              background: 'radial-gradient(800px 400px at 70% -10%, rgba(139,92,246,0.18), transparent 60%), radial-gradient(600px 300px at 10% 100%, rgba(16,185,129,0.08), transparent 60%)',
            }}
          />
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        </main>
      </div>
    </div>
  );
}
