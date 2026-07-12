import React, { useState } from 'react';
import { X, AlertTriangle, CheckCircle2, Loader2, RotateCw, Archive } from 'lucide-react';
import { replayDeadLetterEmLote, dismissDeadLetterEmLote } from '../../services/nfeService';
import type { ProcessingJobWithDoc } from '../../types/fiscal';

interface Props {
  jobs: ProcessingJobWithDoc[];
  action: 'replay' | 'dismiss';
  onClose: () => void;
  onDone: () => void;
}

type ActionResult = { ok: string[]; errors: Array<{ id: string; error: string }> } | null;

const FiscalDeadLetterLoteModal: React.FC<Props> = ({ jobs, action, onClose, onDone }) => {
  const [reason, setReason] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ActionResult>(null);

  const dataFailureCount = jobs.filter(j => j.failure_type === 'data_failure').length;
  const isReplay = action === 'replay';

  async function handleRun() {
    setRunning(true);
    try {
      const ids = jobs.map(j => j.id);
      const res = isReplay
        ? await replayDeadLetterEmLote(ids)
        : await dismissDeadLetterEmLote(ids, reason.trim() || undefined);
      // Mostra o resultado ANTES de recarregar no pai
      setResult(res);
      if (res.ok.length > 0) onDone();
    } catch (err: unknown) {
      setResult({ ok: [], errors: [{ id: '', error: err instanceof Error ? err.message : String(err) }] });
    } finally {
      setRunning(false);
    }
  }

  const allDone = result !== null && result.errors.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-[16px] shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-black text-gray-900">
              {isReplay ? 'Replay em lote' : 'Arquivar em lote'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {jobs.length} job{jobs.length !== 1 ? 's' : ''} selecionado{jobs.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={running}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">

          {/* Aviso: replay em massa de data_failure é enganoso */}
          {isReplay && dataFailureCount > 0 && !result && (
            <div className="flex items-start gap-2 p-3 rounded-[10px] bg-amber-50 border border-amber-200 text-amber-700 text-xs">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                <strong>{dataFailureCount} job{dataFailureCount !== 1 ? 's' : ''}</strong> com falha de dados (data_failure).
                O Replay reprocessa o <strong>mesmo XML</strong>, sem alteração — se o defeito continuar,
                voltam para dead letter pelo mesmo motivo. Só prossiga se os arquivos já foram
                substituídos por fora do sistema.
              </span>
            </div>
          )}

          {/* Lista resumida dos jobs */}
          <div className="bg-gray-50 rounded-[10px] border border-gray-100 divide-y divide-gray-100 max-h-40 overflow-y-auto">
            {jobs.map(j => (
              <div key={j.id} className="flex items-center justify-between px-4 py-2 text-xs">
                <span className="text-gray-700 font-medium truncate max-w-[62%]">
                  {j.raw_document?.access_key ? `${j.raw_document.access_key.substring(0, 24)}…` : j.id}
                </span>
                <span className="flex-shrink-0 ml-2">
                  {j.failure_type === 'data_failure'
                    ? <span className="text-red-600">dados</span>
                    : j.failure_type === 'technical_failure'
                      ? <span className="text-amber-600">técnica</span>
                      : <span className="text-gray-400">—</span>}
                </span>
              </div>
            ))}
          </div>

          {/* Resultado da operação */}
          {result && (
            <div className="space-y-2">
              {result.ok.length > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-[10px] bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>
                    {result.ok.length} job{result.ok.length !== 1 ? 's' : ''}{' '}
                    {isReplay ? 'reenviado(s) para replay' : 'arquivado(s)'} com sucesso.
                  </span>
                </div>
              )}
              {result.errors.map((e, i) => (
                <div key={i} className="flex items-start gap-2 p-3 rounded-[10px] bg-red-50 border border-red-200 text-red-700 text-xs">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{e.id ? `Job ${e.id.slice(0, 8)}…: ` : ''}{e.error}</span>
                </div>
              ))}
            </div>
          )}

          {/* Motivo do arquivamento — some após conclusão total */}
          {!isReplay && !allDone && (
            <div>
              <label className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-1.5 block">
                Motivo (opcional — aplicado a todos)
              </label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                disabled={running}
                placeholder="Ex: cliente reenviou os XMLs corrigidos por e-mail, tratados manualmente."
                rows={2}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none disabled:opacity-50"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-4 border-t border-gray-100 flex items-center gap-3">
          <button
            onClick={onClose}
            disabled={running}
            className="flex-1 h-9 px-4 rounded-[6px] bg-gray-100 text-gray-700 font-medium text-[13px] hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            {allDone ? 'Fechar' : 'Cancelar'}
          </button>
          {!allDone && (
            <button
              onClick={handleRun}
              disabled={running || jobs.length === 0}
              className={`flex-1 flex items-center justify-center gap-1.5 h-9 px-4 rounded-[6px] text-white font-medium text-[13px] transition-all active:scale-95 disabled:opacity-40 ${
                isReplay ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {running
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : isReplay ? <RotateCw className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
              {isReplay ? 'Fazer replay' : 'Arquivar jobs'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FiscalDeadLetterLoteModal;
