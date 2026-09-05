import { createContext, useContext, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface TabsContextValue {
  value: string;
  setValue: (v: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

interface TabsProps {
  value: string;
  onValueChange: (v: string) => void;
  children: ReactNode;
  className?: string;
}

export function Tabs({ value, onValueChange, children, className }: TabsProps) {
  return (
    <TabsContext.Provider value={{ value, setValue: onValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn('flex items-stretch gap-0 overflow-x-auto scrollbar-thin', className)}
      style={{ borderBottom: '1px solid #232329', background: '#070709' }}
      role="tablist"
    >
      {children}
    </div>
  );
}

export function TabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  const ctx = useContext(TabsContext);
  if (!ctx) return null;
  const active = ctx.value === value;
  return (
    <button
      onClick={() => ctx.setValue(value)}
      role="tab"
      aria-selected={active}
      className={cn(
        'relative -mb-px inline-flex shrink-0 items-center justify-center border-b-2 px-4 py-3 text-[13px] font-medium transition-all duration-200 hover:text-[#E6E8F0] active:scale-[0.98]'
      )}
      style={{
        borderBottomColor: active ? '#8B5CF6' : 'transparent',
        color: active ? '#E6E8F0' : '#9FA3B5',
        background: active ? 'rgba(139,92,246,0.08)' : 'transparent',
        fontWeight: active ? 600 : 450,
        letterSpacing: '-0.01em',
        borderRadius: '0px',
        transitionTimingFunction: 'cubic-bezier(0.16,1,0.3,1)',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.color = '#E6E8F0';
          e.currentTarget.style.background = '#121215';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.color = '#9FA3B5';
          e.currentTarget.style.background = 'transparent';
        }
      }}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const ctx = useContext(TabsContext);
  if (!ctx || ctx.value !== value) return null;
  return <div className={className}>{children}</div>;
}
