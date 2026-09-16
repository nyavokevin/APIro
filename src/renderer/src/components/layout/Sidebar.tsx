import type { ReactNode } from 'react';
import {
  LayoutDashboard,
  Code2,
  Folder,
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
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={19} strokeWidth={1.75} /> },
  { key: 'workspace', label: 'Workspace', icon: <Code2 size={19} strokeWidth={1.75} /> },
  { key: 'collections', label: 'Collections', icon: <Folder size={19} strokeWidth={1.75} /> },
  { key: 'history', label: 'History', icon: <Clock size={19} strokeWidth={1.75} /> },
  { key: 'environments', label: 'Environments', icon: <Globe size={19} strokeWidth={1.75} /> },
  { key: 'scanner', label: 'Scanner', icon: <ScanLine size={19} strokeWidth={1.75} /> },
  { key: 'mocks', label: 'Mocks', icon: <Server size={19} strokeWidth={1.75} /> },
  { key: 'testing', label: 'Testing', icon: <FlaskConical size={19} strokeWidth={1.75} /> },
  { key: 'security', label: 'Security', icon: <Shield size={19} strokeWidth={1.75} /> },
];

const bottomNav: NavItem[] = [
  { key: 'settings', label: 'Settings', icon: <Settings size={19} strokeWidth={1.75} /> },
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
          'group relative flex h-[38px] w-full items-center gap-3 text-left',
          'transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
          'active:scale-[0.98]',
          isActive
            ? 'text-[#E6E8F0] bg-[rgba(139,92,246,0.10)]'
            : 'text-[#7A7F93] hover:text-[#E6E8F0] hover:bg-[#16161A] hover:translate-x-[1px]',
        ].join(' ')}
        style={{
          padding: '0 14px 0 12px',
          borderLeft: isActive ? '2px solid #8B5CF6' : '2px solid transparent',
          marginLeft: '-1px',
          borderRadius: '0px',
          // subtle active glow
          boxShadow: isActive ? 'inset 3px 0 12px rgba(139,92,246,0.08)' : 'none',
        }}
      >
        <span
          className="transition-colors duration-200"
          style={{ color: isActive ? '#8B5CF6' : undefined }}
        >
          {item.icon}
        </span>
        <span
          style={{
            fontSize: '13px',
            lineHeight: '20px',
            fontWeight: isActive ? 600 : 450,
            letterSpacing: '-0.015em',
            whiteSpace: 'nowrap',
          }}
          className="flex-1"
        >
          {item.label}
        </span>
        {badge !== undefined && badge > 0 && (
          <span
            className="inline-flex items-center justify-center font-semibold shrink-0 tabular-nums"
            style={{
              minWidth: '18px',
              height: '18px',
              padding: '0 5px',
              borderRadius: '9999px',
              background: showHigh ? '#EF4444' : '#8B5CF6',
              color: '#FFFFFF',
              fontSize: '11px',
              lineHeight: '14px',
              boxShadow: showHigh ? '0 0 8px rgba(239,68,68,0.35)' : '0 0 8px rgba(139,92,246,0.25)',
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
      className="flex shrink-0 flex-col min-h-0 h-full self-stretch select-none"
      style={{
        width: '228px',
        background: '#0E0E10',
        borderRight: '1px solid #232329',
        paddingTop: '22px',
      }}
      aria-label="Primary navigation"
    >
      {/* Subtle top highlight line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" aria-hidden />

      {/* Logo */}
      <div className="flex w-full items-center gap-3 px-3" style={{ marginBottom: '28px', paddingLeft: '14px', paddingRight: '14px' }}>
        <span
          className="flex h-[34px] w-[34px] items-center justify-center text-white shrink-0"
          style={{
            background: '#8B5CF6',
            borderRadius: '0px',
            boxShadow: '0 0 20px rgba(139,92,246,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
          }}
        >
          <Boxes size={17} strokeWidth={1.9} />
        </span>
        <span className="flex flex-col min-w-0">
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: '15.5px', lineHeight: '20px', fontWeight: 700, color: '#E6E8F0', letterSpacing: '-0.03em' }}>
            APIro
          </span>
          <span style={{ fontSize: '11px', lineHeight: '13px', fontWeight: 500, color: '#7A7F93', letterSpacing: '0.02em' }}>Reimagined</span>
        </span>
        <span className="ml-auto hidden lg:flex items-center gap-1 rounded bg-[#121215] px-1.5 py-0.5 text-[10px] font-medium text-[#7A7F93] border border-[#232329]">
          v0.1
        </span>
      </div>

      {/* Main nav */}
      <nav className="flex flex-1 flex-col gap-0.5 px-2" aria-label="Main">
        {mainNav.map(renderItem)}
      </nav>

      {/* Bottom section */}
      <div className="flex flex-col gap-1 px-2 pb-3">
        {bottomNav.map(renderItem)}
      </div>
    </aside>
  );
}
