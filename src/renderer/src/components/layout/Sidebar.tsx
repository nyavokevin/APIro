import type { ReactNode } from 'react';
import {
  LayoutDashboard,
  Code2,
  Folder,
  Network,
  Clock,
  Globe,
  ScanLine,
  Server,
  FlaskConical,
  Shield,
  Settings,
  Boxes,
} from 'lucide-react';
import { useUiStore, type AppPage } from '../../stores/uiStore';
import { useSecurityStore } from '../../stores/securityStore';

type NavItem = { key: AppPage; label: string; icon: ReactNode };

const mainNav: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} strokeWidth={1.75} /> },
  { key: 'workspace', label: 'Workspace', icon: <Code2 size={20} strokeWidth={1.75} /> },
  { key: 'collections', label: 'Collections', icon: <Folder size={20} strokeWidth={1.75} /> },
  { key: 'flow', label: 'Flow', icon: <Network size={20} strokeWidth={1.75} /> },
  { key: 'history', label: 'History', icon: <Clock size={20} strokeWidth={1.75} /> },
  { key: 'environments', label: 'Environments', icon: <Globe size={20} strokeWidth={1.75} /> },
  { key: 'scanner', label: 'Scanner', icon: <ScanLine size={20} strokeWidth={1.75} /> },
  { key: 'mocks', label: 'Mocks', icon: <Server size={20} strokeWidth={1.75} /> },
  { key: 'testing', label: 'Testing', icon: <FlaskConical size={20} strokeWidth={1.75} /> },
  { key: 'security', label: 'Security', icon: <Shield size={20} strokeWidth={1.75} /> },
];

const bottomNav: NavItem[] = [
  { key: 'settings', label: 'Settings', icon: <Settings size={20} strokeWidth={1.75} /> },
];

export function Sidebar() {
  const activePage = useUiStore((s) => s.activePage);
  const setActivePage = useUiStore((s) => s.setActivePage);
  const securityCount = useSecurityStore((s) => s.findings.filter((f) => !f.dismissed).length);
  const hasHigh = useSecurityStore((s) => s.findings.some((f) => !f.dismissed && (f.severity === 'critical' || f.severity === 'high')));

  const renderItem = (item: NavItem) => {
    const isActive = activePage === item.key;
    const badge = item.key === 'security' ? securityCount : undefined;
    const showHigh = item.key === 'security' && hasHigh;
    return (
      <button
        key={item.key}
        onClick={() => setActivePage(item.key)}
        aria-label={item.label}
        title={item.label}
        aria-current={isActive ? 'page' : undefined}
        className={[
          'relative flex h-[40px] w-full items-center gap-3 text-left',
          'transition-colors duration-150 ease-out',
          isActive
            ? 'text-[#E2E8F0] bg-[rgba(139,92,246,0.10)]'
            : 'text-[#8F909E] hover:text-[#E2E8F0] hover:bg-[#1A1A1A]',
        ].join(' ')}
        style={{
          padding: '0 16px 0 14px',
          borderLeft: isActive ? '2px solid #8B5CF6' : '2px solid transparent',
          marginLeft: '-1px',
          borderRadius: '0px',
        }}
      >
        <span className={isActive ? 'text-[#8B5CF6]' : 'text-[#8F909E]'}>{item.icon}</span>
        <span
          style={{
            fontSize: '13px',
            lineHeight: '20px',
            fontWeight: isActive ? 500 : 400,
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
          }}
          className="flex-1"
        >
          {item.label}
        </span>
        {badge !== undefined && badge > 0 && (
          <span
            className="inline-flex items-center justify-center font-semibold shrink-0"
            style={{
              minWidth: '18px',
              height: '18px',
              padding: '0 5px',
              borderRadius: '9999px',
              background: showHigh ? '#EF4444' : '#8B5CF6',
              color: '#FFFFFF',
              fontSize: '11px',
              lineHeight: '14px',
            }}
          >
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside
      className="flex shrink-0 flex-col bg-[#0A0A0A] h-screen sticky top-0"
      style={{
        width: '220px',
        borderRight: '1px solid #262626',
        paddingTop: '24px',
      }}
      aria-label="Primary navigation"
    >
      {/* Logo */}
      <div className="flex w-full items-center gap-3 px-4" style={{ marginBottom: '32px', paddingLeft: '16px', paddingRight: '16px' }}>
        <span className="flex h-8 w-8 items-center justify-center bg-[#8B5CF6] text-white" style={{ borderRadius: '0px' }}>
          <Boxes size={18} strokeWidth={1.85} />
        </span>
        <span className="flex flex-col">
          <span style={{ fontSize: '15px', lineHeight: '20px', fontWeight: 600, color: '#E2E8F0', letterSpacing: '-0.02em' }}>APIro</span>
          <span style={{ fontSize: '11px', lineHeight: '14px', fontWeight: 400, color: '#8F909E' }}>Reimagined</span>
        </span>
      </div>

      {/* Main nav */}
      <nav className="flex flex-1 flex-col gap-1 px-2" aria-label="Main">
        {mainNav.map(renderItem)}
      </nav>

      {/* Bottom section */}
      <div className="flex flex-col gap-1 px-2 pb-2">
        {bottomNav.map(renderItem)}

        <div className="mx-2 my-2 h-px bg-[#262626]" />

        {/* User */}
        <div className="flex items-center gap-3 px-2 py-2" style={{ paddingLeft: '14px' }}>
          <div className="relative shrink-0">
            <img
              src="https://i.pravatar.cc/100?img=33"
              alt="User avatar"
              width={36}
              height={36}
              className="avatar object-cover"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '9999px',
                border: '2px solid transparent',
                display: 'block',
              }}
            />
            <span
              aria-hidden
              style={{
                position: 'absolute',
                bottom: '-1px',
                right: '-1px',
                width: '10px',
                height: '10px',
                borderRadius: '9999px',
                background: '#10B981',
                border: '2px solid #0A0A0A',
                display: 'block',
              }}
            />
          </div>
          <span className="min-w-0 flex flex-col">
            <span className="truncate" style={{ fontSize: '13px', lineHeight: '16px', fontWeight: 500, color: '#E2E8F0' }}>Alex Carter</span>
            <span className="truncate" style={{ fontSize: '11px', lineHeight: '14px', color: '#8F909E' }}>alex@apiro.dev</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
