import React, { useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { documentService } from '../../services/documentService';
import { usePersistedState } from './TableUtils';
import type { OpuraDocument } from '../../types/documents';

/**
 * Picker de documento do ÒPURA Docs (GED). Reusa documentService.listDocuments —
 * não reimplementa o DMS. Extraído de ProcessosModule para ser compartilhável.
 *
 * `excludeIntegrated`: quando true, oculta os documentos sintéticos
 * (is_integrated — montados a partir de contracts/invoices/etc.) cujo id não
 * existe em opura_documents. Módulos que gravam o id como ponte (ex.: CNO)
 * devem passar true para não referenciar um documento que não resolve.
 *
 * `storageKey`: chave de `usePersistedState` para o campo de busca (§3 do
 * guia). Cada tela que usa o picker deve passar uma chave própria.
 */
export function DocumentPicker({
  organizationId,
  onPick,
  excludeIntegrated = false,
  storageKey = 'documentPicker:search',
}: {
  organizationId: string;
  onPick: (doc: OpuraDocument) => void;
  excludeIntegrated?: boolean;
  storageKey?: string;
}) {
  const [search, setSearch] = usePersistedState<string>(storageKey, '');
  const [docs, setDocs] = useState<OpuraDocument[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    documentService
      .listDocuments(organizationId, { search: search || undefined })
      .then((list) => setDocs(excludeIntegrated ? list.filter((d) => !d.is_integrated) : list))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, [organizationId, search, excludeIntegrated]);

  return (
    <div className="border border-gray-200 rounded-[6px] p-3">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full h-8 px-2 rounded-[6px] border border-gray-200 text-xs mb-2 outline-none focus:border-blue-500"
        placeholder="Buscar documento no DMS..."
      />
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
      ) : (
        <div className="max-h-40 overflow-y-auto space-y-1">
          {docs.slice(0, 20).map((d) => (
            <button
              key={d.id}
              onClick={() => onPick(d)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[6px] hover:bg-blue-50 text-left text-xs"
            >
              <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span className="truncate">{d.nome}</span>
            </button>
          ))}
          {docs.length === 0 && (
            <p className="text-xs text-gray-400 px-2 py-1">Nenhum documento encontrado.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default DocumentPicker;
