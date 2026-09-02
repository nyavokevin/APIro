import { type ReactNode } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

interface ResizablePanelsProps {
  left: ReactNode;
  right: ReactNode;
  defaultLeft?: number;
  minLeft?: number;
  minRight?: number;
}

export function ResizablePanels({
  left,
  right,
  defaultLeft = 50,
  minLeft = 20,
  minRight = 20,
}: ResizablePanelsProps) {
  return (
    <PanelGroup direction="horizontal" className="h-full w-full">
      <Panel defaultSize={defaultLeft} minSize={minLeft}>
        {left}
      </Panel>
      <PanelResizeHandle className="w-1.5 cursor-col-resize bg-border transition-colors hover:bg-accent" />
      <Panel minSize={minRight}>{right}</Panel>
    </PanelGroup>
  );
}
