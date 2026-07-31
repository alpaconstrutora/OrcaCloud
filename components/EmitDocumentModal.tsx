import React, { useEffect, useMemo, useState } from 'react';
import { X, FileText, FileDown, Loader2, AlertCircle, Settings, File, AlertTriangle } from 'lucide-react';
import { saveAs } from 'file-saver';
import { documentTemplateService, DocumentTemplate } from '../services/documentTemplateService';
import { clientService } from '../services/clientService';
import { organizationService } from '../services/organizationService';
import { projectService } from '../services/projectService';
import { fillDocx, docxBlobToPdf } from '../services/docxRenderService';
import { resolveFields, describeMapping, ResolveContext } from '../services/docxFieldCatalog';
import { contractDocumentVersionService } from '../services/contractDocumentVersionService';
import { Contract } from '../types/contracts';
import { Client, Organization } from '../types/users';
import { ProjectSettings } from '../types/project';
import Button from './ui/Button';

interface Props {
    organizationId: string;
    contract: Contract;
    organization: Organization | null;
    onClose: () => void;
    onManageTemplates?: () => void;
    onFallbackPdf?: () => void;
    notify?: (msg: string, type: 'success' | 'error' | 'info') => void;
    /**
     * Origens extras já resolvidas (locação: landlord/units/guarantee/guarantors/
     * rentalMeta, e o próprio `contract` completo). Sobrepõem o contexto base.
     */
    contextExtra?: Partial<ResolveContext>;
    /** Carregador assíncrono das mesmas origens — o modal abre e preenche depois. */
    loadContext?: () => Promise<Partial<ResolveContext>>;
    /**
     * Salva o documento gerado como versão em `contract_document_versions`
     * (kind MINUTA, source TEMPLATE_DOCX). Default `false` = só baixa, que é o
     * comportamento histórico do módulo de Contratos.
     */
    persistVersion?: boolean;
    /** O cliente vem pronto no contexto (locatário do contrato) — esconde o seletor. */
    lockClient?: boolean;
    /** Disparado após gravar a versão, para o pai recarregar o painel de Documentos. */
    onVersionSaved?: () => void;
}

const slug = (s: string) => (s || '').replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '');

const EmitDocumentModal: React.FC<Props> = ({
    organizationId, contract, organization: organizationProp, onClose, onManageTemplates, onFallbackPdf, notify,
    contextExtra, loadContext, persistVersion = false, lockClient = false, onVersionSaved,
}) => {
    const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [organization, setOrganization] = useState<Organization | null>(organizationProp);
    const [project, setProject] = useState<ProjectSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [templateId, setTemplateId] = useState<string>('');
    const [clientId, setClientId] = useState<string>(contract.client_id ?? '');
    const [busy, setBusy] = useState<null | 'docx' | 'pdf'>(null);
    const [error, setError] = useState<string | null>(null);
    const [extra, setExtra] = useState<Partial<ResolveContext> | null>(contextExtra ?? null);

    // Origens extras assíncronas (locação). Referência estável: só troca quando o
    // load resolve, então entra sem risco nas deps do useMemo do contexto.
    useEffect(() => {
        if (contextExtra) { setExtra(contextExtra); return; }
        if (!loadContext) return;
        let active = true;
        loadContext()
            .then(ctx => { if (active) setExtra(ctx); })
            .catch(e => {
                console.error('[EmitDocumentModal] contexto extra não carregado:', e);
                // Não bloqueia: sem o contexto extra os campos daquelas origens
                // ficam vazios, exatamente como qualquer origem ausente.
                if (active) setError('Não foi possível carregar todos os dados do contrato. Campos podem sair em branco.');
            });
        return () => { active = false; };
    }, [contextExtra, loadContext]);

    useEffect(() => {
        setLoading(true);

        // Carrega templates (sem filtro de org garante que RLS retorna o que o usuário pode ver)
        documentTemplateService.list(organizationId || undefined)
            .then(tpls => {
                setTemplates(tpls);
                if (tpls.length === 1) setTemplateId(tpls[0].id);
            })
            .catch(e => setError(e instanceof Error ? e.message : 'Erro ao carregar modelos'))
            .finally(() => setLoading(false));

        // Carrega organização diretamente no modal — não depende do pai passar organization
        if (!organizationProp) {
            organizationService.listOrganizations()
                .then(orgs => {
                    const match = orgs.find(o => o.id === organizationId) ?? orgs[0] ?? null;
                    setOrganization(match);
                })
                .catch(() => {});
        }

        // Clientes opcionais
        if (organizationId) {
            clientService.listClients(organizationId)
                .then(setClients)
                .catch(() => {});
        }

        // Obra vinculada ao contrato
        if (contract.project_id) {
            projectService.loadProject(contract.project_id)
                .then(data => { if (data) setProject((data as any).settings as ProjectSettings ?? null); })
                .catch(() => {});
        }
    }, [organizationId, organizationProp, contract.project_id]);

    const template = useMemo(() => templates.find(t => t.id === templateId) ?? null, [templates, templateId]);
    const client = useMemo(() => clients.find(c => c.id === clientId) ?? null, [clients, clientId]);

    /**
     * Contexto de resolução. `extra` vem por último de propósito: quando a
     * locação carrega o contrato completo, ele precisa sobrepor o `contract`
     * parcial que o pai passou por prop.
     *
     * ⚠️ `project` PRECISA estar nas dependências: `projectService.loadProject`
     * resolve depois do primeiro render, então antes desta correção o `resolved`
     * não recalculava e todo token do grupo "Obra" saía vazio no documento.
     */
    const ctx = useMemo<ResolveContext>(
        () => ({ organization, client, contract, project, ...(extra ?? {}) }),
        [organization, client, contract, project, extra],
    );

    const resolved = useMemo(
        () => (template ? resolveFields(template.token_map ?? {}, ctx) : {}),
        [template, ctx],
    );

    const mappedTokens = template ? template.detected_tokens.filter(tk => template.token_map?.[tk]) : [];
    const unmappedTokens = template ? template.detected_tokens.filter(tk => !template.token_map?.[tk]) : [];
    const allUnmapped = template && template.detected_tokens.length > 0 && mappedTokens.length === 0;

    const emit = async (kind: 'docx' | 'pdf') => {
        if (!template) return;
        setBusy(kind);
        setError(null);
        try {
            const sourceBlob = await documentTemplateService.downloadFile(template);
            const filled = await fillDocx(sourceBlob, resolved);
            const baseName = `${slug(contract.number)}_${slug(template.name)}`;
            const output = kind === 'docx' ? filled : await docxBlobToPdf(filled);
            const fileName = `${baseName}.${kind}`;

            // Persistir ANTES de baixar: invertido, o usuário já teria o arquivo
            // na mão quando o erro aparecesse, e o toast viraria ruído. Assim o
            // estado do sistema é conhecido no momento da mensagem.
            let savedAsVersion = false;
            if (persistVersion) {
                try {
                    await contractDocumentVersionService.addVersionFromBlob({
                        ownerType: 'CONTRACT',
                        ownerId: contract.id,
                        contractId: contract.id,
                        organizationId: contract.organization_id ?? organizationId ?? null,
                        blob: output,
                        fileName,
                        templateId: template.id,
                        source: 'TEMPLATE_DOCX',
                        kind: 'MINUTA',
                        name: `Minuta — ${template.name}`,
                        notes: `Gerada do modelo "${template.name}" em ${new Date().toLocaleString('pt-BR')}.`,
                    });
                    savedAsVersion = true;
                    onVersionSaved?.();
                } catch (saveErr) {
                    const m = saveErr instanceof Error ? saveErr.message : '';
                    notify?.(`Documento gerado, mas não foi possível salvá-lo como versão${m ? `: ${m}` : '.'}`, 'error');
                }
            }

            // Baixa SEMPRE, mesmo se a gravação falhou: a geração é cara
            // (docxBlobToPdf roda html2canvas) e uma falha de storage não pode
            // custar o arquivo inteiro.
            saveAs(output, fileName);

            if (savedAsVersion) {
                notify?.(`${kind === 'docx' ? 'Documento .docx' : 'PDF'} gerado, salvo como versão (rascunho) e baixado. Use "Emitir" para liberá-lo ao Portal do Cliente.`, 'success');
            } else if (!persistVersion) {
                notify?.(kind === 'docx' ? 'Documento .docx gerado com sucesso!' : 'PDF gerado com sucesso!', 'success');
            }
            onClose();
        } catch (e) {
            const raw = e instanceof Error ? e.message : '';
            const msg = /multi error|templat/i.test(raw)
                ? 'Erro ao processar o modelo. Verifique se o .docx é válido e tente novamente.'
                : raw || 'Falha ao gerar o documento.';
            setError(msg);
            notify?.(msg, 'error');
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="absolute top-0 right-0 bottom-0 flex flex-col bg-white shadow-2xl w-full max-w-2xl overflow-hidden border-l border-gray-200 animate-in slide-in-from-right duration-300">
                <div className="border-b border-gray-100 bg-gray-50/50 flex justify-between items-start gap-6 shrink-0 px-8 py-6">
                    <div className="flex items-start gap-5 flex-1 min-w-0">
                        <div className="flex flex-col items-center gap-2 shrink-0">
                            <div className="bg-blue-600 p-2.5 rounded-xl text-white shadow-lg shadow-blue-100 flex items-center justify-center w-12 h-12">
                                <FileDown className="w-6 h-6" />
                            </div>
                            <div className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 shadow-sm text-center">
                                EMITIR
                            </div>
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col gap-1">
                            <div className="flex items-center gap-3 flex-wrap">
                                <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Emitir Documento</h2>
                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-100 rounded-md border border-gray-200 shadow-sm">
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Contrato:</span>
                                    <span className="text-xs font-bold text-gray-600 uppercase">{contract.number}</span>
                                </div>
                            </div>
                            <p className="text-sm text-gray-500 font-medium leading-tight">
                                Escolha o modelo e o cliente para gerar o documento.
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
                    {loading ? (
                        <div className="space-y-2">
                            {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-gray-50 dark:bg-gray-700/50 rounded-lg animate-pulse" />)}
                        </div>
                    ) : templates.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 py-10 text-center text-gray-400">
                            <FileText size={32} strokeWidth={1} />
                            <p className="text-sm max-w-xs">Nenhum modelo de documento cadastrado. Suba um .docx em "Modelos de Documento" para emitir contratos personalizados.</p>
                            <div className="flex flex-wrap gap-2 justify-center">
                                {onManageTemplates && (
                                    <Button onClick={onManageTemplates} className="gap-2">
                                        <Settings className="w-4 h-4" /> Cadastrar modelo
                                    </Button>
                                )}
                                {onFallbackPdf && (
                                    <button onClick={onFallbackPdf} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
                                        <FileDown className="w-4 h-4" /> Gerar PDF do sistema
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-form-label font-medium text-gray-500 mb-1">Modelo *</label>
                                    <select
                                        value={templateId}
                                        onChange={e => setTemplateId(e.target.value)}
                                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">Selecione um modelo…</option>
                                        {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                </div>
                                {lockClient ? (
                                    /* O cliente é o do contrato e vem pronto no contexto — o
                                       seletor só atrapalharia: ele carrega dentro de
                                       `if (organizationId)`, então com "Todas as organizações"
                                       ficaria vazio e sem ninguém para escolher. */
                                    <div>
                                        <label className="block text-form-label font-medium text-gray-500 mb-1">Cliente</label>
                                        <p className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 truncate">
                                            {ctx.client?.name || '—'}
                                        </p>
                                    </div>
                                ) : (
                                    <div>
                                        <label className="block text-form-label font-medium text-gray-500 mb-1">Cliente</label>
                                        <select
                                            value={clientId}
                                            onChange={e => setClientId(e.target.value)}
                                            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="">Sem cliente</option>
                                            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                )}
                            </div>

                            {allUnmapped && (
                                <div className="flex flex-col gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-300 px-4 py-3">
                                    <div className="flex items-start gap-2 text-red-700 dark:text-red-300">
                                        <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
                                        <div>
                                            <p className="text-sm font-semibold">Os marcadores deste modelo não estão mapeados</p>
                                            <p className="text-xs mt-0.5">Edite o modelo e associe cada marcador a um campo do contrato.</p>
                                        </div>
                                    </div>
                                    {onManageTemplates && (
                                        <Button onClick={onManageTemplates} variant="danger" size="sm" className="self-start gap-1.5">
                                            <Settings className="w-3.5 h-3.5" /> Editar modelo agora
                                        </Button>
                                    )}
                                </div>
                            )}

                            {!allUnmapped && unmappedTokens.length > 0 && (
                                <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                    {unmappedTokens.length} marcador(es) sem mapeamento ({unmappedTokens.map(t => `{${t}}`).join(', ')}) ficarão em branco.
                                </div>
                            )}

                            {template && template.detected_tokens.length > 0 && (
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                                        Pré-visualização · {mappedTokens.length}/{template.detected_tokens.length} campos mapeados
                                        {organization && <span className="ml-2 text-xs font-normal text-green-600">· org: {organization.name}</span>}
                                    </h3>
                                    <div className="rounded-lg border border-gray-100 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-700/50 max-h-64 overflow-auto">
                                        {template.detected_tokens.map(tk => (
                                            <div key={tk} className="grid grid-cols-[64px_1fr] gap-2 px-3 py-2 text-sm">
                                                <span className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-400">{`{${tk}}`}</span>
                                                <div className="min-w-0">
                                                    <p className="text-xs text-gray-400 truncate">{describeMapping(template.token_map?.[tk])}</p>
                                                    <p className={`truncate ${resolved[tk] ? 'text-gray-900 dark:text-white' : 'text-red-400 italic'}`}>
                                                        {resolved[tk] || '(vazio — não mapeado ou sem dados)'}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {error && (
                        <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
                        </div>
                    )}
                </div>

                {templates.length > 0 && (
                    <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-700">
                        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">
                            Cancelar
                        </button>
                        <button
                            onClick={() => emit('docx')}
                            disabled={!template || busy !== null}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                        >
                            {busy === 'docx' ? <Loader2 className="w-4 h-4 animate-spin" /> : <File className="w-4 h-4 text-blue-600" />}
                            {busy === 'docx' ? 'Gerando…' : 'Baixar .docx'}
                        </button>
                        <Button
                            onClick={() => emit('pdf')}
                            disabled={!template || busy !== null}
                            className="gap-2"
                        >
                            {busy === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                            {busy === 'pdf' ? 'Gerando PDF…' : 'Baixar PDF'}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EmitDocumentModal;
