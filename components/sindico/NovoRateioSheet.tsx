import React from 'react';
import { AlertCircle, AlertTriangle, Loader2, Receipt, Users } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import MoneyCentsInput from '../ui/MoneyCentsInput';
import { GhostButton, PrimaryButton, fmtBRLCents } from '../portal/PortalKit';
import { sindicoPortalService, type IdentidadeDoSindico, type UnidadeParaSindico } from '../../services/sindicoPortalService';
import {
    CRITERIOS_DO_RATEIO, motivoNaoSalvaRateio, rotulosDasDespesas,
    type CriterioDoRateio, type PagadorDaCota, type PreviaDoRateio, type TipoDoRateio,
} from '../../utils/rateioDoSindico';
import { rotuloDeDespesa } from '../../utils/despesaCondominio';
import { hojeEmBrasilia } from '../../utils/mandatoSindico';

/**
 * Portal do Síndico › Prestação de contas › Novo rateio (G1, 24/10/2026).
 * O síndico escolhe a competência e o critério; a prévia (despesas e cota de
 * cada unidade) vem do BANCO a cada mudança — o mesmo cálculo que grava ao
 * salvar. Salvo, o rateio fica em rascunho até ele fechar.
 * Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md
 */

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-10 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E1553C]/20 focus:border-[#E1553C]';

const Campo: React.FC<React.PropsWithChildren<{ label: string; dica?: React.ReactNode; htmlFor?: string }>> = ({ label, dica, htmlFor, children }) => (
    <div className="space-y-1.5">
        <label className={ROTULO} htmlFor={htmlFor}>{label}</label>
        {children}
        {dica ? <p className="text-xs text-gray-500 leading-snug">{dica}</p> : null}
    </div>
);

const Secao: React.FC<{ icon: React.ComponentType<{ className?: string }>; titulo: string; direita?: React.ReactNode }> = ({ icon: Icon, titulo, direita }) => (
    <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-[#1F2430]">
            <Icon className="w-4 h-4 text-[#E1553C]" /> {titulo}
        </div>
        {direita}
    </div>
);

interface Props {
    open: boolean;
    identidade: IdentidadeDoSindico;
    condominioId: string | null;
    condominioNome: string;
    /** Unidades do condomínio — só para escolher o GRUPO. */
    unidades: UnidadeParaSindico[];
    /** Motivo de não poder gravar (link sem senha, prévia, condomínio sem org própria). */
    motivoBase: string | null;
    onClose: () => void;
    onSalvo: (mensagem: string) => void;
}

const mesAtual = () => hojeEmBrasilia().slice(0, 7);

const NovoRateioSheet: React.FC<Props> = ({ open, identidade, condominioId, condominioNome, unidades, motivoBase, onClose, onSalvo }) => {
    const [mes, setMes] = React.useState(mesAtual());
    const [tipo, setTipo] = React.useState<TipoDoRateio>('ORDINARIO');
    const [criterio, setCriterio] = React.useState<CriterioDoRateio>('IGUAL');
    const [pagador, setPagador] = React.useState<PagadorDaCota>('RESPONSAVEL');
    const [grupo, setGrupo] = React.useState<string[]>([]);
    const [valorFixoTexto, setValorFixoTexto] = React.useState('');
    const [observacoes, setObservacoes] = React.useState('');

    const [previa, setPrevia] = React.useState<PreviaDoRateio | null>(null);
    const [calculando, setCalculando] = React.useState(false);
    const [erroPrevia, setErroPrevia] = React.useState<string | null>(null);
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    // Abriu: formulário limpo, no mês corrente.
    React.useEffect(() => {
        if (!open) return;
        setMes(mesAtual()); setTipo('ORDINARIO'); setCriterio('IGUAL'); setPagador('RESPONSAVEL');
        setGrupo([]); setValorFixoTexto(''); setObservacoes(''); setPrevia(null); setErro(null); setErroPrevia(null);
    }, [open]);

    // Extraordinário é obra/benfeitoria: por lei, do proprietário. Sugere — não trava.
    React.useEffect(() => { setPagador(tipo === 'EXTRAORDINARIO' ? 'PROPRIETARIO' : 'RESPONSAVEL'); }, [tipo]);

    const valorFixo = valorFixoTexto === '' ? null : Number(valorFixoTexto);
    const competencia = /^\d{4}-\d{2}$/.test(mes) ? `${mes}-01` : null;
    const incompleto = !competencia || (criterio === 'GRUPO' && grupo.length === 0) || (criterio === 'FIXO' && !(Number(valorFixo) > 0));

    // Prévia do banco a cada mudança (com folga para a digitação do valor fixo).
    React.useEffect(() => {
        if (!open || !condominioId || incompleto) { setPrevia(null); return; }
        let vivo = true;
        setCalculando(true);
        setErroPrevia(null);
        const t = window.setTimeout(() => {
            sindicoPortalService.rateioPrevia(identidade, condominioId, { competencia: competencia!, criterio, pagador, grupo, valorFixo })
                .then(p => { if (vivo) setPrevia(p); })
                .catch(e => { if (vivo) { setPrevia(null); setErroPrevia(e instanceof Error ? e.message : 'Não foi possível calcular a prévia.'); } })
                .finally(() => { if (vivo) setCalculando(false); });
        }, 300);
        return () => { vivo = false; window.clearTimeout(t); };
    }, [open, condominioId, identidade, competencia, criterio, pagador, grupo, valorFixo, incompleto]);

    const motivoSalvar = salvando ? 'Salvando…' : calculando ? 'Calculando a prévia…'
        : motivoNaoSalvaRateio({ criterio, grupo, valorFixo }, previa, motivoBase);

    const sujo = criterio !== 'IGUAL' || tipo !== 'ORDINARIO' || grupo.length > 0 || !!valorFixoTexto || !!observacoes.trim() || mes !== mesAtual();

    const salvar = async () => {
        if (!condominioId || !competencia || !previa || motivoSalvar) return;
        setSalvando(true);
        setErro(null);
        try {
            await sindicoPortalService.rateioSalvar(identidade, condominioId, {
                competencia, tipo, criterio, pagador, grupo, valorFixo,
                descricoes: rotulosDasDespesas(previa.despesas), observacoes,
            });
            onSalvo(`Rateio de ${mes.slice(5)}/${mes.slice(0, 4)} salvo em rascunho. Confira e feche quando estiver certo.`);
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível salvar o rateio.');
        } finally {
            setSalvando(false);
        }
    };

    const unidadesDoCondominio = React.useMemo(
        () => unidades.filter(u => u.condominioId === condominioId),
        [unidades, condominioId]);
    const alternarGrupo = (id: string) => setGrupo(g => (g.includes(id) ? g.filter(x => x !== id) : [...g, id]));

    return (
        <Sheet open={open} onClose={onClose} size="xl" dirty={sujo && !salvando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Novo rateio</SheetTitle>
                <SheetDescription>{condominioNome} · as despesas do mês divididas entre as unidades</SheetDescription>
            </SheetHeader>

            <SheetPanel className="p-4 md:p-6">
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                        <Campo label="Competência" htmlFor="rateio-mes">
                            <input id="rateio-mes" type="month" className={CAMPO} value={mes} onChange={e => e.target.value && setMes(e.target.value)} />
                        </Campo>
                        <Campo label="Tipo" htmlFor="rateio-tipo">
                            <select id="rateio-tipo" className={CAMPO} value={tipo} onChange={e => setTipo(e.target.value as TipoDoRateio)}>
                                <option value="ORDINARIO">Ordinário</option>
                                <option value="EXTRAORDINARIO">Extraordinário</option>
                            </select>
                        </Campo>
                        <Campo label="Critério" htmlFor="rateio-criterio">
                            <select id="rateio-criterio" className={CAMPO} value={criterio} onChange={e => setCriterio(e.target.value as CriterioDoRateio)}>
                                {CRITERIOS_DO_RATEIO.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                            </select>
                        </Campo>
                        <Campo label="Cobrar de" htmlFor="rateio-pagador"
                            dica={tipo === 'EXTRAORDINARIO' ? 'Extraordinário (obra, benfeitoria) é obrigação do proprietário.' : undefined}>
                            <select id="rateio-pagador" className={CAMPO} value={pagador} onChange={e => setPagador(e.target.value as PagadorDaCota)}>
                                <option value="RESPONSAVEL">Responsável financeiro</option>
                                <option value="PROPRIETARIO">Proprietário</option>
                            </select>
                        </Campo>
                        {criterio === 'FIXO' && (
                            <Campo label="Valor por unidade (R$)" htmlFor="rateio-fixo">
                                <MoneyCentsInput id="rateio-fixo" value={valorFixoTexto} onChange={setValorFixoTexto} className={CAMPO} />
                            </Campo>
                        )}
                    </div>

                    {criterio === 'GRUPO' && (
                        <div className="space-y-3">
                            <Secao icon={Users} titulo="Unidades do grupo"
                                direita={<span className="text-xs text-gray-500">{grupo.length} de {unidadesDoCondominio.length}</span>} />
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {unidadesDoCondominio.map(u => (
                                    <label key={u.unitId} className="flex items-center gap-2 text-sm text-[#1F2430] cursor-pointer">
                                        <input type="checkbox" checked={grupo.includes(u.unitId)} onChange={() => alternarGrupo(u.unitId)}
                                            className="h-4 w-4 accent-[#E1553C]" />
                                        {[u.torre, u.unidade].filter(Boolean).join(' · ')}
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-3">
                        <Secao icon={Receipt} titulo="Despesas da competência"
                            direita={previa ? <span className="text-sm font-medium text-[#1F2430] tabular-nums">{fmtBRLCents(previa.totalDespesas)}</span> : null} />
                        {calculando && !previa ? (
                            <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Calculando…</p>
                        ) : erroPrevia ? (
                            <p className="text-sm text-red-600 flex items-start gap-1.5"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {erroPrevia}</p>
                        ) : !previa ? (
                            <p className="text-sm text-gray-500">
                                {criterio === 'GRUPO' && grupo.length === 0 ? 'Escolha as unidades do grupo para ver a prévia.'
                                    : criterio === 'FIXO' && !(Number(valorFixo) > 0) ? 'Informe o valor por unidade para ver a prévia.'
                                        : 'Escolha a competência.'}
                            </p>
                        ) : previa.despesas.length === 0 ? (
                            <p className="text-sm text-gray-500">Nenhuma despesa lançada nos centros de custo do condomínio nesta competência.</p>
                        ) : (
                            <ul className="divide-y divide-[#ECECEF] border border-[#ECECEF] rounded-[8px]">
                                {previa.despesas.map(d => (
                                    <li key={d.transaction_id} className="px-4 py-2.5 flex items-start justify-between gap-3 text-sm">
                                        <span className="min-w-0 text-[#1F2430]">{rotuloDeDespesa(d.descricao, d.parte) ?? 'Despesa sem descrição'}</span>
                                        <span className="tabular-nums text-[#1F2430] whitespace-nowrap">{fmtBRLCents(Number(d.valor) || 0)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {previa && previa.jaRateadas > 0 && (
                            <p className="text-xs text-amber-700 flex items-start gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                {previa.jaRateadas} {previa.jaRateadas === 1 ? 'despesa já está' : 'despesas já estão'} em outro rateio e {previa.jaRateadas === 1 ? 'ficou' : 'ficaram'} de fora.
                            </p>
                        )}
                    </div>

                    {previa && previa.itens.length > 0 && (
                        <div className="space-y-3">
                            <Secao icon={Users} titulo="Cota de cada unidade"
                                direita={<span className="text-sm font-medium text-[#1F2430] tabular-nums">{fmtBRLCents(previa.totalRateado)}</span>} />
                            {previa.semResponsavel > 0 && (
                                <p className="text-xs text-amber-700 flex items-start gap-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                    {previa.semResponsavel} {previa.semResponsavel === 1 ? 'unidade está' : 'unidades estão'} sem pagador: a cota entra no rateio, mas não vira cobrança até ter alguém no papel.
                                </p>
                            )}
                            {/* Lista, não tabela: no painel lateral a coluna do valor era cortada (print de 24/10). */}
                            <ul className="divide-y divide-[#ECECEF] border border-[#ECECEF] rounded-[8px]">
                                {previa.itens.map(i => (
                                    <li key={i.unitId} className="px-4 py-2.5 flex items-start justify-between gap-3 text-sm">
                                        <span className="min-w-0">
                                            <span className="block text-[#1F2430]">{i.unitLabel}</span>
                                            <span className={`block text-xs ${i.clientId ? 'text-gray-500' : 'text-amber-700'}`}>{i.clientNome}</span>
                                            {i.aviso && <span className="block text-xs text-gray-500">{i.aviso}</span>}
                                        </span>
                                        <span className="tabular-nums text-[#1F2430] whitespace-nowrap">{fmtBRLCents(Number(i.valor) || 0)}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <Campo label="Observações" htmlFor="rateio-obs">
                        <textarea id="rateio-obs" rows={3} value={observacoes} maxLength={1000}
                            onChange={e => setObservacoes(e.target.value)}
                            placeholder="Ex.: inclui a manutenção anual do elevador."
                            className={`${CAMPO} h-auto py-2`} />
                    </Campo>
                </div>
            </SheetPanel>

            <SheetFooter>
                <div className="flex items-center justify-end gap-3 w-full">
                    {erro ? (
                        <p className="mr-auto flex items-center gap-1.5 text-sm text-red-600"><AlertCircle className="w-4 h-4 shrink-0" /> {erro}</p>
                    ) : previa && previa.totalRateado > 0 ? (
                        <p className="mr-auto text-sm text-gray-500">{previa.itens.filter(i => i.valor > 0).length} cotas · {fmtBRLCents(previa.totalRateado)}</p>
                    ) : null}
                    <GhostButton onClick={onClose}>Cancelar</GhostButton>
                    <span title={motivoSalvar ?? undefined}>
                        <PrimaryButton onClick={salvar} disabled={!!motivoSalvar} className={motivoSalvar ? 'pointer-events-none' : ''}>
                            {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
                            Salvar rascunho
                        </PrimaryButton>
                    </span>
                </div>
            </SheetFooter>
        </Sheet>
    );
};

export default NovoRateioSheet;
