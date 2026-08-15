// components/condominio/FinanceiroTab.tsx
// Rateio condominial — primeira fatia do financeiro (🚪 portão).
// Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md
//
// A ÂNCORA É O CENTRO DE CUSTO: a despesa do condomínio é a que cai no centro
// de custo dele. Isso separa o caixa com ou sem organização própria, e é a
// decisão do usuário (14/08/2026) que dispensou escolher entre org própria e
// marcador no lançamento.
//
// PRÉVIA ANTES DE FECHAR: rateio fechado vira base de cobrança, e boleto
// emitido não se desfaz. Por isso o fluxo é calcular → conferir → salvar
// rascunho → fechar, e o banco recusa alterar item de rateio já fechado.
import React from 'react';
import {
    Calculator, Wallet, Search, RefreshCw, Plus, Lock, AlertTriangle, Building2, AlertCircle } from 'lucide-react';
import { usePersistedState } from '../ui/TableUtils';
import { KpiCard } from '../ui/KpiCard';
import { InlineDisclosureMenu } from '../ui/inline-disclosure-menu';
import ActionIconButton from '../ui/ActionIconButton';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import {
    condominioRateioService, CRITERIO_LABEL, CRITERIO_EXIGE,
    type CriterioRateio, type TipoRateio, type PreviaRateio, type Rateio,
} from '../../services/condominioRateioService';
import type { Empreendimento } from '../../types/empreendimento';

const STATUS_COR: Record<string, string> = {
    RASCUNHO: 'text-amber-600', FECHADO: 'text-emerald-600', CANCELADO: 'text-gray-500',
};
const STATUS_LABEL: Record<string, string> = {
    RASCUNHO: 'Rascunho', FECHADO: 'Fechado', CANCELADO: 'Cancelado',
};

const dinheiro = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function competenciaAtual(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function rotuloCompetencia(iso: string): string {
    const [a, m] = iso.slice(0, 10).split('-');
    return `${m}/${a}`;
}

interface Props { empreendimento: Empreendimento }

const FinanceiroTab: React.FC<Props> = ({ empreendimento }) => {
    const confirm = useConfirm();
    const orgId = empreendimento.organization_id;

    const [searchTerm, setSearchTerm] = usePersistedState<string>('condominio:financeiro:search', '');
    const [centro, setCentro] = React.useState<{ id: string; code: string; name: string } | null>(null);
    const [rateios, setRateios] = React.useState<Rateio[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const [sheetNovo, setSheetNovo] = React.useState(false);
    const [calculando, setCalculando] = React.useState(false);
    const [salvando, setSalvando] = React.useState(false);
    const [previa, setPrevia] = React.useState<PreviaRateio | null>(null);
    const [form, setForm] = React.useState<{
        competencia: string; tipo: TipoRateio; criterio: CriterioRateio; valorFixo: string;
    }>({ competencia: competenciaAtual(), tipo: 'ORDINARIO', criterio: 'IGUAL', valorFixo: '' });

    const carregar = React.useCallback(async () => {
        setLoading(true);
        setErro(null);
        try {
            setCentro(await condominioRateioService.getCentroDeCusto(empreendimento.id));
            setRateios(await condominioRateioService.listar(empreendimento.id));
        } catch (e: any) {
            setErro(e?.message || 'Erro ao carregar o financeiro.');
        } finally {
            setLoading(false);
        }
    }, [empreendimento.id]);

    React.useEffect(() => { carregar(); }, [carregar]);

    const [disponiveis, setDisponiveis] = React.useState<{ id: string; code: string; name: string; grupo: string | null }[]>([]);
    const [escolhido, setEscolhido] = React.useState('');

    // Só carrega quando falta centro de custo — é o único momento em que a
    // lista importa.
    React.useEffect(() => {
        if (loading || centro) return;
        condominioRateioService.listarDisponiveis(orgId)
            .then(setDisponiveis)
            .catch(() => setDisponiveis([]));
    }, [loading, centro, orgId]);

    const criarCentro = async () => {
        try {
            // O nome não repete "Condomínio": ele já vai DENTRO do grupo
            // Condomínios, e "Condomínios › Condomínio 007 - Bella Vista" lê mal.
            const c = await condominioRateioService.criarCentroDeCusto(
                empreendimento.id, orgId, empreendimento.name);
            setCentro(c);
            notify(`Centro de custo ${c.code} criado no grupo Condomínios. Toda despesa do condomínio deve cair nele.`);
        } catch (e: any) {
            notify(e?.message || 'Erro ao criar o centro de custo.', 'error');
        }
    };

    const vincularCentro = async () => {
        if (!escolhido) return;
        try {
            const c = await condominioRateioService.vincular(escolhido, empreendimento.id);
            setCentro(c);
            notify(`Centro de custo ${c.code} vinculado a este condomínio.`);
        } catch (e: any) {
            notify(e?.message || 'Erro ao vincular.', 'error');
        }
    };

    const desvincularCentro = async () => {
        if (!centro) return;
        const ok = await confirm({
            title: 'Desvincular o centro de custo?',
            message: `${centro.code} — ${centro.name} deixa de ser o caixa deste condomínio. Nada é apagado: os lançamentos e os rateios já feitos continuam onde estão, mas novos rateios ficam sem de onde tirar despesa.`,
            variant: 'warning',
            confirmLabel: 'Desvincular',
        });
        if (!ok) return;
        try {
            await condominioRateioService.desvincular(centro.id);
            setCentro(null);
            notify('Centro de custo desvinculado.');
        } catch (e: any) {
            notify(e?.message || 'Erro ao desvincular.', 'error');
        }
    };

    const calcular = async () => {
        if (!centro) return;
        setCalculando(true);
        try {
            setPrevia(await condominioRateioService.previa({
                empreendimentoId: empreendimento.id,
                costCenterId: centro.id,
                competencia: form.competencia,
                criterio: form.criterio,
                valorFixo: Number(form.valorFixo.replace(',', '.')) || 0,
            }));
        } catch (e: any) {
            notify(e?.message || 'Erro ao calcular.', 'error');
        } finally {
            setCalculando(false);
        }
    };

    const salvar = async () => {
        if (!centro || !previa) return;
        setSalvando(true);
        try {
            const r = await condominioRateioService.salvar({
                empreendimentoId: empreendimento.id,
                organizationId: orgId,
                costCenterId: centro.id,
                competencia: form.competencia,
                tipo: form.tipo,
                criterio: form.criterio,
                previa,
            });
            // §22 — costura no array local em vez de recarregar a aba.
            setRateios(prev => [r, ...prev]);
            setSheetNovo(false);
            setPrevia(null);
            notify('Rateio salvo como rascunho. Confira antes de fechar.');
        } catch (e: any) {
            notify(e?.message || 'Erro ao salvar.', 'error');
        } finally {
            setSalvando(false);
        }
    };

    const fechar = async (r: Rateio) => {
        const ok = await confirm({
            title: 'Fechar o rateio?',
            message: `${dinheiro(r.total_rateado)} da competência ${rotuloCompetencia(r.competencia)} passam a ser base de cobrança. Depois de fechado, os valores não podem ser alterados — só cancelando e refazendo.`,
            variant: 'warning',
            confirmLabel: 'Fechar rateio',
        });
        if (!ok) return;
        try {
            const atualizado = await condominioRateioService.fechar(r.id);
            setRateios(prev => prev.map(x => (x.id === r.id ? atualizado : x)));
            notify('Rateio fechado.');
        } catch (e: any) {
            notify(e?.message || 'Erro ao fechar.', 'error');
        }
    };

    const cancelar = async (r: Rateio) => {
        const ok = await confirm({
            title: 'Cancelar o rateio?',
            message: r.status === 'FECHADO'
                ? `Este rateio já foi fechado e pode ter sido comunicado aos condôminos. Cancelar libera a competência ${rotuloCompetencia(r.competencia)} para um rateio novo, mas o que já foi cobrado não se desfaz sozinho.`
                : `O rascunho da competência ${rotuloCompetencia(r.competencia)} será cancelado.`,
            variant: 'danger',
            confirmLabel: 'Cancelar rateio',
        });
        if (!ok) return;
        try {
            const atualizado = await condominioRateioService.cancelar(r.id);
            setRateios(prev => prev.map(x => (x.id === r.id ? atualizado : x)));
            notify('Rateio cancelado.');
        } catch (e: any) {
            notify(e?.message || 'Erro ao cancelar.', 'error');
        }
    };

    const vivos = React.useMemo(() => rateios.filter(r => r.status !== 'CANCELADO'), [rateios]);
    const kpis = React.useMemo(() => ({
        fechados: vivos.filter(r => r.status === 'FECHADO').length,
        rascunhos: vivos.filter(r => r.status === 'RASCUNHO').length,
        ultimoTotal: vivos.find(r => r.status === 'FECHADO')?.total_rateado ?? 0,
    }), [vivos]);

    const filtrados = React.useMemo(() => {
        const t = searchTerm.trim().toLowerCase();
        if (!t) return rateios;
        return rateios.filter(r =>
            rotuloCompetencia(r.competencia).includes(t)
            || CRITERIO_LABEL[r.criterio].toLowerCase().includes(t));
    }, [rateios, searchTerm]);

    // Sem centro de custo não há de onde tirar despesa — e é o primeiro passo.
    if (!loading && !centro) {
        return (
            <div className="text-center py-12 bg-white rounded-[10px] border border-gray-100 shadow-sm">
                <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-900 mb-2">Este condomínio não tem centro de custo</h3>
                <p className="text-sm text-gray-500 max-w-lg mx-auto mb-6">
                    O centro de custo é a âncora da separação do caixa: a despesa do condomínio é a
                    que cai nele, com ou sem organização própria. Sem ele não há de onde tirar as
                    despesas do rateio.
                </p>

                <div className="max-w-lg mx-auto text-left space-y-4">
                    {/* Vincular vem primeiro: quem já cadastrou o centro de custo à
                        mão — o caso comum — não deve ser empurrado a criar um
                        segundo e ficar com dois para o mesmo caixa. */}
                    {disponiveis.length > 0 && (
                        <div className="bg-white p-4 rounded-[10px] border border-gray-200">
                            <label className="text-xs font-semibold text-slate-500">Já existe um centro de custo para este condomínio?</label>
                            <div className="flex gap-2 mt-1">
                                <select
                                    value={escolhido}
                                    onChange={ev => setEscolhido(ev.target.value)}
                                    className="flex-1 h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                >
                                    <option value="">Selecione para vincular</option>
                                    {disponiveis.map(d => (
                                        <option key={d.id} value={d.id}>
                                            {d.code} — {d.name}{d.grupo ? ` (${d.grupo})` : ''}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    onClick={vincularCentro}
                                    disabled={!escolhido}
                                    className="h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 shrink-0"
                                >
                                    Vincular
                                </button>
                            </div>
                            <p className="text-xs text-gray-400 mt-1.5">
                                Vincular aproveita os lançamentos que já caíram nele. Criar um novo
                                deixaria dois centros de custo para o mesmo caixa.
                            </p>
                        </div>
                    )}

                    <div className="text-center">
                        <button
                            onClick={criarCentro}
                            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all active:scale-95"
                        >
                            <Plus className="w-[15px] h-[15px]" /> Criar um novo, no grupo Condomínios
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {erro && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-[10px] px-4 py-3 text-sm">{erro}</div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                <KpiCard label="RATEIOS FECHADOS" value={kpis.fechados} icon={<Lock className="w-5 h-5" />} color="emerald" />
                <KpiCard
                    label="RASCUNHOS" value={kpis.rascunhos}
                    sub={kpis.rascunhos > 0 ? 'Ainda não viraram cobrança' : undefined}
                    icon={<Calculator className="w-5 h-5" />}
                    color={kpis.rascunhos > 0 ? 'amber' : 'gray'}
                />
                <KpiCard
                    label="ÚLTIMO RATEIO FECHADO" value={dinheiro(kpis.ultimoTotal)}
                    sub={centro ? `Centro de custo ${centro.code}` : undefined}
                    icon={<Wallet className="w-5 h-5" />} color="blue"
                />
            </div>

            {/* Qual centro de custo alimenta o rateio — sem isso, "de onde vêm as
                despesas?" só se responde abrindo o código. */}
            {centro && (
                <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                    <p className="text-sm text-gray-600 min-w-0">
                        <span className="text-gray-400">Despesas vêm de</span>{' '}
                        <span className="font-medium text-gray-800">{centro.code} — {centro.name}</span>
                    </p>
                    <button
                        onClick={desvincularCentro}
                        className="h-8 px-2.5 rounded-[6px] text-sm font-medium text-gray-500 hover:bg-gray-100 transition-all shrink-0 whitespace-nowrap"
                    >
                        Desvincular
                    </button>
                </div>
            )}

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por competência ou critério..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>
                        <button
                            onClick={carregar}
                            className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                            title="Recarregar"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => { setPrevia(null); setSheetNovo(true); }}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0 whitespace-nowrap"
                        >
                            <Plus className="w-[15px] h-[15px]" /> Novo rateio
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : filtrados.length === 0 ? (
                    <div className="text-center py-12">
                        <Calculator className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">
                            {rateios.length === 0 ? 'Nenhum rateio' : 'Nenhum resultado'}
                        </h3>
                        <p className="text-sm text-gray-500 max-w-md mx-auto">
                            {rateios.length === 0
                                ? 'O rateio pega as despesas lançadas no centro de custo do condomínio e divide entre as unidades pelo critério escolhido.'
                                : 'Tente ajustar a busca.'}
                        </p>
                    </div>
                ) : (
                    <div className="p-4 space-y-2">
                        {filtrados.map(r => (
                            <div key={r.id} className={`flex items-start gap-3 p-3 rounded-[10px] border ${r.status === 'CANCELADO' ? 'border-gray-100 opacity-60' : 'border-gray-200'}`}>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-medium text-gray-800">
                                            {rotuloCompetencia(r.competencia)}
                                        </span>
                                        <span className={`text-sm font-normal ${STATUS_COR[r.status]}`}>
                                            {STATUS_LABEL[r.status]}
                                        </span>
                                        {r.tipo === 'EXTRAORDINARIO' && (
                                            <span className="text-sm font-normal text-indigo-600">Extraordinário</span>
                                        )}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-0.5">
                                        {CRITERIO_LABEL[r.criterio]}
                                        {' · despesas '}{dinheiro(r.total_despesas)}
                                        {' · rateado '}{dinheiro(r.total_rateado)}
                                        {Math.abs(r.total_despesas - r.total_rateado) > 0.005 && (
                                            <span className="text-amber-600">
                                                {' · diferença '}{dinheiro(r.total_despesas - r.total_rateado)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    {r.status === 'RASCUNHO' && (
                                        <ActionIconButton
                                            kind="edit"
                                            title="Fechar rateio"
                                            icon={<Lock className="w-4 h-4" />}
                                            onClick={() => fechar(r)}
                                        />
                                    )}
                                    {r.status !== 'CANCELADO' && (
                                        <InlineDisclosureMenu showDelete onDelete={() => cancelar(r)} />
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Novo rateio — calcular, conferir, salvar */}
            <Sheet open={sheetNovo} onClose={() => setSheetNovo(false)} size="2xl">
                <SheetHeader onClose={() => setSheetNovo(false)}>
                    <SheetTitle>Novo rateio</SheetTitle>
                    <SheetDescription>{empreendimento.name}</SheetDescription>
                </SheetHeader>
                <SheetPanel>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Competência</label>
                                <input
                                    type="month"
                                    value={form.competencia.slice(0, 7)}
                                    onChange={e => setForm(f => ({ ...f, competencia: `${e.target.value}-01` }))}
                                    className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Tipo</label>
                                <select
                                    value={form.tipo}
                                    onChange={e => setForm(f => ({ ...f, tipo: e.target.value as TipoRateio }))}
                                    className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                >
                                    <option value="ORDINARIO">Ordinário</option>
                                    <option value="EXTRAORDINARIO">Extraordinário</option>
                                </select>
                                <p className="text-xs text-gray-400 mt-1">
                                    {form.tipo === 'EXTRAORDINARIO'
                                        ? 'Obra e benfeitoria são do PROPRIETÁRIO, não do inquilino — por isso rateio separado.'
                                        : 'Despesa corrente do mês.'}
                                </p>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-slate-500">Critério</label>
                            <select
                                value={form.criterio}
                                onChange={e => { setForm(f => ({ ...f, criterio: e.target.value as CriterioRateio })); setPrevia(null); }}
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            >
                                {(Object.keys(CRITERIO_LABEL) as CriterioRateio[]).map(c => (
                                    <option key={c} value={c}>{CRITERIO_LABEL[c]}</option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-400 mt-1">Exige: {CRITERIO_EXIGE[form.criterio]}.</p>
                        </div>

                        {form.criterio === 'FIXO' && (
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Valor por unidade</label>
                                <input
                                    type="text" inputMode="decimal"
                                    value={form.valorFixo}
                                    onChange={e => setForm(f => ({ ...f, valorFixo: e.target.value }))}
                                    placeholder="0,00"
                                    className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                />
                                <p className="text-xs text-gray-400 mt-1">
                                    No valor fixo o total arrecadado é consequência, e pode não bater com a despesa.
                                </p>
                            </div>
                        )}

                        <button
                            onClick={calcular}
                            disabled={calculando}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-gray-100 text-gray-700 rounded-[6px] hover:bg-gray-200 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                        >
                            <Calculator className="w-[15px] h-[15px]" />
                            {calculando ? 'Calculando...' : 'Calcular'}
                        </button>

                        {previa && (
                            <div className="space-y-3 pt-2">
                                <div className="bg-gray-50 rounded-[10px] p-3 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Despesas da competência</span>
                                        <span className="text-gray-800 font-medium">{dinheiro(previa.totalDespesas)}</span>
                                    </div>
                                    <div className="flex justify-between mt-1">
                                        <span className="text-gray-500">Total rateado</span>
                                        <span className="text-gray-800 font-medium">{dinheiro(previa.totalRateado)}</span>
                                    </div>
                                    <div className="text-xs text-gray-400 mt-1">
                                        {previa.despesas.length} lançamento(s) no centro de custo {centro?.code}
                                    </div>
                                </div>

                                {previa.despesas.length === 0 && (
                                    <p className="text-xs text-amber-600 flex items-start gap-1.5">
                                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                        Nenhuma despesa lançada nesta competência para o centro de custo do
                                        condomínio. Lance as despesas no Financeiro apontando para ele.
                                    </p>
                                )}
                                {previa.semDado > 0 && (
                                    <p className="text-xs text-amber-600 flex items-start gap-1.5">
                                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                        {previa.semDado} unidade(s) sem {CRITERIO_EXIGE[form.criterio]} — ficam de fora do rateio.
                                    </p>
                                )}
                                {previa.semResponsavel > 0 && (
                                    <p className="text-xs text-amber-600 flex items-start gap-1.5">
                                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                        {previa.semResponsavel} unidade(s) sem responsável financeiro — a cota é
                                        calculada, mas não há de quem cobrar.
                                    </p>
                                )}

                                <div className="space-y-1.5">
                                    {previa.itens.map(i => (
                                        <div key={i.unitId} className={`flex items-start justify-between gap-3 p-2.5 rounded-[6px] border ${i.valor > 0 ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
                                            <div className="min-w-0">
                                                <div className="text-sm text-gray-800">{i.unitLabel}</div>
                                                <div className="text-xs text-gray-500">
                                                    {i.clientNome}
                                                    {i.aviso ? <span className="text-amber-600"> · {i.aviso}</span> : ''}
                                                </div>
                                            </div>
                                            <span className="text-sm font-medium text-gray-800 shrink-0">{dinheiro(i.valor)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </SheetPanel>
                <SheetFooter>
                    <button onClick={() => setSheetNovo(false)} className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all">Cancelar</button>
                    <button
                        onClick={salvar}
                        disabled={salvando || !previa}
                        className="h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                    >
                        {salvando ? 'Salvando...' : 'Salvar rascunho'}
                    </button>
                </SheetFooter>
            </Sheet>

            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {notification.message}
                </div>
            )}
        </div>
    );
};

export default FinanceiroTab;
