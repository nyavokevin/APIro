import { useState } from 'react';
import { Shield } from 'lucide-react';
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

const TABS: { key: TabKey; label: string; icon?: boolean }[] = [
  { key: 'params', label: 'Params' },
  { key: 'headers', label: 'Headers' },
  { key: 'body', label: 'Body' },
  { key: 'auth', label: 'Auth' },
  { key: 'pre', label: 'Pre-request' },
  { key: 'tests', label: 'Tests' },
  { key: 'results', label: 'Results' },
  { key: 'security', label: 'Security', icon: true },
];

export function Workspace() {
  const activeTab = useRequestStore((s) => s.getActiveTab());
  const updateRequest = useRequestStore((s) => s.updateRequest);
  const send = useRequestStore((s) => s.send);
  const zenMode = useUiStore((s) => s.zenMode);
  const [tab, setTab] = useState<TabKey>('params');

  if (!activeTab) {
    return (
      <div className="flex h-full flex-col bg-[#000000]">
        <RequestTabBar />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-[#8F909E]">
          <span>Open or create a request to get started.</span>
          <button
            onClick={() => useRequestStore.getState().newTab()}
            className="inline-flex items-center gap-1.5 bg-[#121212] px-3 py-2 text-xs font-medium text-[#E2E8F0] hover:bg-[#1A1A1A]"
            style={{ border: '1px solid #262626', borderRadius: '0px' }}
          >
            + New Request Tab
          </button>
        </div>
      </div>
    );
  }

  const { request, response, loading } = activeTab;
  const onChange = (patch: Partial<typeof request>) => updateRequest(activeTab.id, patch);

  return (
    <div className="relative flex h-full flex-col bg-[#000000] overflow-hidden">
      <RequestTabBar />
      <RequestBuilder
        request={request}
        loading={loading}
        onChange={onChange}
        onSend={() => void send(activeTab.id)}
      />

      {!zenMode && (
        <>
          <div
            className="flex bg-[#000000] shrink-0 overflow-x-auto"
            role="tablist"
            style={{ borderBottom: '1px solid #262626', margin: '16px 32px 0 32px' }}
          >
            {TABS.map((t) =>
              t.key === 'security' ? (
                <SecurityTabTrigger key={t.key} active={tab === 'security'} onClick={() => setTab('security')} requestId={activeTab.id} />
              ) : (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key as TabKey)}
                  role="tab"
                  aria-selected={tab === t.key}
                  className="px-4 py-3 text-sm transition-colors duration-150 shrink-0"
                  style={{
                    borderBottom: tab === t.key ? '2px solid #8B5CF6' : '2px solid transparent',
                    color: tab === t.key ? '#E2E8F0' : '#8F909E',
                    marginBottom: '-1px',
                    borderRadius: '0px',
                    fontSize: '13px',
                    fontWeight: 400,
                  }}
                >
                  {t.label}
                </button>
              )
            )}
          </div>

          <div
            className="min-h-[180px] flex-1 overflow-auto bg-[#000000]"
            style={{ borderBottom: '1px solid #262626', margin: '0 32px' }}
          >
            <div className="bg-[#121212] h-full" style={{ border: '1px solid #262626', borderTop: 'none', borderRadius: '0px' }}>
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
        </>
      )}

      <div className="flex-1 overflow-auto bg-[#000000] min-h-0">
        <ResponseViewer response={response} loading={loading} request={request} />
      </div>

      {zenMode && (
        <button
          onClick={() => useUiStore.getState().toggleZenMode()}
          title="Exit Zen Mode (Ctrl+\)"
          className="absolute bottom-3 right-3 bg-[#121212] px-3 py-1.5 text-xs text-[#8F909E] hover:text-[#E2E8F0]"
          style={{ border: '1px solid #262626', borderRadius: '0px' }}
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
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className="inline-flex items-center gap-1.5 px-4 py-3 text-sm transition-colors duration-150 shrink-0"
      style={{
        borderBottom: active ? '2px solid #8B5CF6' : '2px solid transparent',
        color: active ? '#E2E8F0' : '#8F909E',
        marginBottom: '-1px',
        borderRadius: '0px',
        fontSize: '13px',
        fontWeight: 400,
      }}
    >
      <Shield size={13} strokeWidth={1.9} style={{ color: hasHigh ? '#EF4444' : active ? '#8B5CF6' : '#8F909E' }} />
      Security
      {count > 0 && (
        <span
          className="inline-flex items-center justify-center font-semibold"
          style={{
            minWidth: '16px',
            height: '16px',
            padding: '0 4px',
            borderRadius: '9999px',
            background: hasHigh ? '#EF4444' : '#8B5CF6',
            color: '#FFFFFF',
            fontSize: '10px',
            lineHeight: '12px',
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
