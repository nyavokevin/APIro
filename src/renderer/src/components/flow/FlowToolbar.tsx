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
  const seqCount = graph.edges.filter((e) => e.edgeType === 'sequence').length;
  return (
    <div
      className="pointer-events-auto absolute left-3 top-3 z-10 flex flex-wrap items-center gap-1.5 p-1.5"
      style={{
        background: '#0E0E10',
        border: '1px solid #232329',
        borderRadius: 0,
        boxShadow: '0 4px 20px rgba(0,0,0,0.32), 0 1px 0 rgba(255,255,255,0.04) inset',
      }}
    >
      <Button
        variant={isPlaying ? 'secondary' : 'primary'}
        size="sm"
        onClick={isPlaying ? onStop : onPlay}
        disabled={seqCount === 0 && !isPlaying}
        title={isPlaying ? 'Stop playback' : 'Play sequence step-by-step'}
        className="active:scale-[0.97]"
        style={{ minWidth: 92 }}
      >
        {isPlaying ? <Pause size={13} /> : <Play size={13} />}
        {isPlaying ? 'Playing…' : 'Play Flow'}
      </Button>

      <div className="mx-0.5 h-5 w-px" style={{ background: '#232329' }} />

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onZoomOut} aria-label="Zoom out" className="hover:bg-[#121215] active:scale-[0.96]">
          <ZoomOut size={14} />
        </Button>
        <span
          className="min-w-[3.6rem] text-center font-mono text-xs font-medium tabular-nums"
          style={{ color: '#9FA3B5', background: '#121215', border: '1px solid #232329', padding: '2px 6px' }}
        >
          {Math.round(scale * 100)}%
        </span>
        <Button variant="ghost" size="sm" onClick={onZoomIn} aria-label="Zoom in" className="hover:bg-[#121215] active:scale-[0.96]">
          <ZoomIn size={14} />
        </Button>
        <Button variant="ghost" size="sm" onClick={onFit} aria-label="Fit view" className="hover:bg-[#121215] active:scale-[0.96]">
          <Maximize2 size={14} />
        </Button>
      </div>

      <div className="mx-0.5 h-5 w-px" style={{ background: '#232329' }} />

      <label className="flex items-center gap-2 text-xs font-medium" style={{ color: '#9FA3B5' }}>
        <span className="hidden sm:inline text-[11px] tracking-wide" style={{ letterSpacing: '0.05em' }}>LAYOUT</span>
        <select
          value={layout}
          onChange={(e) => onLayoutChange(e.target.value as FlowLayoutKind)}
          className="px-2.5 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.4)] transition-colors"
          style={{ background: '#121215', border: '1px solid #232329', color: '#E6E8F0', borderRadius: 0, minWidth: 128 }}
        >
          {LAYOUTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>

      <div className="mx-0.5 h-5 w-px" style={{ background: '#232329' }} />

      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          const svg = renderFlowSvg(graph, { title: 'APIForge — Connection Flow' });
          downloadSvg(svg, 'apiforge-flow.svg');
        }}
        title="Export SVG"
        className="active:scale-[0.97] hover:border-[#2E2E36]"
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
        className="active:scale-[0.97] hover:border-[#2E2E36]"
      >
        <ImageIcon size={13} /> PNG
      </Button>
    </div>
  );
}
