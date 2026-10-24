import React from 'react';
import { AlertTriangle, CalendarClock, Plus } from 'lucide-react';
import {
    CardHeader, KpiStrip, PortalCard, PortalLoading, PortalTabs, PrimaryButton, fmtBRLCents, fmtDate, type KpiItem,
} from '../portal/PortalKit';
import { PainelFinanceiro } from '../client/CondominioTab';
import { usePersistedState } from '../ui/TableUtils';
import PainelRateiosDoSindico from './PainelRateiosDoSindico';
import TabelaTitulosDoSindico from './TabelaTitulosDoSindico';
import LancarContaSheet from './LancarContaSheet';
import { BaixaDoTituloSheet, CancelarTituloSheet } from './BaixaDoTituloSheet';
import {
    sindicoPortalService, type DocumentoDoTitulo, type FinanceiroDoSindico, type IdentidadeDoSindico, type PortalSindico,
} from '../../services/sindicoPortalService';
import type { PortalCondominio } from '../../services/clientPortalService';
import {
    SINDICO_FINANCEIRO_SUBABA_IDS, SINDICO_FINANCEIRO_SUBABA_LABELS, resolverSubAbaDoFinanceiro,
} from '../../utils/sindicoPortalTabs';
import {
    MOTIVO_PREVIA, MOTIVO_SEM_LOGIN, condominioDoFinanceiro, doCondominio, inicioDaCompetencia, motivoNaoOpera,
    resumoDoMes, situacaoDoTitulo, type TituloDoCondominio,
} from '../../utils/financeiroDoSindico';
import { rotuloDeDespesa } from '../../utils/despesaCondominio';
import { hojeEmBrasilia } from '../../utils/mandatoSindico';

/**
 * Portal do Síndico › Financeiro do condomínio (24/10/2026).
 * Pedido: "O sindico sera o gestor do condomínio, entao no portal dele deve estar
 * disponivel o Financeiro relativo ao condomínio".
 * Plano: docs/planos/2026-10-24-portal-sindico-financeiro.md
 *
 * Quatro sub-abas: Resumo do mês · Contas a pagar · Contas a receber ·
 * Prestação de contas (o síndico monta, fecha e gera as cotas do rateio — G1,
 * `PainelRateiosDoSindico`). Os títulos são os dos CENTROS DE CUSTO do condomínio
 * (`sindico_portal_financeiro`), o mesmo recorte da aba Despesas do admin.
 *
 * Operar (lançar, pagar, editar, cancelar, cadastrar fornecedor) exige LOGIN:
 * pelo link e na prévia do admin os botões ficam desligados dizendo o motivo, e
 * o banco recusa do mesmo jeito. Condomínio sem organização própria (007) só
 * consulta.
 *
 * Síndico de mais de um prédio vê UM condomínio por vez (seletor ao lado do
 * mês): somados, os KPIs e a lista do 007 traziam as contas do 010.
 */

interface Props {
    identidade: IdentidadeDoSindico;
    dados: PortalSindico;
    somenteLeitura: boolean;
    /** Entrou com e-mail e senha (só aí `onLogout` existe). */
    logado: boolean;
    notify: (m: string, t?: 'success' | 'error') => void;
    /** Recarrega o payload do portal (a prestação de contas mora nele). */
    onAlteradoPortal: () => void;
    resolverComprovantes: (rateioId: string) => Promise<{ despesaId: string; url: string; nome: string }[]>;
}

const mesAtual = () => hojeEmBrasilia().slice(0, 7);

const CAMPO_DO_TOPO = 'h-9 px-3 bg-white border border-[#ECECEF] rounded-[8px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#E1553C]/20 focus:border-[#E1553C]';

function rotuloDoMes(mes: string): string {
    const [a, m] = mes.split('-').map(Number);
    if (!a || !m) return mes;
    const nome = new Date(a, m - 1, 15).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return nome.charAt(0).toUpperCase() + nome.slice(1);
}

const PainelFinanceiroDoSindico: React.FC<Props> = ({
    identidade, dados, somenteLeitura, logado, notify, onAlteradoPortal, resolverComprovantes,
}) => {
    const [subAbaSalva, setSubAba] = usePersistedState<string>('sindicoPortal:financeiro:subaba', 'resumo');
    const subAba = resolverSubAbaDoFinanceiro(subAbaSalva);
    const [mes, setMes] = usePersistedState<string>('sindicoPortal:financeiro:mes', mesAtual());
    const competencia = /^\d{4}-\d{2}$/.test(mes) ? mes : mesAtual();
    const [condominioSalvo, setCondominio] = usePersistedState<string>('sindicoPortal:financeiro:condominio', '');
    const condominioId = condominioDoFinanceiro(condominioSalvo, dados.condominios);
    const variosPredios = dados.condominios.length > 1;

    const [fin, setFin] = React.useState<FinanceiroDoSindico | null>(null);
    const [carregando, setCarregando] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);
    const [documentos, setDocumentos] = React.useState<Record<string, DocumentoDoTitulo>>({});
    const [abrindoDoc, setAbrindoDoc] = React.useState<string | null>(null);
    const [versao, setVersao] = React.useState(0);

    const [lancando, setLancando] = React.useState(false);
    const [editando, setEditando] = React.useState<TituloDoCondominio | null>(null);
    const [baixando, setBaixando] = React.useState<TituloDoCondominio | null>(null);
    const [cancelando, setCancelando] = React.useState<TituloDoCondominio | null>(null);

    // Também na Prestação: é daqui que vem se o condomínio pode gravar pelo
    // portal (organização própria), e o rateio (G1) grava.
    React.useEffect(() => {
        let vivo = true;
        setCarregando(true);
        setErro(null);
        sindicoPortalService.getFinanceiro(identidade, inicioDaCompetencia(competencia))
            .then(f => {
                if (!vivo) return;
                setFin(f);
                // Código e arquivo de origem: segunda chamada, best-effort — sem ela
                // a lista continua, só sem a coluna Documento.
                sindicoPortalService.documentosDosTitulos(identidade, f.titulos.map(t => t.id).slice(0, 500))
                    .then(d => { if (vivo) setDocumentos(d); })
                    .catch(() => { if (vivo) setDocumentos({}); });
            })
            .catch(e => { if (vivo) { setErro(e instanceof Error ? e.message : 'Não foi possível carregar o financeiro.'); setFin(null); } })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [identidade, competencia, versao]);

    const hoje = fin?.hoje ?? hojeEmBrasilia();
    const titulos = React.useMemo(() => doCondominio(fin?.titulos ?? [], condominioId), [fin, condominioId]);
    const pagar = React.useMemo(() => titulos.filter(t => t.direcao === 'DEBIT'), [titulos]);
    const receber = React.useMemo(() => titulos.filter(t => t.direcao === 'CREDIT'), [titulos]);
    const condominiosDaTela = React.useMemo(() => (fin?.condominios ?? []).filter(c => c.id === condominioId), [fin, condominioId]);
    const nomeDoCondominio = React.useMemo(() => new Map(condominiosDaTela.map(c => [c.id, c.nome])), [condominiosDaTela]);
    const operaveis = React.useMemo(() => condominiosDaTela.filter(c => c.podeOperar), [condominiosDaTela]);
    const rateios = React.useMemo(() => doCondominio(dados.rateios, condominioId), [dados.rateios, condominioId]);

    const motivoDoCondominio = React.useCallback((id: string) => motivoNaoOpera({
        somenteLeitura, logado,
        motivoDoCondominio: fin?.condominios.find(c => c.id === id)?.motivoNaoOpera ?? null,
    }), [somenteLeitura, logado, fin]);

    const motivoLancar = somenteLeitura ? MOTIVO_PREVIA
        : !logado ? MOTIVO_SEM_LOGIN
            : operaveis.length === 0 ? (condominiosDaTela[0]?.motivoNaoOpera ?? 'Nenhum condomínio disponível para lançar.')
                : null;

    const depoisDeGravar = (mensagem: string) => {
        setLancando(false); setEditando(null); setBaixando(null); setCancelando(null);
        notify(mensagem);
        setVersao(v => v + 1);
    };

    const abrirDocumento = async (t: TituloDoCondominio) => {
        setAbrindoDoc(t.id);
        // A aba nova abre ANTES do await (depois dele o navegador trata como
        // popup). Sem `noopener` aqui porque com ele `window.open` devolve null;
        // o `opener` é cortado à mão logo em seguida.
        const janela = window.open('', '_blank');
        if (janela) janela.opener = null;
        try {
            const url = await sindicoPortalService.abrirDocumentoDoTitulo(identidade, t.id);
            if (janela) janela.location.href = url; else window.open(url, '_blank', 'noopener');
        } catch (e) {
            janela?.close();
            notify(e instanceof Error ? e.message : 'Não foi possível abrir o documento.', 'error');
        } finally {
            setAbrindoDoc(null);
        }
    };

    const botaoLancar = (
        <span title={motivoLancar ?? undefined}>
            <PrimaryButton onClick={() => setLancando(true)} disabled={!!motivoLancar} className={motivoLancar ? 'pointer-events-none' : ''}>
                <Plus className="w-4 h-4" /> Lançar conta
            </PrimaryButton>
        </span>
    );

    return (
        <>
            <PortalCard className="overflow-hidden">
                {/* No celular, abas e mês EMPILHADOS: na mesma linha a aba ativa
                    ficava fora da tela (print de 24/10). */}
                <div className="flex flex-col md:flex-row md:items-end md:justify-between md:gap-3 md:pr-4">
                    <div className="flex-1 min-w-0">
                        <PortalTabs
                            tabs={SINDICO_FINANCEIRO_SUBABA_IDS.map(id => ({ id, label: SINDICO_FINANCEIRO_SUBABA_LABELS[id] }))}
                            active={subAba}
                            onChange={setSubAba}
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:px-0 md:py-2">
                        {variosPredios && (
                            <label className="flex items-center gap-2 text-[13px] text-[#8A8F9A] min-w-0">
                                Condomínio
                                <select
                                    value={condominioId ?? ''}
                                    onChange={e => setCondominio(e.target.value)}
                                    className={`${CAMPO_DO_TOPO} min-w-0 max-w-[16rem]`}
                                >
                                    {dados.condominios.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                                </select>
                            </label>
                        )}
                        {subAba !== 'prestacao' && (
                            <label className="flex items-center gap-2 text-[13px] text-[#8A8F9A]">
                                Mês
                                <input
                                    type="month"
                                    value={competencia}
                                    onChange={e => e.target.value && setMes(e.target.value)}
                                    className={CAMPO_DO_TOPO}
                                />
                            </label>
                        )}
                    </div>
                </div>
            </PortalCard>

            {subAba === 'prestacao' ? (
                <>
                    {/* Gravar exige LOGIN: `logado` só é verdadeiro na entrada por e-mail e senha. */}
                    <PainelRateiosDoSindico
                        identidade={identidade}
                        rateios={rateios}
                        condominio={dados.condominios.find(c => c.id === condominioId) ?? null}
                        unidades={dados.unidades}
                        motivoBase={condominioId
                            ? motivoNaoOpera({
                                somenteLeitura, logado,
                                motivoDoCondominio: fin ? (condominiosDaTela[0]?.motivoNaoOpera ?? null) : 'Carregando o condomínio…',
                            })
                            : 'Nenhum condomínio no seu mandato.'}
                        onAlterado={onAlteradoPortal}
                        notify={notify}
                    />
                    <PortalCard className="p-4 md:p-6">
                        <PainelFinanceiro
                            rateios={rateios as unknown as PortalCondominio['rateios']}
                            multi={false}
                            onResolverComprovantes={resolverComprovantes}
                            visaoDoSindico
                        />
                    </PortalCard>
                </>
            ) : carregando && !fin ? (
                <PortalCard><PortalLoading label="Carregando o financeiro..." /></PortalCard>
            ) : erro ? (
                <PortalCard className="px-5 py-4 flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-[#4A505C]">{erro}</p>
                </PortalCard>
            ) : (
                <>
                    {condominiosDaTela.some(c => !c.podeOperar) && !somenteLeitura && (
                        <PortalCard className="px-5 py-3 text-[13px] text-[#4A505C]">
                            {condominiosDaTela.filter(c => !c.podeOperar).map(c => (
                                <p key={c.id}><strong className="font-semibold text-[#1F2430]">{c.nome}:</strong> {c.motivoNaoOpera}</p>
                            ))}
                        </PortalCard>
                    )}
                    {subAba === 'resumo' && (
                        <ResumoDoMes titulos={titulos} competencia={competencia} hoje={hoje}
                            onIr={setSubAba} direita={botaoLancar} />
                    )}
                    {subAba === 'pagar' && (
                        <TabelaTitulosDoSindico
                            tipo="pagar" titulos={pagar} hoje={hoje} competenciaRotulo={rotuloDoMes(competencia).toLowerCase()}
                            documentos={documentos} nomeDoCondominio={nomeDoCondominio}
                            abrindoDocumento={abrindoDoc} onAbrirDocumento={abrirDocumento}
                            direita={botaoLancar}
                            acoes={{
                                motivoDoCondominio,
                                onBaixar: setBaixando,
                                onEditar: setEditando,
                                onCancelar: setCancelando,
                            }}
                        />
                    )}
                    {subAba === 'receber' && (
                        <TabelaTitulosDoSindico
                            tipo="receber" titulos={receber} hoje={hoje} competenciaRotulo={rotuloDoMes(competencia).toLowerCase()}
                            documentos={documentos} nomeDoCondominio={nomeDoCondominio}
                            abrindoDocumento={abrindoDoc} onAbrirDocumento={abrirDocumento}
                        />
                    )}
                </>
            )}

            {fin && (
                <>
                    <LancarContaSheet
                        open={lancando || !!editando}
                        identidade={identidade}
                        condominios={editando ? fin.condominios.filter(c => c.id === editando.condominioId) : operaveis}                        titulo={editando}
                        onClose={() => { setLancando(false); setEditando(null); }}
                        onSalvo={depoisDeGravar}
                    />
                    <BaixaDoTituloSheet
                        titulo={baixando}
                        identidade={identidade}
                        condominio={fin.condominios.find(c => c.id === baixando?.condominioId) ?? null}
                        onClose={() => setBaixando(null)}
                        onSalvo={depoisDeGravar}
                    />
                    <CancelarTituloSheet
                        titulo={cancelando}
                        identidade={identidade}
                        onClose={() => setCancelando(null)}
                        onSalvo={depoisDeGravar}
                    />
                </>
            )}
        </>
    );
};

// ── Resumo do mês ───────────────────────────────────────────────────────────
const ResumoDoMes: React.FC<{
    titulos: TituloDoCondominio[];
    competencia: string;
    hoje: string;
    onIr: (subAba: string) => void;
    direita: React.ReactNode;
}> = ({ titulos, competencia, hoje, onIr, direita }) => {
    const r = resumoDoMes(titulos, competencia, hoje);
    const kpis: KpiItem[] = [
        { label: 'Pago no mês', value: fmtBRLCents(r.pagoNoMes), onClick: () => onIr('pagar') },
        { label: 'A pagar no mês', value: fmtBRLCents(r.aPagarNoMes), onClick: () => onIr('pagar') },
        // Sem `delta` nos dois de atraso: o selo divide a linha com o valor e
        // cortava "R$ 14.95…" no print de 24/10. O "de quando" vai na dica.
        { label: 'Contas em atraso', value: fmtBRLCents(r.vencidoAPagar), hint: 'a pagar, vencidas de qualquer mês', onClick: () => onIr('pagar') },
        { label: 'Recebido no mês', value: fmtBRLCents(r.recebidoNoMes), hint: `${fmtBRLCents(r.aReceberNoMes)} a receber`, onClick: () => onIr('receber') },
        { label: 'Inadimplência', value: fmtBRLCents(r.inadimplencia), hint: 'a receber, vencidas de qualquer mês', onClick: () => onIr('receber') },
    ];
    const abertas = titulos
        .filter(t => t.direcao === 'DEBIT')
        .map(t => ({ t, s: situacaoDoTitulo(t, hoje) }))
        .filter(x => x.s === 'EM_ABERTO' || x.s === 'VENCIDO')
        .sort((a, b) => a.t.vencimento.localeCompare(b.t.vencimento));

    return (
        <>
            <KpiStrip items={kpis} />
            <PortalCard>
                <CardHeader
                    title="Contas a pagar em aberto"
                    subtitle={abertas.length === 0 ? 'Nada em aberto neste mês' : `${abertas.length} ${abertas.length === 1 ? 'conta' : 'contas'}, as em atraso primeiro`}
                    right={direita}
                />
                <ul className="px-5 pb-4 space-y-2">
                    {abertas.slice(0, 8).map(({ t, s }) => (
                        <li key={t.id} className="text-sm flex items-start justify-between gap-3">
                            <span className="min-w-0">
                                <span className="block truncate text-[#1F2430]">{rotuloDeDespesa(t.descricao, t.credor) ?? 'Despesa sem descrição'}</span>
                                <span className={`block text-xs ${s === 'VENCIDO' ? 'text-[#C24428]' : 'text-gray-400'}`}>
                                    <CalendarClock className="w-3 h-3 inline -mt-0.5 mr-1" />
                                    {s === 'VENCIDO' ? 'venceu em ' : 'vence em '}{fmtDate(t.vencimento)}
                                </span>
                            </span>
                            <span className="text-sm font-medium text-[#1F2430] tabular-nums whitespace-nowrap">{fmtBRLCents(Number(t.valor) || 0)}</span>
                        </li>
                    ))}
                    {abertas.length > 8 && (
                        <li><button type="button" onClick={() => onIr('pagar')} className="text-[13px] font-medium text-[#C24428] hover:text-[#E1553C]">Ver todas em Contas a pagar</button></li>
                    )}
                </ul>
            </PortalCard>
        </>
    );
};

export default PainelFinanceiroDoSindico;
