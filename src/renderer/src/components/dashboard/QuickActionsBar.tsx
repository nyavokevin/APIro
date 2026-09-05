import { Plus, ScanLine, Shield, Download } from 'lucide-react';
import { useUiStore } from '../../stores/uiStore';
import { useRequestStore } from '../../stores/requestStore';

export function QuickActionsBar() {
  const newRequest = () => {
    useRequestStore.getState().newTab();
    useUiStore.getState().setActivePage('workspace');
  };
  const runScan = () => {
    // Trigger a scan via the scanner page; for now just navigate and let user pick project
    useUiStore.getState().setActivePage('scanner');
  };
  const openSecurity = () => useUiStore.getState().setActivePage('security');
  const importSpec = () => useUiStore.getState().setActivePage('collections');

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={newRequest}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold transition-all hover:-translate-y-[1px] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.35)]"
        style={{ background: '#8B5CF6', color: 'white', border: '1px solid transparent', boxShadow: '0 0 12px rgba(139,92,246,0.22)' }}
      >
        <Plus size={14} /> New Request
      </button>
      <button
        onClick={runScan}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium transition-all hover:-translate-y-[1px] active:scale-[0.98] hover:border-[#2E2E36] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.35)]"
        style={{ background: '#121215', color: '#E6E8F0', border: '1px solid #232329' }}
      >
        <ScanLine size={14} style={{ color: '#8B5CF6' }} /> Run Full Scan
      </button>
      <button
        onClick={openSecurity}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium transition-all hover:-translate-y-[1px] active:scale-[0.98] hover:border-[#2E2E36]"
        style={{ background: '#121215', color: '#E6E8F0', border: '1px solid #232329' }}
      >
        <Shield size={14} style={{ color: '#EF4444' }} /> Open Security
      </button>
      <button
        onClick={importSpec}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium transition-all hover:-translate-y-[1px] active:scale-[0.98] hover:border-[#2E2E36]"
        style={{ background: '#121215', color: '#E6E8F0', border: '1px solid #232329' }}
      >
        <Download size={14} style={{ color: '#10B981' }} /> Import Spec
      </button>
    </div>
  );
}
