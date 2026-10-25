import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, FileUp, Landmark, Link2, Loader2, Search } from 'lucide-react';
import {
    CardHeader, GhostButton, KpiStrip, PortalCard, PortalEmpty, PortalLoading, PrimaryButton, StatusPill, Td, TextLinkButton, Th,
    fmtBRLCents, fmtDate, type KpiItem, type PillTone,
} from '../portal/PortalKit';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import CostCenterSelect from '../CostCenterSelect';
import HierarchicalSelect from '../HierarchicalSelect';
import { sindicoPortalService, type CondominioDoFinanceiro, type IdentidadeDoSindico } from '../../services/sindicoPortalService';
import type { ContaDoCondominio } from '../../utils/financeiroDoSindico';
import {
    ROTULO_SITUACAO_DO_MOVIMENTO, motivoNaoConciliaMovimento, motivoNaoIgnoraMovimento, resumoDoExtrato, situacaoDoMovimento,
    type CandidatoDoMovimento, type MovimentoDoExtrato, type SituacaoDoMovimento,
} from '../../utils/extratoDoSindico';

/**
 * Portal do Síndico › Financeiro › Extrato e conciliação (G2b, 25/10/2026).
 * O síndico importa o extrato da conta do condomínio (OFX, CSV, planilha — o
 * mesmo leitor do admin) e casa cada movimento com o título: o título fica
 * conciliado com a conta e a data REAIS do banco. Movimento sem título (tarifa)
 * vira lançamento já conciliado; o que não é do condomínio fica "ignorado",
 * com o motivo. Tudo passa pelas RPCs `sindico_portal_extrato_*`, que chamam
 * por dentro as mesmas funções de conciliação do admin.
 * Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md
 */

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-10 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E1553C]/20 focus:border-[#E1553C]';
const CAMPO_TOPO = 'h-9 px-3 bg-white border border-[#ECECEF] rounded-[8px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#E1553C]/20 focus:border-[#E1553C]';

const TOM: Record<SituacaoDoMovimento, PillTone> = {
    CONCILIADO: 'good', SUGESTAO: 'info', PENDENTE: 'accent', IGNORADO: 'muted', TRANSFERENCIA: 'neutral',
};

const fimDoMes = (mes: string) => {
    const [a, m] = mes.split('-').map(Number);
    const ultimo = new Date(a, m, 0).getDate();
    return `${mes}-${String(ultimo).padStart(2, '0')}`;
};

const Acao: React.FC<{ motivo: string | null; onClick: () => void; children: React.ReactNode }> = ({ motivo, onClick, children }) => (
    <span title={motivo ?? undefined} className={motivo ? 'cursor-not-allowed' : undefined}>
        <TextLinkButton onClick={onClick} disabled={!!motivo} className={motivo ? 'pointer-events-none text-gray-300 disabled:opacity-100' : ''}>
            {children}
        </TextLinkButton>
    </span>
);

interface Props {
    identidade: IdentidadeDoSindico;
    condominioId: string | null;
    /** Catálogo do condomínio (centros, categorias) — para "Lançar e conciliar". */
    condominio: CondominioDoFinanceiro | null;
    competencia: string;
    /** Motivo de não poder gravar (link sem senha, prévia, condomínio sem org própria). */
    motivoBase: string | null;
    notify: (m: string, t?: 'success' | 'error') => void;
    /** Conciliar muda títulos: recarregar o financeiro. */
    onAlterado: () => void;
    onIrParaContas: () => void;
}

const PainelExtratoDoSindico: React.FC<Props> = ({
    identidade, condominioId, condominio, competencia, motivoBase, notify, onAlterado, onIrParaContas,
}) => {
    const [contas, setContas] = React.useState<ContaDoCondominio[] | null>(null);
    const [contaId, setContaId] = React.useState('');
    const [movimentos, setMovimentos] = React.useState<MovimentoDoExtrato[] | null>(null);
    const [temMovimento, setTemMovimento] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    const [versao, setVersao] = React.useState(0);
    const [importando, setImportando] = React.useState(false);
    const [conciliando, setConciliando] = React.useState<MovimentoDoExtrato | null>(null);
    const [ignorando, setIgnorando] = React.useState<MovimentoDoExtrato | null>(null);
    const [ocupado, setOcupado] = React.useState<string | null>(null);
    const arquivoRef = React.useRef<HTMLInputElement>(null);

    // Contas do condomínio (só banco/caixa ativos entram no extrato).
    React.useEffect(() => {
        if (!condominioId) return;
        let vivo = true;
        sindicoPortalService.getContas(identidade, condominioId)
            .then(c => {
                if (!vivo) return;
                const uteis = c.filter(x => x.tipo !== 'gateway');
                setContas(uteis);
                setContaId(atual => (uteis.some(x => x.id === atual) ? atual : (uteis.find(x => x.ativa)?.id ?? uteis[0]?.id ?? '')));
            })
            .catch(e => { if (vivo) { setContas([]); setErro(e instanceof Error ? e.message : 'Não foi possível carregar as contas.'); } });
        return () => { vivo = false; };
    }, [identidade, condominioId]);

    const conta = contas?.find(c => c.id === contaId) ?? null;

    React.useEffect(() => {
        if (!contaId) { setMovimentos(null); return; }
        let vivo = true;
        setErro(null);
        sindicoPortalService.getExtrato(identidade, contaId, `${competencia}-01`, fimDoMes(competencia))
            .then(r => { if (vivo) { setMovimentos(r.movimentos); setTemMovimento(r.temMovimento); } })
            .catch(e => { if (vivo) { setMovimentos(null); setErro(e instanceof Error ? e.message : 'Não foi possível carregar o extrato.'); } });
        return () => { vivo = false; };
    }, [identidade, contaId, competencia, versao]);

    const recarregar = () => { setVersao(v => v + 1); onAlterado(); };

    const motivoImportar = motivoBase ?? (importando ? 'Importando…' : !conta ? 'Escolha a conta.' : !conta.ativa ? 'Esta conta está desativada.' : null);

    const importar = async (arquivo: File) => {
        if (!conta || motivoImportar) return;
        setImportando(true);
        try {
            const r = await sindicoPortalService.importarExtrato(identidade, { id: conta.id, numero: conta.numero, nome: conta.nome }, arquivo);
            const partes = [`${r.inseridas} ${r.inseridas === 1 ? 'movimento importado' : 'movimentos importados'}`];
            if (r.jaExistiam > 0) partes.push(`${r.jaExistiam} já estavam no extrato`);
            if (r.outroFormato > 0) partes.push(`${r.outroFormato} já vieram em outro arquivo`);
            notify(partes.join(' · ') + '.');
            recarregar();
        } catch (e) {
            notify(e instanceof Error ? e.message : 'Não foi possível importar o extrato.', 'error');
        } finally {
            setImportando(false);
            if (arquivoRef.current) arquivoRef.current.value = '';
        }
    };

    const desfazer = async (m: MovimentoDoExtrato) => {
        const v = m.vinculos[0];
        if (!v) return;
        setOcupado(m.id);
        try {
            await sindicoPortalService.desfazerVinculo(identidade, v.matchId);
            notify('Vínculo desfeito: o movimento e o título voltaram a ficar soltos.');
            recarregar();
        } catch (e) {
            notify(e instanceof Error ? e.message : 'Não foi possível desfazer o vínculo.', 'error');
        } finally {
            setOcupado(null);
        }
    };

    const restaurar = async (m: MovimentoDoExtrato) => {
        setOcupado(m.id);
        try {
            await sindicoPortalService.ignorarMovimento(identidade, m.id, null, true);
            notify('Movimento restaurado.');
            recarregar();
        } catch (e) {
            notify(e instanceof Error ? e.message : 'Não foi possível restaurar.', 'error');
        } finally {
            setOcupado(null);
        }
    };

    const resumo = resumoDoExtrato(movimentos ?? []);
    const kpis: KpiItem[] = [
        { label: 'Entradas no mês', value: fmtBRLCents(resumo.entradas) },
        { label: 'Saídas no mês', value: fmtBRLCents(resumo.saidas) },
        { label: 'Conciliados', value: String(resumo.conciliados) },
        { label: 'A conciliar', value: String(resumo.pendentes), hint: resumo.ignorados > 0 ? `${resumo.ignorados} ignorados` : undefined },
    ];

    if (contas && contas.length === 0) {
        return (
            <PortalCard>
                <PortalEmpty icon={<Landmark className="w-8 h-8" />} title="Cadastre a conta do condomínio primeiro"
                    subtitle="O extrato é importado para uma conta bancária. Cadastre a conta (com o saldo inicial) em Contas bancárias." />
                <div className="pb-6 text-center">
                    <TextLinkButton onClick={onIrParaContas}>Ir para Contas bancárias</TextLinkButton>
                </div>
            </PortalCard>
        );
    }

    return (
        <>
            <PortalCard>
                <CardHeader
                    title="Extrato e conciliação"
                    subtitle="Importe o extrato do banco e case cada movimento com a conta paga ou recebida"
                    right={
                        <div className="flex flex-wrap items-center gap-2">
                            {contas && contas.length > 1 && (
                                <select aria-label="Conta" className={CAMPO_TOPO} value={contaId} onChange={e => setContaId(e.target.value)}>
                                    {contas.map(c => <option key={c.id} value={c.id}>{c.nome}{c.ativa ? '' : ' (inativa)'}</option>)}
                                </select>
                            )}
                            <input ref={arquivoRef} type="file" className="hidden" accept=".ofx,.csv,.txt,.xlsx,.xls,.html,.htm,.ret"
                                onChange={e => { const f = e.target.files?.[0]; if (f) void importar(f); }} />
                            <span title={motivoImportar ?? undefined}>
                                <PrimaryButton onClick={() => arquivoRef.current?.click()} disabled={!!motivoImportar} className={motivoImportar ? 'pointer-events-none' : ''}>
                                    {importando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />} Importar extrato
                                </PrimaryButton>
                            </span>
                        </div>
                    }
                />
                {conta && (
                    <p className="px-5 pb-4 -mt-2 text-xs text-gray-500">
                        {conta.nome}{conta.numero ? ` · conta ${conta.numero}` : ''} · OFX, CSV ou planilha do banco
                        {!conta.saldoInicialEm && !temMovimento ? ' · antes da 1ª importação, informe o saldo inicial em Contas bancárias' : ''}
                    </p>
                )}
                {motivoBase && <p className="px-5 pb-4 text-xs text-gray-500">{motivoBase}</p>}
            </PortalCard>

            {movimentos && movimentos.length > 0 && <KpiStrip items={kpis} />}

            <PortalCard>
                {erro ? (
                    <p className="px-5 py-5 text-sm text-[#4A505C] flex items-start gap-2"><AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" /> {erro}</p>
                ) : !contas || (contaId && !movimentos) ? (
                    <PortalLoading label="Carregando o extrato..." />
                ) : !movimentos || movimentos.length === 0 ? (
                    <PortalEmpty icon={<Landmark className="w-8 h-8" />} title="Nenhum movimento neste mês"
                        subtitle={temMovimento ? 'Escolha outro mês no topo, ou importe o extrato deste.' : 'Importe o primeiro extrato desta conta.'} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[860px]">
                            <thead className="border-b border-[#ECECEF]">
                                <tr>
                                    <Th>Data</Th><Th>Movimento</Th><Th className="text-right">Valor</Th><Th>Situação</Th><Th>Título</Th><Th>Ações</Th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#ECECEF]">
                                {movimentos.map(m => {
                                    const s = situacaoDoMovimento(m);
                                    const v = m.vinculos[0];
                                    const mIgnorar = motivoNaoIgnoraMovimento(m, motivoBase);
                                    return (
                                        <tr key={m.id} className="hover:bg-gray-50/70 transition-colors">
                                            <Td className="text-[#8A8F9A] whitespace-nowrap">{fmtDate(m.data)}</Td>
                                            <Td className="text-[#1F2430] max-w-[280px]"><span className="block truncate" title={m.descricao}>{m.descricao}</span></Td>
                                            <Td className={`text-right tabular-nums whitespace-nowrap font-medium ${m.direcao === 'CREDIT' ? 'text-emerald-700' : 'text-[#1F2430]'}`}>
                                                {m.direcao === 'CREDIT' ? '+ ' : '− '}{fmtBRLCents(Number(m.valor) || 0)}
                                            </Td>
                                            <Td className="whitespace-nowrap">
                                                <StatusPill tone={TOM[s]}>{ROTULO_SITUACAO_DO_MOVIMENTO[s]}</StatusPill>
                                            </Td>
                                            <Td className="max-w-[240px]">
                                                {v ? (
                                                    <span className="block truncate text-[#1F2430]" title={v.descricao ?? ''}>
                                                        {v.descricao || 'Título'}{v.credor ? <span className="text-gray-400"> · {v.credor}</span> : null}
                                                    </span>
                                                ) : <span className="text-[#8A8F9A]">—</span>}
                                            </Td>
                                            <Td className="whitespace-nowrap">
                                                <span className="inline-flex items-center gap-3">
                                                    {s === 'CONCILIADO'
                                                        ? <Acao motivo={motivoBase ?? (ocupado === m.id ? 'Gravando…' : null)} onClick={() => desfazer(m)}>Desfazer</Acao>
                                                        : <Acao motivo={motivoNaoConciliaMovimento(m, motivoBase)} onClick={() => setConciliando(m)}>Conciliar</Acao>}
                                                    {s === 'IGNORADO'
                                                        ? <Acao motivo={mIgnorar ?? (ocupado === m.id ? 'Gravando…' : null)} onClick={() => restaurar(m)}>Restaurar</Acao>
                                                        : s !== 'CONCILIADO' && <Acao motivo={mIgnorar} onClick={() => setIgnorando(m)}>Ignorar</Acao>}
                                                </span>
                                            </Td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </PortalCard>

            <ConciliarSheet
                movimento={conciliando}
                identidade={identidade}
                condominio={condominio}
                onClose={() => setConciliando(null)}
                onFeito={msg => { setConciliando(null); notify(msg); recarregar(); }}
            />
            <IgnorarSheet
                movimento={ignorando}
                identidade={identidade}
                onClose={() => setIgnorando(null)}
                onFeito={() => { setIgnorando(null); notify('Movimento ignorado — ele fica fora do que falta conciliar.'); recarregar(); }}
            />
        </>
    );
};

// ── Conciliar: escolher o título, ou lançar a partir do movimento ───────────
const ConciliarSheet: React.FC<{
    movimento: MovimentoDoExtrato | null;
    identidade: IdentidadeDoSindico;
    condominio: CondominioDoFinanceiro | null;
    onClose: () => void;
    onFeito: (mensagem: string) => void;
}> = ({ movimento, identidade, condominio, onClose, onFeito }) => {
    const [modo, setModo] = React.useState<'titulo' | 'lancar'>('titulo');
    const [candidatos, setCandidatos] = React.useState<CandidatoDoMovimento[] | null>(null);
    const [erroLista, setErroLista] = React.useState<string | null>(null);
    const [escolhido, setEscolhido] = React.useState('');
    const [busca, setBusca] = React.useState('');
    const [ajuste, setAjuste] = React.useState<string | null>(null);
    const [descricao, setDescricao] = React.useState('');
    const [centro, setCentro] = React.useState<string | null>(null);
    const [categoria, setCategoria] = React.useState<string | null>(null);
    const [parte, setParte] = React.useState('');
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!movimento) return;
        let vivo = true;
        setModo('titulo'); setCandidatos(null); setErroLista(null); setEscolhido(''); setBusca(''); setAjuste(null);
        setDescricao(movimento.descricao); setParte(''); setCategoria(null); setErro(null);
        setCentro((condominio?.centros.find(c => !c.parentId) ?? condominio?.centros[0])?.id ?? null);
        sindicoPortalService.candidatosDoMovimento(identidade, movimento.id)
            .then(c => {
                if (!vivo) return;
                setCandidatos(c);
                const exatos = c.filter(x => x.exato);
                if (exatos.length === 1) setEscolhido(exatos[0].id);
                if (c.length === 0) setModo('lancar');
            })
            .catch(e => { if (vivo) { setCandidatos([]); setErroLista(e instanceof Error ? e.message : 'Não foi possível buscar os títulos.'); } });
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [movimento?.id]);

    const termo = busca.trim().toLowerCase();
    const visiveis = (candidatos ?? []).filter(c => !termo || `${c.descricao ?? ''} ${c.credor ?? ''}`.toLowerCase().includes(termo));
    const sel = candidatos?.find(c => c.id === escolhido) ?? null;
    const diferente = !!sel && !sel.exato;
    const receita = movimento?.direcao === 'CREDIT';
    const categorias = (condominio?.categorias ?? [])
        .filter(c => (receita ? c.nature === 'REVENUE' : c.nature !== 'REVENUE') || c.id === categoria)
        .map(c => ({ id: c.id, name: c.name, parentId: c.parentId ?? null }));
    const nomeDaCategoria = (id: string | null) => condominio?.categorias.find(c => c.id === id)?.name ?? null;
    const centros = (condominio?.centros ?? []).map(c => ({ id: c.id, code: c.code, name: c.name, parent_id: c.parentId }));

    const motivo = salvando ? 'Gravando…'
        : modo === 'titulo'
            ? (!sel ? 'Escolha o título.' : diferente && !ajuste ? 'Escolha como lançar a diferença.' : null)
            : (!descricao.trim() ? 'Informe a descrição.' : !centro ? 'Escolha o centro de custo.' : !categoria ? 'Escolha a conta financeira.' : null);

    const salvar = async () => {
        if (!movimento || motivo) return;
        setSalvando(true);
        setErro(null);
        try {
            if (modo === 'titulo') {
                await sindicoPortalService.conciliarMovimento(identidade, movimento.id, escolhido, diferente ? nomeDaCategoria(ajuste) : null);
                onFeito(diferente ? 'Conciliado — a diferença virou um lançamento já conciliado.' : 'Conciliado.');
            } else {
                await sindicoPortalService.lancarDoMovimento(identidade, movimento.id, {
                    description: descricao.trim(), cost_center_id: centro!, category_id: categoria!, plano_de_contas_id: null,
                    supplier_id: null, party_name: parte.trim() || null,
                });
                onFeito('Lançado e conciliado.');
            }
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível conciliar.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={!!movimento} onClose={onClose} size="lg" dirty={(!!escolhido || modo === 'lancar') && !salvando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Conciliar movimento</SheetTitle>
                <SheetDescription>
                    {movimento ? `${fmtDate(movimento.data)} · ${movimento.direcao === 'CREDIT' ? 'entrada' : 'saída'} de ${fmtBRLCents(Number(movimento.valor) || 0)} · ${movimento.descricao}` : ''}
                </SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-4 md:p-6">
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-6">
                    <div className="inline-flex rounded-[8px] border border-[#ECECEF] p-0.5" role="tablist">
                        {([['titulo', 'Casar com um título'], ['lancar', 'Lançar e conciliar']] as const).map(([id, rotulo]) => (
                            <button key={id} type="button" role="tab" aria-selected={modo === id} onClick={() => setModo(id)}
                                className={`h-8 px-3 rounded-[6px] text-sm ${modo === id ? 'bg-[#FDEDE8] text-[#C24428] font-medium' : 'text-[#4A505C] hover:bg-gray-50'}`}>
                                {rotulo}
                            </button>
                        ))}
                    </div>

                    {modo === 'titulo' ? (
                        <div className="space-y-3">
                            <div className="relative">
                                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input aria-label="Buscar título" className={`${CAMPO} pl-9`} value={busca} placeholder="Buscar por descrição ou credor"
                                    onChange={e => setBusca(e.target.value)} />
                            </div>
                            {erroLista ? (
                                <p className="text-sm text-red-600 flex items-start gap-1.5"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {erroLista}</p>
                            ) : !candidatos ? (
                                <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Buscando títulos…</p>
                            ) : visiveis.length === 0 ? (
                                <p className="text-sm text-gray-500">
                                    {candidatos.length === 0
                                        ? 'Nenhum título do condomínio perto desta data e neste sentido. Use "Lançar e conciliar".'
                                        : 'Nenhum título com esse texto.'}
                                </p>
                            ) : (
                                <ul className="divide-y divide-[#ECECEF] border border-[#ECECEF] rounded-[8px] max-h-[22rem] overflow-y-auto">
                                    {visiveis.map(c => (
                                        <li key={c.id}>
                                            <label className={`px-4 py-2.5 flex items-start gap-3 text-sm cursor-pointer ${escolhido === c.id ? 'bg-[#FDEDE8]/60' : 'hover:bg-gray-50'}`}>
                                                <input type="radio" name="candidato" className="mt-1 accent-[#E1553C]" checked={escolhido === c.id}
                                                    onChange={() => { setEscolhido(c.id); setAjuste(null); }} />
                                                <span className="min-w-0 flex-1">
                                                    <span className="block text-[#1F2430] truncate">{c.descricao || 'Título sem descrição'}</span>
                                                    <span className="block text-xs text-gray-500">
                                                        {[c.credor, c.vencimento ? `vence ${fmtDate(c.vencimento)}` : null, c.situacao === 'BAIXADO' ? (c.pagoEm ? `baixado em ${fmtDate(c.pagoEm)}` : 'baixado') : 'em aberto']
                                                            .filter(Boolean).join(' · ')}
                                                    </span>
                                                </span>
                                                <span className="text-right whitespace-nowrap">
                                                    <span className="block tabular-nums text-[#1F2430]">{fmtBRLCents(Number(c.valor) || 0)}</span>
                                                    {c.exato
                                                        ? <span className="block text-[11px] text-emerald-700">valor exato</span>
                                                        : <span className="block text-[11px] text-amber-700">dif. {fmtBRLCents(Number(c.difValor) || 0)}</span>}
                                                </span>
                                            </label>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {diferente && (
                                <div className="space-y-1.5">
                                    <label className={ROTULO}>A diferença de {fmtBRLCents(Number(sel?.difValor) || 0)} vai para *</label>
                                    <HierarchicalSelect
                                        items={(condominio?.categorias ?? []).map(c => ({ id: c.id, name: c.name, parentId: c.parentId ?? null }))}
                                        value={ajuste ?? ''} onChange={v => setAjuste(v || null)}
                                        valueField="id" placeholder="—" hoverCls="hover:bg-[#FDEDE8]" size="sm"
                                        panelVariant="drawer" drawerTitle="Conta financeira da diferença"
                                    />
                                    <p className="text-xs text-gray-500">Ex.: juros e multa pagos a mais, desconto recebido. Vira um lançamento já conciliado.</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                            <div className="space-y-1.5 sm:col-span-2">
                                <label className={ROTULO} htmlFor="lancar-desc">Descrição *</label>
                                <input id="lancar-desc" className={CAMPO} value={descricao} maxLength={300} onChange={e => setDescricao(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={ROTULO}>Centro de custo *</label>
                                <CostCenterSelect costCenters={centros} value={centro ?? ''} onChange={v => setCentro(v || null)} hoverCls="hover:bg-[#FDEDE8]" size="sm" />
                            </div>
                            <div className="space-y-1.5">
                                <label className={ROTULO}>Conta financeira *</label>
                                <HierarchicalSelect items={categorias} value={categoria ?? ''} onChange={v => setCategoria(v || null)}
                                    valueField="id" placeholder="—" hoverCls="hover:bg-[#FDEDE8]" size="sm"
                                    panelVariant="drawer" drawerTitle="Selecionar Conta Financeira" />
                            </div>
                            <div className="space-y-1.5 sm:col-span-2">
                                <label className={ROTULO} htmlFor="lancar-parte">{receita ? 'Quem pagou' : 'Credor'}</label>
                                <input id="lancar-parte" className={CAMPO} value={parte} maxLength={200}
                                    placeholder={receita ? 'Ex.: nome do condômino' : 'Ex.: Sicredi (tarifa)'} onChange={e => setParte(e.target.value)} />
                            </div>
                            <p className="sm:col-span-2 text-xs text-gray-500 flex items-start gap-1.5">
                                <Link2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                O lançamento nasce com o valor, a data e o sentido do extrato e já conciliado com este movimento.
                            </p>
                        </div>
                    )}
                </div>
            </SheetPanel>
            <SheetFooter>
                <div className="flex items-center justify-end gap-3 w-full">
                    {erro && <p className="mr-auto flex items-center gap-1.5 text-sm text-red-600"><AlertCircle className="w-4 h-4 shrink-0" /> {erro}</p>}
                    <GhostButton onClick={onClose}>Cancelar</GhostButton>
                    <span title={motivo ?? undefined}>
                        <PrimaryButton onClick={salvar} disabled={!!motivo} className={motivo ? 'pointer-events-none' : ''}>
                            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            {modo === 'titulo' ? 'Conciliar' : 'Lançar e conciliar'}
                        </PrimaryButton>
                    </span>
                </div>
            </SheetFooter>
        </Sheet>
    );
};

// ── Ignorar (motivo obrigatório) ────────────────────────────────────────────
const IgnorarSheet: React.FC<{
    movimento: MovimentoDoExtrato | null; identidade: IdentidadeDoSindico; onClose: () => void; onFeito: () => void;
}> = ({ movimento, identidade, onClose, onFeito }) => {
    const [motivo, setMotivo] = React.useState('');
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    React.useEffect(() => { if (movimento) { setMotivo(''); setErro(null); } }, [movimento?.id]);
    const bloqueio = !motivo.trim() ? 'Diga por que este movimento fica de fora.' : salvando ? 'Gravando…' : null;

    const enviar = async () => {
        if (!movimento || bloqueio) return;
        setSalvando(true); setErro(null);
        try {
            await sindicoPortalService.ignorarMovimento(identidade, movimento.id, motivo.trim(), false);
            onFeito();
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível ignorar o movimento.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={!!movimento} onClose={onClose} size="md" dirty={!!motivo.trim() && !salvando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Ignorar movimento</SheetTitle>
                <SheetDescription>{movimento ? `${fmtDate(movimento.data)} · ${fmtBRLCents(Number(movimento.valor) || 0)} · ${movimento.descricao}` : ''}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-4 md:p-6">
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-1.5">
                    <label className={ROTULO} htmlFor="ignorar-motivo">Por que fica de fora *</label>
                    <textarea id="ignorar-motivo" rows={4} className={`${CAMPO} h-auto py-2`} value={motivo} maxLength={300}
                        placeholder="Ex.: transferência entre contas do próprio condomínio" onChange={e => setMotivo(e.target.value)} />
                    <p className="text-xs text-gray-500">Dá para restaurar depois. O movimento continua no extrato.</p>
                </div>
            </SheetPanel>
            <SheetFooter>
                <div className="flex items-center justify-end gap-3 w-full">
                    {erro && <p className="mr-auto flex items-center gap-1.5 text-sm text-red-600"><AlertCircle className="w-4 h-4 shrink-0" /> {erro}</p>}
                    <GhostButton onClick={onClose}>Voltar</GhostButton>
                    <span title={bloqueio ?? undefined}>
                        <PrimaryButton onClick={enviar} disabled={!!bloqueio} className={bloqueio ? 'pointer-events-none' : ''}>
                            {salvando && <Loader2 className="w-4 h-4 animate-spin" />} Ignorar
                        </PrimaryButton>
                    </span>
                </div>
            </SheetFooter>
        </Sheet>
    );
};

export default PainelExtratoDoSindico;
