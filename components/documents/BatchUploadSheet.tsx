import React from 'react';
import {
  UploadCloud,
  X,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import ActionIconButton from '../ui/ActionIconButton';
import { renderFileIcon } from './DocumentsTable';
import { documentService, OpuraDmsDocumentType } from '../../services/documentService';
import { validateFileNameAgainstMask, extractTokenFromFileName, planBatchFileNames } from '../../utils/dmsUtils';
import { OpuraDocumentCategoria, OpuraDocumentInsert, OpuraFolder } from '../../types';

// Mesmas regras de `executeUpload` em OpuraDocsModule.tsx — mantidas em sincronia manual
// (não vale a pena extrair pra util só por 2 constantes usadas em 2 lugares).
const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'dwg', 'jpg', 'png'];
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 3;

type BatchItemStatus = 'pronto' | 'invalido' | 'enviando' | 'enviado' | 'erro';

interface BatchItemOverrides {
  tipo_documento?: string;
  data_emissao?: string;
  data_validade?: string;
  alerta_dias_antecedencia?: number;
  project_id?: string;
  company_id?: string;
  tagsInput?: string;
}

interface BatchItem {
  key: string;
  file: File;
  fileName: string;
  status: BatchItemStatus;
  invalidReason?: string;
  progress: number;
  error?: string;
  expanded: boolean;
  overrides: BatchItemOverrides;
}

interface CompanyOption {
  id: string;
  razao_social: string;
}

export interface BatchUploadSheetProps {
  open: boolean;
  onClose: () => void;
  activeOrganizationId: string | null;
  organizations: { id: string; name: string }[];
  categoria: OpuraDocumentCategoria;
  categoriaLabel: string;
  currentFolderId: string | null;
  activeFolder?: OpuraFolder;
  docsInFolder: { nome: string }[];
  obras: any[];
  selectedProjectId: string;
  companies: CompanyOption[];
  documentTypes: OpuraDmsDocumentType[];
  currentProfile: { email?: string };
  notify: (message: string, type?: 'success' | 'error') => void;
  onFinished: () => void;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function generateKey(): string {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Valida um item já nomeado contra as regras da pasta (máscara + disciplina permitida). */
function validateAgainstFolder(fileName: string, activeFolder?: OpuraFolder): string | undefined {
  const mask = activeFolder?.naming_mask;
  if (mask) {
    if (!validateFileNameAgainstMask(fileName, mask)) {
      return `Nome não segue a máscara desta pasta ("${mask}").`;
    }
    if (activeFolder?.disciplines && activeFolder.disciplines.length > 0) {
      const extractedDisc = extractTokenFromFileName(fileName, mask, '[DISCIPLINA]');
      if (extractedDisc && !activeFolder.disciplines.some((d) => d.toUpperCase() === extractedDisc.toUpperCase())) {
        return `Disciplina "${extractedDisc}" não é permitida nesta pasta (${activeFolder.disciplines.join(', ')}).`;
      }
    }
  }
  return undefined;
}

/** Extensão + tamanho — mesma checagem de `executeUpload`, aplicada por arquivo. */
function validateFileBasics(file: File): string | undefined {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return 'Formato não permitido. Use: PDF, DOCX, XLSX, DWG, JPG ou PNG.';
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'Arquivo excede o limite de 50MB.';
  }
  return undefined;
}

/**
 * Upload em lote do GED — painel lateral (UI_PATTERNS §2/§3: muitas etapas,
 * mas o contexto da pasta/aba atrás continua visível). Reusa
 * `documentService.uploadNewDocument` (1 chamada por arquivo, já com rollback
 * banco+storage) e a lógica de máscara de `utils/dmsUtils.ts` — nenhum
 * endpoint novo.
 */
export function BatchUploadSheet({
  open,
  onClose,
  activeOrganizationId,
  organizations,
  categoria,
  categoriaLabel,
  currentFolderId,
  activeFolder,
  docsInFolder,
  obras,
  selectedProjectId,
  companies,
  documentTypes,
  currentProfile,
  notify,
  onFinished,
}: BatchUploadSheetProps) {
  const confirm = useConfirm();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [orgId, setOrgId] = React.useState('');
  const [items, setItems] = React.useState<BatchItem[]>([]);
  const [sending, setSending] = React.useState(false);

  // Padrões do lote — mesmos campos do modal de upload unitário.
  const [defaultTipo, setDefaultTipo] = React.useState('');
  const [defaultProjectId, setDefaultProjectId] = React.useState(
    selectedProjectId !== 'all' ? selectedProjectId : ''
  );
  const [defaultCompanyId, setDefaultCompanyId] = React.useState('');
  const [defaultEmissao, setDefaultEmissao] = React.useState('');
  const [defaultValidade, setDefaultValidade] = React.useState('');
  const [defaultAlertaDias, setDefaultAlertaDias] = React.useState(30);
  const [defaultTagsInput, setDefaultTagsInput] = React.useState('');

  // Reset ao abrir — cada sessão de upload em lote começa limpa.
  React.useEffect(() => {
    if (!open) return;
    setOrgId('');
    setItems([]);
    setDefaultTipo('');
    setDefaultProjectId(selectedProjectId !== 'all' ? selectedProjectId : '');
    setDefaultCompanyId('');
    setDefaultEmissao('');
    setDefaultValidade('');
    setDefaultAlertaDias(30);
    setDefaultTagsInput('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const obraCode = React.useMemo(() => {
    const proj = obras.find((o: any) => o.id === defaultProjectId);
    return proj?.code || proj?.name || '';
  }, [obras, defaultProjectId]);

  // Nomes já "ocupados" para o planejamento de sequência: documentos existentes
  // na pasta + arquivos já adicionados neste lote (qualquer que seja o status).
  const addFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const incoming = Array.from(fileList);

    const existingForPlanning = docsInFolder.concat(items.map((i) => ({ nome: i.fileName })));
    const plan = activeFolder?.naming_mask
      ? planBatchFileNames(
          incoming.map((f) => f.name),
          activeFolder.naming_mask,
          { obraCode, defaultDiscipline: activeFolder.disciplines?.[0] },
          existingForPlanning
        )
      : incoming.map((f) => ({ originalName: f.name, tokens: {}, suggestedName: f.name, alreadyValid: true }));

    const newItems: BatchItem[] = incoming.map((file, idx) => {
      const suggestedName = plan[idx].suggestedName;
      const basicError = validateFileBasics(file);
      const folderError = basicError ? undefined : validateAgainstFolder(suggestedName, activeFolder);
      const error = basicError || folderError;
      return {
        key: generateKey(),
        file,
        fileName: suggestedName,
        status: error ? 'invalido' : 'pronto',
        invalidReason: error,
        progress: 0,
        expanded: false,
        overrides: {},
      };
    });

    setItems((prev) => [...prev, ...newItems]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
  };

  const updateItem = (key: string, patch: Partial<BatchItem>) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  };

  const renameItem = (key: string, newName: string) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.key !== key) return i;
        const basicError = validateFileBasics(i.file);
        const folderError = basicError ? undefined : validateAgainstFolder(newName, activeFolder);
        const error = basicError || folderError;
        return { ...i, fileName: newName, status: error ? 'invalido' : 'pronto', invalidReason: error };
      })
    );
  };

  const updateOverride = (key: string, patch: Partial<BatchItemOverrides>) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, overrides: { ...i.overrides, ...patch } } : i)));
  };

  // Colisão de nome final entre itens do lote — checada à parte da validação
  // de máscara (que é por item), porque depende do conjunto inteiro.
  const duplicateKeys = React.useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((i) => {
      const k = i.fileName.trim().toLowerCase();
      counts.set(k, (counts.get(k) || 0) + 1);
    });
    const dup = new Set<string>();
    items.forEach((i) => {
      if ((counts.get(i.fileName.trim().toLowerCase()) || 0) > 1) dup.add(i.key);
    });
    return dup;
  }, [items]);

  const readyCount = items.filter((i) => i.status === 'pronto' && !duplicateKeys.has(i.key)).length;
  const errorCount = items.filter((i) => i.status === 'invalido' || i.status === 'erro' || duplicateKeys.has(i.key)).length;

  const targetOrgId = activeOrganizationId || orgId;

  const buildPayload = (item: BatchItem): OpuraDocumentInsert => {
    const tags = (item.overrides.tagsInput ?? defaultTagsInput)
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const nome = item.fileName.includes('.') ? item.fileName.split('.').slice(0, -1).join('.') : item.fileName;
    return {
      organization_id: targetOrgId,
      nome,
      descricao: undefined,
      autor: undefined,
      categoria,
      tipo_documento: item.overrides.tipo_documento ?? defaultTipo,
      status: 'ativo',
      data_emissao: item.overrides.data_emissao ?? defaultEmissao ?? undefined,
      data_validade: item.overrides.data_validade ?? defaultValidade ?? undefined,
      alerta_dias_antecedencia: item.overrides.alerta_dias_antecedencia ?? defaultAlertaDias,
      tags,
      project_id: item.overrides.project_id ?? defaultProjectId ?? undefined,
      company_id: item.overrides.company_id ?? defaultCompanyId ?? undefined,
      contract_id: undefined,
      supplier_id: undefined,
      client_id: undefined,
      investor_id: undefined,
      folder_id: currentFolderId || undefined,
    };
  };

  const uploadOne = async (item: BatchItem) => {
    updateItem(item.key, { status: 'enviando', progress: 30, error: undefined });
    try {
      const renamedFile =
        item.fileName !== item.file.name ? new File([item.file], item.fileName, { type: item.file.type }) : item.file;
      await documentService.uploadNewDocument(buildPayload(item), renamedFile, currentProfile?.email || 'sistema');
      updateItem(item.key, { status: 'enviado', progress: 100 });
      return true;
    } catch (err: any) {
      updateItem(item.key, { status: 'erro', progress: 100, error: err.message || 'Erro ao enviar.' });
      return false;
    }
  };

  const runQueue = async (queue: BatchItem[]) => {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(UPLOAD_CONCURRENCY, queue.length) }, async () => {
      while (cursor < queue.length) {
        const item = queue[cursor];
        cursor += 1;
        await uploadOne(item);
      }
    });
    await Promise.all(workers);
  };

  const handleSend = async () => {
    if (!targetOrgId) {
      notify('Selecione uma organização para o lote.', 'error');
      return;
    }
    if (!defaultTipo) {
      notify('Selecione o tipo de documento padrão do lote.', 'error');
      return;
    }
    const queue = items.filter((i) => i.status === 'pronto' && !duplicateKeys.has(i.key));
    if (queue.length === 0) {
      notify('Nenhum arquivo pronto para envio.', 'error');
      return;
    }

    setSending(true);
    try {
      await runQueue(queue);
    } finally {
      setSending(false);
    }

    // Recontagem pós-envio — os itens já foram atualizados via updateItem dentro da fila.
    setItems((current) => {
      const sent = current.filter((i) => i.status === 'enviado').length;
      const failed = current.filter((i) => i.status === 'erro').length;
      if (sent > 0) notify(`${sent} documento(s) enviado(s)${failed > 0 ? `, ${failed} com erro` : ''}.`, failed > 0 ? 'error' : 'success');
      else if (failed > 0) notify(`${failed} documento(s) com erro.`, 'error');
      return current;
    });
    onFinished();
  };

  const retryFailed = async () => {
    const queue = items.filter((i) => i.status === 'erro');
    if (queue.length === 0) return;
    setSending(true);
    try {
      await runQueue(queue);
    } finally {
      setSending(false);
    }
    onFinished();
  };

  const requestClose = async () => {
    if (sending) return; // envio em andamento não fecha — evita perder o acompanhamento de progresso
    if (items.some((i) => i.status === 'pronto' || i.status === 'enviado')) {
      const ok = await confirm({
        title: 'Fechar upload em lote?',
        message: 'Os arquivos ainda não enviados desta lista serão descartados.',
        variant: 'warning',
        confirmLabel: 'Fechar mesmo assim',
      });
      if (!ok) return;
    }
    onClose();
  };

  return (
    <Sheet open={open} onClose={requestClose} size="2xl">
      <SheetHeader onClose={requestClose}>
        <SheetTitle>Upload em lote — {categoriaLabel}</SheetTitle>
        <SheetDescription>Envie vários documentos de uma vez, com metadados padrão e ajuste por arquivo.</SheetDescription>
      </SheetHeader>

      <SheetPanel className="p-6 space-y-5">
        {!activeOrganizationId && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500">Organização</label>
            <select
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
            >
              <option value="">Selecione uma organização...</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Dropzone */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-500">Arquivos (PDF, DOCX, XLSX, DWG, JPG, PNG — máx. 50MB cada)</label>
          <div
            className={`border-2 border-dashed rounded-[10px] p-6 text-center transition-colors cursor-pointer ${
              dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-50/50 hover:border-blue-400'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
            />
            <UploadCloud className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-600">Arraste ou clique para selecionar vários arquivos</p>
            <p className="text-xs text-slate-400 mt-1">
              {activeFolder?.naming_mask
                ? `Nomes fora da máscara "${activeFolder.naming_mask}" recebem uma sugestão automática — revise antes de enviar.`
                : 'Sem máscara de nomenclatura nesta pasta.'}
            </p>
          </div>
        </div>

        {/* Padrões do lote */}
        <div className="space-y-3 bg-slate-50/60 border border-slate-100 rounded-[10px] p-4">
          <p className="text-xs font-semibold text-slate-500">Padrões do lote (aplicados a todo arquivo sem ajuste próprio)</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500">Tipo de documento</label>
              <select
                required
                value={defaultTipo}
                onChange={(e) => setDefaultTipo(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
              >
                <option value="">Selecione um tipo...</option>
                {documentTypes.map((type) => (
                  <option key={type.id} value={type.name}>{type.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500">Obra/Empreendimento (Opcional)</label>
              <select
                value={defaultProjectId}
                onChange={(e) => setDefaultProjectId(e.target.value)}
                disabled={selectedProjectId !== 'all'}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:opacity-60"
              >
                <option value="">Nenhum (Geral)</option>
                {obras.map((o: any) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500">Empresa vinculada (Opcional)</label>
              <select
                value={defaultCompanyId}
                onChange={(e) => setDefaultCompanyId(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
              >
                <option value="">Nenhuma</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.razao_social}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500">Tags (separadas por vírgula)</label>
              <input
                type="text"
                placeholder="obra, fundação, AVCB, fiscal"
                value={defaultTagsInput}
                onChange={(e) => setDefaultTagsInput(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500">Data de emissão</label>
              <input
                type="date"
                value={defaultEmissao}
                onChange={(e) => setDefaultEmissao(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500">Data de vencimento</label>
              <input
                type="date"
                value={defaultValidade}
                onChange={(e) => setDefaultValidade(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
              />
            </div>
          </div>
        </div>

        {/* Lista de arquivos */}
        {items.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500">
              {items.length} arquivo{items.length !== 1 ? 's' : ''} · {readyCount} pronto{readyCount !== 1 ? 's' : ''}
              {errorCount > 0 && <span className="text-red-600"> · {errorCount} com erro</span>}
            </p>
            {items.map((item) => {
              const isDuplicate = duplicateKeys.has(item.key);
              const reason = isDuplicate ? 'Nome duplicado neste lote.' : item.invalidReason;
              return (
                <div key={item.key} className="border border-slate-100 rounded-[10px] bg-white overflow-hidden">
                  <div className="flex items-center gap-3 p-3">
                    <div className="shrink-0">{renderFileIcon(item.file.type, item.fileName)}</div>
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={item.fileName}
                        disabled={item.status === 'enviando' || item.status === 'enviado'}
                        onChange={(e) => renameItem(item.key, e.target.value)}
                        className={`w-full text-sm font-medium px-2 py-1 rounded border ${
                          reason ? 'border-red-200 bg-red-50 text-red-700' : 'border-transparent bg-transparent hover:border-slate-200 focus:border-blue-300'
                        } focus:outline-none disabled:opacity-70`}
                      />
                      <p className="text-xs text-slate-400 mt-0.5">{formatSize(item.file.size)}</p>
                      {reason && <p className="text-xs text-red-600 mt-0.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3 shrink-0" />{reason}</p>}
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      {item.status === 'enviando' && <span className="text-xs font-medium text-blue-600 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" />Enviando…</span>}
                      {item.status === 'enviado' && <span className="text-xs font-medium text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Enviado</span>}
                      {item.status === 'erro' && <span className="text-xs font-medium text-red-600">Erro</span>}
                      {(item.status === 'pronto' || item.status === 'invalido') && (
                        <ActionIconButton
                          kind="edit"
                          title="Editar metadados deste arquivo"
                          onClick={() => updateItem(item.key, { expanded: !item.expanded })}
                          icon={item.expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        />
                      )}
                      {item.status !== 'enviando' && (
                        <ActionIconButton kind="delete" title="Remover da lista" onClick={() => removeItem(item.key)} />
                      )}
                    </div>
                  </div>

                  {item.status === 'enviando' && (
                    <div className="h-1 bg-slate-100">
                      <div className="h-full bg-blue-500 transition-all" style={{ width: `${item.progress}%` }} />
                    </div>
                  )}

                  {item.expanded && (item.status === 'pronto' || item.status === 'invalido') && (
                    <div className="border-t border-slate-100 bg-slate-50/60 p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-500">Tipo de documento</label>
                        <select
                          value={item.overrides.tipo_documento ?? ''}
                          onChange={(e) => updateOverride(item.key, { tipo_documento: e.target.value || undefined })}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-[6px] text-xs font-medium"
                        >
                          <option value="">(padrão do lote)</option>
                          {documentTypes.map((type) => (
                            <option key={type.id} value={type.name}>{type.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-500">Data de vencimento</label>
                        <input
                          type="date"
                          value={item.overrides.data_validade ?? ''}
                          onChange={(e) => updateOverride(item.key, { data_validade: e.target.value || undefined })}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-[6px] text-xs font-medium"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-500">Tags</label>
                        <input
                          type="text"
                          placeholder="(padrão do lote)"
                          value={item.overrides.tagsInput ?? ''}
                          onChange={(e) => updateOverride(item.key, { tagsInput: e.target.value || undefined })}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-[6px] text-xs font-medium"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SheetPanel>

      <SheetFooter>
        <span className="flex-1 text-xs font-medium text-slate-500">
          {readyCount} pronto{readyCount !== 1 ? 's' : ''}
          {errorCount > 0 && <span className="text-red-600"> · {errorCount} com erro</span>}
        </span>
        {items.some((i) => i.status === 'erro') && !sending && (
          <button
            type="button"
            onClick={retryFailed}
            className="flex items-center gap-1.5 h-9 px-3.5 border border-slate-200 text-slate-600 rounded-[6px] hover:bg-slate-50 font-medium text-[13px] transition-all active:scale-95"
          >
            <RotateCcw className="w-[15px] h-[15px]" />
            Reenviar os que falharam
          </button>
        )}
        <button
          type="button"
          onClick={requestClose}
          className="px-3.5 h-9 border border-slate-200 text-slate-500 font-medium rounded-[6px] hover:bg-slate-50 transition-colors text-[13px]"
        >
          {sending ? 'Enviando…' : 'Fechar'}
        </button>
        <button
          type="button"
          disabled={sending || readyCount === 0}
          onClick={handleSend}
          className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white font-medium text-[13px] rounded-[6px] hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {sending ? 'Enviando…' : `Enviar ${readyCount} documento${readyCount !== 1 ? 's' : ''}`}
        </button>
      </SheetFooter>
    </Sheet>
  );
}
