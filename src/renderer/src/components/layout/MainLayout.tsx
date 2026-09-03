import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useUiStore, type AppPage } from '../../stores/uiStore';
import { useCollectionStore } from '../../stores/collectionStore';

const PAGE_TITLES: Record<AppPage, string> = {
  dashboard: 'API Library',
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

  // Counter badge: show for dashboard / collections; count = collections length
  const headerCount =
    activePage === 'dashboard' || activePage === 'collections' ? collections.length : undefined;
  const headerCountLabel =
    activePage === 'dashboard' || activePage === 'collections' ? 'APIs' : undefined;

  if (zenMode) {
    return (
      <div className="flex h-screen w-screen overflow-hidden bg-[#000000] text-[#E2E8F0]">
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#000000]">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#000000] text-[#E2E8F0]">
      {showChrome && <Sidebar />}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {showChrome && <Header title={title} count={headerCount} countLabel={headerCountLabel} />}
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#000000]">{children}</main>
      </div>
    </div>
  );
}
