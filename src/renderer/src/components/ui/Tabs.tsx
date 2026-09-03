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
    <div className={cn('flex', className)} style={{ borderBottom: '1px solid #262626' }}>{children}</div>
  );
}

export function TabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  const ctx = useContext(TabsContext);
  if (!ctx) return null;
  const active = ctx.value === value;
  return (
    <button
      onClick={() => ctx.setValue(value)}
      className={cn(
        'relative -mb-px border-b-2 px-4 py-3 text-sm font-medium transition-colors duration-150'
      )}
      style={{
        borderBottom: active ? '2px solid #8B5CF6' : '2px solid transparent',
        color: active ? '#E2E8F0' : '#8F909E',
        borderRadius: '0px',
        paddingLeft: '16px',
        paddingRight: '16px',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = '#E2E8F0'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = '#8F909E'; }}
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
