import { useEffect, useState } from 'react';
import { GitBranch, GitCommit, FolderGit } from 'lucide-react';
import { api } from '../../services/api';

export function GitPanel() {
  const [workspace, setWorkspace] = useState<{ path: string; isGitRepo: boolean; branch: string | null } | null>(null);
  const [status, setStatus] = useState<string[]>([]);
  const [diff, setDiff] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      const ws = await api.workspace.info();
      setWorkspace(ws);
      if (ws.isGitRepo) {
        const s = await api.git.status(ws.path);
        setStatus(s);
        if (s.length > 0) {
          const d = await api.git.diff(ws.path);
          setDiff(d);
        } else {
          setDiff('');
        }
      }
    } catch {
      // fallback for browser preview
      setWorkspace({ path: 'browser', isGitRepo: false, branch: null });
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (!workspace) {
    return <div className="p-2 text-xs text-[var(--text-secondary)]">Loading workspace…</div>;
  }

  return (
    <div className="border-t border-[var(--border)] bg-[var(--bg-secondary)]">
      <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase text-[var(--text-secondary)]">
        <FolderGit size={14} /> Workspace
      </div>
      <div className="px-3 pb-2 text-xs">
        <div className="truncate text-[var(--text-primary)]" title={workspace.path}>{workspace.path}</div>
        <div className="mt-1 flex items-center gap-1 text-[var(--text-secondary)]">
          {workspace.isGitRepo ? (
            <>
              <GitBranch size={12} /> {workspace.branch ?? 'HEAD'} • {status.length} change(s)
            </>
          ) : (
            <span className="text-[var(--text-secondary)]">Not a git repo</span>
          )}
        </div>
        {status.length > 0 && (
          <div className="mt-2">
            <div className="max-h-24 overflow-auto rounded border border-[var(--border)] bg-[var(--bg-primary)] p-2 font-mono text-[10px]">
              {status.map((line, i) => (
                <div key={`${i}-${line}`}>{line}</div>
              ))}
            </div>
            {diff && (
              <details className="mt-2">
                <summary className="cursor-pointer text-[var(--accent)] flex items-center gap-1"><GitCommit size={12}/> Diff</summary>
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded border border-[var(--border)] bg-[var(--bg-primary)] p-2 font-mono text-[10px]">{diff.slice(0, 8000)}{diff.length > 8000 ? '\n…truncated' : ''}</pre>
              </details>
            )}
          </div>
        )}
        <button
          onClick={() => {
            setLoading(true);
            void load().finally(() => setLoading(false));
          }}
          className="mt-2 text-[var(--accent)] hover:underline disabled:opacity-50"
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
    </div>
  );
}
