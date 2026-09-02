interface HeadersViewProps {
  headers: Record<string, string>;
}

export function HeadersView({ headers }: HeadersViewProps) {
  const entries = Object.entries(headers);
  if (entries.length === 0) {
    return <p className="p-3 text-sm text-[var(--text-secondary)]">No headers.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-[var(--text-secondary)]">
          <th className="px-3 py-1 font-medium">Name</th>
          <th className="px-3 py-1 font-medium">Value</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k} className="border-t border-[var(--border)]">
            <td className="px-3 py-1 font-mono text-[var(--accent)]">{k}</td>
            <td className="px-3 py-1 font-mono text-[var(--text-primary)] break-all">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
