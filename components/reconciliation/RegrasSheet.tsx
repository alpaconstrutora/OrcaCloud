import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Loader2, Plus, Search, ShieldCheck, X } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import ActionIconButton from '../ui/ActionIconButton';
import TableSwitch from '../ui/TableSwitch';
import { formatMoney, formatDateBR } from '../ui/Format';
import ClientSelect, { type ClientOption } from '../ClientSelect';
import SupplierSelect, { type SupplierOption } from '../SupplierSelect';
import { bankReconciliationService, type ReconciliationRuleRow, type RuleConditions } from '../../services/bankReconciliationService';
import {
    descreverCondicao, condicaoDoFormulario, formularioDaCondicao, type FormularioDeCondicao,
} from '../../utils/reconciliationRules';

/**
 * Regras de classificação, dentro da Central (antes: aba Regras).
 * Plano docs/planos/2026-09-30-conciliacao-regras-absorvidas-pela-central.md, item 3.
 *
 * Lista + formulário no MESMO painel (REGRA #4: painel lateral, não modal central).
 * Regra só classifica movimento que ninguém classificou — a trava vive no serviço
 * (`linhaAceitaRegra`), e o "Testar" já responde com ela.
 */

/** Regra que a Central manda abrir já preenchida (vinda de "Regras sugeridas"). */
export interface RegraPreenchida {
    name: string;
    contem: string;
    category: string;
    counterparty: string;
    direcao: FormularioDeCondicao['direcao'];
}

interface Props {
    open: boolean;
    onClose: () => void;
    /** Organização da CONTA (resolvida pela Central) — regra é sempre de uma organização. */
    organizationId: string | null;
    selectedAccountId: string | null;
    regras: ReconciliationRuleRow[];
    categories: string[];
    clienteRegistros: ClientOption[];
    credorRegistros: SupplierOption[];
    /** Quando vem preenchida, o painel abre direto no formulário de regra nova. */
    preenchida?: RegraPreenchida | null;
    onChanged: () => Promise<void> | void;
    /** Chamado ao FECHAR o painel se a lista "fora da conciliação" mudou: a Central
     *  recarrega para a Pendentes e os cartões refletirem a lista. */
    onCategoriasExcluidasMudaram?: () => Promise<void> | void;
}

interface Formulario {
    id: string | null;
    name: string;
    contem: string;
    direcao: FormularioDeCondicao['direcao'];
    category: string;
    counterparty: string;
    /** Condição que o formulário simples não sabe editar (E/OU, faixa de valor…):
     *  fica como está ao salvar. `null` = o formulário edita a condição. */
    avancada: RuleConditions | null;
    /** Ações que o formulário não edita (auto_confirm, obra, CC) — preservadas. */
    acoesOriginais: ReconciliationRuleRow['actions'];
}

const VAZIO: Formulario = {
    id: null, name: '', contem: '', direcao: '', category: '', counterparty: '', avancada: null, acoesOriginais: {},
};

const label = 'text-xs font-semibold text-slate-500';
const field = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-50';

const RegrasSheet: React.FC<Props> = ({
    open, onClose, organizationId, selectedAccountId, regras, categories,
    clienteRegistros, credorRegistros, preenchida, onChanged, onCategoriasExcluidasMudaram,
}) => {
    const confirm = useConfirm();
    const [form, setForm] = useState<Formulario | null>(null);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [teste, setTeste] = useState<{ classificaria: number; jaClassificados: number; exemplos: string[] } | null>(null);
    const [testando, setTestando] = useState(false);

    // ── Categorias fora da conciliação (pedido de 01/10/2026: "Movimentação") ──
    // `null` = ainda não leu (ou a leitura falhou): sem lista lida, não deixa gravar —
    // gravaria por cima do que está no banco.
    const [excluidas, setExcluidas] = useState<string[] | null>(null);
    const [gravandoExcluidas, setGravandoExcluidas] = useState(false);
    const excluidasMudaram = useRef(false);

    async function carregarExcluidas(org: string) {
        setExcluidas(null);
        try {
            setExcluidas(await bankReconciliationService.lerCategoriasExcluidas(org));
        } catch (e) {
            setErro('Não foi possível ler as categorias fora da conciliação: '
                + (e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)));
        }
    }

    useEffect(() => {
        if (open && organizationId) void carregarExcluidas(organizationId);
    }, [open, organizationId]);

    async function gravarExcluidas(org: string, lista: string[]) {
        setGravandoExcluidas(true);
        setErro(null);
        try {
            await bankReconciliationService.salvarCategoriasExcluidas(org, lista);
            setExcluidas(lista);
            excluidasMudaram.current = true;
        } catch (e) {
            setErro('Não foi possível salvar as categorias fora da conciliação: '
                + (e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)));
        } finally {
            setGravandoExcluidas(false);
        }
    }

    const fechar = () => {
        if (excluidasMudaram.current) {
            excluidasMudaram.current = false;
            void onCategoriasExcluidasMudaram?.();
        }
        onClose();
    };

    // Abriu: com sugestão, vai direto ao formulário preenchido; sem, mostra a lista.
    useEffect(() => {
        if (!open) return;
        setErro(null);
        setTeste(null);
        setForm(preenchida ? { ...VAZIO, ...preenchida } : null);
    }, [open, preenchida]);

    const editar = (r: ReconciliationRuleRow) => {
        const f = formularioDaCondicao(r.conditions);
        setErro(null);
        setTeste(null);
        setForm({
            id: r.id, name: r.name,
            contem: f?.contem ?? '', direcao: f?.direcao ?? '',
            category: r.actions?.category ?? '', counterparty: r.actions?.counterparty ?? '',
            avancada: f ? null : r.conditions,
            acoesOriginais: r.actions ?? {},
        });
    };

    const condicaoAtual = (f: Formulario): RuleConditions =>
        (f.avancada ?? condicaoDoFormulario({ contem: f.contem, direcao: f.direcao })) as RuleConditions;

    const falta = form && (
        !form.name.trim() ? 'Dê um nome à regra'
            : !form.avancada && !form.contem.trim() ? 'Escreva o texto que a regra procura na descrição'
                : !form.category && !form.counterparty ? 'Escolha a categoria ou o cliente/credor'
                    : null);

    async function testar() {
        if (!form || !selectedAccountId) return;
        if (!form.avancada && !form.contem.trim()) { setErro('Escreva o texto que a regra procura na descrição'); return; }
        setTestando(true);
        setErro(null);
        try {
            const r = await bankReconciliationService.simularRegraNaConta(selectedAccountId, condicaoAtual(form));
            setTeste({
                classificaria: r.classificaria,
                jaClassificados: r.jaClassificados,
                exemplos: r.exemplos.map(tx =>
                    `${formatDateBR(tx.transaction_date)} · ${tx.direction === 'CREDIT' ? '+' : '−'}${formatMoney(tx.amount)} · ${(tx.counterparty_name || tx.description_normalized || tx.description_raw || '').slice(0, 60)}`),
            });
        } catch (e) {
            setErro(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));
        } finally {
            setTestando(false);
        }
    }

    async function salvar() {
        if (!form || falta || !organizationId) return;
        setSalvando(true);
        setErro(null);
        try {
            await bankReconciliationService.salvarRegra(organizationId, {
                id: form.id,
                name: form.name.trim(),
                conditions: condicaoAtual(form),
                actions: {
                    ...form.acoesOriginais,
                    category: form.category || undefined,
                    counterparty: form.counterparty || undefined,
                },
            });
            await onChanged();
            setForm(null);
            setTeste(null);
        } catch (e) {
            setErro(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));
        } finally {
            setSalvando(false);
        }
    }

    // A organização vem por parâmetro: estes botões só existem dentro do bloco que já
    // exige `organizationId` (a da conta). Sem guard de "sem org, não faz nada" —
    // o padrão que a REGRA #5 proíbe (orgContextGuard.test.ts).
    async function alternarAtiva(org: string, r: ReconciliationRuleRow) {
        try {
            await bankReconciliationService.salvarRegra(org, {
                id: r.id, name: r.name, conditions: r.conditions, actions: r.actions, is_active: !r.is_active,
            });
            await onChanged();
        } catch (e) {
            setErro(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));
        }
    }

    async function excluir(org: string, r: ReconciliationRuleRow) {
        const ok = await confirm({
            title: `Excluir a regra "${r.name}"?`,
            message: 'Os movimentos que ela já classificou continuam como estão. A regra só deixa de rodar.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await bankReconciliationService.excluirRegra(org, r.id);
            await onChanged();
        } catch (e) {
            setErro(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));
        }
    }

    // O nome gravado é o que a regra escreve em `counterparty_name`; o drawer escolhe
    // pelo cadastro e devolve o nome (mesma mecânica do BankTxEdicaoEmLoteModal).
    const idDoCliente = clienteRegistros.find(c => c.name === form?.counterparty)?.id ?? '';
    const idDoCredor = credorRegistros.find(s => s.name === form?.counterparty)?.id ?? '';
    const ehCliente = form?.direcao === 'CREDIT' || (!!idDoCliente && !idDoCredor);

    return (
        <Sheet open={open} onClose={fechar} size="lg" dirty={!!form && !salvando}>
            <SheetHeader onClose={fechar}>
                <div className="flex items-center gap-2">
                    {form && (
                        <button onClick={() => { setForm(null); setTeste(null); setErro(null); }} className="p-1 -ml-1 rounded-[6px] text-gray-400 hover:text-gray-700 hover:bg-gray-100" title="Voltar à lista">
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                    <SheetTitle>{form ? (form.id ? 'Editar regra' : 'Nova regra') : 'Regras de classificação'}</SheetTitle>
                </div>
                <SheetDescription>
                    {form
                        ? 'A regra só classifica movimento que ainda não tem categoria. Ela roda no Reprocessar e na importação do extrato.'
                        : `${regras.length} ${regras.length === 1 ? 'regra' : 'regras'} desta organização · rodam no Reprocessar e na importação do extrato`}
                </SheetDescription>
            </SheetHeader>

            <SheetPanel className="p-6 space-y-8">
                {erro && (
                    <div className="flex items-start gap-2 p-3 rounded-[10px] bg-red-50 border border-red-200 text-red-700 text-sm">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>{erro}</span>
                    </div>
                )}

                {!organizationId && (
                    <p className="text-sm text-gray-500">Selecione uma conta bancária: as regras são da organização dela.</p>
                )}

                {organizationId && !form && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                            <h3 className="text-sm font-semibold text-gray-900">Categorias fora da conciliação</h3>
                            {gravandoExcluidas && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                        </div>
                        <p className="text-sm text-gray-600">
                            Extratos destas categorias não geram sugestão e não entram em agrupamentos, divergências
                            nem na aba Pendentes. Continuam no Extrato e nas transferências entre contas.
                        </p>
                        {excluidas === null ? (
                            <p className="text-sm text-gray-500">Carregando…</p>
                        ) : (
                            <div className="flex flex-wrap items-center gap-2">
                                {excluidas.map(c => (
                                    <span key={c} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-[6px] bg-gray-100 text-sm text-gray-800">
                                        {c}
                                        <button
                                            type="button"
                                            onClick={() => gravarExcluidas(organizationId, excluidas.filter(x => x !== c))}
                                            disabled={gravandoExcluidas}
                                            title={`Voltar "${c}" para a conciliação`}
                                            className="p-0.5 rounded-[4px] text-gray-400 hover:text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </span>
                                ))}
                                <select
                                    aria-label="Adicionar categoria fora da conciliação"
                                    value=""
                                    onChange={e => { if (e.target.value) void gravarExcluidas(organizationId, [...excluidas, e.target.value]); }}
                                    disabled={gravandoExcluidas}
                                    title={gravandoExcluidas ? 'Salvando a lista…' : undefined}
                                    className={field.replace('w-full ', 'w-56 ')}
                                >
                                    <option value="">Adicionar categoria…</option>
                                    {categories.filter(c => !excluidas.some(x => x.toLowerCase() === c.toLowerCase()))
                                        .map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                        )}
                    </div>
                )}

                {organizationId && !form && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-3">
                            <h3 className="text-sm font-semibold text-gray-900">Regras</h3>
                            <button
                                onClick={() => { setForm({ ...VAZIO }); setTeste(null); setErro(null); }}
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                            >
                                <Plus className="w-[15px] h-[15px]" />
                                Nova regra
                            </button>
                        </div>
                        {regras.length === 0 ? (
                            <div className="text-center py-12">
                                <ShieldCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma regra</h3>
                                <p className="text-sm text-gray-500">Crie uma, ou aceite uma das regras sugeridas na Central.</p>
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-100 rounded-[10px] border border-gray-100">
                                {regras.map(r => (
                                    <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                                        <div className="pt-0.5">
                                            <TableSwitch checked={r.is_active} onChange={() => alternarAtiva(organizationId, r)}
                                                title={r.is_active ? 'Ativa — clique para desativar' : 'Inativa — clique para ativar'} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className={`text-sm font-medium ${r.is_active ? 'text-gray-900' : 'text-gray-400'}`}>{r.name}</p>
                                            <p className="text-sm text-gray-600 break-words">{descreverCondicao(r.conditions)}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                → {[r.actions?.category, r.actions?.counterparty].filter(Boolean).join(' · ') || 'sem ação'}
                                                {r.actions?.auto_confirm ? ' · confirma sozinha' : ''}
                                                {' · prioridade '}{r.priority}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <ActionIconButton kind="edit" title="Editar regra" onClick={() => editar(r)} />
                                            <ActionIconButton kind="delete" title="Excluir regra" onClick={() => excluir(organizationId, r)} />
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                {organizationId && form && (
                    <>
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                                <h3 className="text-sm font-semibold text-gray-900">Quando</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                <div className="space-y-1.5 col-span-2">
                                    <label htmlFor="regra-nome" className={label}>Nome da regra</label>
                                    <input id="regra-nome" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                                        placeholder="Ex.: Tarifas bancárias" disabled={salvando} className={field} />
                                </div>
                                {form.avancada ? (
                                    <div className="space-y-1.5 col-span-2">
                                        <p className={label}>Condição</p>
                                        <p className="text-sm text-gray-900">{descreverCondicao(form.avancada)}</p>
                                        <p className="text-xs text-gray-500">Condição avançada: fica como está ao salvar. O formulário edita nome, categoria e cliente/credor.</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="space-y-1.5">
                                            <label htmlFor="regra-contem" className={label}>Descrição contém</label>
                                            <input id="regra-contem" value={form.contem} onChange={e => { setForm({ ...form, contem: e.target.value }); setTeste(null); }}
                                                placeholder="Ex.: TARIFA, IOF, ENERGISA" disabled={salvando} className={field} />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label htmlFor="regra-direcao" className={label}>Direção</label>
                                            <select id="regra-direcao" value={form.direcao} onChange={e => { setForm({ ...form, direcao: e.target.value as Formulario['direcao'] }); setTeste(null); }}
                                                disabled={salvando} className={field}>
                                                <option value="">Entradas e saídas</option>
                                                <option value="CREDIT">Só entradas</option>
                                                <option value="DEBIT">Só saídas</option>
                                            </select>
                                        </div>
                                    </>
                                )}
                                <div className="col-span-2 flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={testar}
                                        disabled={testando || salvando || !selectedAccountId}
                                        title={!selectedAccountId ? 'Selecione uma conta bancária para testar' : 'Ver o que a regra classificaria no extrato desta conta, sem gravar nada'}
                                        className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] text-[13px] font-medium text-blue-600 bg-white border border-blue-100 hover:bg-blue-50 transition-all disabled:opacity-50"
                                    >
                                        {testando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Search className="w-[15px] h-[15px]" />}
                                        Testar
                                    </button>
                                    {teste && (
                                        <span className="text-sm text-gray-600">
                                            {teste.classificaria === 0 ? 'Não classificaria nenhum movimento agora' : `Classificaria ${teste.classificaria} movimento(s) agora`}
                                            {teste.jaClassificados > 0 ? ` · ${teste.jaClassificados} já classificado(s) ficam como estão` : ''}
                                        </span>
                                    )}
                                </div>
                                {teste && teste.exemplos.length > 0 && (
                                    <ul className="col-span-2 space-y-1">
                                        {teste.exemplos.map((ex, i) => <li key={i} className="text-xs text-gray-500">{ex}</li>)}
                                    </ul>
                                )}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                                <h3 className="text-sm font-semibold text-gray-900">Então</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                <div className="space-y-1.5">
                                    <label htmlFor="regra-categoria" className={label}>Categoria</label>
                                    <select id="regra-categoria" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} disabled={salvando} className={field}>
                                        <option value="">Não definir</option>
                                        {form.category && !categories.includes(form.category) && <option value={form.category}>{form.category}</option>}
                                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <p className={label}>{ehCliente ? 'Cliente' : 'Credor'}</p>
                                    {ehCliente ? (
                                        <ClientSelect clients={clienteRegistros} value={idDoCliente}
                                            onChange={id => setForm({ ...form, counterparty: clienteRegistros.find(c => c.id === id)?.name ?? '' })}
                                            placeholder="Não definir" icon={null} disabled={salvando} fallbackLabel={form.counterparty || undefined} />
                                    ) : (
                                        <SupplierSelect suppliers={credorRegistros} value={idDoCredor}
                                            onChange={id => setForm({ ...form, counterparty: credorRegistros.find(s => s.id === id)?.name ?? '' })}
                                            placeholder="Não definir" title="Selecionar Credor" size="sm" disabled={salvando} fallbackLabel={form.counterparty || undefined} />
                                    )}
                                </div>
                                {form.acoesOriginais.auto_confirm && (
                                    <p className="col-span-2 text-xs text-gray-500">
                                        Esta regra também confirma o movimento sozinha (tirando-o da conciliação). Isso continua valendo.
                                    </p>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </SheetPanel>

            {form && (
                <SheetFooter>
                    {falta && <span className="text-xs text-gray-500 mr-auto">{falta}</span>}
                    <button onClick={() => { setForm(null); setTeste(null); setErro(null); }} disabled={salvando}
                        className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px] transition-all disabled:opacity-50">
                        Cancelar
                    </button>
                    <button
                        onClick={salvar}
                        disabled={salvando || !!falta || !organizationId}
                        title={falta ?? undefined}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {salvando && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                        {form.id ? 'Salvar regra' : 'Criar regra'}
                    </button>
                </SheetFooter>
            )}
        </Sheet>
    );
};

export default RegrasSheet;
