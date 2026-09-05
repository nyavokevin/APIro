import { useState, useEffect } from 'react';
import { Shield, GripHorizontal } from 'lucide-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useRequestStore } from '../stores/requestStore';
import { useUiStore } from '../stores/uiStore';
import { useSecurityStore } from '../stores/securityStore';
import { RequestBuilder } from '../components/request/RequestBuilder';
import { ParamsTab } from '../components/request/ParamsTab';
import { HeadersTab } from '../components/request/HeadersTab';
import { BodyTab } from '../components/request/BodyTab';
import { AuthTab } from '../components/request/AuthTab';
import { PreRequestTab } from '../components/request/PreRequestTab';
import { TestsTab } from '../components/request/TestsTab';
import { SecurityTab } from '../components/request/SecurityTab';
import { ResponseViewer } from '../components/response/ResponseViewer';
import { TestResults } from '../components/testing/TestResults';
import { RequestTabBar } from '../components/request/RequestTabBar';

type TabKey = 'params' | 'headers' | 'body' | 'auth' | 'pre' | 'tests' | 'results' | 'security';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'params', label: 'Params' },
  { key: 'headers', label: 'Headers' },
  { key: 'body', label: 'Body' },
  { key: 'auth', label: 'Auth' },
  { key: 'pre', label: 'Pre-request' },
  { key: 'tests', label: 'Tests' },
  { key: 'results', label: 'Results' },
  { key: 'security', label: 'Security' },
];

export function Workspace() {
  const activeTab = useRequestStore((s) => s.getActiveTab());
  const updateRequest = useRequestStore((s) => s.updateRequest);
  const send = useRequestStore((s) => s.send);
  const zenMode = useUiStore((s) => s.zenMode);
  const [tab, setTab] = useState<TabKey>('params');

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ requestId?: string }>).detail;
      if (detail?.requestId) {
        const tabs = useRequestStore.getState().tabs;
        const target = tabs.find((t) => t.id === detail.requestId);
        if (target) useRequestStore.getState().setActiveTab(target.id);
      }
      const { activePage, setActivePage } = useUiStore.getState();
      if (activePage !== 'workspace') setActivePage('workspace');
      setTab('security');
    };
    window.addEventListener('apiforge:open-workspace-security', handler as EventListener);
    return () => window.removeEventListener('apiforge:open-workspace-security', handler as EventListener);
  }, []);

  if (!activeTab) {
    return (
      <div className="flex flex-1 min-h-0 flex-col bg-[#070709] overflow-hidden">
        <RequestTabBar />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-sm p-8">
          <div className="flex h-12 w-12 items-center justify-center bg-[#121215] border border-[#232329]" style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
            <Shield size={18} className="text-[#7A7F93]" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold tracking-tight" style={{ color: '#E6E8F0' }}>No request open</p>
            <p className="mt-1 text-xs" style={{ color: '#7A7F93' }}>Open or create a request to get started.</p>
          </div>
          <button
            onClick={() => useRequestStore.getState().newTab()}
            className="inline-flex items-center gap-1.5 bg-[#8B5CF6] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#7C3AED] active:scale-[0.98] transition-all"
            style={{ border: '1px solid transparent', borderRadius: '0px', boxShadow: '0 0 12px rgba(139,92,246,0.25)' }}
          >
            + New Request Tab
          </button>
          <p className="text-[11px] text-[#5A5E6E]">Tip: press Ctrl+N or ⌘K → “New request”</p>
        </div>
      </div>
    );
  }

  const { request, response, loading } = activeTab;
  const onChange = (patch: Partial<typeof request>) => updateRequest(activeTab.id, patch);

  return (
    <div className="relative flex flex-1 min-h-0 max-h-full flex-col bg-[#070709] overflow-hidden" style={{ height: '100%', maxHeight: '100%' }}>
      <RequestTabBar />
      <RequestBuilder
        request={request}
        loading={loading}
        onChange={onChange}
        onSend={() => void send(activeTab.id)}
      />

      {zenMode ? (
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-[#070709]">
          <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
            <ResponseViewer response={response} loading={loading} request={request} />
          </div>
        </div>
      ) : (
        <PanelGroup direction="vertical" className="flex-1 min-h-0" style={{ height: '100%' }}>
          {/* Top — Tabs + Tab content (resizable) */}
          <Panel defaultSize={48} minSize={22} maxSize={75} className="flex flex-col min-h-0">
            <div className="flex shrink-0 overflow-x-auto scrollbar-thin" role="tablist" style={{ background: '#070709', borderBottom: '1px solid #232329', margin: '14px 28px 0 28px' }}>
              {TABS.map((t) =>
                t.key === 'security' ? (
                  <SecurityTabTrigger key={t.key} active={tab === 'security'} onClick={() => setTab('security')} requestId={activeTab.id} />
                ) : (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key as TabKey)}
                    role="tab"
                    aria-selected={tab === t.key}
                    className="px-4 py-3 text-sm transition-all duration-200 shrink-0 hover:text-[#E6E8F0] active:scale-[0.98]"
                    style={{
                      borderBottom: tab === t.key ? '2px solid #8B5CF6' : '2px solid transparent',
                      color: tab === t.key ? '#E6E8F0' : '#9FA3B5',
                      background: tab === t.key ? 'rgba(139,92,246,0.08)' : 'transparent',
                      marginBottom: '-1px',
                      borderRadius: '0px',
                      fontSize: '13px',
                      fontWeight: tab === t.key ? 600 : 450,
                      letterSpacing: '-0.01em',
                      transitionTimingFunction: 'cubic-bezier(0.16,1,0.3,1)',
                    }}
                    onMouseEnter={(e) => {
                      if (tab !== t.key) {
                        (e.currentTarget as HTMLButtonElement).style.background = '#121215';
                        (e.currentTarget as HTMLButtonElement).style.color = '#E6E8F0';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (tab !== t.key) {
                        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                        (e.currentTarget as HTMLButtonElement).style.color = '#9FA3B5';
                      }
                    }}
                  >
                    {t.label}
                  </button>
                )
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ background: '#070709', margin: '0 28px', scrollbarGutter: 'stable' } as React.CSSProperties}>
              <div className="bg-[#121215] min-h-full" style={{ border: '1px solid #232329', borderTop: 'none', borderRadius: '0px', boxShadow: '0 1px 8px rgba(0,0,0,0.22)' }}>
                {tab === 'params' && <ParamsTab request={request} onChange={onChange} />}
                {tab === 'headers' && <HeadersTab request={request} onChange={onChange} />}
                {tab === 'body' && <BodyTab request={request} onChange={onChange} />}
                {tab === 'auth' && <AuthTab request={request} onChange={onChange} />}
                {tab === 'pre' && <PreRequestTab request={request} onChange={onChange} />}
                {tab === 'tests' && <TestsTab request={request} onChange={onChange} />}
                {tab === 'results' && <TestResults />}
                {tab === 'security' && <SecurityTab request={request} response={response} requestId={activeTab.id} />}
              </div>
            </div>
          </Panel>

          <PanelResizeHandle className="group relative flex h-2 shrink-0 items-center justify-center bg-[#070709] hover:bg-[#121215] transition-colors">
            <div className="h-px w-full" style={{ background: '#232329' }} />
            <div className="absolute flex items-center justify-center gap-1 rounded-full bg-[#1E1E24] px-2 py-0.5 opacity-0 group-hover:opacity-100 group-data-[resize-handle-state=drag]:opacity-100 transition-opacity border border-[#2E2E36] shadow-sm">
              <GripHorizontal size={10} className="text-[#7A7F93]" />
              <span className="text-[10px] font-medium tracking-wide text-[#7A7F93] hidden sm:inline">drag to resize</span>
            </div>
          </PanelResizeHandle>

          {/* Bottom — Response (resizable) */}
          <Panel defaultSize={52} minSize={25} className="flex flex-col min-h-0 overflow-hidden bg-[#070709]">
            <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
              <ResponseViewer response={response} loading={loading} request={request} />
            </div>
          </Panel>
        </PanelGroup>
      )}

      {zenMode && (
        <button
          onClick={() => useUiStore.getState().toggleZenMode()}
          title="Exit Zen Mode (Ctrl+\)"
          className="absolute bottom-3 right-3 bg-[#121215] px-3 py-1.5 text-xs hover:text-[#E6E8F0] active:scale-[0.98] transition-all"
          style={{ color: '#7A7F93', border: '1px solid #232329', borderRadius: '0px', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}
        >
          Exit Zen (Ctrl+\)
        </button>
      )}
    </div>
  );
}

function SecurityTabTrigger({ active, onClick, requestId }: { active: boolean; onClick: () => void; requestId: string }) {
  const count = useSecurityStore((s) => s.getFindingCountForRequest(requestId));
  const hasHigh = useSecurityStore((s) =>
    s.findings.some((f) => f.requestId === requestId && !f.dismissed && (f.severity === 'critical' || f.severity === 'high'))
  );
  const showIcon = count > 0;
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className="inline-flex items-center gap-1.5 px-4 py-3 text-sm transition-all duration-200 shrink-0 hover:text-[#E6E8F0] active:scale-[0.98]"
      style={{
        borderBottom: active ? '2px solid #8B5CF6' : '2px solid transparent',
        color: active ? '#E6E8F0' : '#9FA3B5',
        background: active ? 'rgba(139,92,246,0.08)' : 'transparent',
        marginBottom: '-1px',
        borderRadius: '0px',
        fontSize: '13px',
        fontWeight: active ? 600 : 450,
        letterSpacing: '-0.01em',
        transitionTimingFunction: 'cubic-bezier(0.16,1,0.3,1)',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.background = '#121215';
          (e.currentTarget as HTMLButtonElement).style.color = '#E6E8F0';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = '#9FA3B5';
        }
      }}
      title={showIcon ? `${count} finding(s)` : 'Security — no findings'}
    >
      {showIcon && <Shield size={13} strokeWidth={1.9} style={{ color: hasHigh ? '#EF4444' : active ? '#8B5CF6' : '#9FA3B5' }} aria-hidden />}
      Security
      {count > 0 && (
        <span
          className="inline-flex items-center justify-center font-semibold tabular-nums"
          style={{
            minWidth: '16px',
            height: '16px',
            padding: '0 4px',
            borderRadius: '9999px',
            background: hasHigh ? '#EF4444' : '#8B5CF6',
            color: '#FFFFFF',
            fontSize: '10px',
            lineHeight: '12px',
            boxShadow: hasHigh ? '0 0 6px rgba(239,68,68,0.35)' : '0 0 6px rgba(139,92,246,0.3)',
          }}
        >
          {count}
        </span>
      )}
      {showIcon && hasHigh && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-[#EF4444] animate-pulse" aria-hidden />}
    </button>
  );
}
