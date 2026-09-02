import { Play, Pause, ZoomIn, ZoomOut, Maximize2, Download, Image as ImageIcon } from 'lucide-react';
import type { FlowGraph, FlowLayoutKind } from '@shared/types/flow';
import { Button } from '../ui/Button';
import { renderFlowSvg, downloadSvg, downloadPngFromSvg } from '../../lib/flow/export';

interface Props {
  layout: FlowLayoutKind;
  onLayoutChange: (k: FlowLayoutKind) => void;
  onPlay: () => void;
  onStop: () => void;
  isPlaying: boolean;
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  graph: FlowGraph;
}

const LAYOUTS: { value: FlowLayoutKind; label: string }[] = [
  { value: 'hierarchical', label: 'Hierarchical' },
  { value: 'forceDirected', label: 'Force-Directed' },
  { value: 'grid', label: 'Grid' },
  { value: 'circular', label: 'Circular' },
  { value: 'manual', label: 'Manual' },
];

export function FlowToolbar({ layout, onLayoutChange, onPlay, onStop, isPlaying, scale, onZoomIn, onZoomOut, onFit, graph }: Props) {
  return (
    <div className="pointer-events-auto absolute left-3 top-3 flex flex-wrap items-center gap-1.5 rounded border border-[var(--border)] bg-[var(--bg-secondary)] p-1.5">
      <Button
        variant={isPlaying ? 'secondary' : 'primary'}
        size="sm"
        onClick={isPlaying ? onStop : onPlay}
        disabled={graph.edges.filter((e) => e.edgeType === 'sequence').length === 0 && !isPlaying}
        title={isPlaying ? 'Stop playback' : 'Play sequence step-by-step'}
      >
        {isPlaying ? <Pause size={13} /> : <Play size={13} />}
        {isPlaying ? 'Playing…' : 'Play Flow'}
      </Button>

      <div className="mx-0.5 h-5 w-px bg-[var(--border)]" />

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onZoomOut} aria-label="Zoom out"><ZoomOut size={14} /></Button>
        <span className="min-w-[3.2rem] text-center font-mono text-xs text-[var(--text-secondary)]">{Math.round(scale * 100)}%</span>
        <Button variant="ghost" size="sm" onClick={onZoomIn} aria-label="Zoom in"><ZoomIn size={14} /></Button>
        <Button variant="ghost" size="sm" onClick={onFit} aria-label="Fit view"><Maximize2 size={14} /></Button>
      </div>

      <div className="mx-0.5 h-5 w-px bg-[var(--border)]" />

      <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
        <span className="hidden sm:inline">Layout</span>
        <select
          value={layout}
          onChange={(e) => onLayoutChange(e.target.value as FlowLayoutKind)}
          className="rounded border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        >
          {LAYOUTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>

      <div className="mx-0.5 h-5 w-px bg-[var(--border)]" />

      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          const svg = renderFlowSvg(graph, { title: 'APIForge — Connection Flow' });
          downloadSvg(svg, 'apiforge-flow.svg');
        }}
        title="Export SVG"
      >
        <Download size={13} /> SVG
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={async () => {
          const svg = renderFlowSvg(graph, { title: 'APIForge — Connection Flow' });
          await downloadPngFromSvg(svg, 'apiforge-flow.png');
        }}
        title="Export PNG"
      >
        <ImageIcon size={13} /> PNG
      </Button>
    </div>
  );
}
