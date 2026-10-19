import React, { useEffect, useMemo, useState } from 'react';
import { FileText, FileDown, Loader2, AlertCircle, Settings, File, AlertTriangle } from 'lucide-react';
import { saveAs } from 'file-saver';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/modal';
import ClientSelect from './ClientSelect';
import { documentTemplateService, DocumentTemplate } from '../services/documentTemplateService';
import { clientService } from '../services/clientService';
import { supplierService } from '../services/supplierService';
import { organizationService } from '../services/organizationService';
import { projectService } from '../services/projectService';
import { fillDocx, docxBlobToPdf } from '../services/docxRenderService';
import { resolveFields, describeMapping, ResolveContext, fornecedorComoCliente } from '../services/docxFieldCatalog';
import { contractDocumentVersionService } from '../services/contractDocumentVersionService';
import { Contract } from '../types/contracts';
import { Client, Organization, Supplier } from '../types/users';
import { ProjectSettings } from '../types/project';
import Button from './ui/Button';
import { isChunkLoadError, reloadOnceForChunkError } from '../utils/chunkLoadError';

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
    // Credor de contrato de Suprimentos: o fornecedor de Dados Gerais › Fornecedor.
    // `undefined` = ainda carregando; `null` = não achou (sem permissão / excluído).
    const [supplier, setSupplier] = useState<Supplier | null | undefined>(contract.supplier_id ? undefined : null);
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

        // Clientes opcionais — contrato de fornecedor não tem cliente (Suprimentos).
        if (organizationId && !contract.supplier_id) {
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
    }, [organizationId, organizationProp, contract.project_id, contract.supplier_id]);

    // O contrato já sabe quem é o credor — não se pergunta de novo (19/10/2026).
    useEffect(() => {
        if (!contract.supplier_id) { setSupplier(null); return; }
        let active = true;
        setSupplier(undefined);
        supplierService.getById(contract.supplier_id)
            .then(s => { if (active) setSupplier(s); })
            .catch(() => { if (active) setSupplier(null); });
        return () => { active = false; };
    }, [contract.supplier_id]);

    const template = useMemo(() => templates.find(t => t.id === templateId) ?? null, [templates, templateId]);
    const client = useMemo(() => clients.find(c => c.id === clientId) ?? null, [clients, clientId]);
    // Parte do contrato: fornecedor (Suprimentos — nunca tem cliente) ou cliente. Só sem
    // nenhuma das duas o usuário escolhe um cliente.
    const temFornecedor = !!contract.supplier_id;
    const temCliente = !temFornecedor && (lockClient || !!contract.client_id);

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
        () => ({
            organization,
            // Sem cliente, o fornecedor ocupa o lugar dele: os modelos que mapearam a parte
            // contratada por "Cliente"/"Compradores" preenchem com o credor sem remapear.
            client: client ?? (temFornecedor ? fornecedorComoCliente(supplier) : null),
            supplier: supplier ?? null,
            contract, project, ...(extra ?? {}),
        }),
        [organization, client, temFornecedor, supplier, contract, project, extra],
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
            // Só o PDF vira versão: é o que o cliente vê no portal e o que o
            // ZapSign assina — e o bucket `documents` aceita só PDF/imagem desde a
            // auditoria C3-07 (aplicar_20270918000008). O .docx era recusado no
            // upload, a versão nunca nascia e o arquivo baixava mesmo assim — o
            // usuário via o download e achava que tinha gravado (04/10/2026).
            // O .docx é cópia de TRABALHO: baixa para editar, sem versão.
            // Plano: docs/planos/2026-10-04-gerar-pelo-modelo-versao-pdf.md
            const gravaVersao = persistVersion && kind === 'pdf';
            let savedAsVersion = false;
            if (gravaVersao) {
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
                    const msg = `Documento gerado e baixado, mas NÃO foi salvo como versão${m ? `: ${m}` : '.'}`;
                    // Fica no painel aberto: o toast some em 4,5 s junto com o
                    // download e passava despercebido (04/10/2026).
                    setError(msg);
                    notify?.(msg, 'error');
                }
            }

            // Baixa SEMPRE, mesmo se a gravação falhou: a geração é cara
            // (docxBlobToPdf roda html2canvas) e uma falha de storage não pode
            // custar o arquivo inteiro.
            saveAs(output, fileName);

            if (persistVersion && kind === 'docx') {
                notify?.('.docx baixado para edição — ele não entra na tabela de documentos. Depois de editar, salve em PDF e use "Subir documento".', 'info');
            } else if (savedAsVersion) {
                notify?.(`${kind === 'docx' ? 'Documento .docx' : 'PDF'} gerado, salvo como versão (rascunho) e baixado. Use "Emitir" para liberá-lo no portal.`, 'success');
            } else if (!persistVersion) {
                notify?.(kind === 'docx' ? 'Documento .docx gerado com sucesso!' : 'PDF gerado com sucesso!', 'success');
            }
            if (!gravaVersao || savedAsVersion) onClose();
        } catch (e) {
            if (isChunkLoadError(e) && reloadOnceForChunkError()) {
                return;
            }
            const raw = e instanceof Error ? e.message : '';
            const msg = isChunkLoadError(e)
                ? 'Uma atualização do sistema foi detectada. Recarregue a página e tente novamente.'
                : /multi error|templat/i.test(raw)
                ? 'Erro ao processar o modelo. Verifique se o .docx é válido e tente novamente.'
                : raw || 'Falha ao gerar o documento.';
            setError(msg);
            notify?.(msg, 'error');
        } finally {
            setBusy(null);
        }
    };

    // Botão desligado SEMPRE diz o motivo — o <button> desligado não recebe o hover, então o
    // `title` mora no <span> que o envolve (mesmo desenho do Editar do avulso em Contas a Pagar).
    const carregandoCredor = temFornecedor && supplier === undefined;
    const motivoDesligado = busy ? 'Gerando o documento…'
        : !template ? 'Escolha um modelo para continuar.'
        : carregandoCredor ? 'Carregando os dados do credor…'
        : undefined;
    const desligado = !template || busy !== null || carregandoCredor;

    // Rótulo + valor só-leitura da parte do contrato (§32: valor escuro; o "não editável"
    // se diz pelo fundo e pelo texto de apoio, nunca apagando o valor).
    const parteSoLeitura = (rotulo: string, valor: string, apoio: string) => (
        <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-500">{rotulo}</label>
            <p className="w-full h-9 flex items-center rounded-[6px] border border-gray-200 bg-gray-50 px-3 text-sm font-normal text-gray-900 truncate" title={valor}>
                {valor}
            </p>
            <p className="text-xs text-gray-500">{apoio}</p>
        </div>
    );

    // O app só tem tema claro: nada da variante `dark` do Tailwind aqui. No v4, sem `@custom-variant dark`,
    // ela segue o modo escuro do SISTEMA, e quem usa o Windows escuro via valor branco sobre gaveta branca
    // (19/10/2026; guia §33). Plano: docs/planos/2026-10-19-gerar-pelo-modelo-padrao.md
    return (
        /* Modal, não gaveta (19/10/2026): a única escolha é o modelo — a parte vem do
           contrato. UI_PATTERNS §5.2. */
        <Modal open onClose={onClose} size="2xl">
            <ModalHeader
                onClose={onClose}
                title={<>{persistVersion ? 'Gerar pelo modelo' : 'Emitir documento'} — {contract.number}</>}
                description={persistVersion
                    ? 'O PDF gerado entra como rascunho na tabela de documentos; o portal só mostra depois de emitido.'
                    : 'Escolha o modelo para gerar o documento.'}
            />

            <ModalBody>
                <div className="space-y-6">
                    {loading ? (
                        <div className="space-y-2">
                            {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-gray-50 rounded-[6px] animate-pulse" />)}
                        </div>
                    ) : templates.length === 0 ? (
                        /* §12 — estado vazio: ícone grande + título + frase */
                        <div className="text-center py-12">
                            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" strokeWidth={1.5} />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum modelo de documento cadastrado</h3>
                            <p className="text-sm text-gray-500 max-w-sm mx-auto">Suba um .docx em "Modelos de Documento" para emitir contratos personalizados.</p>
                            <div className="flex flex-wrap gap-2 justify-center mt-4">
                                {onManageTemplates && (
                                    <Button onClick={onManageTemplates} className="gap-2">
                                        <Settings className="w-4 h-4" /> Cadastrar modelo
                                    </Button>
                                )}
                                {onFallbackPdf && (
                                    <Button variant="secondary" onClick={onFallbackPdf}>
                                        <FileDown className="w-[15px] h-[15px]" /> Gerar PDF do sistema
                                    </Button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* §30 — rótulo→campo 6px, campo→campo 16px. Coluna única: o nome do modelo
                                é longo e truncava na meia largura. */}
                            <div className="grid grid-cols-1 gap-y-4">
                                <div className="space-y-1.5">
                                    <label htmlFor="emit-modelo" className="block text-xs font-semibold text-slate-500">Modelo *</label>
                                    <select
                                        id="emit-modelo"
                                        value={templateId}
                                        onChange={e => setTemplateId(e.target.value)}
                                        className="w-full h-9 rounded-[6px] border border-gray-200 bg-white px-3 text-sm font-normal text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                    >
                                        <option value="">Selecione um modelo…</option>
                                        {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                </div>
                                {temFornecedor ? (
                                    /* Suprimentos: o credor é o fornecedor de Dados Gerais, com os
                                       dados do cadastro de Fornecedores. Não se pergunta de novo. */
                                    parteSoLeitura(
                                        'Credor',
                                        supplier === undefined ? 'Carregando…' : (supplier?.name || 'Fornecedor não encontrado no cadastro'),
                                        'Vem de Dados Gerais › Fornecedor. Os dados são os do cadastro em Minha Organização › Fornecedores.',
                                    )
                                ) : temCliente ? (
                                    /* O cliente é o do contrato e vem pronto no contexto — o
                                       seletor só atrapalharia: ele carrega dentro de
                                       `if (organizationId)`, então com "Todas as organizações"
                                       ficaria vazio e sem ninguém para escolher. */
                                    parteSoLeitura('Cliente', ctx.client?.name || '—', 'Vem do contrato.')
                                ) : (
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-semibold text-slate-500">Cliente</label>
                                        <ClientSelect
                                            clients={clients}
                                            value={clientId}
                                            onChange={setClientId}
                                            icon={null}
                                            placeholder="Sem cliente"
                                            triggerClassName="w-full h-9 rounded-[6px] border border-gray-200 bg-white text-sm font-normal text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                        />
                                    </div>
                                )}
                            </div>

                            {allUnmapped && (
                                <div className="flex flex-col gap-2 rounded-[10px] bg-red-50 border border-red-200 px-4 py-3">
                                    <div className="flex items-start gap-2 text-red-700">
                                        <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
                                        <div>
                                            <p className="text-sm font-semibold">Os marcadores deste modelo não estão mapeados</p>
                                            <p className="text-sm mt-0.5">Edite o modelo e associe cada marcador a um campo do contrato.</p>
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
                                <div className="flex items-start gap-2 rounded-[10px] bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                    {unmappedTokens.length} marcador(es) sem mapeamento ({unmappedTokens.map(t => `{${t}}`).join(', ')}) ficarão em branco.
                                </div>
                            )}

                            {template && template.detected_tokens.length > 0 && (
                                <div className="space-y-3">
                                    <h3 className="text-sm font-semibold text-gray-700">
                                        Pré-visualização · {mappedTokens.length}/{template.detected_tokens.length} campos mapeados
                                        {organization && <span className="ml-2 text-xs font-normal text-green-700">· org: {organization.name}</span>}
                                    </h3>
                                    {/* §6.9 — tabela dentro de Sheet: px-3, py-2.5, separador vertical, cabeçalho
                                        branco em sentence case (§6.2/§6.11) fixo ao rolar (§6.5). */}
                                    <div className="rounded-[10px] border border-gray-100 overflow-auto max-h-[45vh]">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="sticky top-0 z-10 bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                                                    <th className="px-3 py-2 border-r border-gray-100 w-24">Marcador</th>
                                                    <th className="px-3 py-2 border-r border-gray-100">Campo do sistema</th>
                                                    <th className="px-3 py-2">Valor</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200">
                                                {template.detected_tokens.map(tk => (
                                                    <tr key={tk}>
                                                        <td className="px-3 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-blue-600 whitespace-nowrap">{`{${tk}}`}</td>
                                                        <td className="px-3 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{describeMapping(template.token_map?.[tk])}</td>
                                                        <td className={`px-3 py-2.5 last:border-r-0 text-sm font-normal break-words ${resolved[tk] ? 'text-gray-900' : 'text-red-600'}`}>
                                                            {resolved[tk] || '(vazio — não mapeado ou sem dados)'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {error && (
                        <div className="flex items-start gap-2 rounded-[10px] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
                        </div>
                    )}
                </div>
            </ModalBody>

            {templates.length > 0 && (
                <ModalFooter>
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <span className="inline-flex" title={motivoDesligado}>
                        <Button
                            variant="secondary"
                            onClick={() => emit('docx')}
                            disabled={desligado}
                        >
                            {busy === 'docx' ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <File className="w-[15px] h-[15px]" />}
                            {busy === 'docx' ? 'Gerando…' : persistVersion ? 'Baixar .docx para editar' : 'Baixar .docx'}
                        </Button>
                    </span>
                    <span className="inline-flex" title={motivoDesligado}>
                        <Button
                            onClick={() => emit('pdf')}
                            disabled={desligado}
                        >
                            {busy === 'pdf' ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <FileDown className="w-[15px] h-[15px]" />}
                            {busy === 'pdf' ? 'Gerando PDF…' : persistVersion ? 'Gerar versão (PDF)' : 'Baixar PDF'}
                        </Button>
                    </span>
                </ModalFooter>
            )}
        </Modal>
    );
};

export default EmitDocumentModal;
