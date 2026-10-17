import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CalendarClock, CheckCircle2, FileText, Landmark, Loader2, Paperclip, Tag, Trash2, Upload, User } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { SecaoTitulo } from '../ui/SecaoTitulo';
import MoneyCentsInput from '../ui/MoneyCentsInput';
import { useConfirm } from '../ui/confirm';
import { formatMoney, formatDateBR } from '../ui/Format';
import SupplierSelect from '../SupplierSelect';
import CostCenterSelect from '../CostCenterSelect';
import PlanoContasSelect from '../PlanoContasSelect';
import HierarchicalSelect from '../HierarchicalSelect';
import { supplierService } from '../../services/supplierService';
import { financialRegistryService } from '../../services/financialRegistryService';
import { projectService } from '../../services/projectService';
import { payableService, type PagamentoAvulsoGravado } from '../../services/payableService';
import { FORMAS_PAGAMENTO, hojeLocal } from '../../utils/baixaRecebivel';
import {
    MAX_PARCELAS_AVULSO,
    PERIODICIDADES_CONTRATO,
    previaParcelas,
    validarPagamentoAvulso,
    type FormPagamentoAvulso,
    type FormaPagamentoAvulso,
    type PeriodicidadeContrato,
} from '../../utils/pagamentoAvulso';
import type { ChartOfAccount, CostCenter, PaymentAccount } from '../../types';

/**
 * Contas a Pagar › Pagamento avulso — criar e editar um título a pagar gerado
 * manualmente (`source_system='MANUAL'`). Plano:
 * docs/planos/2026-10-17-contas-a-pagar-pagamento-avulso.md (item 5).
 *
 * Painel lateral (UI_PATTERNS §3: criar registro simples = Sheet). Formulário
 * curto, então salvar FECHA também na edição (UI_PATTERNS §6.4 — o §25 do guia
 * é para edição longa/multi-aba).
 *
 * A organização vem pronta de quem abre: o topo (ou o modal de "Todas") na
 * criação, a do próprio título na edição — este painel nunca pergunta (REGRA #5).
 */

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full px-3 h-9 bg-gray-50 border border-gray-100 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:bg-white focus:border-blue-600 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed';
const CAMPO_ERRO = 'border-red-300 bg-red-50/40';

/** Teto do bucket `financeiro-anexos` (20 MiB) e os tipos que ele aceita. */
const ANEXO_MAX_BYTES = 20 * 1024 * 1024;
const ANEXO_TIPOS = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

interface Props {
    open: boolean;
    /** Organização do título: a resolvida pelo topo (criar) ou a do registro (editar). */
    organizationId: string;
    /** Presente = edição de um título MANUAL existente. */
    editId?: string | null;
    onClose: () => void;
    /** Depois de gravar: ids gravados + a frase do toast (+ aviso quando a baixa de "Já pago" não saiu). */
    onSaved: (resultado: { ids: string[]; mensagem: string; aviso: string | null }) => void;
}

type ProjetoOpcao = { id: string; name: string; settings?: { isSystemProject?: boolean; name?: string } };

function formVazio(): FormPagamentoAvulso {
    return {
        supplierId: null,
        credorNome: '',
        descricao: '',
        valorTotal: 0,
        projeto: null,
        costCenterId: null,
        planoDeContasId: null,
        categoryId: null,
        categoryName: null,
        formaPagamento: null,
        paymentAccountId: null,
        competencia: '',
        parcelas: 1,
        periodicidade: 'Mensal',
        primeiroVencimento: hojeLocal(),
        jaPago: false,
        dataPagamento: hojeLocal(),
    };
}

const Campo: React.FC<React.PropsWithChildren<{ label: string; erro?: string | null; dica?: React.ReactNode; className?: string }>> = ({ label, erro, dica, className = '', children }) => (
    <div className={`space-y-1.5 ${className}`}>
        <label className={ROTULO}>{label}</label>
        {children}
        {erro
            ? <p className="text-xs text-red-600 leading-snug">{erro}</p>
            : dica ? <p className="text-xs text-gray-500 leading-snug">{dica}</p> : null}
    </div>
);

const PagamentoAvulsoSheet: React.FC<Props> = ({ open, organizationId, editId, onClose, onSaved }) => {
    const confirm = useConfirm();
    const isEdit = !!editId;
    const hoje = hojeLocal();

    const [form, setForm] = useState<FormPagamentoAvulso>(formVazio);
    const [valorTexto, setValorTexto] = useState('');
    const [credorLivre, setCredorLivre] = useState('');
    const [arquivo, setArquivo] = useState<File | null>(null);
    const [removerAnexo, setRemoverAnexo] = useState(false);
    const [gravado, setGravado] = useState<PagamentoAvulsoGravado | null>(null);
    const [snapshot, setSnapshot] = useState('');
    const [tentou, setTentou] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [carregando, setCarregando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const [fornecedores, setFornecedores] = useState<{ id: string; name: string; nickname?: string | null; document?: string | null; category?: string | null }[]>([]);
    const [centros, setCentros] = useState<CostCenter[]>([]);
    const [planos, setPlanos] = useState<CostCenter[]>([]);
    const [contasFinanceiras, setContasFinanceiras] = useState<ChartOfAccount[]>([]);
    const [contasPagamento, setContasPagamento] = useState<PaymentAccount[]>([]);
    const [projetos, setProjetos] = useState<ProjetoOpcao[]>([]);

    // Cadastros da organização DO TÍTULO — nunca de todas (um CC de outra org
    // gravado aqui viraria UUID solto na coluna).
    useEffect(() => {
        if (!open || !organizationId) return;
        let vivo = true;
        Promise.all([
            supplierService.listSuppliers(organizationId).catch(() => []),
            financialRegistryService.listCostCenters(organizationId).catch(() => []),
            financialRegistryService.listPlanoContas(organizationId).catch(() => []),
            financialRegistryService.listChartOfAccounts(organizationId).catch(() => []),
            financialRegistryService.listPaymentAccounts().catch(() => []),
            // `listProjects` já devolve só OBRA (REGRA #3) e sem projeto de sistema (REGRA #2).
            projectService.listProjects({ organizationId }).catch(() => []),
        ]).then(([sup, cc, pc, cf, contas, projs]) => {
            if (!vivo) return;
            setFornecedores((sup || []) as typeof fornecedores);
            setCentros(cc || []);
            setPlanos(pc || []);
            setContasFinanceiras(cf || []);
            // Conta da organização OU que a atende (lista ou "todas") — regra de 15/09/2026.
            setContasPagamento(((contas || []) as PaymentAccount[]).filter(a =>
                a.organization_id === organizationId
                || a.serves_all_organizations
                || (a.served_organization_ids ?? []).includes(organizationId)));
            setProjetos(((projs || []) as ProjetoOpcao[]).map(p => ({ id: p.id, name: p.name, settings: p.settings })));
        });
        return () => { vivo = false; };
    }, [open, organizationId]);

    // Abrir: zera (criar) ou lê o título (editar).
    useEffect(() => {
        if (!open) return;
        setErro(null);
        setTentou(false);
        setArquivo(null);
        setRemoverAnexo(false);
        if (!editId) {
            const f = formVazio();
            setForm(f);
            setValorTexto('');
            setCredorLivre('');
            setGravado(null);
            setSnapshot(JSON.stringify(f));
            return;
        }
        let vivo = true;
        setCarregando(true);
        payableService.getAvulso(editId)
            .then(t => {
                if (!vivo) return;
                const f: FormPagamentoAvulso = {
                    ...formVazio(),
                    supplierId: t.supplier_id,
                    credorNome: t.party_name ?? '',
                    descricao: t.description ?? '',
                    valorTotal: Number(t.amount) || 0,
                    projeto: t.project_id ? { id: t.project_id, name: '' } : null,
                    costCenterId: t.cost_center_id,
                    planoDeContasId: t.plano_de_contas_id,
                    categoryId: t.category_id,
                    categoryName: t.category,
                    formaPagamento: t.payment_type,
                    paymentAccountId: t.payment_account_id,
                    competencia: (t.competencia_date ?? '').slice(0, 7),
                    primeiroVencimento: t.due_date ?? '',
                };
                setGravado(t);
                setForm(f);
                setValorTexto(String(Number(t.amount) || ''));
                setCredorLivre(t.supplier_id ? '' : (t.party_name ?? ''));
                setSnapshot(JSON.stringify(f));
            })
            .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Não foi possível abrir o título.'); })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [open, editId]);

    const set = <K extends keyof FormPagamentoAvulso>(k: K, v: FormPagamentoAvulso[K]) =>
        setForm(f => ({ ...f, [k]: v }));

    // Nome do credor: o do fornecedor escolhido; senão, o digitado.
    const fornecedor = fornecedores.find(s => s.id === form.supplierId);
    const credorNome = fornecedor ? fornecedor.name : credorLivre;
    const projetoEscolhido = form.projeto
        ? (projetos.find(p => p.id === form.projeto!.id) ?? form.projeto)
        : null;
    const formFinal: FormPagamentoAvulso = { ...form, credorNome, projeto: projetoEscolhido };

    const erros = validarPagamentoAvulso(isEdit ? { ...formFinal, parcelas: 1, jaPago: false } : formFinal, hoje);
    const mostrar = (k: keyof FormPagamentoAvulso) => (tentou ? erros[k] ?? null : null);
    const previa = useMemo(() => (isEdit ? [] : previaParcelas(formFinal)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [isEdit, form.valorTotal, form.parcelas, form.periodicidade, form.primeiroVencimento]);

    const dirty = JSON.stringify(form) !== snapshot || !!arquivo || removerAnexo || credorLivre !== (gravado && !gravado.supplier_id ? (gravado.party_name ?? '') : '');

    async function fechar() {
        if (dirty && !salvando) {
            const ok = await confirm({
                title: 'Sair sem salvar?',
                message: 'O que foi preenchido neste pagamento avulso será perdido.',
                variant: 'warning',
                // Mesmos rótulos do Esc/backdrop do Sheet — dois diálogos iguais com botões diferentes confundem.
                confirmLabel: 'Sair e descartar',
                cancelLabel: 'Continuar editando',
            });
            if (!ok) return;
        }
        onClose();
    }

    function escolherArquivo(f: File | null) {
        setErro(null);
        if (!f) return;
        if (!ANEXO_TIPOS.includes(f.type)) { setErro('O anexo precisa ser PDF ou imagem (PNG, JPG, WEBP).'); return; }
        if (f.size > ANEXO_MAX_BYTES) { setErro('O anexo passa de 20 MB. Reduza o arquivo e tente de novo.'); return; }
        setArquivo(f);
        setRemoverAnexo(false);
    }

    async function salvar() {
        setTentou(true);
        if (Object.keys(erros).length > 0) {
            setErro('Corrija os campos marcados.');
            return;
        }
        setSalvando(true);
        setErro(null);
        try {
            if (isEdit && gravado) {
                await payableService.updateAvulso(gravado, formFinal, { novo: arquivo, remover: removerAnexo });
                onSaved({ ids: [gravado.id], mensagem: 'Pagamento avulso atualizado.', aviso: null });
            } else {
                const r = await payableService.createAvulso(organizationId, formFinal, arquivo);
                const n = r.ids.length;
                const mensagem = n > 1
                    ? `${n} parcelas lançadas em Contas a Pagar.`
                    : form.jaPago && !r.avisoBaixa
                        ? 'Pagamento avulso lançado e baixado.'
                        : 'Pagamento avulso lançado em Contas a Pagar.';
                onSaved({ ids: r.ids, mensagem, aviso: r.avisoBaixa });
            }
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível gravar o pagamento.');
        } finally {
            setSalvando(false);
        }
    }

    const temAnexoGravado = !!gravado?.documento_path && !removerAnexo && !arquivo;
    const multiParcela = !isEdit && Math.floor(Number(form.parcelas) || 1) > 1;

    return (
        <Sheet open={open} onClose={onClose} size="xl" dirty={dirty && !salvando}>
            <SheetHeader onClose={fechar}>
                <SheetTitle>{isEdit ? 'Editar pagamento avulso' : 'Novo pagamento avulso'}</SheetTitle>
                <SheetDescription>
                    {isEdit
                        ? 'Título a pagar gerado manualmente. Baixa e estorno continuam na linha da tabela.'
                        : 'Título a pagar gerado manualmente, fora de pedido, contrato ou boleto.'}
                </SheetDescription>
            </SheetHeader>

            <SheetPanel className="px-6 py-5 space-y-8">
                {carregando ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500 text-sm">Carregando...</p>
                    </div>
                ) : (
                <>
                {gravado?.status === 'CONCILIATED' && (
                    <div className="flex gap-2 p-3 rounded-[6px] bg-amber-50 border border-amber-100 text-amber-800 text-sm">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>Este título já está pago. Alterar o valor aqui não mexe no pagamento registrado — para corrigir o valor pago, estorne a baixa antes.</span>
                    </div>
                )}

                {/* Quem recebe e o quê */}
                <div className="space-y-4">
                    <SecaoTitulo icon={User} titulo="Credor e descrição" />
                    <Campo label="Fornecedor" dica={form.supplierId ? null : 'Sem cadastro? Deixe em branco e escreva o nome abaixo.'}>
                        <SupplierSelect
                            suppliers={fornecedores}
                            value={form.supplierId ?? ''}
                            onChange={id => set('supplierId', id || null)}
                            placeholder="Selecionar fornecedor"
                            size="sm"
                            title="Selecionar credor"
                        />
                    </Campo>
                    {!form.supplierId && (
                        <Campo label="Credor sem cadastro">
                            <input
                                type="text"
                                value={credorLivre}
                                onChange={e => setCredorLivre(e.target.value)}
                                placeholder="Ex.: Cartório do 1º Ofício"
                                className={CAMPO}
                            />
                        </Campo>
                    )}
                    <Campo label="Descrição *" erro={mostrar('descricao')}>
                        <input
                            type="text"
                            value={form.descricao}
                            onChange={e => set('descricao', e.target.value)}
                            placeholder="Ex.: Registro de escritura"
                            className={`${CAMPO} ${mostrar('descricao') ? CAMPO_ERRO : ''}`}
                        />
                    </Campo>
                </div>

                {/* Valor e vencimento(s) */}
                <div className="space-y-4">
                    <SecaoTitulo icon={CalendarClock} titulo={isEdit ? 'Valor e vencimento' : 'Valor e parcelas'} />
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <Campo label={isEdit ? 'Valor (R$) *' : 'Valor total (R$) *'} erro={mostrar('valorTotal')}>
                            <MoneyCentsInput
                                value={valorTexto}
                                onChange={v => { setValorTexto(v); set('valorTotal', v === '' ? 0 : Number(v)); }}
                                className={`${CAMPO} ${mostrar('valorTotal') ? CAMPO_ERRO : ''}`}
                            />
                        </Campo>
                        <Campo label={multiParcela ? '1º vencimento *' : 'Vencimento *'} erro={mostrar('primeiroVencimento')}>
                            <input
                                type="date"
                                value={form.primeiroVencimento}
                                max="9999-12-31"
                                onChange={e => set('primeiroVencimento', e.target.value)}
                                className={`${CAMPO} ${mostrar('primeiroVencimento') ? CAMPO_ERRO : ''}`}
                            />
                        </Campo>
                        {!isEdit && (
                            <>
                                <Campo label="Nº de parcelas" erro={mostrar('parcelas')}>
                                    <input
                                        type="number"
                                        min={1}
                                        max={MAX_PARCELAS_AVULSO}
                                        step={1}
                                        value={form.parcelas}
                                        onChange={e => {
                                            const n = Math.floor(Number(e.target.value) || 0);
                                            setForm(f => ({ ...f, parcelas: n, jaPago: n > 1 ? false : f.jaPago }));
                                        }}
                                        className={`${CAMPO} ${mostrar('parcelas') ? CAMPO_ERRO : ''}`}
                                    />
                                </Campo>
                                <Campo label="Periodicidade" dica={multiParcela ? null : 'Vale quando há mais de uma parcela.'}>
                                    <select
                                        value={form.periodicidade}
                                        disabled={!multiParcela}
                                        title={multiParcela ? undefined : 'Com uma parcela só não há periodicidade.'}
                                        onChange={e => set('periodicidade', e.target.value as PeriodicidadeContrato)}
                                        className={CAMPO}
                                    >
                                        {PERIODICIDADES_CONTRATO.map(p => <option key={p.value} value={p.value}>{p.value}</option>)}
                                    </select>
                                </Campo>
                            </>
                        )}
                        <Campo label="Competência" erro={mostrar('competencia')} dica={form.competencia ? null : 'Em branco = mês do vencimento.'}>
                            <input
                                type="month"
                                value={form.competencia}
                                onChange={e => set('competencia', e.target.value)}
                                className={`${CAMPO} ${mostrar('competencia') ? CAMPO_ERRO : ''}`}
                            />
                        </Campo>
                    </div>

                    {multiParcela && previa.length > 1 && (
                        <div className="overflow-x-auto rounded-[10px] border border-gray-100">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                                        <th className="px-3 py-2 border-r border-gray-100">Parcela</th>
                                        <th className="px-3 py-2 border-r border-gray-100">Vencimento</th>
                                        <th className="px-3 py-2 text-right">Valor</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {previa.map((p, i) => (
                                        <tr key={i}>
                                            <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">{i + 1}/{previa.length}</td>
                                            <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">{formatDateBR(p.vencimento)}</td>
                                            <td className="px-3 py-2.5 text-right text-sm font-medium text-gray-800">{formatMoney(p.valor)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t border-gray-200">
                                        <td colSpan={2} className="px-3 py-2 text-sm text-gray-500">Total</td>
                                        <td className="px-3 py-2 text-right text-sm font-medium text-gray-800">
                                            {formatMoney(previa.reduce((s, p) => s + p.valor, 0))}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>

                {/* Classificação */}
                <div className="space-y-4">
                    <SecaoTitulo icon={Tag} titulo="Classificação" />
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <Campo label="Obra">
                            <select
                                value={form.projeto?.id ?? ''}
                                onChange={e => set('projeto', e.target.value ? { id: e.target.value, name: '' } : null)}
                                className={CAMPO}
                            >
                                <option value="">— Sem obra —</option>
                                {/* Obra gravada que não está mais na lista (outra org, arquivada) continua visível. */}
                                {form.projeto && !projetos.some(p => p.id === form.projeto!.id) && (
                                    <option value={form.projeto.id}>— obra fora da lista —</option>
                                )}
                                {projetos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </Campo>
                        <Campo label="Centro de custo">
                            <CostCenterSelect
                                costCenters={centros}
                                value={form.costCenterId ?? ''}
                                onChange={v => set('costCenterId', v || null)}
                                hoverCls="hover:bg-blue-50"
                                size="sm"
                            />
                        </Campo>
                        <Campo label="Plano de contas">
                            <PlanoContasSelect
                                planoContas={planos}
                                value={form.planoDeContasId ?? ''}
                                onChange={v => set('planoDeContasId', v || null)}
                                placeholder="—"
                                hoverCls="hover:bg-blue-50"
                                size="sm"
                            />
                        </Campo>
                        <Campo label="Conta financeira">
                            {/* financial_categories — a dimensão que a DRE lê; mesmo drawer do boleto. */}
                            <HierarchicalSelect
                                items={contasFinanceiras.map(c => ({ id: c.id, name: c.name, parentId: c.parent_id ?? null }))}
                                value={form.categoryId ?? ''}
                                onChange={v => {
                                    const c = contasFinanceiras.find(x => x.id === v);
                                    setForm(f => ({ ...f, categoryId: v || null, categoryName: c?.name ?? null }));
                                }}
                                valueField="id"
                                placeholder="—"
                                hoverCls="hover:bg-blue-50"
                                size="sm"
                                panelVariant="drawer"
                                drawerTitle="Selecionar Conta Financeira"
                            />
                        </Campo>
                    </div>
                </div>

                {/* Pagamento */}
                <div className="space-y-4">
                    <SecaoTitulo icon={Landmark} titulo="Pagamento" />
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <Campo label="Forma de pagamento">
                            <select
                                value={form.formaPagamento ?? ''}
                                onChange={e => set('formaPagamento', (e.target.value || null) as FormaPagamentoAvulso | null)}
                                className={CAMPO}
                            >
                                <option value="">—</option>
                                {FORMAS_PAGAMENTO.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                            </select>
                        </Campo>
                        <Campo
                            label={form.jaPago ? 'Conta de pagamento *' : 'Conta de pagamento'}
                            erro={mostrar('paymentAccountId')}
                            dica={contasPagamento.length === 0 ? 'Nenhuma conta desta organização cadastrada em Minha Organização › Contas.' : null}
                        >
                            <select
                                value={form.paymentAccountId ?? ''}
                                onChange={e => set('paymentAccountId', e.target.value || null)}
                                className={`${CAMPO} ${mostrar('paymentAccountId') ? CAMPO_ERRO : ''}`}
                            >
                                <option value="">—</option>
                                {form.paymentAccountId && !contasPagamento.some(a => a.id === form.paymentAccountId) && (
                                    <option value={form.paymentAccountId}>— conta fora da lista —</option>
                                )}
                                {contasPagamento.map(a => (
                                    <option key={a.id} value={a.id}>{a.name}{a.bank ? ` · ${a.bank}` : ''}</option>
                                ))}
                            </select>
                        </Campo>
                    </div>

                    {!isEdit && (
                        <div className="space-y-4">
                            <label
                                className={`flex items-start gap-3 ${multiParcela ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                                title={multiParcela ? 'Pagamento já feito vale para uma parcela só.' : undefined}
                            >
                                <input
                                    type="checkbox"
                                    checked={form.jaPago}
                                    disabled={multiParcela}
                                    onChange={e => set('jaPago', e.target.checked)}
                                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40"
                                />
                                <span className="min-w-0">
                                    <span className="block text-sm font-medium text-gray-800">Já pago</span>
                                    <span className="block text-xs text-gray-500 mt-0.5">
                                        {multiParcela
                                            ? 'Com mais de uma parcela, lance em aberto e dê baixa em cada uma na tabela.'
                                            : 'O pagamento já aconteceu: o título entra como Pago. Se cair na alçada de aprovação, fica aguardando aprovação antes da baixa.'}
                                    </span>
                                </span>
                            </label>
                            {form.jaPago && (
                                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                    <Campo label="Data do pagamento *" erro={mostrar('dataPagamento')}>
                                        <input
                                            type="date"
                                            value={form.dataPagamento}
                                            max={hoje}
                                            onChange={e => set('dataPagamento', e.target.value)}
                                            className={`${CAMPO} ${mostrar('dataPagamento') ? CAMPO_ERRO : ''}`}
                                        />
                                    </Campo>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Anexo */}
                <div className="space-y-4">
                    <SecaoTitulo icon={Paperclip} titulo="Documento" />
                    <input
                        ref={fileRef}
                        type="file"
                        accept={ANEXO_TIPOS.join(',')}
                        className="hidden"
                        onChange={e => { escolherArquivo(e.target.files?.[0] ?? null); e.target.value = ''; }}
                    />
                    {arquivo ? (
                        <div className="flex items-center gap-3 p-3 rounded-[6px] border border-gray-100 bg-gray-50">
                            <FileText className="w-4 h-4 text-gray-500 shrink-0" />
                            <span className="flex-1 min-w-0 truncate text-sm text-gray-900" title={arquivo.name}>{arquivo.name}</span>
                            <button type="button" onClick={() => setArquivo(null)} className="text-sm font-medium text-gray-600 hover:text-gray-900">Remover</button>
                        </div>
                    ) : temAnexoGravado ? (
                        <div className="flex items-center gap-3 p-3 rounded-[6px] border border-gray-100 bg-gray-50">
                            <FileText className="w-4 h-4 text-gray-500 shrink-0" />
                            <span className="flex-1 min-w-0 truncate text-sm text-gray-900" title={gravado!.documento_nome ?? ''}>{gravado!.documento_nome || 'Documento'}</span>
                            <button
                                type="button"
                                onClick={async () => {
                                    try { window.open(await payableService.urlDoAnexo(gravado!.documento_path!), '_blank', 'noopener'); }
                                    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível abrir o documento.'); }
                                }}
                                className="text-sm font-medium text-blue-600 hover:text-blue-800"
                            >
                                Ver
                            </button>
                            <button type="button" onClick={() => fileRef.current?.click()} className="text-sm font-medium text-gray-600 hover:text-gray-900">Trocar</button>
                            <button type="button" onClick={() => setRemoverAnexo(true)} className="text-red-500 hover:text-red-700" title="Remover documento">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            className="w-full flex items-center justify-center gap-2 h-16 rounded-[6px] border border-dashed border-gray-300 text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/40 transition-colors"
                        >
                            <Upload className="w-4 h-4" />
                            Anexar nota, recibo ou comprovante (PDF ou imagem, até 20 MB)
                        </button>
                    )}
                    {removerAnexo && (
                        <p className="text-xs text-gray-500">O documento será removido ao salvar. <button type="button" onClick={() => setRemoverAnexo(false)} className="text-blue-600 hover:text-blue-800 font-medium">Desfazer</button></p>
                    )}
                    {multiParcela && (arquivo || temAnexoGravado) && (
                        <p className="text-xs text-gray-500">O mesmo documento fica ligado a todas as parcelas.</p>
                    )}
                </div>
                </>
                )}
            </SheetPanel>

            <SheetFooter>
                <div className="flex items-center justify-end gap-3 w-full">
                    {erro && (
                        <p className="mr-auto flex items-center gap-1.5 text-sm text-red-600">
                            <AlertCircle className="w-4 h-4 shrink-0" /> {erro}
                        </p>
                    )}
                    {!erro && !isEdit && form.valorTotal > 0 && (
                        <p className="mr-auto text-sm text-gray-500">
                            {multiParcela
                                ? `${previa.length} parcelas · ${formatMoney(form.valorTotal)}`
                                : formatMoney(form.valorTotal)}
                        </p>
                    )}
                    <button
                        type="button"
                        onClick={fechar}
                        className="h-9 px-3.5 text-[13px] font-medium text-gray-600 hover:bg-gray-100 rounded-[6px] transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={salvar}
                        disabled={salvando || carregando}
                        title={salvando ? 'Gravando…' : carregando ? 'Carregando o título…' : undefined}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {salvando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <CheckCircle2 className="w-[15px] h-[15px]" />}
                        {isEdit ? 'Salvar alterações' : form.jaPago ? 'Lançar pagamento pago' : multiParcela ? 'Lançar parcelas' : 'Lançar pagamento'}
                    </button>
                </div>
            </SheetFooter>
        </Sheet>
    );
};

export default PagamentoAvulsoSheet;
