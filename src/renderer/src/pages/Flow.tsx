import { useCallback, useEffect, useMemo, useState } from 'react';
import { Network, Layers, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { FlowCanvas } from '../components/flow/FlowCanvas';
import { analyzeFlow } from '../lib/flow/analyzer';
import { applyLayout } from '../lib/flow/layout';
import type { FlowGraph, FlowLayoutKind } from '@shared/types/flow';


export function Flow() {
  const collections = useWorkspaceStore((s) => s.collections);
  const loading = useWorkspaceStore((s) => s.loading);

  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('__all__');
  const [layout, setLayout] = useState<FlowLayoutKind>('hierarchical');
  const [showSequence, setShowSequence] = useState(true);
  const [showAuth, setShowAuth] = useState(true);
  const [showDataFlow, setShowDataFlow] = useState(true);
  const [graph, setGraph] = useState<FlowGraph>({ nodes: [], edges: [], layout: 'hierarchical' });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [impactMode, setImpactMode] = useState(false);

  // Build list of collection options (top-level + folders)
  const collectionOptions = useMemo(() => {
    const opts: { id: string; label: string; depth: number }[] = [{ id: '__all__', label: 'All Collections', depth: 0 }];
    function walk(nodes: typeof collections, depth: number) {
      for (const n of nodes) {
        if (n.type === 'folder') {
          opts.push({ id: n.id, label: n.name, depth });
          if (n.children) walk(n.children, depth + 1);
        }
      }
    }
    walk(collections, 0);
    return opts;
  }, [collections]);

  const sourceCollections = useMemo(() => {
    if (selectedCollectionId === '__all__') return collections;
    // find subtree
    function find(nodes: typeof collections, id: string): typeof collections | null {
      for (const n of nodes) {
        if (n.id === id) return n.type === 'folder' ? (n.children ?? []) : [n];
        if (n.children) {
          const f = find(n.children, id);
          if (f) return f;
        }
        // if the selected node itself is a folder, wrap as synthetic collection
        if (n.id === id && n.type === 'folder') return n.children ?? [];
      }
      return null;
    }
    const sub = find(collections, selectedCollectionId);
    if (!sub) return collections;
    // wrap sub into a synthetic root so analyzer keeps grouping
    const owner = (() => {
      function findOwner(nodes: typeof collections, id: string): (typeof collections)[number] | null {
        for (const n of nodes) {
          if (n.id === id) return n;
          if (n.children) { const f = findOwner(n.children, id); if (f) return f; }
        }
        return null;
      }
      return findOwner(collections, selectedCollectionId);
    })();
    if (owner && owner.type === 'folder') {
      return [{ ...owner, children: sub }];
    }
    return sub;
  }, [collections, selectedCollectionId]);

  // recompute graph when sources or toggles change
  useEffect(() => {
    const g = analyzeFlow(sourceCollections, {
      layout,
      includeSequence: showSequence,
      includeAuth: showAuth,
      includeDataFlow: showDataFlow,
    });
    setGraph(g);
    setSelectedNodeId(null);
  }, [sourceCollections, layout, showSequence, showAuth, showDataFlow]);

  const handleLayoutChange = useCallback((kind: FlowLayoutKind) => {
    setLayout(kind);
    setGraph((prev) => {
      const next: FlowGraph = { ...prev, layout: kind, nodes: prev.nodes.map((n) => ({ ...n })), edges: [...prev.edges] };
      applyLayout(next, kind);
      return next;
    });
  }, []);

  const handleNodesChange = useCallback((nodes: FlowGraph['nodes']) => {
    setGraph((prev) => ({ ...prev, nodes }));
  }, []);

  const stats = useMemo(() => {
    const data = graph.edges.filter((e) => e.edgeType === 'dataFlow').length;
    const auth = graph.edges.filter((e) => e.edgeType === 'authFlow').length;
    const seq = graph.edges.filter((e) => e.edgeType === 'sequence').length;
    return { nodes: graph.nodes.length, data, auth, seq, total: graph.edges.length };
  }, [graph]);

  if (loading && collections.length === 0) {
    return <div className="flex h-full items-center justify-center text-sm text-[var(--text-secondary)]">Loading collections…</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg-primary)]">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
        <div className="flex items-center gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <Network size={16} className="text-[var(--accent)]" /> Connection Flow
          </h2>
          <span className="hidden items-center gap-1.5 rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-secondary)] sm:flex">
            <Layers size={12} /> {stats.nodes} nodes · {stats.total} edges
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* collection selector */}
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <span className="hidden sm:inline">Collection</span>
            <select
              value={selectedCollectionId}
              onChange={(e) => setSelectedCollectionId(e.target.value)}
              className="max-w-[180px] rounded border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            >
              {collectionOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {'— '.repeat(o.depth)}{o.label}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={()=>setImpactMode(v=>!v)}
            className={`px-2 py-1 text-xs font-medium border ${impactMode?'bg-[rgba(239,68,68,0.15)] text-[#EF4444] border-[#EF4444]':'bg-[var(--bg-primary)] text-[var(--text-secondary)] border-[var(--border)]'}`}
            style={{borderRadius:'0px'}}
            title="Impact graph — what breaks if this changes"
          >
            {impactMode?'Impact ON':'Impact'}
          </button>
          <div className="flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] p-0.5">
            {([
              { key: 'data', label: 'Data', active: showDataFlow, setter: setShowDataFlow, color: '#4d9fff' },
              { key: 'auth', label: 'Auth', active: showAuth, setter: setShowAuth, color: '#ffb224' },
              { key: 'seq', label: 'Seq', active: showSequence, setter: setShowSequence, color: '#767676' },
            ] as const).map((t) => (
              <button
                key={t.key}
                onClick={() => (t.setter as any)(!t.active)}
                className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                  t.active ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title={t.active ? `Hide ${t.label}` : `Show ${t.label}`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: t.active ? t.color : '#3d3d3d' }} />
                {t.label}
                {t.active ? <Eye size={11} className="opacity-60" /> : <EyeOff size={11} className="opacity-60" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap gap-1.5 border-b border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2 text-xs">
        {impactMode && selectedNodeId && (
          <span className="px-2 py-1 text-xs font-medium" style={{ background:'rgba(239,68,68,0.10)', color:'#EF4444', border:'1px solid #EF4444', borderRadius:'0px' }}>
            Impact: downstream of {graph.nodes.find(n=>n.id===selectedNodeId)?.label ?? selectedNodeId} highlighted in red — click a node
          </span>
        )}
        <span className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">{stats.nodes}</span> requests
        </span>
        <span className="rounded border px-2 py-1" style={{ borderColor: '#4d9fff44', color: '#4d9fff', background: '#4d9fff0f' }}>{stats.data} data-flow</span>
        <span className="rounded border px-2 py-1" style={{ borderColor: '#ffb22444', color: '#ffb224', background: '#ffb2240f' }}>{stats.auth} auth</span>
        <span className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 text-[var(--text-secondary)]">{stats.seq} sequence</span>
        {stats.total === 0 && stats.nodes > 1 && (
          <span className="inline-flex items-center gap-1 rounded border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-2 py-1 text-[var(--warning)]">
            <AlertCircle size={12} /> No connections detected — add {'{{var}}'} usage or scripts
          </span>
        )}
      </div>

      {/* Canvas */}
      <div className="min-h-0 flex-1">
        <FlowCanvas
          graph={graph}
          onLayoutChange={handleLayoutChange}
          onNodesChange={handleNodesChange}
          onNodeSelect={setSelectedNodeId}
          selectedNodeId={selectedNodeId}
          impactMode={impactMode}
        />
      </div>

      {/* Footer hint */}
      <div className="border-t border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-1.5 text-[11px] text-[var(--text-muted)]">
        Tip: drag nodes to rearrange · scroll to zoom · drag canvas to pan · <span className="font-mono">▶ Play</span> walks the sequence · export as SVG/PNG.
      </div>
    </div>
  );
}
