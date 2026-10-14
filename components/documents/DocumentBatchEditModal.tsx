import React from 'react';
import { Settings, X, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useConfirm } from '../ui/confirm';
import { documentService, OpuraDmsDocumentType, OpuraDmsDiscipline } from '../../services/documentService';
import { OpuraDocument, OpuraDocumentStatus, OpuraDocumentUpdate, OpuraNormaSituacao } from '../../types';
import { NORMA_ORGAOS_SUGERIDOS, NORMA_SITUACOES, opcoesEdicaoNorma } from '../../utils/gedNormas';
import { renderFileIcon } from './DocumentsTable';

interface CompanyOption {
  id: string;
  razao_social: string;
}

interface SupplierOption {
  id: string;
  name: string;
}

/** Uma extensão do catálogo do GED, no formato que o select consome. */
export interface ExtensaoOption {
  value: string;
  label: string;
  mime_type: string;
}

export interface DocumentBatchEditModalProps {
  documents: OpuraDocument[];
  documentTypes: OpuraDmsDocumentType[];
  disciplines: OpuraDmsDiscipline[];
  obras: any[];
  companies: CompanyOption[];
  /** Autor do Projeto — mesma lista do formulário de edição individual. */
  suppliers: SupplierOption[];
  /** Extensões do catálogo da organização. Omitir = lista original. */
  extensaoOptions?: ExtensaoOption[];
  /** Ícone customizado por extensão, para a prévia dos documentos selecionados. */
  extensionIcons?: Record<string, string>;
  currentProfile: { email?: string };
  notify: (message: string, type?: 'success' | 'error') => void;
  onClose: () => void;
  onSaved: () => void;
}

const STATUS_OPTIONS: { value: OpuraDocumentStatus; label: string }[] = [
  { value: 'ativo', label: '✅ Ativo' },
  { value: 'arquivado', label: '📁 Arquivado' },
  { value: 'vencido', label: '⚠️ Vencido (Forçar)' },
  { value: 'alerta', label: '🔔 Alerta (Forçar)' },
];

const ALERTA_OPTIONS = [90, 60, 30, 15, 7];

// As opções vêm do catálogo da organização (prop `extensaoOptions`, tabela
// `opura_dms_file_extensions`) — trocar para uma extensão fora dele geraria um
// arquivo que o próprio upload rejeitaria. O default abaixo é o piso de quem não
// passar a prop, e é a lista que existia antes do catálogo.
const FALLBACK_EXTENSAO_OPTIONS: ExtensaoOption[] = [
  { value: 'pdf', label: 'PDF', mime_type: 'application/pdf' },
  { value: 'docx', label: 'DOCX', mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { value: 'xlsx', label: 'XLSX', mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { value: 'dwg', label: 'DWG', mime_type: 'application/acad' },
  { value: 'jpg', label: 'JPG', mime_type: 'image/jpeg' },
  { value: 'png', label: 'PNG', mime_type: 'image/png' },
];

/**
 * Edição em lote do GED — modal dedicado (não Sheet: `docs/ui_ux_guia_unificado.md`
 * §10 já prescreve modal para isso). Campo vazio = não altera aquele campo, exceto
 * Tags, que sempre mescla com o que cada documento já tinha (nunca sobrescreve).
 */
export function DocumentBatchEditModal({
  documents,
  documentTypes,
  disciplines,
  obras,
  companies,
  suppliers,
  extensaoOptions = FALLBACK_EXTENSAO_OPTIONS,
  extensionIcons,
  currentProfile,
  notify,
  onClose,
  onSaved,
}: DocumentBatchEditModalProps) {
  const confirm = useConfirm();
  const [tipoDocumento, setTipoDocumento] = React.useState('');
  const [disciplineCode, setDisciplineCode] = React.useState('');
  const [descricao, setDescricao] = React.useState('');
  // Autor do Projeto: fornecedor cadastrado (grava supplier_id + autor) ou nome
  // digitado à mão ("Outro"), como no formulário de edição individual do GED.
  const [autorSupplierId, setAutorSupplierId] = React.useState('');
  const [autorOutro, setAutorOutro] = React.useState(false);
  const [autorNome, setAutorNome] = React.useState('');
  const [revisao, setRevisao] = React.useState('');
  // Extensão não é metadado — trocar renomeia o arquivo de cada documento no
  // Storage (ver documentService.renameActiveVersionExtension). Por isso fica
  // fora de `buildCommonUpdates`/`updateDocumentsBatch` e tem sua própria
  // confirmação antes de salvar.
  const [extensaoNova, setExtensaoNova] = React.useState<string>('');
  const [status, setStatus] = React.useState('');
  const [dataEmissao, setDataEmissao] = React.useState('');
  const [dataValidade, setDataValidade] = React.useState('');
  const [alertaDias, setAlertaDias] = React.useState('');
  const [projectId, setProjectId] = React.useState('');
  const [companyId, setCompanyId] = React.useState('');
  const [addTagsInput, setAddTagsInput] = React.useState('');
  // Aba Normas — só quando TODA a seleção é norma (a edição em lote parte de uma aba,
  // mas a regra não depende disso). Código fica de fora: é único por norma.
  const isNormas = documents.length > 0 && documents.every((d) => d.categoria === 'normas');
  const [normaOrgao, setNormaOrgao] = React.useState('');
  const [normaEdicao, setNormaEdicao] = React.useState('');
  const [normaSituacao, setNormaSituacao] = React.useState<OpuraNormaSituacao | ''>('');
  const [normaSubstituidaPor, setNormaSubstituidaPor] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [savedOnce, setSavedOnce] = React.useState(false);

  const orgIds = React.useMemo(() => new Set(documents.map((d) => d.organization_id)), [documents]);
  const isMultiOrg = orgIds.size > 1;

  // Fornecedor é cadastro por organização — vincular um fornecedor de uma org a
  // documento de outra criaria vínculo cruzado. Com seleção multi-org, Autor só
  // aceita nome digitado.
  const autorNomeFinal = autorOutro || isMultiOrg
    ? autorNome.trim()
    : (suppliers.find((s) => s.id === autorSupplierId)?.name || '');
  const autorChanged = !!autorNomeFinal || (!isMultiOrg && !autorOutro && !!autorSupplierId);

  const noneChanged =
    !tipoDocumento && !disciplineCode && !descricao.trim() && !autorChanged && !status &&
    !dataEmissao && !dataValidade && !alertaDias && !projectId && !companyId && !addTagsInput.trim() &&
    !revisao.trim() && !extensaoNova &&
    !normaOrgao.trim() && !normaEdicao.trim() && !normaSituacao;

  const buildCommonUpdates = (): OpuraDocumentUpdate => {
    const updates: OpuraDocumentUpdate = {};
    if (tipoDocumento) updates.tipo_documento = tipoDocumento;
    if (disciplineCode) updates.discipline_code = disciplineCode;
    if (descricao.trim()) updates.descricao = descricao.trim();
    if (revisao.trim()) updates.revisao = revisao.trim();
    if (autorChanged) {
      updates.autor = autorNomeFinal;
      // "Outro"/multi-org desfaz o vínculo com fornecedor — o autor passa a ser texto
      // livre. `null` (não `undefined`) porque undefined some no payload e deixaria o
      // supplier_id antigo apontando para outro fornecedor.
      updates.supplier_id = ((!isMultiOrg && !autorOutro && autorSupplierId) || null) as any;
    }
    if (status) updates.status = status as OpuraDocumentStatus;
    if (dataEmissao) updates.data_emissao = dataEmissao;
    if (dataValidade) updates.data_validade = dataValidade;
    if (alertaDias) updates.alerta_dias_antecedencia = parseInt(alertaDias, 10);
    if (!isMultiOrg && projectId) updates.project_id = projectId;
    if (!isMultiOrg && companyId) updates.company_id = companyId;
    if (isNormas) {
      if (normaOrgao.trim()) updates.norma_orgao = normaOrgao.trim();
      if (normaEdicao.trim()) updates.norma_edicao = normaEdicao.trim();
      if (normaSituacao) {
        updates.norma_situacao = normaSituacao;
        // Como na edição individual: fora de "Substituída" não existe "substituída por".
        // `null` (não undefined) para o campo antigo sair do banco. Em "Substituída"
        // sem texto, o valor de cada norma fica como está.
        if (normaSituacao !== 'substituida') updates.norma_substituida_por = null;
        else if (normaSubstituidaPor.trim()) updates.norma_substituida_por = normaSubstituidaPor.trim();
      }
    }
    return updates;
  };

  const changedFieldLabels = (): string[] => {
    const labels: string[] = [];
    if (tipoDocumento) labels.push(`Tipo=${tipoDocumento}`);
    if (disciplineCode) labels.push(`Disciplina=${disciplineCode}`);
    if (descricao.trim()) labels.push('Descrição');
    if (revisao.trim()) labels.push(`Revisão=${revisao.trim()}`);
    if (extensaoNova) labels.push(`Extensão do arquivo=${extensaoNova.toUpperCase()}`);
    if (autorChanged) labels.push(`Autor=${autorNomeFinal}`);
    if (status) labels.push(`Status=${status}`);
    if (dataEmissao) labels.push('Data de emissão');
    if (dataValidade) labels.push('Data de vencimento');
    if (alertaDias) labels.push(`Alerta=${alertaDias}d`);
    if (!isMultiOrg && projectId) labels.push('Obra');
    if (!isMultiOrg && companyId) labels.push('Empresa');
    if (addTagsInput.trim()) labels.push('Tags adicionadas');
    if (isNormas && normaOrgao.trim()) labels.push(`Órgão=${normaOrgao.trim()}`);
    if (isNormas && normaEdicao.trim()) labels.push(`Edição=${normaEdicao.trim()}`);
    if (isNormas && normaSituacao) labels.push(`Situação=${NORMA_SITUACOES[normaSituacao].label}`);
    return labels;
  };

  const requestClose = async () => {
    if (saving) return;
    if (savedOnce) {
      const ok = await confirm({
        title: 'Fechar edição em lote?',
        message: 'Algumas alterações já foram salvas. Fechar agora não desfaz o que já foi aplicado.',
        variant: 'warning',
        confirmLabel: 'Fechar mesmo assim',
      });
      if (!ok) return;
    }
    onClose();
  };

  const handleSave = async () => {
    if (noneChanged) return;

    // Extensão renomeia o ARQUIVO no Storage de cada documento selecionado —
    // diferente dos outros campos (metadado). Confirmação extra antes de mexer
    // em arquivo, mesmo já dentro de um modal de edição em lote.
    if (extensaoNova) {
      const ok = await confirm({
        title: 'Renomear a extensão do arquivo?',
        message: `O arquivo de ${documents.length} documento${documents.length !== 1 ? 's' : ''} será renomeado para .${extensaoNova} no Storage. Isso não converte o conteúdo do arquivo — só troca a extensão do nome. Documentos sem versão ativa serão ignorados.`,
        variant: 'warning',
        confirmLabel: 'Renomear',
      });
      if (!ok) return;
    }

    setSaving(true);

    const ids = documents.map((d) => d.id);
    const commonUpdates = buildCommonUpdates();
    const fieldLabels = changedFieldLabels();

    try {
      const hasCommonUpdates = Object.keys(commonUpdates).length > 0;
      if (hasCommonUpdates) {
        await documentService.updateDocumentsBatch(ids, commonUpdates);
      }

      let tagsOk = 0;
      let tagsFailed = 0;
      const newTags = addTagsInput.split(',').map((t) => t.trim()).filter(Boolean);
      if (newTags.length > 0) {
        const results = await Promise.allSettled(
          documents.map((doc) => {
            const merged = Array.from(new Set([...(doc.tags || []), ...newTags]));
            return documentService.updateDocument(doc.id, { tags: merged });
          })
        );
        results.forEach((r) => (r.status === 'fulfilled' ? tagsOk++ : tagsFailed++));
      }

      let extOk = 0;
      let extFailed = 0;
      if (extensaoNova) {
        const mimeType = extensaoOptions.find((o) => o.value === extensaoNova)?.mime_type;
        const results = await Promise.allSettled(
          documents.map((doc) => documentService.renameActiveVersionExtension(doc, extensaoNova, mimeType))
        );
        results.forEach((r) => (r.status === 'fulfilled' ? extOk++ : extFailed++));
      }

      if (hasCommonUpdates || tagsOk > 0 || extOk > 0) setSavedOnce(true);

      // Auditoria por documento, em paralelo — não bloqueia a resposta ao usuário.
      Promise.allSettled(
        documents.map((doc) =>
          documentService.logDocumentAction(
            doc.organization_id,
            doc.id,
            currentProfile?.email || 'sistema',
            'status_alterado',
            `Edição em lote: ${fieldLabels.join(', ') || 'sem alterações comuns'}`
          )
        )
      ).catch(() => {});

      if (tagsFailed > 0 || extFailed > 0) {
        const prefix = hasCommonUpdates ? 'Campos comuns atualizados. ' : '';
        const parts: string[] = [];
        if (newTags.length > 0) parts.push(`Tags: ${tagsOk} de ${tagsOk + tagsFailed} documentos`);
        if (extensaoNova) parts.push(`Extensão: ${extOk} de ${extOk + extFailed} arquivos`);
        notify(`${prefix}${parts.join(' · ')} atualizado(s), com erro em parte deles.`, 'error');
        onSaved();
        return;
      }

      notify(`${documents.length} documento${documents.length !== 1 ? 's' : ''} atualizado${documents.length !== 1 ? 's' : ''}.`);
      onSaved();
      onClose();
    } catch (err: any) {
      notify('Erro ao editar em lote: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-2xl border border-slate-100 overflow-hidden my-8 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="font-black text-slate-800 text-lg">Editar em lote</h3>
              <p className="text-xs text-slate-400 font-medium">
                {documents.length} documento{documents.length !== 1 ? 's' : ''} selecionado{documents.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={requestClose}
            disabled={saving}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Lista resumida da seleção */}
          <div className="bg-slate-50 rounded-[10px] border border-slate-100 divide-y divide-slate-100 max-h-36 overflow-y-auto">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center gap-2.5 px-3 py-2">
                <div className="shrink-0">{renderFileIcon(doc.active_version?.mime_type || '', doc.nome, extensionIcons)}</div>
                <span className="text-xs font-medium text-slate-700 truncate flex-1">{doc.nome}</span>
                <span className="text-xs text-slate-400 shrink-0">{doc.tipo_documento}</span>
              </div>
            ))}
          </div>

          <p className="text-xs font-semibold text-slate-500">Deixe um campo vazio para não alterá-lo nos documentos selecionados.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {isNormas && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500">Órgão</label>
                  <input
                    type="text"
                    list="ged-normas-orgaos-edicao-lote"
                    placeholder="Deixe vazio para não alterar"
                    value={normaOrgao}
                    onChange={(e) => setNormaOrgao(e.target.value)}
                    disabled={saving}
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:opacity-50"
                  />
                  <datalist id="ged-normas-orgaos-edicao-lote">
                    {NORMA_ORGAOS_SUGERIDOS.map((o) => <option key={o.value} value={o.value} />)}
                  </datalist>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500">Edição / ano</label>
                  <select
                    value={normaEdicao}
                    onChange={(e) => setNormaEdicao(e.target.value)}
                    disabled={saving}
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:opacity-50"
                  >
                    <option value="">Não alterar</option>
                    {opcoesEdicaoNorma(normaEdicao).map((ed) => (
                      <option key={ed} value={ed}>{ed}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500">Situação</label>
                  <select
                    value={normaSituacao}
                    onChange={(e) => setNormaSituacao(e.target.value as OpuraNormaSituacao | '')}
                    disabled={saving}
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:opacity-50"
                  >
                    <option value="">— Não alterar —</option>
                    {Object.entries(NORMA_SITUACOES).map(([value, s]) => (
                      <option key={value} value={value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                {normaSituacao === 'substituida' ? (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Substituída por</label>
                    <input
                      type="text"
                      placeholder="Vazio = mantém o de cada norma"
                      value={normaSubstituidaPor}
                      onChange={(e) => setNormaSubstituidaPor(e.target.value)}
                      disabled={saving}
                      className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:opacity-50"
                    />
                  </div>
                ) : (
                  <p className="self-end text-xs text-slate-400 pb-2.5">
                    O código não se edita em lote: é único por norma.
                  </p>
                )}
              </>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500">Tipo de documento</label>
              <select
                value={tipoDocumento}
                onChange={(e) => setTipoDocumento(e.target.value)}
                disabled={saving}
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:opacity-50"
              >
                <option value="">— Não alterar —</option>
                {documentTypes.map((t) => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500">Disciplina</label>
              <select
                value={disciplineCode}
                onChange={(e) => setDisciplineCode(e.target.value)}
                disabled={saving}
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:opacity-50"
              >
                <option value="">— Não alterar —</option>
                {disciplines.map((d) => (
                  <option key={d.id} value={d.code}>{d.code} - {d.name}</option>
                ))}
              </select>
            </div>

            {/* Norma: Revisão vira Edição; vencimento/alerta não existem (norma não vence
                por data); quem emite é o Órgão, não um Autor — como na edição individual. */}
            {!isNormas && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500">Revisão</label>
              <input
                type="text"
                placeholder="Ex: Rev. A, 00 — deixe vazio para não alterar"
                value={revisao}
                onChange={(e) => setRevisao(e.target.value)}
                disabled={saving}
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:opacity-50"
              />
            </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={saving}
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:opacity-50"
              >
                <option value="">— Não alterar —</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            {!isNormas && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500">Alerta de vencimento</label>
              <select
                value={alertaDias}
                onChange={(e) => setAlertaDias(e.target.value)}
                disabled={saving}
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:opacity-50"
              >
                <option value="">— Não alterar —</option>
                {ALERTA_OPTIONS.map((d) => (
                  <option key={d} value={d}>{d} dias antes</option>
                ))}
              </select>
            </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500">{isNormas ? 'Data de publicação' : 'Data de emissão'}</label>
              <input
                type="date"
                value={dataEmissao}
                onChange={(e) => setDataEmissao(e.target.value)}
                disabled={saving}
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:opacity-50"
              />
            </div>

            {!isNormas && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500">Data de vencimento</label>
              <input
                type="date"
                value={dataValidade}
                onChange={(e) => setDataValidade(e.target.value)}
                disabled={saving}
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:opacity-50"
              />
            </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500">Obra vinculada</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={saving || isMultiOrg}
                title={isMultiOrg ? 'Documentos selecionados pertencem a organizações diferentes.' : undefined}
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:opacity-50"
              >
                <option value="">— Não alterar —</option>
                {obras.map((o: any) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500">Empresa vinculada</label>
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                disabled={saving || isMultiOrg}
                title={isMultiOrg ? 'Documentos selecionados pertencem a organizações diferentes.' : undefined}
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:opacity-50"
              >
                <option value="">— Não alterar —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.razao_social}</option>
                ))}
              </select>
            </div>
          </div>

          {!isNormas && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500">Autor do Projeto</label>
            {isMultiOrg ? (
              <input
                type="text"
                placeholder="Nome do autor ou responsável — deixe vazio para não alterar"
                value={autorNome}
                onChange={(e) => setAutorNome(e.target.value)}
                disabled={saving}
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:opacity-50"
              />
            ) : (
              <>
                <select
                  value={autorOutro ? '__outro__' : autorSupplierId}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__outro__') {
                      setAutorSupplierId('');
                      setAutorOutro(true);
                    } else {
                      setAutorSupplierId(val);
                      setAutorOutro(false);
                      setAutorNome('');
                    }
                  }}
                  disabled={saving}
                  className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:opacity-50"
                >
                  <option value="">— Não alterar —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                  <option value="__outro__">Outro (digitar nome)</option>
                </select>
                {autorOutro && (
                  <input
                    type="text"
                    placeholder="Nome do autor ou responsável..."
                    value={autorNome}
                    onChange={(e) => setAutorNome(e.target.value)}
                    disabled={saving}
                    autoFocus
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:opacity-50"
                  />
                )}
              </>
            )}
          </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500">Descrição / Notas complementares</label>
            <textarea
              rows={3}
              placeholder="Substitui a descrição dos documentos selecionados — deixe vazio para não alterar"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              disabled={saving}
              className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:opacity-50 resize-none"
            />
          </div>

          {/* Extensão renomeia o ARQUIVO no Storage (não é metadado) — por isso fica
              separada dos demais campos, com aviso próprio sempre visível. */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500">Extensão do arquivo</label>
            <select
              value={extensaoNova}
              onChange={(e) => setExtensaoNova(e.target.value)}
              disabled={saving}
              className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:opacity-50"
            >
              <option value="">— Não alterar —</option>
              {extensaoOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {extensaoNova && (
              <div className="flex items-start gap-2 p-3 rounded-[10px] bg-amber-50 border border-amber-200 text-amber-700 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Isso renomeia o arquivo de cada documento selecionado no Storage para
                  .{extensaoNova} — não converte o conteúdo do arquivo, só o nome. Documentos
                  sem versão ativa serão ignorados.
                </span>
              </div>
            )}
          </div>

          {isMultiOrg && (
            <div className="flex items-start gap-2 p-3 rounded-[10px] bg-amber-50 border border-amber-200 text-amber-700 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Os documentos selecionados pertencem a organizações diferentes — Obra e Empresa
                ficam desabilitados, e o Autor só aceita nome digitado (sem vínculo com
                fornecedor), para não vincular um documento à organização errada.
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500">Adicionar tags</label>
            <input
              type="text"
              placeholder="Ex: Revisado, Auditoria 2026 — mescla com as tags que cada documento já tem"
              value={addTagsInput}
              onChange={(e) => setAddTagsInput(e.target.value)}
              disabled={saving}
              className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:opacity-50"
            />
          </div>

          {noneChanged && (
            <p className="text-xs text-slate-400 text-center">Preencha ao menos um campo para habilitar o salvamento.</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
          <button
            type="button"
            onClick={requestClose}
            disabled={saving}
            className="h-9 px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-500 font-medium text-[13px] rounded-[6px] transition-all disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || noneChanged}
            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-[13px] rounded-[6px] transition-all active:scale-95 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {saving ? 'Salvando…' : `Salvar em ${documents.length} documento${documents.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
