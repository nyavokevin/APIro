import { useCallback, useEffect, useMemo, useState } from 'react';
import { Network, Layers, AlertCircle, Eye, EyeOff, GitBranch, Zap } from 'lucide-react';
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
    function find(nodes: typeof collections, id: string): typeof collections | null {
      for (const n of nodes) {
        if (n.id === id) return n.type === 'folder' ? (n.children ?? []) : [n];
        if (n.children) {
          const f = find(n.children, id);
          if (f) return f;
        }
        if (n.id === id && n.type === 'folder') return n.children ?? [];
      }
      return null;
    }
    const sub = find(collections, selectedCollectionId);
    if (!sub) return collections;
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
    return (
      <div className="flex h-full flex-col bg-[#070709]">
        <div className="border-b border-[#232329] bg-[#0E0E10] px-4 py-3">
          <div className="h-6 w-40 skeleton" style={{ borderRadius: 0 }} />
        </div>
        <div className="flex-1 p-4 space-y-3">
          <div className="h-10 w-full skeleton" />
          <div className="grid grid-cols-3 gap-3">
            <div className="h-20 skeleton" /><div className="h-20 skeleton" /><div className="h-20 skeleton" />
          </div>
          <div className="h-[360px] skeleton" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#070709] overflow-hidden">
      {/* Header — sticky */}
      <div
        className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
        style={{ background: '#0E0E10', borderColor: '#232329' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="flex items-center gap-2.5 text-[13px] font-semibold tracking-tight" style={{ color: '#E6E8F0', letterSpacing: '-0.015em' }}>
            <span className="flex h-7 w-7 items-center justify-center" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.22)', color: '#8B5CF6' }}>
              <Network size={14} strokeWidth={1.9} />
            </span>
            Connection Flow
          </h2>
          <span
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium tabular-nums"
            style={{ background: '#121215', border: '1px solid #232329', color: '#9FA3B5' }}
          >
            <Layers size={12} className="opacity-70" /> {stats.nodes} nodes · {stats.total} edges
          </span>
          {impactMode && selectedNodeId && (
            <span className="hidden lg:inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium" style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.28)' }}>
              <GitBranch size={11} /> impact active
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs font-medium" style={{ color: '#9FA3B5' }}>
            <span className="hidden sm:inline tracking-wide" style={{ letterSpacing: '0.04em', fontSize: '11px' }}>COLLECTION</span>
            <select
              value={selectedCollectionId}
              onChange={(e) => setSelectedCollectionId(e.target.value)}
              className="max-w-[190px] px-2.5 py-1.5 text-xs outline-none transition-colors"
              style={{ background: '#121215', border: '1px solid #232329', color: '#E6E8F0', borderRadius: 0 }}
            >
              {collectionOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {'— '.repeat(o.depth)}{o.label}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={() => setImpactMode((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-[0.97] focus-visible:outline-none"
            style={{
              background: impactMode ? 'rgba(239,68,68,0.12)' : '#121215',
              color: impactMode ? '#EF4444' : '#9FA3B5',
              border: `1px solid ${impactMode ? 'rgba(239,68,68,0.42)' : '#232329'}`,
              borderRadius: 0,
              boxShadow: impactMode ? '0 0 14px rgba(239,68,68,0.18)' : 'none',
            }}
            title="Impact graph — what breaks if this changes"
          >
            <Zap size={12} className={impactMode ? '' : 'opacity-60'} />
            {impactMode ? 'Impact ON' : 'Impact'}
          </button>

          <div className="flex items-center gap-0.5 p-0.5" style={{ background: '#121215', border: '1px solid #232329' }}>
            {([
              { key: 'data', label: 'Data', active: showDataFlow, setter: setShowDataFlow, color: '#4d9fff' },
              { key: 'auth', label: 'Auth', active: showAuth, setter: setShowAuth, color: '#ffb224' },
              { key: 'seq', label: 'Seq', active: showSequence, setter: setShowSequence, color: '#8B5CF6' },
            ] as const).map((t) => (
              <button
                key={t.key}
                onClick={() => (t.setter as any)(!t.active)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium transition-all duration-200 active:scale-[0.97] focus-visible:outline-none"
                style={{
                  background: t.active ? '#1E1E24' : 'transparent',
                  color: t.active ? '#E6E8F0' : '#7A7F93',
                  border: t.active ? '1px solid #2E2E36' : '1px solid transparent',
                  borderRadius: 0,
                }}
                title={t.active ? `Hide ${t.label}` : `Show ${t.label}`}
              >
                <span className="h-2 w-2 shrink-0" style={{ background: t.active ? t.color : '#3a3a42', borderRadius: 1, boxShadow: t.active ? `0 0 6px ${t.color}66` : 'none' }} />
                {t.label}
                {t.active ? <Eye size={11} className="opacity-60" /> : <EyeOff size={11} className="opacity-50" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats bar — sticky below header */}
      <div
        className="sticky top-[57px] z-10 flex flex-wrap items-center gap-2 border-b px-4 py-2.5 text-xs"
        style={{ background: '#070709', borderColor: '#232329' }}
      >
        {impactMode && selectedNodeId && (
          <span className="inline-flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium" style={{ background: 'rgba(239,68,68,0.07)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.24)' }}>
            <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: '#EF4444' }} />
            Impact: downstream of <span className="font-mono font-semibold">{graph.nodes.find((n) => n.id === selectedNodeId)?.label ?? selectedNodeId}</span> — click a node
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 font-medium tabular-nums" style={{ background: '#121215', border: '1px solid #232329', color: '#9FA3B5' }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#8B5CF6' }} />
          <span className="font-semibold" style={{ color: '#E6E8F0' }}>{stats.nodes}</span> requests
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 font-medium tabular-nums" style={{ border: '1px solid rgba(77,159,255,0.28)', color: '#4d9fff', background: 'rgba(77,159,255,0.08)' }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#4d9fff' }} />{stats.data} data-flow
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 font-medium tabular-nums" style={{ border: '1px solid rgba(255,178,36,0.28)', color: '#ffb224', background: 'rgba(255,178,36,0.08)' }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#ffb224' }} />{stats.auth} auth
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 font-medium tabular-nums" style={{ background: '#0E0E10', border: '1px solid #232329', color: '#7A7F93' }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#7A7F93' }} />{stats.seq} sequence
        </span>
        {stats.total === 0 && stats.nodes > 1 && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 font-medium" style={{ border: '1px solid rgba(251,191,36,0.28)', color: '#FBBF24', background: 'rgba(251,191,36,0.08)' }}>
            <AlertCircle size={12} /> No connections detected — add {'{{var}}'} usage or scripts
          </span>
        )}
        <span className="ml-auto hidden sm:inline text-[11px] tracking-wide" style={{ color: '#5A5E6E', letterSpacing: '0.04em' }}>
          {graph.layout} layout
        </span>
      </div>

      {/* Canvas */}
      <div className="min-h-0 flex-1 relative overflow-hidden">
        <FlowCanvas
          graph={graph}
          onLayoutChange={handleLayoutChange}
          onNodesChange={handleNodesChange}
          onNodeSelect={setSelectedNodeId}
          selectedNodeId={selectedNodeId}
          impactMode={impactMode}
        />
      </div>

      {/* Footer hint — sticky */}
      <div className="flex items-center justify-between gap-3 border-t px-4 py-2 text-[11px] leading-none" style={{ background: '#0E0E10', borderColor: '#232329', color: '#7A7F93' }}>
        <span className="hidden sm:inline">
          Drag nodes to rearrange · scroll to zoom · drag canvas to pan · <span className="font-mono font-medium" style={{ color: '#9FA3B5' }}>▶ Play</span> walks the sequence · export SVG / PNG
        </span>
        <span className="sm:hidden">Drag · zoom · pan · Play sequence</span>
        <span className="hidden md:inline-flex items-center gap-1.5 text-[11px]" style={{ color: '#5A5E6E' }}>
          <span className="h-1 w-1 rounded-full" style={{ background: '#2A2A32' }} />
          200ms spring · sharp
        </span>
      </div>
    </div>
  );
}
