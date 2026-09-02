import { useState } from 'react';
import { useRequestStore } from '../stores/requestStore';
import { useUiStore } from '../stores/uiStore';
import { RequestBuilder } from '../components/request/RequestBuilder';
import { ParamsTab } from '../components/request/ParamsTab';
import { HeadersTab } from '../components/request/HeadersTab';
import { BodyTab } from '../components/request/BodyTab';
import { AuthTab } from '../components/request/AuthTab';
import { PreRequestTab } from '../components/request/PreRequestTab';
import { TestsTab } from '../components/request/TestsTab';
import { ResponseViewer } from '../components/response/ResponseViewer';
import { TestResults } from '../components/testing/TestResults';
import { RequestTabBar } from '../components/request/RequestTabBar';

type TabKey = 'params' | 'headers' | 'body' | 'auth' | 'pre' | 'tests' | 'results';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'params', label: 'Params' },
  { key: 'headers', label: 'Headers' },
  { key: 'body', label: 'Body' },
  { key: 'auth', label: 'Auth' },
  { key: 'pre', label: 'Pre-request' },
  { key: 'tests', label: 'Tests' },
  { key: 'results', label: 'Results' },
];

export function Workspace() {
  const activeTab = useRequestStore((s) => s.getActiveTab());
  const updateRequest = useRequestStore((s) => s.updateRequest);
  const send = useRequestStore((s) => s.send);
  const zenMode = useUiStore((s) => s.zenMode);
  const [tab, setTab] = useState<TabKey>('params');

  if (!activeTab) {
    return (
      <div className="flex h-full flex-col">
        <RequestTabBar />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-[var(--text-secondary)]">
          <span>Open or create a request to get started.</span>
          <button
            onClick={() => useRequestStore.getState().newTab()}
            className="inline-flex items-center gap-1.5 rounded border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
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
    <div className="relative flex h-full flex-col">
      <RequestTabBar />
      <RequestBuilder
        request={request}
        loading={loading}
        onChange={onChange}
        onSend={() => void send(activeTab.id)}
      />

      {!zenMode && (
        <>
          <div className="flex border-b border-[var(--border)] bg-[var(--bg-secondary)]" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                role="tab"
                aria-selected={tab === t.key}
                className={`-mb-px border-b-2 px-4 py-2 text-sm ${
                  tab === t.key
                    ? 'border-[var(--accent)] text-[var(--text-primary)]'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="min-h-[160px] flex-1 overflow-auto border-b border-[var(--border)]">
            {tab === 'params' && <ParamsTab request={request} onChange={onChange} />}
            {tab === 'headers' && <HeadersTab request={request} onChange={onChange} />}
            {tab === 'body' && <BodyTab request={request} onChange={onChange} />}
            {tab === 'auth' && <AuthTab request={request} onChange={onChange} />}
            {tab === 'pre' && <PreRequestTab request={request} onChange={onChange} />}
            {tab === 'tests' && <TestsTab request={request} onChange={onChange} />}
            {tab === 'results' && <TestResults />}
          </div>
        </>
      )}

      <div className="flex-1 overflow-auto">
        <ResponseViewer response={response} loading={loading} request={request} />
      </div>

      {zenMode && (
        <button
          onClick={() => useUiStore.getState().toggleZenMode()}
          title="Exit Zen Mode (Ctrl+\)"
          className="absolute bottom-3 right-3 rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          Exit Zen (Ctrl+\)
        </button>
      )}
    </div>
  );
}
