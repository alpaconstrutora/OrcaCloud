import React from 'react';
import { AlertTriangle, Link2, Plus, X } from 'lucide-react';
import type { ProjectRisk, RiskLink, RiskModuloVinculo, RiskSinal } from '../../types/risk';
import { RISK_MODULOS_VINCULO, ROTULO_MODULO_VINCULO } from '../../types/risk';
import { riskService } from '../../services/riskService';
import { errorMessage } from '../../hooks/useOrgContext';
import { useToast } from '../../hooks/useToast';
import { useStore } from '../../store/useStore';
import { resolverPlanejamentoDoDiario } from '../../utils/diaryPlanningLink';
import { isPlanejamento } from '../../utils/projectClassification';
import { ehVinculoDuplicado, MENSAGEM_VINCULO_DUPLICADO, ROTULO_DATA_DO_MODULO, type ObjetoVinculavel } from '../../utils/riskVinculos';
import { useConfirm } from '../ui/confirm';
import ActionIconButton from '../ui/ActionIconButton';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import { formatDateBR } from '../ui/Format';
import { SecaoTitulo } from '../ui/SecaoTitulo';
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO, ROTULO } from './riscosUi';

/**
 * Aba Vínculos da ficha (F2.2 + F2.5 de docs/planos/2026-11-13-modulo-riscos.md).
 *
 * Lista o que está ligado ao risco (contrato, pedido, NC, documento, tarefa do
 * cronograma) e o SINAL atual de cada vínculo — calculado no banco por
 * `fn_risk_sinais` a partir do objeto de origem (contrato vencendo, pedido atrasado…).
 *
 * "Vincular" abre o seletor DENTRO da aba (proibido drawer aninhado, UI_PATTERNS §4.4):
 * escolhe o módulo e depois o objeto, sempre da organização DO RISCO e, quando o risco é
 * de obra, da MESMA obra. A busca do seletor é transitória (§3.1 do guia: filtra o
 * seletor, não a lista da tela, e zera ao fechar).
 */
interface Props {
    risco: ProjectRisk;
    vinculos: RiskLink[];
    carregando: boolean;
    erro: string | null;
    onTentarDeNovo: () => void;
    /** Sinais DESTE risco (`fn_risk_sinais` filtrado). */
    sinais: RiskSinal[];
    podeEditar: boolean;
    motivoSemEdicao: string;
    onVinculos: (lista: RiskLink[]) => void;
    /** Recalcular os sinais depois de vincular/desvincular (o sinal é do banco). */
    onAtualizarSinais: () => void;
}

export const COR_GRAVIDADE: Record<RiskSinal['gravidade'], string> = { alta: 'text-red-700', media: 'text-amber-700' };

const COLS_VINCULOS: StandardTableColumn[] = [
    { key: 'rotulo', label: 'Vínculo', sortable: true, width: 260 },
    { key: 'modulo', label: 'Módulo', sortable: true, width: 150 },
    { key: 'sinal', label: 'Sinal', sortable: true, width: 220 },
];

/** O sinal de um vínculo como texto colorido (§8). Vários sinais no mesmo objeto: um por linha. */
const SinalTexto: React.FC<{ sinais: RiskSinal[] }> = ({ sinais }) => {
    if (!sinais.length) return <span className="text-sm font-normal text-gray-600">Sem sinal</span>;
    return (
        <span className="flex flex-col">
            {sinais.map((s, i) => (
                <span key={i} className={`inline-flex items-center gap-1 text-sm font-normal ${COR_GRAVIDADE[s.gravidade]}`}
                    title={s.gravidade === 'alta' ? 'Gravidade alta' : 'Gravidade média'}>
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    {s.sinal}
                </span>
            ))}
        </span>
    );
};

export const RiscoVinculos: React.FC<Props> = ({
    risco, vinculos, carregando, erro, onTentarDeNovo, sinais, podeEditar, motivoSemEdicao, onVinculos, onAtualizarSinais,
}) => {
    const { showToast } = useToast();
    const confirm = useConfirm();
    const allProjects = useStore(s => s.allProjects);

    const [escolhendo, setEscolhendo] = React.useState(false);
    const [modulo, setModulo] = React.useState<RiskModuloVinculo | ''>('');
    const [objetos, setObjetos] = React.useState<ObjetoVinculavel[]>([]);
    const [carregandoObjetos, setCarregandoObjetos] = React.useState(false);
    const [erroObjetos, setErroObjetos] = React.useState<string | null>(null);
    // §3.1: busca de seletor é transitória — zera ao fechar o seletor, nunca vai para o localStorage.
    const [busca, setBusca] = React.useState('');
    const [gravando, setGravando] = React.useState<string | null>(null);

    // A obra do risco restringe todos os módulos; sem obra, só a organização.
    const obraId = risco.escopo === 'obra' ? risco.project_id : null;
    // Cronograma = planejamento da obra, pelo mesmo caminho do Diário (obra → orçamento → planejamento).
    const planejamentoId = React.useMemo(() => {
        if (!obraId) return null;
        // `allProjects` (os quatro tipos) de propósito: o planejamento NÃO está em `projects` (só obras, REGRA #3).
        const projetos = allProjects.filter(p => !!p.id).map(p => ({ id: p.id as string, settings: p.settings }));
        const id = resolverPlanejamentoDoDiario(obraId, projetos);
        return id && isPlanejamento(projetos.find(p => p.id === id)) ? id : null;
    }, [obraId, allProjects]);
    const motivoSemCronograma = !obraId
        ? 'Tarefa do cronograma só se vincula a risco de obra (o cronograma é da obra).'
        : !planejamentoId ? 'Esta obra não tem planejamento ligado (Engenharia › Planejamento), então não há tarefa para vincular.' : null;

    const porLink = React.useMemo(() => {
        const m = new Map<string, RiskSinal[]>();
        for (const s of sinais) m.set(s.link_id, [...(m.get(s.link_id) ?? []), s]);
        return m;
    }, [sinais]);
    const jaVinculados = React.useMemo(() => new Set(vinculos.map(v => `${v.modulo}:${v.external_id}`)), [vinculos]);

    const seqCarga = React.useRef(0);
    const carregarObjetos = React.useCallback(async (m: RiskModuloVinculo) => {
        const minha = ++seqCarga.current;
        setCarregandoObjetos(true);
        setErroObjetos(null);
        setObjetos([]);
        try {
            const org = risco.organization_id;
            const lista = m === 'contrato' ? await riskService.listarContratosVinculaveis(org, obraId)
                : m === 'pedido_compra' ? await riskService.listarPedidosVinculaveis(org, obraId)
                : m === 'nao_conformidade' ? await riskService.listarNaoConformidadesVinculaveis(org, obraId)
                : m === 'documento' ? await riskService.listarDocumentosVinculaveis(org, obraId)
                : planejamentoId ? await riskService.listarTarefasVinculaveis(planejamentoId) : [];
            if (minha === seqCarga.current) setObjetos(lista);
        } catch (e) {
            if (minha === seqCarga.current) setErroObjetos(errorMessage(e, 'erro desconhecido'));
        } finally {
            if (minha === seqCarga.current) setCarregandoObjetos(false);
        }
    }, [risco.organization_id, obraId, planejamentoId]);

    const escolherModulo = (m: RiskModuloVinculo | '') => {
        setModulo(m);
        setBusca('');
        if (m) void carregarObjetos(m);
        else { seqCarga.current++; setObjetos([]); setErroObjetos(null); }
    };

    const fecharSeletor = () => { seqCarga.current++; setEscolhendo(false); setModulo(''); setObjetos([]); setBusca(''); setErroObjetos(null); };

    const vincular = async (o: ObjetoVinculavel) => {
        if (jaVinculados.has(`${o.modulo}:${o.id}`)) { showToast(MENSAGEM_VINCULO_DUPLICADO, 'error'); return; }
        setGravando(o.id);
        try {
            const link = await riskService.vincular(risco, { modulo: o.modulo, externalId: o.id, externalRef: o.ref, rotulo: o.rotulo });
            onVinculos([...vinculos, link]);
            onAtualizarSinais();
            showToast(`Vinculado: ${o.rotulo}.`);
        } catch (e) {
            showToast(ehVinculoDuplicado(e) ? MENSAGEM_VINCULO_DUPLICADO : errorMessage(e, 'Não foi possível vincular.'), 'error');
        } finally {
            setGravando(null);
        }
    };

    const desvincular = async (l: RiskLink) => {
        const ok = await confirm({
            title: 'Desvincular?',
            message: `"${l.external_label ?? ROTULO_MODULO_VINCULO[l.modulo]}" deixa de ser acompanhado por ${risco.codigo} e os sinais dele somem deste risco. O objeto de origem não muda, e o vínculo desfeito fica no histórico.`,
            variant: 'warning',
            confirmLabel: 'Desvincular',
        });
        if (!ok) return;
        try {
            await riskService.desvincular(risco, l);
            onVinculos(vinculos.filter(v => v.id !== l.id));
            onAtualizarSinais();
            showToast('Vínculo desfeito.');
        } catch (e) {
            showToast(errorMessage(e, 'Não foi possível desvincular.'), 'error');
        }
    };

    const colsObjetos = React.useMemo<StandardTableColumn[]>(() => [
        { key: 'rotulo', label: 'Objeto', sortable: true, width: 280 },
        { key: 'situacao', label: 'Situação', sortable: true, width: 170 },
        { key: 'data', label: modulo ? ROTULO_DATA_DO_MODULO[modulo] : 'Data', sortable: true, width: 130 },
    ], [modulo]);

    if (escolhendo) {
        return (
            <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                <SecaoTitulo icon={Link2} titulo="Vincular a este risco"
                    resumo={obraId ? 'só objetos da obra do risco' : 'só objetos da organização do risco'} />
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <div className="space-y-1.5">
                        <label className={ROTULO} htmlFor="rv-modulo">Módulo</label>
                        <select id="rv-modulo" className={CAMPO} value={modulo} onChange={e => escolherModulo(e.target.value as RiskModuloVinculo | '')}>
                            <option value="">Escolha o módulo…</option>
                            {RISK_MODULOS_VINCULO.map(m => (
                                <option key={m} value={m} disabled={m === 'cronograma' && !!motivoSemCronograma}>
                                    {ROTULO_MODULO_VINCULO[m]}{m === 'cronograma' && motivoSemCronograma ? ' (indisponível)' : ''}
                                </option>
                            ))}
                        </select>
                        {motivoSemCronograma && <p className="text-xs text-gray-600">Tarefa do cronograma: {motivoSemCronograma}</p>}
                    </div>
                </div>

                {modulo && erroObjetos && (
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-red-50 border border-red-100 rounded-[10px] px-4 py-3 text-sm text-red-700">
                        <span>Não foi possível carregar: {erroObjetos}</span>
                        <button type="button" onClick={() => void carregarObjetos(modulo)} className="font-medium text-red-700 underline">Tentar de novo</button>
                    </div>
                )}

                {modulo && !erroObjetos && (
                    <StandardTable<ObjetoVinculavel>
                        storageKey={`riscos:ficha:vincular:${modulo}`}
                        columns={colsObjetos}
                        rows={objetos}
                        rowKey={o => o.id}
                        loading={carregandoObjetos}
                        dense
                        maxHeight="50vh"
                        search={busca}
                        onSearchChange={setBusca}
                        searchText={o => `${o.rotulo} ${o.situacao ?? ''}`}
                        searchPlaceholder={`Buscar ${ROTULO_MODULO_VINCULO[modulo].toLowerCase()}...`}
                        sortValue={(k, o) => (k === 'situacao' ? o.situacao ?? '' : k === 'data' ? o.data ?? '' : o.rotulo)}
                        onRowClick={o => { if (!jaVinculados.has(`${o.modulo}:${o.id}`) && !gravando) void vincular(o); }}
                        rowLabel={o => `${o.rotulo}. Vincular a ${risco.codigo}`}
                        renderCell={(k, o) => {
                            switch (k) {
                                case 'rotulo': return <span className="block truncate text-sm font-normal text-gray-700" title={o.rotulo}>{o.rotulo}</span>;
                                case 'situacao': return <span className="block truncate text-sm font-normal text-gray-600" title={o.situacao ?? undefined}>{o.situacao || '—'}</span>;
                                case 'data': return <span className="text-sm font-normal text-gray-600">{o.data ? formatDateBR(o.data) : '—'}</span>;
                                default: return null;
                            }
                        }}
                        actions={{
                            width: 120,
                            render: o => jaVinculados.has(`${o.modulo}:${o.id}`)
                                ? <span className="text-sm font-normal text-gray-600">Já vinculado</span>
                                : (
                                    // O `disabled` engole o `title`: o motivo vai no <span> em volta.
                                    <span className="inline-flex" title={gravando && gravando !== o.id ? 'Aguarde: gravando o vínculo anterior.' : undefined}>
                                        <button type="button" disabled={!!gravando} onClick={e => { e.stopPropagation(); void vincular(o); }}
                                            className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all disabled:opacity-50">
                                            {gravando === o.id ? 'Vinculando…' : 'Vincular'}
                                        </button>
                                    </span>
                                ),
                        }}
                        empty={{
                            icon: <Link2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                            title: `Nada encontrado em ${ROTULO_MODULO_VINCULO[modulo].toLowerCase()}`,
                            subtitle: obraId ? 'A lista mostra só os da obra deste risco.' : 'A lista mostra só os da organização deste risco.',
                        }}
                    />
                )}

                <div className="flex items-center justify-end gap-2">
                    <button type="button" onClick={fecharSeletor} className={BOTAO_SECUNDARIO}>
                        <X className="w-[15px] h-[15px]" /> Concluir
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex" title={podeEditar ? undefined : motivoSemEdicao}>
                    <button type="button" onClick={() => setEscolhendo(true)} disabled={!podeEditar} className={BOTAO_PRIMARIO}>
                        <Plus className="w-[15px] h-[15px]" /> Vincular
                    </button>
                </span>
                {!podeEditar && <p className="text-xs text-gray-600">{motivoSemEdicao}</p>}
            </div>
            <p className="text-sm text-gray-600">
                O sinal vem do objeto vinculado: contrato vencido ou vencendo em 30 dias, pedido com entrega atrasada, NC vencida ou grave,
                documento vencido ou vencendo, tarefa atrasada ou do caminho crítico em aberto. Com sinal, o dono do risco recebe um aviso por dia.
            </p>

            {erro ? (
                <div className="flex flex-wrap items-center justify-between gap-3 bg-red-50 border border-red-100 rounded-[10px] px-4 py-3 text-sm text-red-700">
                    <span>Não foi possível carregar os vínculos: {erro}</span>
                    <button type="button" onClick={onTentarDeNovo} className="font-medium text-red-700 underline">Tentar de novo</button>
                </div>
            ) : (
                <StandardTable<RiskLink>
                    storageKey="riscos:ficha:vinculos"
                    columns={COLS_VINCULOS}
                    rows={vinculos}
                    rowKey={l => l.id}
                    loading={carregando}
                    dense
                    // Sem busca de propósito: são os poucos objetos ligados a UM risco.
                    defaultSort={{ column: 'modulo', direction: 'asc' }}
                    sortValue={(k, l) => {
                        if (k === 'modulo') return ROTULO_MODULO_VINCULO[l.modulo];
                        if (k === 'sinal') { const s = porLink.get(l.id) ?? []; return s.some(x => x.gravidade === 'alta') ? 2 : s.length ? 1 : 0; }
                        return l.external_label ?? '';
                    }}
                    renderCell={(k, l) => {
                        switch (k) {
                            case 'rotulo': { const t = l.external_label ?? l.external_id; return <span className="block truncate text-sm font-normal text-gray-700" title={t}>{t}</span>; }
                            case 'modulo': return <span className="text-sm font-normal text-gray-700">{ROTULO_MODULO_VINCULO[l.modulo]}</span>;
                            case 'sinal': return <SinalTexto sinais={porLink.get(l.id) ?? []} />;
                            default: return null;
                        }
                    }}
                    actions={podeEditar ? {
                        width: 90,
                        render: l => <ActionIconButton kind="delete" size="sm" title="Desvincular" onClick={() => void desvincular(l)} />,
                    } : undefined}
                    empty={{
                        icon: <Link2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                        title: 'Nenhum vínculo',
                        subtitle: 'Vincule o contrato, o pedido, a NC, o documento ou a tarefa que este risco acompanha.',
                    }}
                />
            )}
        </div>
    );
};

export default RiscoVinculos;
