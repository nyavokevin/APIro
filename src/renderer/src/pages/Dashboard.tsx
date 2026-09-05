import { useEffect } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { SecuritySummaryCard } from '../components/dashboard/SecuritySummaryCard';
import { TestingSummaryCard } from '../components/dashboard/TestingSummaryCard';
import { ScannerSummaryCard } from '../components/dashboard/ScannerSummaryCard';
import { EnvironmentStatusBar } from '../components/dashboard/EnvironmentStatusBar';
import { MocksStatusBar } from '../components/dashboard/MocksStatusBar';
import { RecentActivityFeed } from '../components/dashboard/RecentActivityFeed';
import { QuickActionsBar } from '../components/dashboard/QuickActionsBar';
import { useWorkspaceStore } from '../stores/workspaceStore';

export function Dashboard() {
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-[#070709] overflow-hidden">
      <div className="flex-1 min-h-0 overflow-auto overscroll-contain">
        <div className="mx-auto w-full max-w-[1280px] p-6">
          {/* Header */}
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.22)', color: '#8B5CF6' }}>
              <LayoutDashboard size={16} />
            </span>
            <div>
              <h1 className="text-[18px] font-semibold tracking-tight" style={{ color: '#E6E8F0', letterSpacing: '-0.02em' }}>Dashboard</h1>
              <p className="text-xs" style={{ color: '#7A7F93' }}>Overview of your workspace — security, tests, routes, and recent activity.</p>
            </div>
            <div className="ml-auto hidden sm:flex items-center gap-2 text-xs px-2.5 py-1.5" style={{ background: '#121215', border: '1px solid #232329', color: '#7A7F93' }}>
              <span className="h-2 w-2 rounded-full bg-[#10B981] animate-pulse" /> Local
            </div>
          </div>

          {/* Top 3 cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <SecuritySummaryCard />
            <TestingSummaryCard />
            <ScannerSummaryCard />
          </div>

          {/* Env + Mocks */}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <EnvironmentStatusBar />
            <MocksStatusBar />
          </div>

          {/* Recent Activity */}
          <div className="mt-6">
            <RecentActivityFeed />
          </div>

          {/* Quick Actions */}
          <div className="mt-6">
            <h2 className="mb-3 text-sm font-semibold tracking-tight" style={{ color: '#E6E8F0', letterSpacing: '-0.01em' }}>Quick Actions</h2>
            <QuickActionsBar />
          </div>

          <div className="mt-6 flex items-center gap-2 text-xs" style={{ color: '#5A5E6E' }}>
            <span className="h-px flex-1" style={{ background: '#1E1E24' }} />
            <span>All cards are live — they update as your stores change, no refresh needed</span>
            <span className="h-px flex-1" style={{ background: '#1E1E24' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
