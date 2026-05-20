import { useState, useRef, useCallback } from 'react';
import { uploadNFe } from '../../services/nfeService';
import type { FiscalPage } from './FiscalModule';

interface FileEntry {
  name: string;
  size: number;
  progress: number;
  status: 'uploading' | 'queued' | 'duplicate' | 'error';
  error?: string;
}

interface Props {
  organizationId: string;
  userId: string;
  onToast: (msg: string, type: 'ok' | 'err') => void;
  onNavigate: (page: FiscalPage) => void;
}

const INGESTION_RULES = [
  ['Idempotência',    'NF duplicada detectada por access_key e source_hash'],
  ['Rejeição',        'XML inválido, emitente ausente, itens ausentes'],
  ['Warnings',        'Campos opcionais ausentes não bloqueiam o processamento'],
  ['Retry',           'Falha técnica: até 3 tentativas com exponential backoff'],
  ['Dead Letter',     'Falha de dados: encaminhado sem retry automático'],
  ['Rastreabilidade', 'XML original preservado e imutável no Storage'],
] as const;

export function FiscalUpload({ organizationId, userId, onToast, onNavigate }: Props) {
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList) return;

    const xmlFiles = Array.from(fileList).filter(
      f => f.name.toLowerCase().endsWith('.xml')
    );
    if (!xmlFiles.length) {
      onToast('Apenas arquivos XML são aceitos', 'err');
      return;
    }

    setUploading(true);
    setFiles(xmlFiles.map(f => ({ name: f.name, size: f.size, progress: 10, status: 'uploading' })));

    const results = await Promise.allSettled(
      xmlFiles.map(async (file, idx) => {
        // Simulação de progresso durante o upload real
        const tick = setInterval(() => {
          setFiles(prev => prev.map((f, i) =>
            i === idx && f.progress < 85 ? { ...f, progress: f.progress + 15 } : f
          ));
        }, 300);

        try {
          await uploadNFe(file, organizationId, userId);
          clearInterval(tick);
          setFiles(prev => prev.map((f, i) =>
            i === idx ? { ...f, progress: 100, status: 'queued' } : f
          ));
          return 'ok';
        } catch (err: any) {
          clearInterval(tick);
          const isDuplicate = err.code === 'DUPLICATE_NF' || err.code === 'DUPLICATE_FILE';
          setFiles(prev => prev.map((f, i) =>
            i === idx ? { ...f, progress: 100, status: isDuplicate ? 'duplicate' : 'error', error: err.message } : f
          ));
          return isDuplicate ? 'duplicate' : 'error';
        }
      })
    );

    setUploading(false);
    const ok = results.filter(r => r.status === 'fulfilled' && r.value === 'ok').length;
    const dupes = results.filter(r => r.status === 'fulfilled' && r.value === 'duplicate').length;
    const errors = results.filter(r => r.status === 'fulfilled' && r.value === 'error').length;

    if (ok > 0) onToast(`${ok} NF-e(s) enviadas para processamento`, 'ok');
    if (dupes > 0) onToast(`${dupes} NF-e(s) duplicadas ignoradas`, 'err');
    if (errors > 0) onToast(`${errors} arquivo(s) com erro`, 'err');
  }, [organizationId, userId, onToast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const progressColor = (status: FileEntry['status']) => {
    if (status === 'duplicate') return 'var(--famber)';
    if (status === 'error')     return 'var(--fred)';
    if (status === 'queued')    return 'var(--fgreen)';
    return 'var(--faccent)';
  };

  return (
    <div className="f-page">
      <div className="f-page-header">
        <div className="f-page-title">Upload NF-e</div>
        <div className="f-page-sub">Envie arquivos XML de nota fiscal eletrônica para processamento automático</div>
      </div>

      <div className="f-card">
        <div
          className={`f-upload-zone ${dragging ? 'dragging' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            className="f-hidden"
            accept=".xml"
            multiple
            onChange={e => processFiles(e.target.files)}
          />
          <div className="f-upload-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <polyline points="9 15 12 12 15 15" />
            </svg>
          </div>
          <div className="f-upload-title">Arraste XMLs aqui ou clique para selecionar</div>
          <div className="f-upload-sub">Múltiplos arquivos • NF-e modelo 55 • Schema 4.00</div>
          <button
            className="f-upload-btn"
            onClick={e => e.stopPropagation()}
            disabled={uploading}
          >
            {uploading ? 'Enviando…' : 'Selecionar arquivos'}
          </button>
        </div>

        {files.length > 0 && (
          <div style={{ marginTop: 20 }}>
            {files.map((f, i) => (
              <div key={i} style={{ padding: '12px 0', borderTop: '1px solid var(--fborder)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ftext2)" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{f.name}</span>
                    <span className="f-mono" style={{ color: 'var(--ftext3)' }}>
                      {(f.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                  <div>
                    {f.status === 'queued'    && <span className="f-badge f-badge-queued">✓ na fila</span>}
                    {f.status === 'duplicate' && <span style={{ fontSize: 11, color: 'var(--famber)', fontFamily: 'monospace' }}>⚠ duplicada</span>}
                    {f.status === 'error'     && <span style={{ fontSize: 11, color: 'var(--fred)', fontFamily: 'monospace' }}>{f.error}</span>}
                    {f.status === 'uploading' && <span className="f-mono" style={{ color: 'var(--faccent)' }}>{f.progress}%</span>}
                  </div>
                </div>
                <div className="f-progress-bar">
                  <div
                    className="f-progress-fill"
                    style={{ width: `${f.progress}%`, background: progressColor(f.status) }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="f-card">
        <div className="f-section-title">Regras de ingestão</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {INGESTION_RULES.map(([title, desc]) => (
            <div key={title} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--fgreen)', marginTop: 2 }}>✓</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{title}</div>
                <div style={{ fontSize: 12, color: 'var(--ftext2)' }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
