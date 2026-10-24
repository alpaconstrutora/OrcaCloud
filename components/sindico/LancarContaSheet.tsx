import React from 'react';
import { AlertCircle, CalendarClock, CheckCircle2, FileText, Landmark, Loader2, Paperclip, Plus, Tag, Upload, User } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import MoneyCentsInput from '../ui/MoneyCentsInput';
import SupplierSelect from '../SupplierSelect';
import CostCenterSelect from '../CostCenterSelect';
import PlanoContasSelect from '../PlanoContasSelect';
import HierarchicalSelect from '../HierarchicalSelect';
import { GhostButton, PrimaryButton, TextLinkButton, fmtBRLCents, fmtDate } from '../portal/PortalKit';
import FornecedorDoSindicoSheet from './FornecedorDoSindicoSheet';
import {
    sindicoPortalService, type CondominioDoFinanceiro, type IdentidadeDoSindico, type LinhaDoSindico,
} from '../../services/sindicoPortalService';
import {
    MAX_PARCELAS_AVULSO, PERIODICIDADES_CONTRATO, montarTitulosAvulsos, previaParcelas, validarPagamentoAvulso,
    type FormPagamentoAvulso, type FormaPagamentoAvulso, type PeriodicidadeContrato,
} from '../../utils/pagamentoAvulso';
import { FORMAS_PAGAMENTO } from '../../utils/baixaRecebivel';
import { hojeEmBrasilia } from '../../utils/mandatoSindico';
import type { TituloDoCondominio } from '../../utils/financeiroDoSindico';

/**
 * Portal do Síndico › Financeiro › Contas a pagar — lançar (e editar) uma conta
 * a pagar do condomínio. Plano: docs/planos/2026-10-24-portal-sindico-financeiro.md
 *
 * É o "pagamento avulso" de Contas a Pagar (`components/financeiro/PagamentoAvulsoSheet.tsx`)
 * do lado do síndico: a MESMA regra pura (`utils/pagamentoAvulso.ts` — validação,
 * parcelas, competência), com os cadastros vindos da RPC do portal em vez das
 * tabelas (o síndico não é membro da org; leitura direta devolveria [] calado).
 * O banco revalida tudo e FORÇA org, origem MANUAL, alçada APROVADO e autoria.
 *
 * Painel lateral (UI_PATTERNS): criar registro simples. Centro de custo só os do
 * condomínio; Conta Financeira obrigatória (é a dimensão da DRE e a org do
 * condomínio ainda não tem plano de contas próprio); Plano de contas só aparece
 * quando a org tem algum.
 */

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-10 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E1553C]/20 focus:border-[#E1553C] disabled:bg-gray-50 disabled:cursor-not-allowed';
const CAMPO_ERRO = 'border-red-300 bg-red-50/40';
const ANEXO_MAX_BYTES = 20 * 1024 * 1024;
const ANEXO_TIPOS = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

const Secao: React.FC<{ icon: React.ComponentType<{ className?: string }>; titulo: string }> = ({ icon: Icon, titulo }) => (
    <div className="flex items-center gap-2 text-[13px] font-semibold text-[#1F2430]">
        <Icon className="w-4 h-4 text-[#E1553C]" /> {titulo}
    </div>
);

const Campo: React.FC<React.PropsWithChildren<{ label: string; erro?: string | null; dica?: React.ReactNode; className?: string }>> = ({ label, erro, dica, className = '', children }) => (
    <div className={`space-y-1.5 ${className}`}>
        <label className={ROTULO}>{label}</label>
        {children}
        {erro
            ? <p className="text-xs text-red-600 leading-snug">{erro}</p>
            : dica ? <p className="text-xs text-gray-500 leading-snug">{dica}</p> : null}
    </div>
);

function formVazio(condominio: CondominioDoFinanceiro | null, hoje: string): FormPagamentoAvulso {
    // O centro "raiz" do condomínio (o primeiro por código) já vem escolhido:
    // quase toda despesa é dele, e o banco recusa centro de outro prédio.
    const raiz = condominio?.centros.find(c => !c.parentId) ?? condominio?.centros[0];
    return {
        supplierId: null, credorNome: '', descricao: '', valorTotal: 0, projeto: null,
        costCenterId: raiz?.id ?? null, planoDeContasId: null, categoryId: null, categoryName: null,
        formaPagamento: null, paymentAccountId: null, competencia: '', parcelas: 1, periodicidade: 'Mensal',
        primeiroVencimento: hoje, jaPago: false, dataPagamento: hoje,
    };
}

function formDoTitulo(t: TituloDoCondominio, hoje: string): FormPagamentoAvulso {
    return {
        supplierId: t.supplierId, credorNome: t.credor ?? '', descricao: t.descricao ?? '', valorTotal: Number(t.valor) || 0,
        projeto: null, costCenterId: t.centroId, planoDeContasId: t.planoId, categoryId: t.categoriaId, categoryName: t.categoria,
        formaPagamento: (t.formaPagamento as FormaPagamentoAvulso | null) ?? null, paymentAccountId: t.contaId,
        competencia: (t.competencia ?? '').slice(0, 7), parcelas: 1, periodicidade: 'Mensal',
        primeiroVencimento: (t.vencimento ?? '').slice(0, 10), jaPago: false, dataPagamento: hoje,
    };
}

/** A linha que vai para a RPC — só os campos que o síndico informa. */
export function linhaDoSindico(l: ReturnType<typeof montarTitulosAvulsos>[number]): LinhaDoSindico {
    return {
        description: l.description, amount: l.amount, due_date: l.due_date, competencia_date: l.competencia_date,
        supplier_id: l.supplier_id, party_name: l.party_name, cost_center_id: l.cost_center_id,
        plano_de_contas_id: l.plano_de_contas_id, category_id: l.category_id, payment_type: l.payment_type,
        payment_account_id: l.payment_account_id, installment_type: l.installment_type,
    };
}

interface Props {
    open: boolean;
    identidade: IdentidadeDoSindico;
    /** Condomínios em que o síndico PODE lançar (com organização própria). */
    condominios: CondominioDoFinanceiro[];
    /** Presente = edição de um título MANUAL em aberto. */
    titulo?: TituloDoCondominio | null;
    onClose: () => void;
    onSalvo: (mensagem: string) => void;
}

const LancarContaSheet: React.FC<Props> = ({ open, identidade, condominios, titulo, onClose, onSalvo }) => {
    const confirm = useConfirm();
    const hoje = hojeEmBrasilia();
    const isEdit = !!titulo;

    const [condominioId, setCondominioId] = React.useState<string>('');
    const condominio = condominios.find(c => c.id === condominioId) ?? null;
    const [form, setForm] = React.useState<FormPagamentoAvulso>(() => formVazio(null, hoje));
    const [snapshot, setSnapshot] = React.useState('');
    const [valorTexto, setValorTexto] = React.useState('');
    const [credorLivre, setCredorLivre] = React.useState('');
    const [arquivo, setArquivo] = React.useState<File | null>(null);
    const [removerAnexo, setRemoverAnexo] = React.useState(false);
    const [tentou, setTentou] = React.useState(false);
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    const [cadastrandoFornecedor, setCadastrandoFornecedor] = React.useState(false);
    const [avisoFornecedor, setAvisoFornecedor] = React.useState<string | null>(null);
    /** Fornecedor cadastrado agora — ainda não está na lista que veio da RPC. */
    const [fornecedoresNovos, setFornecedoresNovos] = React.useState<CondominioDoFinanceiro['fornecedores']>([]);
    const fileRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        if (!open) return;
        const condId = titulo?.condominioId ?? condominios[0]?.id ?? '';
        const cond = condominios.find(c => c.id === condId) ?? null;
        const f = titulo ? formDoTitulo(titulo, hoje) : formVazio(cond, hoje);
        setCondominioId(condId);
        setForm(f);
        setSnapshot(JSON.stringify(f));
        setValorTexto(f.valorTotal ? String(f.valorTotal) : '');
        setCredorLivre(titulo && !titulo.supplierId ? (titulo.credor ?? '') : '');
        setArquivo(null);
        setRemoverAnexo(false);
        setTentou(false);
        setErro(null);
        setFornecedoresNovos([]);
        setAvisoFornecedor(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, titulo?.id]);

    const set = <K extends keyof FormPagamentoAvulso>(k: K, v: FormPagamentoAvulso[K]) => setForm(f => ({ ...f, [k]: v }));

    const fornecedores = React.useMemo(
        () => [...(condominio?.fornecedores ?? []), ...fornecedoresNovos.filter(n => !condominio?.fornecedores.some(f => f.id === n.id))],
        [condominio, fornecedoresNovos]);
    const fornecedor = fornecedores.find(s => s.id === form.supplierId);
    const formFinal: FormPagamentoAvulso = { ...form, credorNome: fornecedor ? fornecedor.name : credorLivre };

    const erros = {
        ...validarPagamentoAvulso(isEdit ? { ...formFinal, parcelas: 1, jaPago: false } : formFinal, hoje),
        ...(form.costCenterId ? {} : { costCenterId: 'Escolha o centro de custo.' }),
        ...(form.categoryId ? {} : { categoryId: 'Escolha a conta financeira.' }),
    } as Partial<Record<keyof FormPagamentoAvulso, string>>;
    const mostrar = (k: keyof FormPagamentoAvulso) => (tentou ? erros[k] ?? null : null);
    const previa = React.useMemo(() => (isEdit ? [] : previaParcelas(formFinal)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [isEdit, form.valorTotal, form.parcelas, form.periodicidade, form.primeiroVencimento]);
    const multiParcela = !isEdit && Math.floor(Number(form.parcelas) || 1) > 1;
    const dirty = JSON.stringify(form) !== snapshot || !!arquivo || removerAnexo || credorLivre !== (titulo && !titulo.supplierId ? (titulo.credor ?? '') : '');

    const fechar = async () => {
        if (dirty && !salvando) {
            const ok = await confirm({
                title: 'Sair sem salvar?',
                message: 'O que foi preenchido nesta conta será perdido.',
                variant: 'warning',
                confirmLabel: 'Sair e descartar',
                cancelLabel: 'Continuar editando',
            });
            if (!ok) return;
        }
        onClose();
    };

    const escolherArquivo = (f: File | null) => {
        setErro(null);
        if (!f) return;
        if (!ANEXO_TIPOS.includes(f.type)) { setErro('O anexo precisa ser PDF ou imagem (PNG, JPG, WEBP).'); return; }
        if (f.size > ANEXO_MAX_BYTES) { setErro('O anexo passa de 20 MB. Reduza o arquivo e tente de novo.'); return; }
        setArquivo(f);
        setRemoverAnexo(false);
    };

    const salvar = async () => {
        setTentou(true);
        if (Object.keys(erros).length > 0 || !condominio) { setErro('Corrija os campos marcados.'); return; }
        setSalvando(true);
        setErro(null);
        let anexo: { path: string; nome: string } | null = null;
        try {
            if (arquivo) anexo = await sindicoPortalService.enviarAnexo(identidade, condominio.id, arquivo);
            const linhas = montarTitulosAvulsos(isEdit ? { ...formFinal, parcelas: 1, jaPago: false } : formFinal, 'portal').map(linhaDoSindico);
            if (isEdit && titulo) {
                await sindicoPortalService.editarTitulo(identidade, titulo.id, linhas[0], { novo: anexo, remover: removerAnexo });
                onSalvo('Conta atualizada.');
            } else {
                const ids = await sindicoPortalService.lancarPagar(identidade, condominio.id, linhas, {
                    documento: anexo, jaPago: form.jaPago, dataPagamento: form.jaPago ? form.dataPagamento : null,
                });
                onSalvo(ids.length > 1 ? `${ids.length} parcelas lançadas.` : form.jaPago ? 'Conta lançada e paga.' : 'Conta lançada.');
            }
        } catch (e) {
            // O anexo subiu mas o título não nasceu: não deixa arquivo órfão.
            if (anexo) await sindicoPortalService.descartarAnexo(identidade, condominio.id, anexo.path);
            setErro(e instanceof Error ? e.message : 'Não foi possível gravar a conta.');
        } finally {
            setSalvando(false);
        }
    };

    const centros = (condominio?.centros ?? []).map(c => ({ id: c.id, code: c.code, name: c.name, parent_id: c.parentId }));
    const motivoSalvar = salvando ? 'Gravando…' : !condominio ? 'Nenhum condomínio disponível para lançar.' : null;

    return (
        <>
            <Sheet open={open} onClose={onClose} size="xl" dirty={dirty && !salvando}>
                <SheetHeader onClose={fechar}>
                    <SheetTitle>{isEdit ? 'Editar conta a pagar' : 'Lançar conta a pagar'}</SheetTitle>
                    <SheetDescription>
                        {isEdit
                            ? 'Conta lançada à mão, ainda em aberto. A baixa continua na linha da tabela.'
                            : 'Despesa do condomínio fora de contrato ou boleto já cadastrado.'}
                    </SheetDescription>
                </SheetHeader>

                <SheetPanel className="p-4 md:p-6">
                    <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-8">
                        {condominios.length > 1 && !isEdit && (
                            <Campo label="Condomínio">
                                <select className={CAMPO} value={condominioId}
                                    onChange={e => {
                                        const c = condominios.find(x => x.id === e.target.value) ?? null;
                                        setCondominioId(e.target.value);
                                        setForm(f => ({ ...f, ...formVazio(c, hoje), descricao: f.descricao, valorTotal: f.valorTotal }));
                                    }}>
                                    {condominios.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                                </select>
                            </Campo>
                        )}

                        <div className="space-y-4">
                            <Secao icon={User} titulo="Credor e descrição" />
                            <Campo label="Fornecedor" dica={form.supplierId ? null : 'Sem cadastro? Cadastre ou escreva o nome abaixo.'}>
                                <SupplierSelect
                                    suppliers={fornecedores}
                                    value={form.supplierId ?? ''}
                                    onChange={id => set('supplierId', id || null)}
                                    placeholder="Selecionar fornecedor"
                                    size="sm"
                                    title="Selecionar fornecedor"
                                />
                                <TextLinkButton onClick={() => setCadastrandoFornecedor(true)} className="mt-1">
                                    <Plus className="w-3.5 h-3.5" /> Cadastrar fornecedor
                                </TextLinkButton>
                                {avisoFornecedor && <p className="text-xs text-[#2F5F98]">{avisoFornecedor}</p>}
                            </Campo>
                            {!form.supplierId && (
                                <Campo label="Credor sem cadastro">
                                    <input type="text" value={credorLivre} onChange={e => setCredorLivre(e.target.value)}
                                        placeholder="Ex.: Companhia de saneamento" className={CAMPO} />
                                </Campo>
                            )}
                            <Campo label="Descrição *" erro={mostrar('descricao')}>
                                <input type="text" value={form.descricao} onChange={e => set('descricao', e.target.value)}
                                    placeholder="Ex.: Limpeza da caixa d'água"
                                    className={`${CAMPO} ${mostrar('descricao') ? CAMPO_ERRO : ''}`} />
                            </Campo>
                        </div>

                        <div className="space-y-4">
                            <Secao icon={CalendarClock} titulo={isEdit ? 'Valor e vencimento' : 'Valor e parcelas'} />
                            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                <Campo label={isEdit ? 'Valor (R$) *' : 'Valor total (R$) *'} erro={mostrar('valorTotal')}>
                                    <MoneyCentsInput value={valorTexto}
                                        onChange={v => { setValorTexto(v); set('valorTotal', v === '' ? 0 : Number(v)); }}
                                        className={`${CAMPO} ${mostrar('valorTotal') ? CAMPO_ERRO : ''}`} />
                                </Campo>
                                <Campo label={multiParcela ? '1º vencimento *' : 'Vencimento *'} erro={mostrar('primeiroVencimento')}>
                                    <input type="date" value={form.primeiroVencimento} max="9999-12-31"
                                        onChange={e => set('primeiroVencimento', e.target.value)}
                                        className={`${CAMPO} ${mostrar('primeiroVencimento') ? CAMPO_ERRO : ''}`} />
                                </Campo>
                                {!isEdit && (
                                    <>
                                        <Campo label="Nº de parcelas" erro={mostrar('parcelas')}>
                                            <input type="number" min={1} max={MAX_PARCELAS_AVULSO} step={1} value={form.parcelas}
                                                onChange={e => {
                                                    const n = Math.floor(Number(e.target.value) || 0);
                                                    setForm(f => ({ ...f, parcelas: n, jaPago: n > 1 ? false : f.jaPago }));
                                                }}
                                                className={`${CAMPO} ${mostrar('parcelas') ? CAMPO_ERRO : ''}`} />
                                        </Campo>
                                        <Campo label="Periodicidade" dica={multiParcela ? null : 'Vale quando há mais de uma parcela.'}>
                                            <select value={form.periodicidade} disabled={!multiParcela}
                                                title={multiParcela ? undefined : 'Com uma parcela só não há periodicidade.'}
                                                onChange={e => set('periodicidade', e.target.value as PeriodicidadeContrato)} className={CAMPO}>
                                                {PERIODICIDADES_CONTRATO.map(p => <option key={p.value} value={p.value}>{p.value}</option>)}
                                            </select>
                                        </Campo>
                                    </>
                                )}
                                <Campo label="Competência" erro={mostrar('competencia')} dica={form.competencia ? null : 'Em branco = mês do vencimento.'}>
                                    <input type="month" value={form.competencia} onChange={e => set('competencia', e.target.value)}
                                        className={`${CAMPO} ${mostrar('competencia') ? CAMPO_ERRO : ''}`} />
                                </Campo>
                            </div>
                            {multiParcela && previa.length > 1 && (
                                <ul className="rounded-[10px] border border-gray-100 divide-y divide-gray-100 text-sm">
                                    {previa.map((p, i) => (
                                        <li key={i} className="flex items-center justify-between px-3 py-2">
                                            <span className="text-gray-600">{i + 1}/{previa.length} · {fmtDate(p.vencimento)}</span>
                                            <span className="font-medium text-gray-800 tabular-nums">{fmtBRLCents(p.valor)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="space-y-4">
                            <Secao icon={Tag} titulo="Classificação" />
                            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                <Campo label="Centro de custo *" erro={mostrar('costCenterId')}>
                                    <CostCenterSelect costCenters={centros} value={form.costCenterId ?? ''}
                                        onChange={v => set('costCenterId', v || null)} hoverCls="hover:bg-[#FDEDE8]" size="sm" />
                                </Campo>
                                <Campo label="Conta financeira *" erro={mostrar('categoryId')}>
                                    <HierarchicalSelect
                                        // Conta a pagar não se classifica em conta de RECEITA (o print de
                                        // 24/10 abria a lista em "Receita de Serviços").
                                        items={(condominio?.categorias ?? []).filter(c => c.nature !== 'REVENUE' || c.id === form.categoryId)
                                            .map(c => ({ id: c.id, name: c.name, parentId: c.parentId ?? null }))}
                                        value={form.categoryId ?? ''}
                                        onChange={v => {
                                            const c = condominio?.categorias.find(x => x.id === v);
                                            setForm(f => ({ ...f, categoryId: v || null, categoryName: c?.name ?? null }));
                                        }}
                                        valueField="id" placeholder="—" hoverCls="hover:bg-[#FDEDE8]" size="sm"
                                        panelVariant="drawer" drawerTitle="Selecionar Conta Financeira"
                                    />
                                </Campo>
                                {(condominio?.planos.length ?? 0) > 0 && (
                                    <Campo label="Plano de contas">
                                        <PlanoContasSelect
                                            planoContas={(condominio?.planos ?? []).map(p => ({ id: p.id, code: p.code, name: p.name }))}
                                            value={form.planoDeContasId ?? ''} onChange={v => set('planoDeContasId', v || null)}
                                            placeholder="—" hoverCls="hover:bg-[#FDEDE8]" size="sm" />
                                    </Campo>
                                )}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <Secao icon={Landmark} titulo="Pagamento" />
                            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                <Campo label="Forma de pagamento">
                                    <select value={form.formaPagamento ?? ''} className={CAMPO}
                                        onChange={e => set('formaPagamento', (e.target.value || null) as FormaPagamentoAvulso | null)}>
                                        <option value="">—</option>
                                        {FORMAS_PAGAMENTO.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                    </select>
                                </Campo>
                                <Campo label={form.jaPago ? 'Conta de pagamento *' : 'Conta de pagamento'} erro={mostrar('paymentAccountId')}
                                    dica={(condominio?.contas.length ?? 0) === 0 ? 'O condomínio ainda não tem conta bancária cadastrada — fale com a administradora.' : null}>
                                    <select value={form.paymentAccountId ?? ''} disabled={(condominio?.contas.length ?? 0) === 0}
                                        title={(condominio?.contas.length ?? 0) === 0 ? 'Nenhuma conta bancária atende este condomínio.' : undefined}
                                        onChange={e => set('paymentAccountId', e.target.value || null)}
                                        className={`${CAMPO} ${mostrar('paymentAccountId') ? CAMPO_ERRO : ''}`}>
                                        <option value="">—</option>
                                        {(condominio?.contas ?? []).map(a => <option key={a.id} value={a.id}>{a.name}{a.bank ? ` · ${a.bank}` : ''}</option>)}
                                    </select>
                                </Campo>
                            </div>
                            {!isEdit && (
                                <div className="space-y-4">
                                    <label className={`flex items-start gap-3 ${multiParcela ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                                        title={multiParcela ? 'Pagamento já feito vale para uma parcela só.' : undefined}>
                                        <input type="checkbox" checked={form.jaPago} disabled={multiParcela}
                                            onChange={e => set('jaPago', e.target.checked)}
                                            className="mt-0.5 w-4 h-4 rounded border-gray-300 accent-[#E1553C] disabled:opacity-40" />
                                        <span className="min-w-0">
                                            <span className="block text-sm font-medium text-gray-800">Já pago</span>
                                            <span className="block text-xs text-gray-500 mt-0.5">
                                                {multiParcela
                                                    ? 'Com mais de uma parcela, lance em aberto e dê baixa em cada uma na tabela.'
                                                    : 'O pagamento já aconteceu: a conta entra como paga.'}
                                            </span>
                                        </span>
                                    </label>
                                    {form.jaPago && (
                                        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                            <Campo label="Data do pagamento *" erro={mostrar('dataPagamento')}>
                                                <input type="date" value={form.dataPagamento} max={hoje}
                                                    onChange={e => set('dataPagamento', e.target.value)}
                                                    className={`${CAMPO} ${mostrar('dataPagamento') ? CAMPO_ERRO : ''}`} />
                                            </Campo>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            <Secao icon={Paperclip} titulo="Documento" />
                            <input ref={fileRef} type="file" accept={ANEXO_TIPOS.join(',')} className="hidden"
                                onChange={e => { escolherArquivo(e.target.files?.[0] ?? null); e.target.value = ''; }} />
                            {arquivo ? (
                                <div className="flex items-center gap-3 p-3 rounded-[6px] border border-gray-100 bg-gray-50">
                                    <FileText className="w-4 h-4 text-gray-500 shrink-0" />
                                    <span className="flex-1 min-w-0 truncate text-sm text-gray-900" title={arquivo.name}>{arquivo.name}</span>
                                    <button type="button" onClick={() => setArquivo(null)} className="text-sm font-medium text-gray-600 hover:text-gray-900">Remover</button>
                                </div>
                            ) : (
                                <button type="button" onClick={() => fileRef.current?.click()}
                                    className="w-full flex items-center justify-center gap-2 h-16 rounded-[6px] border border-dashed border-gray-300 text-sm font-medium text-gray-600 hover:border-[#E1553C] hover:text-[#C24428] hover:bg-[#FDEDE8]/40 transition-colors">
                                    <Upload className="w-4 h-4" />
                                    {isEdit ? 'Trocar o documento (PDF ou imagem, até 20 MB)' : 'Anexar nota, boleto ou recibo (PDF ou imagem, até 20 MB)'}
                                </button>
                            )}
                            {isEdit && !arquivo && (
                                <label className="flex items-center gap-2 text-xs text-gray-600">
                                    <input type="checkbox" checked={removerAnexo} onChange={e => setRemoverAnexo(e.target.checked)} className="accent-[#E1553C]" />
                                    Remover o documento anexado, se houver
                                </label>
                            )}
                            {multiParcela && arquivo && <p className="text-xs text-gray-500">O mesmo documento fica ligado a todas as parcelas.</p>}
                        </div>
                    </div>
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
                                {multiParcela ? `${previa.length} parcelas · ${fmtBRLCents(form.valorTotal)}` : fmtBRLCents(form.valorTotal)}
                            </p>
                        )}
                        <GhostButton onClick={fechar}>Cancelar</GhostButton>
                        <PrimaryButton onClick={salvar} disabled={!!motivoSalvar} title={motivoSalvar ?? undefined}>
                            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            {isEdit ? 'Salvar alterações' : form.jaPago ? 'Lançar conta paga' : multiParcela ? 'Lançar parcelas' : 'Lançar conta'}
                        </PrimaryButton>
                    </div>
                </SheetFooter>
            </Sheet>

            {condominio && (
                <FornecedorDoSindicoSheet
                    open={cadastrandoFornecedor}
                    identidade={identidade}
                    condominioId={condominio.id}
                    onClose={() => setCadastrandoFornecedor(false)}
                    onSalvo={f => {
                        setFornecedoresNovos(prev => [...prev, { id: f.id, name: f.nome, nickname: null, document: f.document ?? null, category: null }]);
                        set('supplierId', f.id);
                        setAvisoFornecedor(f.existente
                            ? `Este documento já estava cadastrado como "${f.nome}": o cadastro passou a valer neste condomínio, sem duplicar.`
                            : `Fornecedor "${f.nome}" cadastrado.`);
                        setCadastrandoFornecedor(false);
                    }}
                />
            )}
        </>
    );
};

export default LancarContaSheet;
