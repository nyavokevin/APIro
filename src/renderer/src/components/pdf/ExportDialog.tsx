import { useState } from 'react';
import { Download, Loader2, FileDown } from 'lucide-react';
import type { Collection, PdfExportFormat, PdfExportOptions } from '@shared/types/request';
import { api } from '../../services/api';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  collection?: Collection | null;
  collections: Collection[];
}

const FORMATS: { value: PdfExportFormat; label: string }[] = [
  { value: 'pdf', label: 'PDF' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'html', label: 'HTML' },
  { value: 'openapi-yaml', label: 'OpenAPI (YAML)' },
];

function downloadContent(filename: string, content: string, format: PdfExportFormat) {
  let blob: Blob;
  if (format === 'pdf') {
    const isBase64 = /^[A-Za-z0-9+/=\r\n]+$/.test(content) && content.length > 100;
    if (isBase64) {
      const binary = atob(content.replace(/\s/g, ''));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      blob = new Blob([bytes], { type: 'application/pdf' });
    } else {
      blob = new Blob([content], { type: 'application/pdf' });
    }
  } else if (format === 'html') {
    blob = new Blob([content], { type: 'text/html' });
  } else if (format === 'openapi-yaml') {
    blob = new Blob([content], { type: 'application/x-yaml' });
  } else {
    blob = new Blob([content], { type: 'text/markdown' });
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ExportDialog({ open, onClose, collection, collections }: ExportDialogProps) {
  const [selectedId, setSelectedId] = useState<string>(collection?.id ?? collections[0]?.id ?? '');
  const [title, setTitle] = useState(collection?.name ?? '');
  const [version, setVersion] = useState('1.0.0');
  const [format, setFormat] = useState<PdfExportFormat>('pdf');
  const [primaryColor, setPrimaryColor] = useState('#ff5c00');
  const [logoPath, setLogoPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const target = collections.find((c) => c.id === selectedId) ?? collection ?? null;

  const handleExport = async () => {
    if (!target) {
      setError('Select a collection to export.');
      return;
    }
    setLoading(true);
    setError(null);
    setPreview(null);
    setSuccess(null);
    try {
      const options: PdfExportOptions = {
        title: title || target.name,
        version,
        format,
        primaryColor,
        logoPath: logoPath || undefined,
      };
      const res = await api.pdfExport.generate(target, options);
      if (res.format === 'pdf') {
        const safeName = (title || target.name).replace(/[^\w.-]+/g, '_');
        downloadContent(`${safeName}.pdf`, res.content, 'pdf');
        setSuccess(`Exported "${title || target.name}" as PDF.`);
      } else {
        setPreview(res.content);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPreview = () => {
    if (!preview || !target) return;
    const safeName = (title || target.name).replace(/[^\w.-]+/g, '_');
    downloadContent(`${safeName}.${format === 'openapi-yaml' ? 'yaml' : format}`, preview, format);
    setSuccess(`Downloaded "${safeName}.${format === 'openapi-yaml' ? 'yaml' : format}".`);
  };

  return (
    <Modal open={open} onClose={onClose} title="Export Documentation">
      <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--text-secondary)]">Collection</span>
            <select
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.target.value);
                const c = collections.find((x) => x.id === e.target.value);
                if (c) setTitle(c.name);
              }}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
            >
            {collections.length === 0 && <option value="">No collections</option>}
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input label="Version" value={version} onChange={(e) => setVersion(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--text-secondary)]">Format</span>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as PdfExportFormat)}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
            >
              {FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--text-secondary)]">Primary Color</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-9 w-12 rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)]"
              />
              <Input
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="flex-1"
              />
            </div>
          </label>
        </div>

        <Input
          label="Logo Path (optional)"
          value={logoPath}
          onChange={(e) => setLogoPath(e.target.value)}
          placeholder="C:\\logos\\brand.png or /assets/logo.png"
        />

        {error && <p className="text-sm text-danger">{error}</p>}
        {success && <p className="text-sm text-success">{success}</p>}

        {preview && (
          <div className="space-y-2">
            <p className="text-xs text-[var(--text-secondary)]">Preview</p>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] p-3 text-xs text-[var(--text-primary)]">
              {preview}
            </pre>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" onClick={handleExport} disabled={loading}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
            {loading ? 'Exporting…' : 'Export'}
          </Button>
          {preview && (
            <Button variant="secondary" onClick={handleDownloadPreview}>
              <Download size={14} /> Download
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
