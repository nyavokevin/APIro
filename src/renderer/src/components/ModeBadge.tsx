export function ModeBadge() {
  const mode = (window as unknown as { __APIFORGE_MODE__?: string }).__APIFORGE_MODE__;
  if (mode !== 'web') return null;
  return (
    <span
      title="Running outside the desktop app — data is stored in localStorage and the browser fetch API is used. Third-party APIs may block cross-origin requests (CORS)."
      className="ml-2 rounded bg-info/20 px-1.5 py-0.5 text-[10px] font-medium text-info"
    >
      Web mode
    </span>
  );
}
