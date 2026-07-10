import { useState, useRef, useCallback } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';
import { uploadNFe } from '../../services/nfeService';

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
}

const INGESTION_RULES = [
  ['Idempotência', 'NF duplicada detectada por access_key e source_hash'],
  ['Rejeição', 'XML inválido, emitente ausente, itens ausentes'],
  ['Warnings', 'Campos opcionais ausentes não bloqueiam o processamento'],
  ['Retry', 'Falha técnica: até 3 tentativas com exponential backoff'],
  ['Dead Letter', 'Falha de dados: encaminhado sem retry automático'],
  ['Rastreabilidade', 'XML original preservado e imutável no Storage'],
] as const;

const PROGRESS_COLOR: Record<FileEntry['status'], string> = {
  duplicate: 'bg-amber-500',
  error: 'bg-red-500',
  queued: 'bg-emerald-500',
  uploading: 'bg-blue-500',
};

export function FiscalUpload({ organizationId, userId, onToast }: Props) {
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList) return;

    const xmlFiles = Array.from(fileList).filter(f => f.name.toLowerCase().endsWith('.xml'));
    if (!xmlFiles.length) {
      onToast('Apenas arquivos XML são aceitos', 'err');
      return;
    }

    setUploading(true);
    setFiles(xmlFiles.map(f => ({ name: f.name, size: f.size, progress: 10, status: 'uploading' })));

    const results = await Promise.allSettled(
      xmlFiles.map(async (file, idx) => {
        const tick = setInterval(() => {
          setFiles(prev => prev.map((f, i) =>
            i === idx && f.progress < 85 ? { ...f, progress: f.progress + 15 } : f
          ));
        }, 300);

        try {
          await uploadNFe(file, organizationId, userId);
          clearInterval(tick);
          setFiles(prev => prev.map((f, i) => i === idx ? { ...f, progress: 100, status: 'queued' } : f));
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

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-6">
        <div
          className={`border-2 border-dashed rounded-[10px] px-8 py-14 text-center cursor-pointer transition-all ${
            dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-400'
          }`}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".xml"
            multiple
            onChange={e => processFiles(e.target.files)}
          />
          <div className="w-12 h-12 bg-blue-50 border border-blue-100 rounded-[10px] flex items-center justify-center mx-auto mb-4 text-blue-600">
            <UploadCloud className="w-6 h-6" />
          </div>
          <div className="text-[15px] font-bold text-gray-900 mb-1.5">Arraste XMLs aqui ou clique para selecionar</div>
          <div className="text-sm text-gray-500 mb-5">Múltiplos arquivos • NF-e modelo 55 • Schema 4.00</div>
          <button
            onClick={e => e.stopPropagation()}
            disabled={uploading}
            className="h-9 px-4 rounded-[6px] text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-all disabled:opacity-50"
          >
            {uploading ? 'Enviando…' : 'Selecionar arquivos'}
          </button>
        </div>

        {files.length > 0 && (
          <div className="mt-5">
            {files.map((f, i) => (
              <div key={i} className="py-3 border-t border-gray-100">
                <div className="flex justify-between items-center mb-1.5">
                  <div className="flex items-center gap-2.5">
                    <FileText className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-sm font-normal text-gray-700">{f.name}</span>
                    <span className="text-xs text-gray-400">{(f.size / 1024).toFixed(1)} KB</span>
                  </div>
                  <div>
                    {f.status === 'queued' && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" /> na fila
                      </span>
                    )}
                    {f.status === 'duplicate' && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                        <AlertTriangle className="w-3.5 h-3.5" /> duplicada
                      </span>
                    )}
                    {f.status === 'error' && <span className="text-xs font-medium text-red-600">{f.error}</span>}
                    {f.status === 'uploading' && <span className="text-xs font-medium text-blue-600">{f.progress}%</span>}
                  </div>
                </div>
                <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${PROGRESS_COLOR[f.status]}`}
                    style={{ width: `${f.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-6">
        <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-4 pb-2.5 border-b border-gray-100">Regras de ingestão</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {INGESTION_RULES.map(([title, desc]) => (
            <div key={title} className="flex gap-2.5 items-start">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-bold text-gray-800 mb-0.5">{title}</div>
                <div className="text-xs text-gray-500">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
