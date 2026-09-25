import React, { useEffect, useRef, useState } from 'react';
import {
    Upload, Loader2, ArrowLeft, FileText, AlertCircle, CheckCircle2,
    Building2, Calendar, DollarSign, Hash, Eye, Save,
    ThumbsUp, Ban, Trash2, UserPlus, Undo2, Receipt, Tag, StickyNote,
} from 'lucide-react';
import PlanoContasSelect from './PlanoContasSelect';
import HierarchicalSelect from './HierarchicalSelect';
import SupplierSelect from './SupplierSelect';
import CostCenterSelect from './CostCenterSelect';
import { STATUS_LABELS, STATUS_TEXT_COLORS } from '../utils/boletoStatus';
import { boletoService } from '../services/boletoService';
import { supplierService } from '../services/supplierService';
import { financialRegistryService } from '../services/financialRegistryService';
import { projectService } from '../services/projectService';
import { extractFromPdfFile } from '../utils/boletoParser';
import { onlyDigits } from '../utils/febrabanRules';
import { formatMoney } from './ui/Format';
import { useConfirm } from './ui/confirm';
import { useWritableOrganizations } from '../hooks/useOrgContext';
import type { Boleto, BoletoExtractionResult, Supplier, CostCenter, ChartOfAccount } from '../types';

interface BoletoFormModalProps {
    organizationId: string;
    organizations?: { id: string; name: string }[];
    onOrgChange?: (id: string) => void;
    userEmail?: string;
    projectId?: string;
    boleto?: Boleto;
    onClose: () => void;
    onSaved: (boleto: Boleto) => void;
}

// Delegado à primitiva compartilhada (ver components/ui/Format.tsx / PLANO_MODULO_TABELAS.md).
// Mantido o nome exportado para não tocar os call sites existentes (BoletoManager etc.).
const formatBRL = (v?: number) => formatMoney(v);

// Malha do formulário — §21 (rótulo sentence case), §30 (rótulo→campo 6px,
// campos 16/24px) e §16 (escala compacta: h-9, rounded-[6px]). O desenho veio
// do drawer "Agendar Ordem de Manutenção" (Gestão de Ativos), a pedido do
// usuário em 24/09/2026: mesmo rótulo e mesmo preenchimento cinza; o radius é
// o da §16, não o `rounded-xl` daquela tela, que é a escala deprecada.
const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full px-3 h-9 bg-gray-50 border border-gray-100 rounded-[6px] text-sm text-gray-900 outline-none focus:bg-white focus:border-blue-600 transition-colors disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed';
const CAMPO_AREA = 'w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-[6px] text-sm text-gray-900 outline-none focus:bg-white focus:border-blue-600 transition-colors';

/**
 * Painel — o card do §30: `bg-white p-6 rounded-[10px] border shadow-sm`.
 *
 * Existe porque a tela inteira vivia solta sobre o mesmo cinza do shell
 * (`bg-gray-50`), e o cartão do documento também era `bg-gray-50`: tudo com a
 * mesma cor, nada com borda de verdade. O olho não achava onde o boleto
 * acabava e o formulário começava — foi exatamente a queixa de 24/09/2026.
 * Branco sobre o cinza do shell é o que separa.
 */
const Painel: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ className = '', children }) => (
    <div className={`bg-white rounded-[10px] border border-gray-100 shadow-sm ${className}`}>
        {children}
    </div>
);

/**
 * Seção dentro de um painel — §30: título + ícone + `border-b pb-3`, campos em
 * `space-y-4`, e 32px (`space-y-8`) entre seções irmãs.
 *
 * Seção NÃO vira card próprio: campos que o usuário preenche em sequência são
 * um formulário só. Três cards empilhados fariam o olho entrar e sair três
 * vezes e gastariam 3× moldura.
 */
const Secao: React.FC<React.PropsWithChildren<{ titulo: string; icone: React.ComponentType<{ className?: string }>; acao?: React.ReactNode }>> = ({ titulo, icone: Icone, acao, children }) => (
    <div className="space-y-4">
        <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <Icone className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
            {acao && <div className="ml-auto">{acao}</div>}
        </div>
        {children}
    </div>
);

/* Barreira de navegador para a data do vencimento — a mesma janela que
   `vencimentoPlausivel` aplica no service. Sem `min`/`max` o `<input
   type="date">` aceita ano de até 275760, que foi como um `20023-09-21` entrou
   na base. O service continua sendo o guarda de verdade: isto só evita ao
   usuário digitar e só então tomar o erro. */
const VENCIMENTO_MIN = '1997-10-07';
const VENCIMENTO_MAX = `${new Date().getFullYear() + 5}-12-31`;

const BoletoFormModal: React.FC<BoletoFormModalProps> = ({
    organizationId: initialOrgId, organizations = [], onOrgChange,
    userEmail, projectId, boleto: initial, onClose, onSaved,
}) => {
    const [organizationId, setOrganizationId] = React.useState(initialOrgId);
    // Orgs em que o usuário REALMENTE pode gravar. `useStore().organizations`
    // (de onde vem a prop `organizations`) lista org de que ele não é membro —
    // a RLS de `organizations` é mais frouxa que a das tabelas de dados, e
    // gravar numa delas volta 42501. Ver REGRA #5.
    const orgsGravaveis = useWritableOrganizations();
    const [trocandoOrg, setTrocandoOrg] = useState(false);
    const [boleto, setBoleto] = useState<Boleto | undefined>(initial);
    const [uploading, setUploading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const confirm = useConfirm();
    const [info, setInfo] = useState<string | null>(null);

    const [linhaManual, setLinhaManual] = useState('');
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
    const [planoContas, setPlanoContas] = useState<CostCenter[]>([]);
    const [contasFinanceiras, setContasFinanceiras] = useState<ChartOfAccount[]>([]);
    const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
    const [documentoBlobUrl, setDocumentoBlobUrl] = useState<string | null>(null);

    // Arquivo selecionado mas ainda não enviado ao Supabase (aguardando org)
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [pendingExtraction, setPendingExtraction] = useState<BoletoExtractionResult | null>(null);

    // Form fields
    const [supplierId, setSupplierId] = useState<string>(initial?.supplier_id ?? '');
    const [costCenterId, setCostCenterId] = useState<string>(initial?.cost_center_id ?? '');
    const [planoDeContasId, setPlanoDeContasId] = useState<string>(initial?.plano_de_contas_id ?? '');
    const [categoryId, setCategoryId] = useState<string>(initial?.category_id ?? '');
    const [selectedProjectId, setSelectedProjectId] = useState<string>(initial?.project_id ?? projectId ?? '');
    const [descricao, setDescricao] = useState<string>(initial?.descricao ?? '');
    const [observacoes, setObservacoes] = useState<string>(initial?.observacoes ?? '');
    const [valor, setValor] = useState<string>(initial?.valor != null ? String(initial.valor) : '');
    const [vencimento, setVencimento] = useState<string>(initial?.vencimento ?? '');
    const [multa, setMulta] = useState<string>(initial?.multa != null ? String(initial.multa) : '');
    const [multaPercentual, setMultaPercentual] = useState<string>(initial?.multa_percentual != null ? String(initial.multa_percentual) : '');
    const [jurosDia, setJurosDia] = useState<string>(initial?.juros_dia != null ? String(initial.juros_dia) : '');
    const [jurosDiaTipo, setJurosDiaTipo] = useState<'valor' | 'percentual'>(initial?.juros_dia_tipo ?? 'valor');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const isCreating = !boleto;

    // Mini-formulário de cadastro rápido de fornecedor
    const [showNovoFornecedor, setShowNovoFornecedor] = useState(false);
    const [novoForn, setNovoForn] = useState({
        name: '', document: '', type: 'PJ' as 'PJ' | 'PF', category: 'Materiais de Construção',
        street: '', number: '', neighborhood: '', city: '', state: '', zip_code: '',
    });
    const [salvandoForn, setSalvandoForn] = useState(false);

    useEffect(() => {
        Promise.all([
            supplierService.listSuppliers(organizationId),
            financialRegistryService.listCostCenters(organizationId),
            financialRegistryService.listPlanoContas(organizationId),
            projectService.listProjects().catch(() => []),
            financialRegistryService.listChartOfAccounts(organizationId).catch(() => []),
        ]).then(([sup, cc, pc, projs, cf]) => {
            setSuppliers(sup || []);
            setCostCenters(cc || []);
            setPlanoContas(pc || []);
            setContasFinanceiras(cf || []);
            type ProjectRow = { id: string; name: string; settings?: { classification?: string } };
            // Sem filtro aqui de propósito: `listProjects` já devolve só OBRA
            // (regra #3) e já exclui projeto de sistema (regra #2). O filtro por
            // NOME que existia aqui — /gest[aã]o comercial/ — era exatamente o
            // padrão que a regra #2 proíbe: toda tela nova nascia sem ele.
            setProjects(((projs || []) as ProjectRow[]).map((p) => ({ id: p.id, name: p.name })));
        }).catch(err => console.warn('falha ao carregar registros', err));
    }, [organizationId]);

    // Aplica sugestão de fornecedor caso nenhum esteja selecionado
    useEffect(() => {
        if (boleto?.sugestao_supplier_id && !supplierId) {
            setSupplierId(boleto.sugestao_supplier_id);
        }
    }, [boleto?.sugestao_supplier_id]);

    // Pré-preenche formulário de novo fornecedor com dados do boleto
    useEffect(() => {
        if (boleto) {
            let nome = boleto.beneficiario_nome ?? '';
            let cnpj = boleto.beneficiario_cnpj ?? '';

            // Extrai CNPJ/CPF embutido no nome (ex: "... - CNPJ: 07604526000120  Ven")
            if (!cnpj) {
                const match = nome.match(/\b(\d{14}|\d{11})\b/);
                if (match) cnpj = match[1];
            }

            // Remove do nome: " - CNPJ: ...", sequências de 11+ dígitos e lixo após o separador
            nome = nome
                .replace(/[\s\-–]+(?:CNPJ|CPF)[:\s]*[\d.\/\-]+.*/i, '')
                .replace(/\s+\d{11,14}\b.*/g, '')
                .trim();

            const digits = onlyDigits(cnpj);
            setNovoForn(prev => ({
                ...prev,
                name: nome || prev.name,
                document: cnpj || prev.document,
                type: digits.length === 14 ? 'PJ' : digits.length === 11 ? 'PF' : prev.type,
            }));
        }
    }, [boleto?.id]);

    // Bucket 'boletos' privado: resolve a signed URL (async) em estado.
    const [documentoUrl, setDocumentoUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!boleto?.documento_path) { setDocumentoUrl(null); return; }
        let cancelled = false;
        boletoService.getDocumentoUrl(boleto.documento_path)
            .then(url => { if (!cancelled) setDocumentoUrl(url); })
            .catch(() => { if (!cancelled) setDocumentoUrl(null); });
        return () => { cancelled = true; };
    }, [boleto?.documento_path]);

    // Busca o documento como blob para contornar CSP que bloqueia iframes cross-origin
    useEffect(() => {
        if (!documentoUrl) { setDocumentoBlobUrl(null); return; }
        let revoked = false;
        fetch(documentoUrl)
            .then(r => r.blob())
            .then(blob => {
                if (!revoked) setDocumentoBlobUrl(URL.createObjectURL(blob));
            })
            .catch(() => setDocumentoBlobUrl(null));
        return () => {
            revoked = true;
            setDocumentoBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
        };
    }, [documentoUrl]);

    async function handleFile(file: File) {
        setError(null);
        setUploading(true);
        // Gera preview local imediato
        const localUrl = URL.createObjectURL(file);
        setDocumentoBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return localUrl; });
        try {
            const extraction = await extractFromPdfFile(file).catch(() => null);
            setPendingFile(file);
            setPendingExtraction(extraction);
            // Pré-preenche campos com o que foi extraído
            if (extraction) {
                setValor(extraction.campos.valor.valor != null ? String(extraction.campos.valor.valor) : '');
                setVencimento(extraction.campos.vencimento.valor ?? '');
                if (extraction.campos.multa.valor != null)
                    setMulta(String(extraction.campos.multa.valor));
                if (extraction.campos.multa_percentual.valor != null)
                    setMultaPercentual(String(extraction.campos.multa_percentual.valor));
                if (extraction.campos.juros_dia.valor != null)
                    setJurosDia(String(extraction.campos.juros_dia.valor));
                if (extraction.campos.juros_dia_tipo.valor != null)
                    setJurosDiaTipo(extraction.campos.juros_dia_tipo.valor);
            }
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error.message || 'Falha na extração');
        } finally {
            setUploading(false);
        }
    }

    async function handleUploadAndSave(closeAfter = true) {
        if (!pendingFile || !organizationId) return;
        setBusy(true);
        setError(null);
        try {
            const result = await boletoService.uploadBoleto({
                organizationId, file: pendingFile, userEmail,
                projectId: selectedProjectId || projectId,
                extraction: pendingExtraction,
            });
            // Aplica associações do formulário
            const updated = await boletoService.associar(result.boleto.id, organizationId, {
                supplier_id:          supplierId || undefined,
                cost_center_id:       costCenterId || undefined,
                plano_de_contas_id:   planoDeContasId || undefined,
                category_id:          categoryId || null,
                project_id:           selectedProjectId || projectId || undefined,
                descricao:            descricao.trim() || undefined,
                observacoes:          observacoes || undefined,
                valor:                valor ? Number(valor) : undefined,
                vencimento:           vencimento || undefined,
                multa:                multa ? Number(multa) : undefined,
                multa_percentual:     multaPercentual ? Number(multaPercentual) : undefined,
                juros_dia:            jurosDia ? Number(jurosDia) : undefined,
                juros_dia_tipo:       jurosDia ? jurosDiaTipo : undefined,
            }, userEmail);
            setPendingFile(null);
            setPendingExtraction(null);
            onSaved(updated);
            if (result.duplicate) {
                // Boleto duplicado: mostra aviso e permanece no modal com os dados existentes
                setBoleto(updated);
                setInfo('Este boleto já havia sido capturado anteriormente. Carregando registro existente.');
            } else if (closeAfter) {
                onClose();
            } else {
                setBoleto(updated);
            }
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error.message || 'Falha ao salvar boleto');
            setBusy(false);
        }
    }

    async function handleAplicarLinhaManual() {
        if (!boleto) return;
        const digits = onlyDigits(linhaManual);
        if (digits.length !== 44 && digits.length !== 47 && digits.length !== 48) {
            setError('Linha digitável deve ter 44, 47 ou 48 dígitos.');
            return;
        }
        setError(null);
        setBusy(true);
        try {
            const updated = await boletoService.aplicarLinhaDigitavelManual(
                boleto.id, organizationId, digits, userEmail,
            );
            setBoleto(updated);
            setValor(updated.valor != null ? String(updated.valor) : '');
            setVencimento(updated.vencimento ?? '');
            setMulta(updated.multa != null ? String(updated.multa) : '');
            setMultaPercentual(updated.multa_percentual != null ? String(updated.multa_percentual) : '');
            setJurosDia(updated.juros_dia != null ? String(updated.juros_dia) : '');
            if (updated.juros_dia_tipo) setJurosDiaTipo(updated.juros_dia_tipo);
            setLinhaManual('');
            setInfo('Linha digitável processada com sucesso.');
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error.message || 'Falha ao processar linha digitável');
        } finally {
            setBusy(false);
        }
    }

    /**
     * Troca a organização do boleto.
     *
     * Fornecedor, obra, centro de custo, plano de contas e conta financeira
     * são catálogo da org ANTIGA — o service zera os seis, e aqui o estado
     * local acompanha, senão o formulário continuaria exibindo o id de uma
     * dimensão que não existe mais na lista carregada.
     */
    async function handleTrocarOrganizacao(novaOrgId: string) {
        if (!boleto || !novaOrgId || novaOrgId === organizationId) return;
        const destino = orgsGravaveis.find(o => o.id === novaOrgId);
        const temDimensao = supplierId || selectedProjectId || costCenterId || planoDeContasId || categoryId;
        const ok = await confirm({
            title: `Mover o boleto para ${destino?.name ?? 'outra organização'}?`,
            message: temDimensao
                ? 'Fornecedor, obra, centro de custo, plano de contas e conta financeira serão limpos: pertencem ao cadastro da organização atual e não existem na de destino.'
                : 'O boleto passa a pertencer a essa organização, e os cadastros oferecidos abaixo passam a ser os dela.',
            variant: 'warning',
            confirmLabel: 'Mover',
        });
        if (!ok) return;
        setError(null);
        setTrocandoOrg(true);
        try {
            const atualizado = await boletoService.moverParaOrganizacao(boleto.id, organizationId, novaOrgId, userEmail);
            setBoleto(atualizado);
            setOrganizationId(novaOrgId);
            setSupplierId('');
            setSelectedProjectId('');
            setCostCenterId('');
            setPlanoDeContasId('');
            setCategoryId('');
            setShowNovoFornecedor(false);
            onOrgChange?.(novaOrgId);
            onSaved(atualizado);
            setInfo(`Boleto movido para ${destino?.name ?? 'a organização selecionada'}.`);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Falha ao mover o boleto de organização');
        } finally {
            setTrocandoOrg(false);
        }
    }

    async function handleSalvar() {
        if (!boleto) return;
        setBusy(true);
        setError(null);
        try {
            const updated = await boletoService.associar(boleto.id, organizationId, {
                supplier_id: supplierId || undefined,
                cost_center_id: costCenterId || undefined,
                plano_de_contas_id: planoDeContasId || undefined,
                category_id: categoryId || null,
                project_id: selectedProjectId || projectId || boleto.project_id,
                descricao: descricao.trim() || undefined,
                observacoes: observacoes || undefined,
                valor: valor ? Number(valor) : undefined,
                vencimento: vencimento || undefined,
                multa: multa ? Number(multa) : undefined,
                multa_percentual: multaPercentual ? Number(multaPercentual) : undefined,
                juros_dia: jurosDia ? Number(jurosDia) : undefined,
                juros_dia_tipo: jurosDia ? jurosDiaTipo : undefined,
            }, userEmail);
            setBoleto(updated);
            setInfo('Boleto atualizado.');
            onSaved(updated);
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error.message || 'Falha ao salvar');
        } finally {
            setBusy(false);
        }
    }

    async function handleAprovar() {
        if (!boleto) return;
        if (!supplierId) {
            setError('Selecione um fornecedor antes de aprovar.');
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await handleSalvar();
            const updated = await boletoService.aprovarECriarInvoice(boleto.id, organizationId, userEmail);
            setBoleto(updated);
            setInfo('Boleto aprovado e lançado em contas a pagar.');
            onSaved(updated);
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error.message || 'Falha ao aprovar');
        } finally {
            setBusy(false);
        }
    }

    async function handleMarcarPago() {
        if (!boleto) return;
        setBusy(true);
        try {
            const updated = await boletoService.marcarPago(boleto.id, organizationId, userEmail);
            setBoleto(updated);
            onSaved(updated);
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error.message || 'Falha ao marcar como pago');
        } finally {
            setBusy(false);
        }
    }

    async function handleSalvarNovoFornecedor() {
        if (!novoForn.name.trim()) return;
        setSalvandoForn(true);
        try {
            const criado = await supplierService.addSupplier({
                name:         novoForn.name.trim(),
                document:     novoForn.document.trim() || undefined,
                type:         novoForn.type,
                category:     novoForn.category,
                street:       novoForn.street.trim() || undefined,
                number:       novoForn.number.trim() || undefined,
                neighborhood: novoForn.neighborhood.trim() || undefined,
                city:         novoForn.city.trim() || undefined,
                state:        novoForn.state.trim() || undefined,
                zip_code:     novoForn.zip_code.trim() || undefined,
                organization_id: organizationId,
            });
            setSuppliers(prev => [...prev, criado].sort((a, b) => a.name.localeCompare(b.name)));
            setSupplierId(criado.id);
            setShowNovoFornecedor(false);
            setInfo(`Fornecedor "${criado.name}" cadastrado e selecionado.`);
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error.message || 'Falha ao cadastrar fornecedor');
        } finally {
            setSalvandoForn(false);
        }
    }

    async function handleCancelar() {
        if (!boleto) return;
        const motivo = window.prompt('Motivo do cancelamento:');
        if (!motivo) return;
        setBusy(true);
        try {
            const updated = await boletoService.cancelar(boleto.id, organizationId, motivo, userEmail);
            setBoleto(updated);
            onSaved(updated);
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error.message || 'Falha ao cancelar');
        } finally {
            setBusy(false);
        }
    }

    /* Primeiro passo do fluxo de exclusão do pago (decisão do usuário,
       24/09/2026): reverter estorna título e nota e devolve o boleto a rascunho;
       só aí o Excluir aparece. A confirmação diz o que o estorno mexe no
       financeiro, porque é isso que ninguém deveria descobrir depois. */
    async function handleReverterParaRascunho() {
        if (!boleto) return;
        const ok = await confirm({
            title: 'Reverter para rascunho?',
            message: 'O título deste boleto no financeiro e a nota serão estornados, e o valor sai do realizado. O boleto volta a rascunho e poderá ser editado, aprovado de novo ou excluído.',
            variant: 'danger',
            confirmLabel: 'Reverter',
        });
        if (!ok) return;
        setBusy(true);
        try {
            const atualizado = await boletoService.reverterParaRascunho(boleto.id, organizationId, userEmail);
            setBoleto(atualizado);
            onSaved(atualizado);
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error.message || 'Falha ao reverter');
        } finally {
            setBusy(false);
        }
    }

    async function handleExcluir() {
        if (!boleto) return;
        const ok = await confirm({
            title: boleto.status === 'rascunho' ? 'Excluir rascunho?' : 'Excluir boleto?',
            message: boleto.status === 'pago'
                ? 'Este boleto está marcado como PAGO: o título já baixado no financeiro e a nota serão removidos junto, e o valor sai do realizado. Essa ação não pode ser desfeita.'
                : boleto.status === 'aprovado'
                    ? 'Este boleto já foi aprovado: o título dele no financeiro e a nota serão removidos junto. Essa ação não pode ser desfeita.'
                    : 'Excluir este rascunho permanentemente? Essa ação não pode ser desfeita.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        setBusy(true);
        try {
            await boletoService.excluir(boleto.id, organizationId, userEmail);
            onSaved({ ...boleto, status: 'cancelado' }); // sinal de atualização
            onClose();
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error.message || 'Falha ao excluir');
            setBusy(false);
        }
    }

    return (
        <div className="flex flex-col">
            <div className="w-full">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="p-2 rounded-[6px] hover:bg-gray-100 text-gray-500"
                            title="Voltar"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                        <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                            {isCreating ? 'Capturar Boleto' : `Boleto · ${boleto?.banco_nome ?? 'Documento'}`}
                            {!isCreating && boleto?.numero != null && (
                                <span className="text-sm font-semibold text-gray-400">
                                    #{String(boleto.numero).padStart(4, '0')}
                                </span>
                            )}
                        </h2>
                        {boleto && (
                            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                                <span>Status:</span>
                                <span className={`text-sm font-normal ${STATUS_TEXT_COLORS[boleto.status]}`}>
                                    {STATUS_LABELS[boleto.status]}
                                </span>
                                <span className="text-gray-300">·</span>
                                <span>Confiança: {boleto.confidence_score ?? 0}%</span>
                            </p>
                        )}
                        </div>
                    </div>
                </div>

                {/* `bg-gray-50` de propósito: o shell (`Layout`) já e cinza, mas esta
                    tela substitui a lista e precisa carregar o proprio fundo para
                    que o branco dos paineis signifique alguma coisa. */}
                <div data-corpo className="p-6 space-y-6 bg-gray-50 min-h-[70vh]">
                    {error && (
                        <div className="flex items-start gap-3 p-3 rounded-[6px] bg-red-50 border border-red-200 text-red-700 text-sm">
                            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}
                    {info && (
                        <div className="flex items-start gap-3 p-3 rounded-[6px] bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
                            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>{info}</span>
                        </div>
                    )}

                    {/* Upload zone (only when creating and no file selected yet) */}
                    {isCreating && !pendingFile && (
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="bg-white border-2 border-dashed border-gray-200 rounded-[10px] p-12 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition-colors"
                        >
                            {uploading ? (
                                <div className="flex flex-col items-center gap-3 text-blue-600">
                                    <Loader2 className="w-8 h-8 animate-spin" />
                                    <span className="font-medium">Processando boleto...</span>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-3 text-gray-500">
                                    <Upload className="w-10 h-10 text-blue-600" />
                                    <div>
                                        <p className="text-gray-900 font-semibold">Arraste um boleto aqui ou clique para selecionar</p>
                                        <p className="text-xs text-gray-500 mt-1">PDF ou imagem (JPG/PNG)</p>
                                    </div>
                                </div>
                            )}
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="application/pdf,image/*"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleFile(f);
                                }}
                            />
                        </div>
                    )}

                    {/* Preview local após seleção do arquivo, antes de salvar */}
                    {isCreating && pendingFile && !boleto && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Preview do PDF */}
                            <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
                                <Painel className="overflow-hidden">
                                    <div className="px-6 py-3.5 border-b border-gray-100 flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-blue-600" />
                                        <h3 className="text-sm font-semibold text-gray-900">Documento original</h3>
                                    </div>
                                    <div className="aspect-[3/4] bg-gray-50">
                                        {documentoBlobUrl
                                            ? <iframe src={documentoBlobUrl} className="w-full h-full" title="Boleto" />
                                            : <div className="flex items-center justify-center h-full text-gray-400 text-sm"><Loader2 className="w-5 h-5 animate-spin mr-2" />Carregando...</div>
                                        }
                                    </div>
                                    <div className="px-6 py-3 text-xs text-gray-500 border-t border-gray-100 truncate" title={pendingFile.name}>{pendingFile.name}</div>
                                </Painel>
                            </div>

                            {/* Dados extraídos + formulário — mesmas seções da edição */}
                            <Painel className="p-6 space-y-8">
                                <Secao titulo="Cobrança" icone={Receipt}>
                                    {pendingExtraction && (
                                        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                            <ReadOnlyField icon={Building2} label="Banco" value={pendingExtraction.campos.banco_nome?.valor ?? '—'} />
                                            <ReadOnlyField icon={Hash} label="Confiança" value={`${pendingExtraction.confidence_score ?? 0}%`} />
                                            {pendingExtraction.campos.beneficiario_nome?.valor && (
                                                <ReadOnlyField label="Beneficiário" value={
                                                    pendingExtraction.campos.beneficiario_nome.valor
                                                        .replace(/[\s\-–]+(?:CNPJ|CPF)[:\s]*[\d.\/\-]+.*/i, '')
                                                        .replace(/\s+\d{11,14}\b.*/g, '')
                                                        .trim()
                                                } />
                                            )}
                                            {pendingExtraction.campos.beneficiario_cnpj?.valor && (
                                                <ReadOnlyField label="CNPJ / CPF" value={pendingExtraction.campos.beneficiario_cnpj.valor} mono />
                                            )}
                                        </div>
                                    )}

                                    {/* Organização — obrigatória para salvar. Nunca oferece
                                        "Todas": `organization_id` nulo é recusado pela RLS
                                        (REGRA #5). */}
                                    {orgsGravaveis.length > 0 && (
                                        <FormField
                                            label="Organização *"
                                            icon={Building2}
                                            hint={!organizationId ? 'Escolha antes de salvar — ela define quais fornecedores, obras e centros de custo aparecem abaixo.' : null}
                                        >
                                            <select
                                                value={organizationId}
                                                onChange={e => { setOrganizationId(e.target.value); onOrgChange?.(e.target.value); }}
                                                className={CAMPO}
                                                autoFocus={!organizationId}
                                            >
                                                <option value="">— Selecione a organização —</option>
                                                {orgsGravaveis.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                            </select>
                                        </FormField>
                                    )}

                                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                        <FormField label="Valor (R$)" icon={DollarSign}>
                                            <input type="number" step="0.01" min="0" value={valor}
                                                onChange={e => setValor(e.target.value)}
                                                className={CAMPO} />
                                        </FormField>
                                        <FormField label="Vencimento" icon={Calendar}>
                                            <input type="date" value={vencimento}
                                                min={VENCIMENTO_MIN} max={VENCIMENTO_MAX}
                                                onChange={e => setVencimento(e.target.value)}
                                                className={CAMPO} />
                                        </FormField>
                                    </div>

                                    <MultaJurosFields
                                        multa={multa} setMulta={setMulta}
                                        multaPercentual={multaPercentual} setMultaPercentual={setMultaPercentual}
                                        jurosDia={jurosDia} setJurosDia={setJurosDia}
                                        jurosDiaTipo={jurosDiaTipo} setJurosDiaTipo={setJurosDiaTipo}
                                    />

                                </Secao>

                                <Secao titulo="Classificação" icone={Tag}>
                                    <FormField label="Descrição">
                                        <input
                                            type="text"
                                            value={descricao}
                                            onChange={e => setDescricao(e.target.value)}
                                            placeholder="O que está sendo pago (vai para a descrição do título)"
                                            className={CAMPO}
                                        />
                                    </FormField>

                                    <FormField label="Obra / Projeto">
                                        <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}
                                            className={CAMPO}>
                                            <option value="">— Sem vínculo —</option>
                                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                    </FormField>

                                    <FormField label="Centro de Custo">
                                        <CostCenterSelect
                                            costCenters={costCenters}
                                            value={costCenterId}
                                            onChange={setCostCenterId}
                                            hoverCls="hover:bg-blue-50"
                                            size="sm"
                                        />
                                    </FormField>

                                    <FormField label="Plano de Contas">
                                        <PlanoContasSelect
                                            planoContas={planoContas}
                                            value={planoDeContasId}
                                            onChange={setPlanoDeContasId}
                                            placeholder="—"
                                            hoverCls="hover:bg-blue-50"
                                            size="sm"
                                        />
                                    </FormField>

                                    {/* Conta Financeira (financial_categories) — a dimensão que a DRE
                                        lê. Distinta de Centro de Custo e de Plano de Contas; mesmo
                                        drawer do ContractModal. */}
                                    <FormField label="Conta Financeira">
                                        <HierarchicalSelect
                                            items={contasFinanceiras.map(c => ({ id: c.id, name: c.name, parentId: c.parent_id ?? null }))}
                                            value={categoryId}
                                            onChange={setCategoryId}
                                            valueField="id"
                                            placeholder="—"
                                            hoverCls="hover:bg-blue-50"
                                            size="sm"
                                            panelVariant="drawer"
                                            drawerTitle="Selecionar Conta Financeira"
                                        />
                                    </FormField>

                                </Secao>

                                <Secao titulo="Observações" icone={StickyNote}>
                                    <FormField label="Anotações internas">
                                        <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)}
                                            rows={3}
                                            placeholder="Só para a equipe — não vai para o título nem para o fornecedor."
                                            className={CAMPO_AREA} />
                                    </FormField>
                                </Secao>

                                <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                                    <button onClick={() => { setPendingFile(null); setPendingExtraction(null); setDocumentoBlobUrl(null); }}
                                        className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-[6px] text-sm font-medium">
                                        Trocar arquivo
                                    </button>
                                    <button
                                        onClick={() => handleUploadAndSave(false)}
                                        disabled={busy || !organizationId}
                                        className="flex items-center gap-2 px-5 py-2 bg-gray-100 text-gray-900 rounded-[6px] text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
                                        title={!organizationId ? 'Selecione a organização antes de salvar' : undefined}
                                    >
                                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                        Salvar rascunho
                                    </button>
                                    <button
                                        onClick={() => handleUploadAndSave(true)}
                                        disabled={busy || !organizationId}
                                        className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-[6px] text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                                        title={!organizationId ? 'Selecione a organização antes de salvar' : undefined}
                                    >
                                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ThumbsUp className="w-3.5 h-3.5" />}
                                        Salvar e fechar
                                    </button>
                                </div>
                            </Painel>
                        </div>
                    )}

                    {/* Conteúdo após o boleto existir */}
                    {boleto && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Coluna esquerda: visualização do documento */}
                            <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
                                <Painel className="overflow-hidden">
                                    <div className="px-6 py-3.5 border-b border-gray-100 flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-blue-600" />
                                        <h3 className="text-sm font-semibold text-gray-900">Documento original</h3>
                                    </div>
                                    <div className="aspect-[3/4] bg-gray-50">
                                        {boleto.documento_mime === 'application/pdf' ? (
                                            documentoBlobUrl
                                                ? <iframe src={documentoBlobUrl} className="w-full h-full" title="Boleto" />
                                                : <div className="flex items-center justify-center h-full text-gray-400 text-sm"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...</div>
                                        ) : documentoBlobUrl ? (
                                            <img src={documentoBlobUrl} className="w-full h-full object-contain" alt="Boleto" />
                                        ) : null}
                                    </div>
                                    <div className="px-6 py-3 flex items-center justify-between gap-3 text-xs text-gray-500 border-t border-gray-100">
                                        <span className="truncate" title={boleto.documento_nome}>{boleto.documento_nome}</span>
                                        {documentoUrl && (
                                            <a href={documentoUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-blue-600 hover:underline flex items-center gap-1">
                                                <Eye className="w-3 h-3" /> Abrir
                                            </a>
                                        )}
                                    </div>
                                </Painel>

                                {/* Linha digitável manual (quando confidence baixo) */}
                                {boleto.confidence_score !== undefined && boleto.confidence_score < 80 && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-[10px] p-4">
                                        <p className="text-xs font-semibold text-amber-700 mb-2">
                                            Extração com baixa confiança
                                        </p>
                                        <p className="text-xs text-amber-700 mb-3">
                                            Cole abaixo a linha digitável (47 ou 48 dígitos) impressa no boleto:
                                        </p>
                                        <input
                                            type="text"
                                            value={linhaManual}
                                            onChange={(e) => setLinhaManual(e.target.value)}
                                            placeholder="00000.00000 00000.000000 00000.000000 0 00000000000000"
                                            className="w-full px-3 h-9 rounded-[6px] border border-amber-300 bg-white text-sm font-mono outline-none focus:border-amber-500"
                                        />
                                        <button
                                            onClick={handleAplicarLinhaManual}
                                            disabled={busy || !linhaManual}
                                            className="mt-2 px-4 py-2 bg-amber-600 text-white rounded-[6px] text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
                                        >
                                            Validar linha digitável
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Coluna direita: UM painel, quatro seções (§30). O que o
                                sistema LEU do boleto (banco, linha, beneficiário) fica em
                                "Cobrança"; o que o usuário DECIDE fica em "Classificação"
                                — é essa a fronteira que a tela não mostrava. */}
                            <Painel className="p-6 space-y-8">
                                <Secao titulo="Cobrança" icone={Receipt}>
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                        <ReadOnlyField icon={Building2} label="Banco" value={boleto.banco_nome ?? boleto.banco_codigo ?? '—'} />
                                        <ReadOnlyField icon={Hash} label="Linha digitável" value={boleto.linha_digitavel ?? '—'} mono />
                                    </div>

                                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                        <FormField label="Valor (R$)" icon={DollarSign}>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={valor}
                                                onChange={(e) => setValor(e.target.value)}
                                                className={CAMPO}
                                            />
                                        </FormField>
                                        <FormField label="Vencimento" icon={Calendar}>
                                            <input
                                                type="date"
                                                value={vencimento}
                                                min={VENCIMENTO_MIN}
                                                max={VENCIMENTO_MAX}
                                                onChange={(e) => setVencimento(e.target.value)}
                                                className={CAMPO}
                                            />
                                        </FormField>
                                    </div>

                                    <MultaJurosFields
                                        multa={multa} setMulta={setMulta}
                                        multaPercentual={multaPercentual} setMultaPercentual={setMultaPercentual}
                                        jurosDia={jurosDia} setJurosDia={setJurosDia}
                                        jurosDiaTipo={jurosDiaTipo} setJurosDiaTipo={setJurosDiaTipo}
                                    />
                                </Secao>

                                <Secao titulo="Quem recebe" icone={UserPlus}>
                                    {/* Beneficiário só aparece quando não há fornecedor vinculado — evita duplicidade */}
                                    {boleto.beneficiario_nome && !supplierId && (() => {
                                        const nomeExib = boleto.beneficiario_nome!
                                            .replace(/[\s\-–]+(?:CNPJ|CPF)[:\s]*[\d.\/\-]+.*/i, '')
                                            .replace(/\s+\d{11,14}\b.*/g, '')
                                            .trim();
                                        let cnpjExib = boleto.beneficiario_cnpj ?? '';
                                        if (!cnpjExib) {
                                            const m = boleto.beneficiario_nome!.match(/\b(\d{14}|\d{11})\b/);
                                            if (m) cnpjExib = m[1];
                                        }
                                        return (
                                            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                                <ReadOnlyField label="Beneficiário" value={nomeExib || boleto.beneficiario_nome!} />
                                                <ReadOnlyField label="CNPJ / CPF" value={cnpjExib || '—'} mono />
                                            </div>
                                        );
                                    })()}

                                    <FormField label="Fornecedor">
                                        <>
                                            {boleto.sugestao_supplier_id && supplierId === boleto.sugestao_supplier_id && (
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <span className="inline-flex items-center gap-1 text-sm font-normal text-emerald-700">
                                                        <CheckCircle2 className="w-3.5 h-3.5" /> Sugerido via CNPJ
                                                    </span>
                                                    <button type="button" onClick={() => setSupplierId('')} className="text-xs text-gray-700 hover:text-gray-900 underline">limpar</button>
                                                </div>
                                            )}
                                            <div className="flex gap-2 items-stretch">
                                                {/* Drawer lateral em tabela (Nome · CNPJ/CPF · Categoria,
                                                    ordenável, com busca e filtro de categoria) — o <select>
                                                    nativo não permitia pesquisar num catálogo longo. */}
                                                <div className="flex-1 min-w-0 overflow-hidden">
                                                    <SupplierSelect
                                                        suppliers={suppliers}
                                                        value={supplierId}
                                                        onChange={(v) => { setSupplierId(v); setShowNovoFornecedor(false); }}
                                                        placeholder="Selecione um fornecedor"
                                                    />
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => { setShowNovoFornecedor(v => !v); setSupplierId(''); }}
                                                    title="Cadastrar novo fornecedor com dados do boleto"
                                                    className={`shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3 h-9 rounded-[6px] border text-sm font-medium transition-colors ${
                                                        showNovoFornecedor
                                                            ? 'bg-blue-600 text-white border-blue-600'
                                                            : 'bg-white text-blue-600 border-blue-200 hover:bg-blue-50'
                                                    }`}
                                                >
                                                    <UserPlus className="w-3.5 h-3.5" />
                                                    Novo
                                                </button>
                                            </div>

                                            {/* Mini-formulário de cadastro rápido */}
                                            {showNovoFornecedor && (
                                                <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-[10px] space-y-4">
                                                    <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                                                        <UserPlus className="w-3 h-3" /> Cadastrar novo fornecedor
                                                    </p>

                                                    <div>
                                                        <label className={`${ROTULO} block mb-1.5`}>Razão Social *</label>
                                                        <input
                                                            type="text"
                                                            required
                                                            value={novoForn.name}
                                                            onChange={e => setNovoForn(p => ({ ...p, name: e.target.value }))}
                                                            className={CAMPO}
                                                            placeholder="Nome do fornecedor"
                                                        />
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                                        <div>
                                                            <label className={`${ROTULO} block mb-1.5`}>CNPJ / CPF</label>
                                                            <input
                                                                type="text"
                                                                value={novoForn.document}
                                                                onChange={e => setNovoForn(p => ({ ...p, document: e.target.value }))}
                                                                className={`${CAMPO} font-mono`}
                                                                placeholder="00.000.000/0000-00"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className={`${ROTULO} block mb-1.5`}>Tipo</label>
                                                            <select
                                                                value={novoForn.type}
                                                                onChange={e => setNovoForn(p => ({ ...p, type: e.target.value as 'PJ' | 'PF' }))}
                                                                className={CAMPO}
                                                            >
                                                                <option value="PJ">Pessoa Jurídica</option>
                                                                <option value="PF">Pessoa Física</option>
                                                            </select>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <label className={`${ROTULO} block mb-1.5`}>Categoria</label>
                                                        <select
                                                            value={novoForn.category}
                                                            onChange={e => setNovoForn(p => ({ ...p, category: e.target.value }))}
                                                            className={CAMPO}
                                                        >
                                                            {['Materiais de Construção','Mão de Obra / Serviços','Equipamentos / Ferramentas','Consultoria / Projetos','Transporte / Logística','Outros'].map(c => (
                                                                <option key={c} value={c}>{c}</option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    {/* Endereço */}
                                                    <div className="pt-1 border-t border-blue-100">
                                                        <p className="text-xs font-semibold text-slate-500 mb-2">Endereço</p>
                                                        <div className="grid grid-cols-3 gap-x-6 gap-y-4 mb-2">
                                                            <div className="col-span-2">
                                                                <label className={`${ROTULO} block mb-1.5`}>Rua / Logradouro</label>
                                                                <input
                                                                    type="text"
                                                                    value={novoForn.street}
                                                                    onChange={e => setNovoForn(p => ({ ...p, street: e.target.value }))}
                                                                    className={CAMPO}
                                                                    placeholder="Av. Paulista"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className={`${ROTULO} block mb-1.5`}>Número</label>
                                                                <input
                                                                    type="text"
                                                                    value={novoForn.number}
                                                                    onChange={e => setNovoForn(p => ({ ...p, number: e.target.value }))}
                                                                    className={CAMPO}
                                                                    placeholder="123"
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-x-6 gap-y-4 mb-2">
                                                            <div>
                                                                <label className={`${ROTULO} block mb-1.5`}>Bairro</label>
                                                                <input
                                                                    type="text"
                                                                    value={novoForn.neighborhood}
                                                                    onChange={e => setNovoForn(p => ({ ...p, neighborhood: e.target.value }))}
                                                                    className={CAMPO}
                                                                    placeholder="Centro"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className={`${ROTULO} block mb-1.5`}>CEP</label>
                                                                <input
                                                                    type="text"
                                                                    value={novoForn.zip_code}
                                                                    onChange={e => setNovoForn(p => ({ ...p, zip_code: e.target.value }))}
                                                                    className={`${CAMPO} font-mono`}
                                                                    placeholder="00000-000"
                                                                    maxLength={9}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="grid grid-cols-3 gap-x-6 gap-y-4">
                                                            <div className="col-span-2">
                                                                <label className={`${ROTULO} block mb-1.5`}>Cidade</label>
                                                                <input
                                                                    type="text"
                                                                    value={novoForn.city}
                                                                    onChange={e => setNovoForn(p => ({ ...p, city: e.target.value }))}
                                                                    className={CAMPO}
                                                                    placeholder="São Paulo"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className={`${ROTULO} block mb-1.5`}>UF</label>
                                                                <select
                                                                    value={novoForn.state}
                                                                    onChange={e => setNovoForn(p => ({ ...p, state: e.target.value }))}
                                                                    className={CAMPO}
                                                                >
                                                                    <option value="">—</option>
                                                                    {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => (
                                                                        <option key={uf} value={uf}>{uf}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex gap-2 pt-1">
                                                        <button
                                                            type="button"
                                                            onClick={handleSalvarNovoFornecedor}
                                                            disabled={salvandoForn || !novoForn.name.trim()}
                                                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-[6px] text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                                                        >
                                                            {salvandoForn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                                            Salvar e selecionar
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowNovoFornecedor(false)}
                                                            className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm font-medium"
                                                        >
                                                            Cancelar
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    </FormField>

                                    <FormField label="Descrição">
                                        <input
                                            type="text"
                                            value={descricao}
                                            onChange={e => setDescricao(e.target.value)}
                                            placeholder="O que está sendo pago (vai para a descrição do título)"
                                            className={CAMPO}
                                        />
                                    </FormField>
                                </Secao>

                                <Secao titulo="Classificação" icone={Tag}>
                                    {/* Organização do boleto. NAO e o seletor do topo: o topo e
                                        filtro de listagem, este campo é a org DONA do registro —
                                        é ela que decide quais fornecedores, obras, centros de
                                        custo e planos de contas aparecem nos campos abaixo.
                                        Editável só em rascunho/revisão: depois da aprovação existe
                                        título em `internal_transactions` na org antiga. */}
                                    <FormField
                                        label="Organização"
                                        icon={Building2}
                                        hint={boletoService.motivoParaNaoMudarOrganizacao(boleto.status)
                                            ?? 'Trocar limpa fornecedor, obra, centro de custo, plano de contas e conta financeira — são cadastros da organização atual.'}
                                    >
                                        <select
                                            value={organizationId}
                                            disabled={!boletoService.podeMudarOrganizacao(boleto.status) || trocandoOrg || busy}
                                            onChange={(e) => handleTrocarOrganizacao(e.target.value)}
                                            className={CAMPO}
                                            title={boletoService.motivoParaNaoMudarOrganizacao(boleto.status) ?? undefined}
                                        >
                                            {/* A org do boleto pode não estar entre as graváveis (perdeu
                                                acesso, ou é leitura por outra via) — sem esta linha o
                                                <select> mostraria a org errada, a primeira da lista. */}
                                            {!orgsGravaveis.some(o => o.id === organizationId) && (
                                                <option value={organizationId}>
                                                    {organizations.find(o => o.id === organizationId)?.name ?? 'Organização atual'}
                                                </option>
                                            )}
                                            {orgsGravaveis.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                        </select>
                                    </FormField>

                                    <FormField label="Obra / Projeto">
                                        <select
                                            value={selectedProjectId}
                                            onChange={(e) => setSelectedProjectId(e.target.value)}
                                            className={CAMPO}
                                        >
                                            <option value="">— Sem vínculo —</option>
                                            {projects.map(p => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                    </FormField>

                                    <FormField label="Centro de Custo">
                                        <CostCenterSelect
                                            costCenters={costCenters}
                                            value={costCenterId}
                                            onChange={setCostCenterId}
                                            hoverCls="hover:bg-blue-50"
                                            size="sm"
                                        />
                                    </FormField>

                                    <FormField label="Plano de Contas">
                                        <PlanoContasSelect
                                            planoContas={planoContas}
                                            value={planoDeContasId}
                                            onChange={setPlanoDeContasId}
                                            placeholder="—"
                                            hoverCls="hover:bg-blue-50"
                                            size="sm"
                                        />
                                    </FormField>

                                    {/* Conta Financeira (financial_categories) — a dimensão que a DRE
                                        lê. Distinta de Centro de Custo e de Plano de Contas; mesmo
                                        drawer do ContractModal. */}
                                    <FormField label="Conta Financeira">
                                        <HierarchicalSelect
                                            items={contasFinanceiras.map(c => ({ id: c.id, name: c.name, parentId: c.parent_id ?? null }))}
                                            value={categoryId}
                                            onChange={setCategoryId}
                                            valueField="id"
                                            placeholder="—"
                                            hoverCls="hover:bg-blue-50"
                                            size="sm"
                                            panelVariant="drawer"
                                            drawerTitle="Selecionar Conta Financeira"
                                        />
                                    </FormField>

                                </Secao>

                                <Secao titulo="Observações" icone={StickyNote}>
                                    <FormField label="Anotações internas">
                                        <textarea
                                            value={observacoes}
                                            onChange={(e) => setObservacoes(e.target.value)}
                                            rows={3}
                                            placeholder="Só para a equipe — não vai para o título nem para o fornecedor."
                                            className={CAMPO_AREA}
                                        />
                                    </FormField>

                                    {boleto.erros_validacao && boleto.erros_validacao.length > 0 && (
                                        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-[6px] p-3">
                                            <p className="font-semibold mb-1">Avisos de validação:</p>
                                            <ul className="list-disc list-inside space-y-0.5">
                                                {boleto.erros_validacao.map((e, i) => <li key={i}>{e}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                </Secao>
                            </Painel>
                        </div>
                    )}
                </div>

                {/* Footer com ações */}
                {boleto && (
                    <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex flex-wrap items-center justify-end gap-2">
                        {boleto.status === 'pago' && (
                            <button
                                onClick={handleReverterParaRascunho}
                                disabled={busy}
                                className="px-4 py-2 text-amber-700 hover:bg-amber-50 rounded-[6px] text-sm font-medium flex items-center gap-2"
                            >
                                <Undo2 className="w-3.5 h-3.5" /> Reverter para rascunho
                            </button>
                        )}

                        {boletoService.podeExcluir(boleto.status) && (
                            <button
                                onClick={handleExcluir}
                                disabled={busy}
                                className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-[6px] text-sm font-medium flex items-center gap-2"
                            >
                                <Trash2 className="w-3.5 h-3.5" /> Excluir
                            </button>
                        )}

                        {boleto.status !== 'pago' && boleto.status !== 'cancelado' && (
                            <button
                                onClick={handleCancelar}
                                disabled={busy}
                                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-[6px] text-sm font-medium flex items-center gap-2"
                            >
                                <Ban className="w-3.5 h-3.5" /> Cancelar
                            </button>
                        )}

                        <button
                            onClick={handleSalvar}
                            disabled={busy}
                            className="px-5 py-2 bg-gray-100 text-gray-900 rounded-[6px] text-sm font-medium hover:bg-gray-200 flex items-center gap-2"
                        >
                            <Save className="w-3.5 h-3.5" /> Salvar Rascunho
                        </button>

                        {(boleto.status === 'rascunho' || boleto.status === 'revisao') && (
                            <button
                                onClick={handleAprovar}
                                disabled={busy || !supplierId}
                                className="px-5 py-2 bg-blue-600 text-white rounded-[6px] text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                <ThumbsUp className="w-3.5 h-3.5" /> Aprovar e Lançar
                            </button>
                        )}

                        {boleto.status === 'aprovado' && (
                            <button
                                onClick={handleMarcarPago}
                                disabled={busy}
                                className="px-5 py-2 bg-emerald-600 text-white rounded-[6px] text-sm font-medium hover:bg-emerald-700 flex items-center gap-2"
                            >
                                <CheckCircle2 className="w-3.5 h-3.5" /> Marcar como Pago
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── Pequenos helpers de UI ──────────────────────────────────────────────────

const FormField: React.FC<React.PropsWithChildren<{ label: string; icon?: React.ComponentType<{ className?: string }>; hint?: string | null }>> = ({ label, icon: Icon, hint, children }) => (
    <div className="space-y-1.5">
        <label className={`flex items-center gap-1.5 ${ROTULO}`}>
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {label}
        </label>
        {children}
        {hint && <p className="text-xs text-gray-500 leading-snug">{hint}</p>}
    </div>
);

const ReadOnlyField: React.FC<{ label: string; value: string; icon?: React.ComponentType<{ className?: string }>; mono?: boolean }> = ({ label, value, icon: Icon, mono }) => (
    <div className="space-y-1.5">
        <label className={`flex items-center gap-1.5 ${ROTULO}`}>
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {label}
        </label>
        <div className={`px-3 h-9 flex items-center bg-gray-50 border border-gray-100 rounded-[6px] text-sm text-gray-700 ${mono ? 'font-mono text-xs' : ''}`}>
            <span className="truncate" title={value}>{value}</span>
        </div>
    </div>
);

interface MultaJurosFieldsProps {
    multa: string; setMulta: (v: string) => void;
    multaPercentual: string; setMultaPercentual: (v: string) => void;
    jurosDia: string; setJurosDia: (v: string) => void;
    jurosDiaTipo: 'valor' | 'percentual'; setJurosDiaTipo: (v: 'valor' | 'percentual') => void;
}

const MultaJurosFields: React.FC<MultaJurosFieldsProps> = ({
    multa, setMulta, multaPercentual, setMultaPercentual,
    jurosDia, setJurosDia, jurosDiaTipo, setJurosDiaTipo,
}) => {
    const temDados = multa || multaPercentual || jurosDia;
    return (
        <details open={!!temDados} className="group">
            <summary className={`flex items-center gap-1.5 ${ROTULO} cursor-pointer select-none list-none mb-2`}>
                <span className="group-open:rotate-90 inline-block transition-transform">▶</span>
                Multa &amp; Juros
                {temDados && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />}
            </summary>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 pt-1">
                <FormField label="Multa (R$)">
                    <input
                        type="number" step="0.01" min="0"
                        value={multa}
                        onChange={e => { setMulta(e.target.value); if (e.target.value) setMultaPercentual(''); }}
                        placeholder="0,00"
                        className={CAMPO}
                    />
                </FormField>
                <FormField label="Multa (%)">
                    <input
                        type="number" step="0.0001" min="0" max="100"
                        value={multaPercentual}
                        onChange={e => { setMultaPercentual(e.target.value); if (e.target.value) setMulta(''); }}
                        placeholder="2,00"
                        className={CAMPO}
                    />
                </FormField>
                <FormField label="Juros/dia">
                    <div className="flex gap-1">
                        <input
                            type="number" step="0.0001" min="0"
                            value={jurosDia}
                            onChange={e => setJurosDia(e.target.value)}
                            placeholder="0,033"
                            className={CAMPO}
                        />
                        <select
                            value={jurosDiaTipo}
                            onChange={e => setJurosDiaTipo(e.target.value as 'valor' | 'percentual')}
                            className={`${CAMPO} w-auto px-2`}
                        >
                            <option value="valor">R$</option>
                            <option value="percentual">%</option>
                        </select>
                    </div>
                </FormField>
                <div className="flex items-end pb-1">
                    <p className="text-xs text-gray-400 leading-tight">
                        Extraídos do texto do boleto.<br />
                        Confidence baixa — revise antes de aprovar.
                    </p>
                </div>
            </div>
        </details>
    );
};

export default BoletoFormModal;
export { formatBRL };
