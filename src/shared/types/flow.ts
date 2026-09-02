// ── Connection Flow Visualizer — shared types ─────────────────────────────
export type FlowNodeType = 'request' | 'environmentVar' | 'collection' | 'script';
export type FlowEdgeType = 'dataFlow' | 'authFlow' | 'dependency' | 'sequence' | 'errorFlow';
export type FlowLayoutKind = 'hierarchical' | 'forceDirected' | 'grid' | 'circular' | 'manual';

export interface FlowNode {
  id: string;
  label: string;
  nodeType: FlowNodeType;
  method: string | null;          // GET, POST...
  url: string;
  collectionId: string;           // owner collection id (for click-through)
  requestId: string;              // original RequestData id
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;                  // method badge color
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  edgeType: FlowEdgeType;
  label: string | null;           // variable name or step index
  animated: boolean;
  color: string;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  layout: FlowLayoutKind;
}

export interface FlowAnalysisOptions {
  layout?: FlowLayoutKind;
  includeSequence?: boolean;
  includeAuth?: boolean;
  includeDataFlow?: boolean;
}
