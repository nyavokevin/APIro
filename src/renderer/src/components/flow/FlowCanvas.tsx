import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FlowGraph, FlowLayoutKind } from '@shared/types/flow';
import { RequestNode } from './RequestNode';
import { FlowEdges } from './FlowEdges';
import { FlowToolbar } from './FlowToolbar';
import { FlowLegend } from './FlowLegend';
import { FlowMinimap } from './FlowMinimap';
import { useRequestStore } from '../../stores/requestStore';
import { useUiStore } from '../../stores/uiStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { Button } from '../ui/Button';

interface Props {
  graph: FlowGraph;
  onLayoutChange: (kind: FlowLayoutKind) => void;
  onNodesChange: (nodes: FlowGraph['nodes']) => void;
  onNodeSelect: (nodeId: string | null) => void;
  selectedNodeId: string | null;
  impactMode?: boolean;
}

export function FlowCanvas({ graph, onLayoutChange, onNodesChange, onNodeSelect, selectedNodeId, impactMode = false }: Props) {
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [activeEdgeId, setActiveEdgeId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [draggingCanvas, setDraggingCanvas] = useState(false);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const nodeDragRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const playTimerRef = useRef<number | null>(null);

  // derived: highlighted nodes during play
  const playSequence = useMemo(
    () => graph.edges.filter((e) => e.edgeType === 'sequence').sort((a, b) => (a.label ?? '').localeCompare(b.label ?? '')),
    [graph.edges]
  );

  const playFlow = useCallback(() => {
    if (playSequence.length === 0 || isPlaying) return;
    setIsPlaying(true);
    let i = 0;
    setActiveEdgeId(playSequence[0]?.id ?? null);
    playTimerRef.current = window.setInterval(() => {
      i += 1;
      if (i >= playSequence.length) {
        if (playTimerRef.current) window.clearInterval(playTimerRef.current);
        playTimerRef.current = null;
        setIsPlaying(false);
        setActiveEdgeId(null);
        return;
      }
      setActiveEdgeId(playSequence[i].id);
    }, 700);
  }, [playSequence, isPlaying]);

  const stopFlow = useCallback(() => {
    if (playTimerRef.current) window.clearInterval(playTimerRef.current);
    playTimerRef.current = null;
    setIsPlaying(false);
    setActiveEdgeId(null);
  }, []);

  useEffect(() => () => { if (playTimerRef.current) window.clearInterval(playTimerRef.current); }, []);

  // Fit view on graph change
  useEffect(() => {
    if (graph.nodes.length === 0) { setScale(1); setOffset({ x: 0, y: 0 }); return; }
    // compute bounds
    const pad = 40;
    const minX = Math.min(...graph.nodes.map((n) => n.x));
    const maxX = Math.max(...graph.nodes.map((n) => n.x + n.width));
    const minY = Math.min(...graph.nodes.map((n) => n.y));
    const maxY = Math.max(...graph.nodes.map((n) => n.y + n.height));
    const w = maxX - minX;
    const h = maxY - minY;
    const el = canvasRef.current;
    if (!el) return;
    const vw = el.clientWidth - pad * 2;
    const vh = el.clientHeight - pad * 2;
    const sx = vw / (w || 1);
    const sy = vh / (h || 1);
    const s = Math.min(1.2, Math.max(0.35, Math.min(sx, sy)));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setScale(s);
    setOffset({ x: -cx * s, y: -cy * s });
  }, [graph.nodes]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.0012;
    setScale((prev) => Math.min(3, Math.max(0.25, prev + delta * prev)));
  }, []);

  const onCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-node]')) return;
    onNodeSelect(null);
    setDraggingCanvas(true);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [offset, onNodeSelect]);

  const onCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    if (nodeDragRef.current) {
      const dx = (e.clientX - nodeDragRef.current.startX) / scale;
      const dy = (e.clientY - nodeDragRef.current.startY) / scale;
      const nx = nodeDragRef.current.origX + dx;
      const ny = nodeDragRef.current.origY + dy;
      const next = graph.nodes.map((n) => (n.id === nodeDragRef.current!.id ? { ...n, x: nx, y: ny } : n));
      onNodesChange(next);
      return;
    }
    if (draggingCanvas && dragRef.current) {
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      setOffset({ x: dragRef.current.ox + dx, y: dragRef.current.oy + dy });
    }
  }, [draggingCanvas, graph.nodes, onNodesChange, scale]);

  const onCanvasPointerUp = useCallback(() => {
    setDraggingCanvas(false);
    nodeDragRef.current = null;
    dragRef.current = null;
  }, []);

  const onNodePointerDown = useCallback((e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    const n = graph.nodes.find((x) => x.id === id);
    if (!n) return;
    nodeDragRef.current = { id, startX: e.clientX, startY: e.clientY, origX: n.x, origY: n.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [graph.nodes]);

  const handleSelect = useCallback((id: string) => {
    onNodeSelect(id === selectedNodeId ? null : id);
  }, [onNodeSelect, selectedNodeId]);

  const handleOpenRequest = useCallback((nodeId: string) => {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const col = useWorkspaceStore.getState().getCollectionById(node.collectionId)
      ?? useWorkspaceStore.getState().getCollectionById(node.requestId)
      ?? null;
    // Try direct lookup by requestId via collections traversal
    let reqData = null as any;
    const findReq = (nodes: any[]): any => {
      for (const c of nodes) {
        if (c.id === node.requestId && c.data) return c.data;
        if (c.id === node.collectionId && c.data) return c.data;
        if (c.children) { const f = findReq(c.children); if (f) return f; }
      }
      return null;
    };
    reqData = findReq(useWorkspaceStore.getState().collections);
    // fallback: if col is request
    if (!reqData && col && (col as any).data) reqData = (col as any).data;
    if (reqData) {
      useRequestStore.getState().openRequest(reqData);
      useUiStore.getState().setActivePage('workspace');
    }
  }, [graph.nodes]);

  const selectedNode = selectedNodeId ? graph.nodes.find((n) => n.id === selectedNodeId) ?? null : null;

  // Impact graph: downstream of selected node via dataFlow/authFlow (BFS) — must be before early return (hooks rule)
  const { impactedNodeIds, impactedEdgeIds } = useMemo(() => {
    if (!impactMode || !selectedNodeId) return { impactedNodeIds: new Set<string>(), impactedEdgeIds: new Set<string>() };
    const depEdges = (graph.edges ?? []).filter(e => e.edgeType === 'dataFlow' || e.edgeType === 'authFlow');
    const adj = new Map<string, string[]>();
    for (const e of depEdges) {
      if (!adj.has(e.source)) adj.set(e.source, []);
      adj.get(e.source)!.push(e.target);
    }
    const visited = new Set<string>();
    const edgeVisited = new Set<string>();
    const queue: string[] = [selectedNodeId];
    visited.add(selectedNodeId);
    while (queue.length) {
      const cur = queue.shift()!;
      const neigh = adj.get(cur) ?? [];
      for (const nb of neigh) {
        const eid = depEdges.find(e => e.source===cur && e.target===nb)?.id;
        if (eid) edgeVisited.add(eid);
        if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
      }
    }
    visited.delete(selectedNodeId);
    return { impactedNodeIds: visited, impactedEdgeIds: edgeVisited };
  }, [impactMode, selectedNodeId, graph.edges]);

  if (graph.nodes.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
          <p className="text-sm font-medium text-[var(--text-primary)]">No requests to visualize</p>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-[var(--text-secondary)]">
            Create a collection with at least two requests. Use <code className="rounded bg-[var(--bg-tertiary)] px-1 py-0.5 font-mono text-[10px]">{'{{var}}'}</code> in URLs/headers and <code className="rounded bg-[var(--bg-tertiary)] px-1 py-0.5 font-mono text-[10px]">pm.environment.set</code> in scripts to see data-flow edges.
          </p>
          <div className="mt-3 flex justify-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => useUiStore.getState().setActivePage('collections')}>Go to Collections</Button>
            <Button variant="primary" size="sm" onClick={() => useUiStore.getState().setActivePage('workspace')}>New Request</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={canvasRef}
      className="relative h-full w-full overflow-hidden bg-[var(--bg-primary)]"
      style={{ cursor: draggingCanvas ? 'grabbing' : 'grab' }}
      onWheel={onWheel}
      onPointerDown={onCanvasPointerDown}
      onPointerMove={onCanvasPointerMove}
      onPointerUp={onCanvasPointerUp}
    >
      {/* grid background */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(to right, #1a1a1a 1px, transparent 1px), linear-gradient(to bottom, #1a1a1a 1px, transparent 1px)',
          backgroundSize: `${24 * scale}px ${24 * scale}px`,
          backgroundPosition: `${offset.x}px ${offset.y}px`,
          opacity: 0.35,
        }}
      />

      <FlowToolbar
        layout={graph.layout}
        onLayoutChange={onLayoutChange}
        onPlay={playFlow}
        onStop={stopFlow}
        isPlaying={isPlaying}
        scale={scale}
        onZoomIn={() => setScale((s) => Math.min(3, s * 1.18))}
        onZoomOut={() => setScale((s) => Math.max(0.25, s / 1.18))}
        onFit={() => {
          const pad = 40;
          const minX = Math.min(...graph.nodes.map((n) => n.x));
          const maxX = Math.max(...graph.nodes.map((n) => n.x + n.width));
          const minY = Math.min(...graph.nodes.map((n) => n.y));
          const maxY = Math.max(...graph.nodes.map((n) => n.y + n.height));
          const w = maxX - minX;
          const h = maxY - minY;
          const el = canvasRef.current;
          if (!el) return;
          const vw = el.clientWidth - pad * 2;
          const vh = el.clientHeight - pad * 2;
          const s = Math.min(1.2, Math.max(0.35, Math.min(vw / (w || 1), vh / (h || 1))));
          const cx = (minX + maxX) / 2;
          const cy = (minY + maxY) / 2;
          setScale(s);
          setOffset({ x: -cx * s, y: -cy * s });
        }}
        graph={graph}
      />

      {/* viewport */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 0,
          height: 0,
          overflow: 'visible',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: '0 0',
            width: 0,
            height: 0,
            overflow: 'visible',
          }}
        >
          <FlowEdges
            edges={graph.edges}
            nodes={graph.nodes}
            hoveredEdgeId={hoveredEdgeId}
            activeEdgeId={activeEdgeId}
            onHover={setHoveredEdgeId}
            impactedEdgeIds={impactMode ? impactedEdgeIds : undefined}
          />
          {graph.nodes.map((n) => {
            const isImpacted = impactMode && impactedNodeIds.has(n.id);
            const isSelected = selectedNodeId === n.id;
            const isDimmedForImpact = impactMode && selectedNodeId && !isSelected && !isImpacted;
            return (
              <div key={n.id} data-node>
                <RequestNode
                  node={isImpacted ? { ...n, color: '#EF4444' } : n}
                  selected={isSelected}
                  dimmed={isDimmedForImpact || (isPlaying && activeEdgeId ? (() => {
                    const e = graph.edges.find((x) => x.id === activeEdgeId);
                    return e ? e.source !== n.id && e.target !== n.id : false;
                  })() : false)}
                  highlighted={isImpacted || (isPlaying && activeEdgeId ? (() => {
                    const e = graph.edges.find((x) => x.id === activeEdgeId);
                    return e ? e.source === n.id || e.target === n.id : false;
                  })() : false)}
                  onSelect={handleSelect}
                  onPointerDown={onNodePointerDown}
                />
              </div>
            );
          })}
        </div>
      </div>

      <FlowMinimap nodes={graph.nodes} offset={offset} scale={scale} viewportEl={canvasRef.current} />

      <FlowLegend />

      {/* details drawer for selected node */}
      {selectedNode && (
        <div className="absolute bottom-3 left-3 max-w-[320px] rounded border border-[var(--border)] bg-[var(--bg-secondary)] p-3 shadow-none">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded px-1.5 py-0.5 text-[10px] font-bold leading-none" style={{ background: `${selectedNode.color}1A`, color: selectedNode.color, border: `1px solid ${selectedNode.color}33`, fontFamily: 'JetBrains Mono, monospace' }}>
                  {selectedNode.method}
                </span>
                <span className="truncate text-xs font-semibold text-[var(--text-primary)]">{selectedNode.label}</span>
              </div>
              <div className="mt-1 truncate font-mono text-[11px] text-[var(--text-secondary)]" title={selectedNode.url}>{selectedNode.url || '—'}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {graph.edges.filter((e) => e.source === selectedNode.id || e.target === selectedNode.id).map((e) => (
                  <span key={e.id} className="rounded border px-1.5 py-0.5 text-[10px] font-medium" style={{ borderColor: e.color, color: e.color, background: `${e.color}14` }}>
                    {e.edgeType === 'dataFlow' ? '⇢' : e.edgeType === 'authFlow' ? '🔑' : '→'} {e.label ?? e.edgeType}
                  </span>
                ))}
                {graph.edges.filter((e) => e.source === selectedNode.id || e.target === selectedNode.id).length === 0 && (
                  <span className="text-[11px] text-[var(--text-muted)]">No connections</span>
                )}
              </div>
            </div>
            <button onClick={() => onNodeSelect(null)} className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]" aria-label="Close">✕</button>
          </div>
          <div className="mt-2.5 flex gap-1.5">
            <Button variant="primary" size="sm" onClick={() => handleOpenRequest(selectedNode.id)}>Open request</Button>
            <Button variant="secondary" size="sm" onClick={() => onNodeSelect(null)}>Close</Button>
          </div>
        </div>
      )}
    </div>
  );
}
