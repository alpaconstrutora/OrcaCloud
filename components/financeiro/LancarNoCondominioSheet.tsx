// components/financeiro/LancarNoCondominioSheet.tsx
// Botão "Lançamento" do Fechamento por Centro de Custo (Contas a Pagar) →
// Comercial › Condomínios › Financeiro.
// Plano: docs/planos/2026-08-24-fechamento-lancamento-no-condominio.md
//
// NÃO escreve em `internal_transactions` — cria um `condominio_rateios` em
// RASCUNHO com exatamente os títulos marcados, reusando o mesmo fluxo de
// "Novo rateio" da aba do condomínio (calcular → conferir → lançar). Título
// continua no Contas a Pagar, sem alteração; quem confere/fecha o rascunho é
// a aba do condomínio.
import React from 'react';
import { AlertTriangle, Building2, Calculator, Loader2, Lock } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import {
    condominioRateioService, CRITERIO_LABEL, CRITERIO_EXIGE,
    type CriterioRateio, type TipoRateio, type PreviaRateio,
} from '../../services/condominioRateioService';
import type { Payable } from '../../types/financial';
import { formatMoney } from '../ui/Format';

interface Grupo {
    empreendimentoId: string;
    empreendimentoNome: string;
    organizationId: string;
    costCenterId: string;
    payables: Payable[];
}

interface Props {
    open: boolean;
    onClose: () => void;
    /** Títulos marcados no Fechamento — já filtrados para só os de condomínio. */
    payables: Payable[];
    /** 'YYYY-MM' da competência escolhida na tela — vira o rótulo do rateio;
     *  as despesas vão pelos IDs marcados, não por esta data (ver aviso no corpo). */
    competencia: string;
    /** Avisa o pai quais títulos entraram de fato, para tirar da seleção e
     *  marcar como "já lançado" sem depender de recarregar a tela (§22). */
    onLancado: (idsLancados: string[]) => void;
    notify: (message: string, type?: 'success' | 'error') => void;
}

const dinheiro = (v: number) => formatMoney(v);

function rotuloCompetencia(iso: string): string {
    const [a, m] = iso.split('-');
    return `${m}/${a}`;
}

export default function LancarNoCondominioSheet({ open, onClose, payables, competencia, onLancado, notify }: Props) {
    const [grupos, setGrupos] = React.useState<Grupo[] | null>(null);
    const [carregandoGrupos, setCarregandoGrupos] = React.useState(false);
    const [erroGrupos, setErroGrupos] = React.useState<string | null>(null);

    const [form, setForm] = React.useState<{ tipo: TipoRateio; criterio: CriterioRateio; valorFixo: string }>({
        tipo: 'ORDINARIO', criterio: 'IGUAL', valorFixo: '',
    });

    const [conflitos, setConflitos] = React.useState<Set<string>>(new Set());
    const [verificandoConflitos, setVerificandoConflitos] = React.useState(false);

    const [previas, setPrevias] = React.useState<Map<string, PreviaRateio>>(new Map());
    const [calculando, setCalculando] = React.useState(false);
    const [lancando, setLancando] = React.useState(false);

    // Agrupa os títulos marcados por condomínio — a organização e o nome vêm
    // de `empreendimentos`, via o centro de custo de cada título.
    React.useEffect(() => {
        if (!open) return;
        setCarregandoGrupos(true);
        setErroGrupos(null);
        setPrevias(new Map());
        const ccIds = [...new Set(payables.map(p => p.cost_center_id).filter((id): id is string => !!id))];
        condominioRateioService.listarPorCentrosDeCusto(ccIds)
            .then(resolvidos => {
                const porCC = new Map(resolvidos.map(r => [r.costCenterId, r]));
                const porEmpreendimento = new Map<string, Grupo>();
                for (const p of payables) {
                    const r = p.cost_center_id ? porCC.get(p.cost_center_id) : undefined;
                    if (!r) continue; // título sem condomínio resolvido — não deveria chegar aqui, mas não trava a tela
                    let g = porEmpreendimento.get(r.empreendimentoId);
                    if (!g) {
                        g = {
                            empreendimentoId: r.empreendimentoId, empreendimentoNome: r.empreendimentoNome,
                            organizationId: r.organizationId, costCenterId: r.costCenterId, payables: [],
                        };
                        porEmpreendimento.set(r.empreendimentoId, g);
                    }
                    g.payables.push(p);
                }
                setGrupos([...porEmpreendimento.values()].sort((a, b) => a.empreendimentoNome.localeCompare(b.empreendimentoNome, 'pt-BR')));
            })
            .catch(e => setErroGrupos(e?.message || 'Erro ao identificar os condomínios dos títulos marcados.'))
            .finally(() => setCarregandoGrupos(false));
    }, [open, payables]);

    // Bloqueio antecipado: `uidx_rateio_competencia` recusa um segundo rateio
    // vivo na mesma (condomínio, competência, tipo). Avisa antes de calcular,
    // não deixa o usuário preencher tudo para descobrir só no fim.
    React.useEffect(() => {
        if (!grupos || grupos.length === 0) { setConflitos(new Set()); return; }
        let ativo = true;
        setVerificandoConflitos(true);
        Promise.all(grupos.map(g => condominioRateioService.listar(g.empreendimentoId)))
            .then(listas => {
                if (!ativo) return;
                const vivos = new Set<string>();
                listas.forEach((lista, i) => {
                    const g = grupos[i];
                    const conflita = lista.some(r =>
                        r.status !== 'CANCELADO' && r.tipo === form.tipo && r.competencia.slice(0, 7) === competencia);
                    if (conflita) vivos.add(g.empreendimentoId);
                });
                setConflitos(vivos);
            })
            .catch(() => { if (ativo) setConflitos(new Set()); })
            .finally(() => { if (ativo) setVerificandoConflitos(false); });
        return () => { ativo = false; };
    }, [grupos, form.tipo, competencia]);

    const podeCalcular = !!grupos && grupos.length > 0 && conflitos.size === 0;

    async function calcular() {
        if (!grupos) return;
        setCalculando(true);
        try {
            const entradas = await Promise.all(grupos.map(async g => {
                const p = await condominioRateioService.previa({
                    empreendimentoId: g.empreendimentoId,
                    costCenterId: g.costCenterId,
                    competencia: `${competencia}-01`,
                    criterio: form.criterio,
                    valorFixo: Number(form.valorFixo.replace(',', '.')) || 0,
                    transactionIds: g.payables.map(p => p.id),
                });
                return [g.empreendimentoId, p] as const;
            }));
            setPrevias(new Map(entradas));
        } catch (e: any) {
            notify(e?.message || 'Erro ao calcular.', 'error');
        } finally {
            setCalculando(false);
        }
    }

    async function lancar() {
        if (!grupos || previas.size !== grupos.length) return;
        setLancando(true);
        const idsLancados: string[] = [];
        const falhas: string[] = [];
        for (const g of grupos) {
            const previa = previas.get(g.empreendimentoId);
            if (!previa) continue;
            try {
                await condominioRateioService.salvar({
                    empreendimentoId: g.empreendimentoId,
                    organizationId: g.organizationId,
                    costCenterId: g.costCenterId,
                    competencia: `${competencia}-01`,
                    tipo: form.tipo,
                    criterio: form.criterio,
                    previa,
                });
                idsLancados.push(...g.payables.map(p => p.id));
            } catch (e: any) {
                falhas.push(`${g.empreendimentoNome}: ${e?.message || 'falha ao lançar'}`);
            }
        }
        setLancando(false);
        if (idsLancados.length > 0) {
            onLancado(idsLancados);
            notify(falhas.length === 0
                ? `Lançado como rascunho em ${grupos.length} condomínio${grupos.length !== 1 ? 's' : ''}.`
                : `Lançado em ${grupos.length - falhas.length} de ${grupos.length} condomínios. ${falhas.join(' · ')}`,
                falhas.length === 0 ? 'success' : 'error');
        } else {
            notify(falhas.join(' · ') || 'Erro ao lançar.', 'error');
        }
        if (falhas.length === 0) onClose();
    }

    const totalGeral = payables.reduce((s, p) => s + (p.amount ?? 0), 0);

    return (
        <Sheet open={open} onClose={onClose} size="xl">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Lançamento no condomínio</SheetTitle>
                <SheetDescription>
                    {payables.length} título{payables.length !== 1 ? 's' : ''} · {dinheiro(totalGeral)} · competência {rotuloCompetencia(competencia)}
                </SheetDescription>
            </SheetHeader>
            <SheetPanel>
                <div className="space-y-4">
                    <p className="text-xs text-gray-400">
                        As despesas vão pelos títulos marcados no Fechamento, não por um novo recorte de data — a
                        competência acima é só o rótulo do rateio.
                    </p>

                    {carregandoGrupos ? (
                        <div className="text-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        </div>
                    ) : erroGrupos ? (
                        <p className="text-sm text-red-600">{erroGrupos}</p>
                    ) : !grupos || grupos.length === 0 ? (
                        <p className="text-sm text-gray-500">
                            Nenhum dos títulos marcados pertence a um centro de custo de condomínio.
                        </p>
                    ) : (
                        <>
                            <div className="space-y-2">
                                {grupos.map(g => {
                                    const conflito = conflitos.has(g.empreendimentoId);
                                    const previa = previas.get(g.empreendimentoId);
                                    const totalGrupo = g.payables.reduce((s, p) => s + (p.amount ?? 0), 0);
                                    return (
                                        <div key={g.empreendimentoId} className={`p-3 rounded-[10px] border ${conflito ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0 flex items-center gap-1.5">
                                                    <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                    <span className="text-sm font-medium text-gray-800 truncate">{g.empreendimentoNome}</span>
                                                </div>
                                                <span className="text-sm font-medium text-gray-800 shrink-0">{dinheiro(totalGrupo)}</span>
                                            </div>
                                            <p className="text-xs text-gray-400 mt-0.5">{g.payables.length} despesa{g.payables.length !== 1 ? 's' : ''}</p>
                                            {conflito && (
                                                <p className="text-xs text-red-600 flex items-start gap-1.5 mt-1.5">
                                                    <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                                    Já existe um rateio {form.tipo === 'ORDINARIO' ? 'ordinário' : 'extraordinário'} vivo
                                                    de {rotuloCompetencia(competencia)} para este condomínio. Cancele-o em
                                                    Comercial › Condomínios › Financeiro antes de lançar aqui.
                                                </p>
                                            )}
                                            {previa && !conflito && (
                                                <div className="text-xs text-gray-500 mt-1.5 space-y-1">
                                                    <p>Rateado: <span className="text-gray-800 font-medium">{dinheiro(previa.totalRateado)}</span></p>
                                                    {previa.semDado > 0 && (
                                                        <p className="text-amber-600 flex items-start gap-1.5">
                                                            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                                            {previa.semDado} unidade(s) sem {CRITERIO_EXIGE[form.criterio]}.
                                                        </p>
                                                    )}
                                                    {previa.semResponsavel > 0 && (
                                                        <p className="text-amber-600 flex items-start gap-1.5">
                                                            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                                            {previa.semResponsavel} unidade(s) sem responsável financeiro.
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {verificandoConflitos && (
                                <p className="text-xs text-gray-400 flex items-center gap-1.5">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verificando rateios existentes...
                                </p>
                            )}

                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <div>
                                    <label className="text-xs font-semibold text-slate-500">Tipo</label>
                                    <select
                                        value={form.tipo}
                                        onChange={e => { setForm(f => ({ ...f, tipo: e.target.value as TipoRateio })); setPrevias(new Map()); }}
                                        className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                    >
                                        <option value="ORDINARIO">Ordinário</option>
                                        <option value="EXTRAORDINARIO">Extraordinário</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-slate-500">Critério</label>
                                    <select
                                        value={form.criterio}
                                        onChange={e => { setForm(f => ({ ...f, criterio: e.target.value as CriterioRateio })); setPrevias(new Map()); }}
                                        className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                    >
                                        {/* GRUPO fica de fora: exige selecionar as unidades do grupo à mão,
                                            e este fluxo lança para vários condomínios de uma vez — sem tela
                                            própria para escolher unidade por condomínio. Quem precisa de
                                            GRUPO usa "Novo rateio" na aba do condomínio. */}
                                        {(Object.keys(CRITERIO_LABEL) as CriterioRateio[]).filter(c => c !== 'GRUPO').map(c => (
                                            <option key={c} value={c}>{CRITERIO_LABEL[c]}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            {form.criterio === 'FIXO' && (
                                <div>
                                    <label className="text-xs font-semibold text-slate-500">Valor por unidade</label>
                                    <input
                                        type="text" inputMode="decimal"
                                        value={form.valorFixo}
                                        onChange={e => { setForm(f => ({ ...f, valorFixo: e.target.value })); setPrevias(new Map()); }}
                                        placeholder="0,00"
                                        className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                    />
                                </div>
                            )}

                            <button
                                onClick={calcular}
                                disabled={!podeCalcular || calculando}
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-gray-100 text-gray-700 rounded-[6px] hover:bg-gray-200 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                            >
                                {calculando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Calculator className="w-[15px] h-[15px]" />}
                                {calculando ? 'Calculando...' : 'Calcular'}
                            </button>
                        </>
                    )}
                </div>
            </SheetPanel>
            <SheetFooter>
                <button onClick={onClose} className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all">Cancelar</button>
                <button
                    onClick={lancar}
                    disabled={lancando || !grupos || grupos.length === 0 || previas.size !== grupos?.length || conflitos.size > 0}
                    className="h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                >
                    {lancando ? 'Lançando...' : 'Lançar como rascunho'}
                </button>
            </SheetFooter>
        </Sheet>
    );
}
