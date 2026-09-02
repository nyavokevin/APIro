import { useMemo } from 'react';
import DOMPurify from 'dompurify';

interface HtmlPreviewProps {
  html: string;
}

export function HtmlPreview({ html }: HtmlPreviewProps) {
  const sanitized = useMemo(() => {
    try {
      return DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ['script', 'object', 'embed', 'link', 'meta', 'base'],
        FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style'],
      });
    } catch {
      // Fallback: escape all
      return html.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  }, [html]);

  // Note: CSP is enforced via DOMPurify + sandbox (no allow-same-origin/popups/forms/top-navigation).
  // We inject a meta CSP into srcDoc for defense-in-depth where supported.
  const srcWithCsp = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">${sanitized}`;
  return (
    <iframe
      title="HTML preview"
      sandbox="allow-scripts"
      srcDoc={srcWithCsp}
      style={{ width: '100%', height: '100%', border: 'none', background: 'white' }}
    />
  );
}
