import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, ClipboardCheck, Loader2, Plus, Wrench } from 'lucide-react';
import {
    CardHeader, GhostButton, PortalCard, PortalEmpty, PortalLoading, PortalTabs, PrimaryButton, StatusPill, Td, TextLinkButton, Th,
    fmtBRLCents, fmtDate, type PillTone,
} from '../portal/PortalKit';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import MoneyCentsInput from '../ui/MoneyCentsInput';
import { usePersistedState } from '../ui/TableUtils';
import { sindicoPortalService, type CondominioDoSindico, type IdentidadeDoSindico } from '../../services/sindicoPortalService';
import {
    ROTULO_PRIORIDADE, ROTULO_RESPONSAVEL, ROTULO_STATUS_OS, ROTULO_TIPO_OS, motivoNaoEditaOs, motivoNaoFechaOs,
    situacaoDoItem, textoDaPeriodicidade,
    type ItemDoPlano, type ManutencaoDoPredio, type OrdemDeServico, type PrioridadeOs, type Responsavel, type StatusOs,
    type TipoOs, type UnidadePeriodo,
} from '../../utils/manutencaoDoSindico';
import { MOTIVO_SEM_LOGIN } from '../../utils/financeiroDoSindico';
import { hojeEmBrasilia } from '../../utils/mandatoSindico';

/**
 * Portal do Síndico › Manutenção (G4, 26/11/2026).
 * Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md
 * Pronto quando: síndico abre e conclui OS (e cadastra equipamento — aba Equipamentos).
 *
 * Duas sub-abas: Ordens de serviço (abrir, editar, concluir, cancelar) e Plano de
 * manutenção (incluir, editar, tirar do plano, abrir a OS do item). Concluir a OS
 * de um item do plano recalcula o próximo vencimento NO BANCO (o gatilho do app,
 * `trg_maintenance_order_completed`). OS não se apaga pelo portal: concluída é o
 * registro técnico do prédio; a que não vai acontecer é cancelada com motivo.
 * Gravar exige login (ou a administradora pelo app) — o banco recusa igual.
 */

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E1553C]/20 focus:border-[#E1553C]';
const CAMPO_DO_TOPO = 'h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#E1553C]/20 focus:border-[#E1553C]';

const TOM_STATUS: Record<StatusOs, PillTone> = { ABERTA: 'accent', AGENDADA: 'info', EM_EXECUCAO: 'info', CONCLUIDA: 'good', CANCELADA: 'muted' };

interface Props {
    identidade: IdentidadeDoSindico;
    condominios: CondominioDoSindico[];
    /** Pode gravar: síndico com e-mail e senha, sessão do link, ou a administradora pelo app. */
    logado: boolean;
    notify: (m: string, t?: 'success' | 'error') => void;
}

const Acao: React.FC<{ motivo: string | null; onClick: () => void; children: React.ReactNode }> = ({ motivo, onClick, children }) => (
    <span title={motivo ?? undefined} className={motivo ? 'cursor-not-allowed' : undefined}>
        <TextLinkButton onClick={onClick} disabled={!!motivo} className={motivo ? 'pointer-events-none text-gray-300 disabled:opacity-100' : ''}>
            {children}
        </TextLinkButton>
    </span>
);

/** Leitura comum de Manutenção e Equipamentos: o condomínio escolhido e o que o banco devolve. */
export function useManutencaoDoPredio(identidade: IdentidadeDoSindico, condominios: CondominioDoSindico[], logado: boolean) {
    // Uma escolha para as duas abas (Manutenção e Equipamentos): trocar de aba não volta ao primeiro prédio.
    const [salvo, setCondominioId] = usePersistedState<string>('sindicoPortal:manutencao:condominio', condominios[0]?.id ?? '');
    const condominioId = condominios.some(c => c.id === salvo) ? salvo : (condominios[0]?.id ?? '');
    const [dados, setDados] = React.useState<ManutencaoDoPredio | null>(null);
    const [erro, setErro] = React.useState<string | null>(null);
    const [versao, setVersao] = React.useState(0);

    React.useEffect(() => {
        if (!condominioId) return;
        let vivo = true;
        setErro(null);
        sindicoPortalService.getManutencao(identidade, condominioId)
            .then(d => { if (vivo) setDados(d); })
            .catch(e => { if (vivo) { setDados(null); setErro(e instanceof Error ? e.message : 'Não foi possível carregar a manutenção.'); } });
        return () => { vivo = false; };
    }, [identidade, condominioId, versao]);

    const motivoBase = !logado ? MOTIVO_SEM_LOGIN : !dados ? 'Carregando o condomínio…' : dados.motivoNaoOpera;
    return { condominioId, setCondominioId, dados, erro, motivoBase, recarregar: () => setVersao(v => v + 1) };
}

export const SeletorDoCondominio: React.FC<{
    condominios: CondominioDoSindico[]; value: string; onChange: (id: string) => void;
}> = ({ condominios, value, onChange }) => (condominios.length > 1 ? (
    <label className="flex items-center gap-2 text-[13px] text-[#8A8F9A] min-w-0">
        Condomínio
        <select value={value} onChange={e => onChange(e.target.value)} className={`${CAMPO_DO_TOPO} min-w-0 max-w-[16rem]`}>
            {condominios.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
    </label>
) : null);

type SubAba = 'ordens' | 'plano';

const PainelManutencaoDoSindico: React.FC<Props> = ({ identidade, condominios, logado, notify }) => {
    const { condominioId, setCondominioId, dados, erro, motivoBase, recarregar } = useManutencaoDoPredio(identidade, condominios, logado);
    const [subAba, setSubAba] = React.useState<SubAba>('ordens');
    const [os, setOs] = React.useState<{ ordem: OrdemDeServico | null; item?: ItemDoPlano | null } | null>(null);
    const [concluindo, setConcluindo] = React.useState<OrdemDeServico | null>(null);
    const [cancelando, setCancelando] = React.useState<OrdemDeServico | null>(null);
    const [item, setItem] = React.useState<ItemDoPlano | 'novo' | null>(null);
    const hoje = hojeEmBrasilia();

    const depois = (m: string) => { setOs(null); setConcluindo(null); setCancelando(null); setItem(null); notify(m); recarregar(); };

    const tirarDoPlano = async (i: ItemDoPlano) => {
        try {
            await sindicoPortalService.removerItemDoPlano(identidade, condominioId, i.id);
            depois(`"${i.descricao}" saiu do plano. As ordens já executadas continuam no histórico.`);
        } catch (e) {
            notify(e instanceof Error ? e.message : 'Não foi possível tirar o item do plano.', 'error');
        }
    };

    const abertas = dados?.ordens.filter(o => o.status !== 'CONCLUIDA' && o.status !== 'CANCELADA').length ?? 0;

    return (
        <>
            <PortalCard className="overflow-hidden">
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between lg:gap-3 lg:pr-4">
                    <div className="flex-1 min-w-0">
                        <PortalTabs
                            tabs={[{ id: 'ordens', label: 'Ordens de serviço', count: abertas }, { id: 'plano', label: 'Plano de manutenção', count: dados?.itens.length }]}
                            active={subAba}
                            onChange={id => setSubAba(id as SubAba)}
                        />
                    </div>
                    {condominios.length > 1 && (
                        <div className="px-4 py-3 lg:px-0 lg:py-2">
                            <SeletorDoCondominio condominios={condominios} value={condominioId} onChange={setCondominioId} />
                        </div>
                    )}
                </div>
            </PortalCard>

            {erro ? (
                <PortalCard className="px-5 py-4 flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" /><p className="text-sm text-[#4A505C]">{erro}</p>
                </PortalCard>
            ) : !dados ? (
                <PortalCard><PortalLoading label="Carregando a manutenção..." /></PortalCard>
            ) : subAba === 'ordens' ? (
                <PortalCard>
                    <CardHeader
                        title="Ordens de serviço"
                        subtitle="O que foi pedido, agendado e feito no prédio"
                        right={
                            <span title={motivoBase ?? undefined}>
                                <PrimaryButton onClick={() => setOs({ ordem: null })} disabled={!!motivoBase} className={motivoBase ? 'pointer-events-none' : ''}>
                                    <Plus className="w-4 h-4" /> Nova ordem
                                </PrimaryButton>
                            </span>
                        }
                    />
                    {dados.ordens.length === 0 ? (
                        <PortalEmpty icon={<Wrench className="w-8 h-8" />} title="Nenhuma ordem de serviço"
                            subtitle="Abra uma ordem para registrar um conserto, uma inspeção ou a manutenção do plano." />
                    ) : (
                        <div className="overflow-x-auto border-t border-[#ECECEF]">
                            <table className="w-full min-w-[820px]">
                                <thead className="border-b border-[#ECECEF]">
                                    <tr><Th>Serviço</Th><Th>Tipo</Th><Th>Previsto</Th><Th>Executado</Th><Th>Situação</Th><Th>Ações</Th></tr>
                                </thead>
                                <tbody className="divide-y divide-[#ECECEF]">
                                    {dados.ordens.map(o => (
                                        <tr key={o.id} className="hover:bg-gray-50/70 transition-colors align-top">
                                            <Td className="text-[#1F2430]">
                                                {o.descricao}
                                                <span className="block text-[11px] text-gray-400">
                                                    {[o.codigo, o.sistema, o.ativo, o.itemId ? 'do plano' : null].filter(Boolean).join(' · ') || '—'}
                                                </span>
                                            </Td>
                                            <Td className="whitespace-nowrap">
                                                {ROTULO_TIPO_OS[o.tipo]}
                                                {o.prioridade && o.prioridade !== 'NORMAL' && <span className="block text-[11px] text-gray-400">{ROTULO_PRIORIDADE[o.prioridade]}</span>}
                                            </Td>
                                            <Td className="whitespace-nowrap">{o.previsto ? fmtDate(o.previsto) : '—'}</Td>
                                            <Td className="whitespace-nowrap">
                                                {o.executado ? fmtDate(o.executado) : '—'}
                                                {o.custo != null && Number(o.custo) > 0 && <span className="block text-[11px] text-gray-400">{fmtBRLCents(Number(o.custo))}</span>}
                                            </Td>
                                            <Td><StatusPill tone={TOM_STATUS[o.status]}>{ROTULO_STATUS_OS[o.status]}</StatusPill></Td>
                                            <Td className="whitespace-nowrap">
                                                <span className="inline-flex items-center gap-3">
                                                    <Acao motivo={motivoNaoFechaOs(o, motivoBase)} onClick={() => setConcluindo(o)}>Concluir</Acao>
                                                    <Acao motivo={motivoNaoEditaOs(o, motivoBase)} onClick={() => setOs({ ordem: o })}>Editar</Acao>
                                                    <Acao motivo={motivoNaoFechaOs(o, motivoBase)} onClick={() => setCancelando(o)}>Cancelar</Acao>
                                                </span>
                                            </Td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {motivoBase && dados && <p className="px-5 py-3 text-xs text-gray-500">{motivoBase}</p>}
                </PortalCard>
            ) : (
                <PortalCard>
                    <CardHeader
                        title="Plano de manutenção"
                        subtitle={dados.plano ? `${dados.plano.nome}${dados.plano.desde ? ` · desde ${fmtDate(dados.plano.desde)}` : ''}` : 'O que o prédio precisa fazer de tempos em tempos'}
                        right={
                            <span title={motivoBase ?? undefined}>
                                <PrimaryButton onClick={() => setItem('novo')} disabled={!!motivoBase} className={motivoBase ? 'pointer-events-none' : ''}>
                                    <Plus className="w-4 h-4" /> Incluir item
                                </PrimaryButton>
                            </span>
                        }
                    />
                    {dados.itens.length === 0 ? (
                        <PortalEmpty icon={<ClipboardCheck className="w-8 h-8" />} title="Nenhum item no plano"
                            subtitle="Inclua o que se repete — extintores, bombas, elevadores, limpeza da caixa d'água — e quando vence." />
                    ) : (
                        <div className="overflow-x-auto border-t border-[#ECECEF]">
                            <table className="w-full min-w-[820px]">
                                <thead className="border-b border-[#ECECEF]">
                                    <tr><Th>Serviço</Th><Th>Periodicidade</Th><Th>Responsável</Th><Th>Próximo</Th><Th>Última</Th><Th>Ações</Th></tr>
                                </thead>
                                <tbody className="divide-y divide-[#ECECEF]">
                                    {dados.itens.map(i => {
                                        const sit = situacaoDoItem(i.proximo, hoje);
                                        return (
                                            <tr key={i.id} className="hover:bg-gray-50/70 transition-colors align-top">
                                                <Td className="text-[#1F2430]">
                                                    {i.descricao}
                                                    <span className="block text-[11px] text-gray-400">{i.sistema ?? '—'}</span>
                                                </Td>
                                                <Td className="whitespace-nowrap">{textoDaPeriodicidade(i.periodicidadeValor, i.periodicidadeUnidade)}</Td>
                                                <Td>{i.responsavel ? ROTULO_RESPONSAVEL[i.responsavel] : '—'}</Td>
                                                <Td className="whitespace-nowrap">
                                                    {i.proximo ? fmtDate(i.proximo) : '—'}
                                                    {sit === 'VENCIDO' && <span className="ml-2"><StatusPill tone="accent">Vencido</StatusPill></span>}
                                                    {sit === 'PROXIMO' && <span className="ml-2"><StatusPill tone="info">Em breve</StatusPill></span>}
                                                </Td>
                                                <Td className="whitespace-nowrap">{i.ultimaExecucao ? fmtDate(i.ultimaExecucao) : '—'}</Td>
                                                <Td className="whitespace-nowrap">
                                                    <span className="inline-flex items-center gap-3">
                                                        <Acao motivo={motivoBase} onClick={() => setOs({ ordem: null, item: i })}>Abrir OS</Acao>
                                                        <Acao motivo={motivoBase} onClick={() => setItem(i)}>Editar</Acao>
                                                        <Acao motivo={motivoBase} onClick={() => tirarDoPlano(i)}>Tirar do plano</Acao>
                                                    </span>
                                                </Td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {motivoBase && dados && <p className="px-5 py-3 text-xs text-gray-500">{motivoBase}</p>}
                </PortalCard>
            )}

            {dados && (
                <>
                    <OrdemSheet aberta={os} dados={dados} identidade={identidade} condominioId={condominioId} onClose={() => setOs(null)} onSalvo={depois} />
                    <ConcluirSheet ordem={concluindo} identidade={identidade} condominioId={condominioId} onClose={() => setConcluindo(null)} onSalvo={depois} />
                    <CancelarSheet ordem={cancelando} identidade={identidade} condominioId={condominioId} onClose={() => setCancelando(null)} onSalvo={depois} />
                    <ItemSheet item={item} dados={dados} identidade={identidade} condominioId={condominioId} onClose={() => setItem(null)} onSalvo={depois} />
                </>
            )}
        </>
    );
};

// ── Abrir / editar OS ────────────────────────────────────────────────────────
interface FormOs { descricao: string; tipo: TipoOs; prioridade: PrioridadeOs; sistemaId: string; itemId: string; ativoId: string; previsto: string }

const formDaOs = (o: OrdemDeServico | null, item?: ItemDoPlano | null): FormOs => ({
    descricao: o?.descricao ?? item?.descricao ?? '', tipo: o?.tipo ?? (item ? 'PREVENTIVA' : 'CORRETIVA'),
    prioridade: o?.prioridade ?? 'NORMAL', sistemaId: o?.sistemaId ?? item?.sistemaId ?? '', itemId: o?.itemId ?? item?.id ?? '',
    ativoId: o?.ativoId ?? '', previsto: o?.previsto ?? '',
});

const OrdemSheet: React.FC<{
    aberta: { ordem: OrdemDeServico | null; item?: ItemDoPlano | null } | null;
    dados: ManutencaoDoPredio; identidade: IdentidadeDoSindico; condominioId: string;
    onClose: () => void; onSalvo: (m: string) => void;
}> = ({ aberta, dados, identidade, condominioId, onClose, onSalvo }) => {
    const ordem = aberta?.ordem ?? null;
    const [form, setForm] = React.useState<FormOs>(formDaOs(null));
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    React.useEffect(() => { if (aberta) { setForm(formDaOs(aberta.ordem, aberta.item)); setErro(null); } }, [aberta]);

    const set = <K extends keyof FormOs>(k: K, v: FormOs[K]) => setForm(f => ({ ...f, [k]: v }));
    const sujo = !!aberta && JSON.stringify(form) !== JSON.stringify(formDaOs(aberta.ordem, aberta.item));
    const motivo = salvando ? 'Gravando…' : !form.descricao.trim() ? 'Descreva o serviço.' : ordem && !sujo ? 'Nada mudou.' : null;

    const salvar = async () => {
        if (motivo) return;
        setSalvando(true);
        setErro(null);
        try {
            await sindicoPortalService.salvarOs(identidade, condominioId, ordem?.id ?? null, {
                descricao: form.descricao.trim(), tipo: form.tipo, prioridade: form.prioridade, sistemaId: form.sistemaId || null,
                itemId: form.itemId || null, ativoId: form.ativoId || null, fornecedorId: ordem?.fornecedorId ?? null, previsto: form.previsto || null,
            });
            onSalvo(ordem ? 'Ordem de serviço salva.' : 'Ordem de serviço aberta.');
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível salvar a ordem.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={!!aberta} onClose={onClose} size="md" dirty={sujo && !salvando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>{ordem ? 'Editar ordem de serviço' : 'Nova ordem de serviço'}</SheetTitle>
                <SheetDescription>{ordem?.codigo ?? (aberta?.item ? `Do plano: ${aberta.item.descricao}` : 'Conserto, inspeção ou manutenção')}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-4 md:p-6">
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                    <div className="space-y-1.5">
                        <label className={ROTULO} htmlFor="os-descricao">Serviço *</label>
                        <textarea id="os-descricao" rows={3} className={`${CAMPO} h-auto py-2`} value={form.descricao}
                            placeholder="O que precisa ser feito" onChange={e => set('descricao', e.target.value)} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="os-tipo">Tipo</label>
                            <select id="os-tipo" className={CAMPO} value={form.tipo} onChange={e => set('tipo', e.target.value as TipoOs)}>
                                {(Object.keys(ROTULO_TIPO_OS) as TipoOs[]).map(t => <option key={t} value={t}>{ROTULO_TIPO_OS[t]}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="os-prioridade">Prioridade</label>
                            <select id="os-prioridade" className={CAMPO} value={form.prioridade} onChange={e => set('prioridade', e.target.value as PrioridadeOs)}>
                                {(Object.keys(ROTULO_PRIORIDADE) as PrioridadeOs[]).map(p => <option key={p} value={p}>{ROTULO_PRIORIDADE[p]}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="os-sistema">Sistema</label>
                            <select id="os-sistema" className={CAMPO} value={form.sistemaId} onChange={e => set('sistemaId', e.target.value)}>
                                <option value="">—</option>
                                {dados.sistemas.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="os-ativo">Equipamento</label>
                            <select id="os-ativo" className={CAMPO} value={form.ativoId} onChange={e => set('ativoId', e.target.value)}>
                                <option value="">—</option>
                                {dados.ativos.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="os-item">Item do plano</label>
                            <select id="os-item" className={CAMPO} value={form.itemId} onChange={e => set('itemId', e.target.value)}>
                                <option value="">— (fora do plano)</option>
                                {dados.itens.map(i => <option key={i.id} value={i.id}>{i.descricao}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="os-previsto">Data prevista</label>
                            <input id="os-previsto" type="date" className={CAMPO} value={form.previsto} onChange={e => set('previsto', e.target.value)} />
                        </div>
                    </div>
                    {form.itemId && <p className="text-xs text-gray-500">Ao concluir, o próximo vencimento do item no plano é recalculado a partir da data da execução.</p>}
                </div>
            </SheetPanel>
            <RodapeComMotivo erro={erro} motivo={motivo} salvando={salvando} onClose={onClose} onSalvar={salvar} rotulo={ordem ? 'Salvar' : 'Abrir ordem'} />
        </Sheet>
    );
};

// ── Concluir ─────────────────────────────────────────────────────────────────
const ConcluirSheet: React.FC<{
    ordem: OrdemDeServico | null; identidade: IdentidadeDoSindico; condominioId: string;
    onClose: () => void; onSalvo: (m: string) => void;
}> = ({ ordem, identidade, condominioId, onClose, onSalvo }) => {
    const hoje = hojeEmBrasilia();
    const [data, setData] = React.useState(hoje);
    const [custoTexto, setCustoTexto] = React.useState('');
    const [achados, setAchados] = React.useState('');
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    React.useEffect(() => { if (ordem) { setData(hojeEmBrasilia()); setCustoTexto(''); setAchados(''); setErro(null); } }, [ordem]);

    const motivo = salvando ? 'Gravando…' : !data || data > hoje ? 'Informe a data da execução (não pode ser futura).' : null;

    const salvar = async () => {
        if (!ordem || motivo) return;
        setSalvando(true);
        setErro(null);
        try {
            const r = await sindicoPortalService.concluirOs(identidade, condominioId, ordem.id, data, custoTexto === '' ? null : Number(custoTexto), achados.trim());
            onSalvo(r.proximoDoPlano ? `Ordem concluída. Próximo vencimento no plano: ${fmtDate(r.proximoDoPlano)}.` : 'Ordem concluída.');
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível concluir a ordem.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={!!ordem} onClose={onClose} size="sm" dirty={(!!achados.trim() || custoTexto !== '') && !salvando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Concluir ordem</SheetTitle>
                <SheetDescription>{ordem?.descricao}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-4 md:p-6">
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="concluir-data">Executada em *</label>
                            <input id="concluir-data" type="date" max={hoje} className={CAMPO} value={data} onChange={e => setData(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="concluir-custo">Custo</label>
                            <MoneyCentsInput id="concluir-custo" value={custoTexto} onChange={setCustoTexto} className={CAMPO} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className={ROTULO} htmlFor="concluir-achados">O que foi feito / encontrado</label>
                        <textarea id="concluir-achados" rows={3} className={`${CAMPO} h-auto py-2`} value={achados} onChange={e => setAchados(e.target.value)} />
                    </div>
                    {ordem?.itemId && <p className="text-xs text-gray-500">O próximo vencimento do item no plano é recalculado a partir desta data.</p>}
                </div>
            </SheetPanel>
            <RodapeComMotivo erro={erro} motivo={motivo} salvando={salvando} onClose={onClose} onSalvar={salvar} rotulo="Concluir" />
        </Sheet>
    );
};

// ── Cancelar ─────────────────────────────────────────────────────────────────
const CancelarSheet: React.FC<{
    ordem: OrdemDeServico | null; identidade: IdentidadeDoSindico; condominioId: string;
    onClose: () => void; onSalvo: (m: string) => void;
}> = ({ ordem, identidade, condominioId, onClose, onSalvo }) => {
    const [texto, setTexto] = React.useState('');
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    React.useEffect(() => { if (ordem) { setTexto(''); setErro(null); } }, [ordem]);
    const motivo = salvando ? 'Gravando…' : !texto.trim() ? 'Diga o motivo do cancelamento.' : null;

    const salvar = async () => {
        if (!ordem || motivo) return;
        setSalvando(true);
        setErro(null);
        try {
            await sindicoPortalService.cancelarOs(identidade, condominioId, ordem.id, texto.trim());
            onSalvo('Ordem cancelada. Ela continua no histórico com o motivo.');
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível cancelar a ordem.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={!!ordem} onClose={onClose} size="sm" dirty={!!texto.trim() && !salvando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Cancelar ordem</SheetTitle>
                <SheetDescription>{ordem?.descricao}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-4 md:p-6">
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-1.5">
                    <label className={ROTULO} htmlFor="cancelar-os-motivo">Motivo *</label>
                    <textarea id="cancelar-os-motivo" rows={3} className={`${CAMPO} h-auto py-2`} value={texto}
                        placeholder="Ex.: resolvido pelo zelador, serviço duplicado" onChange={e => setTexto(e.target.value)} />
                </div>
            </SheetPanel>
            <RodapeComMotivo erro={erro} motivo={motivo} salvando={salvando} onClose={onClose} onSalvar={salvar} rotulo="Cancelar ordem" voltar="Voltar" />
        </Sheet>
    );
};

// ── Item do plano ────────────────────────────────────────────────────────────
interface FormItem { descricao: string; sistemaId: string; valor: string; unidade: UnidadePeriodo; responsavel: Responsavel | ''; proximo: string }

const formDoItem = (i: ItemDoPlano | null): FormItem => ({
    descricao: i?.descricao ?? '', sistemaId: i?.sistemaId ?? '', valor: i ? String(i.periodicidadeValor) : '1',
    unidade: i?.periodicidadeUnidade ?? 'MES', responsavel: i?.responsavel ?? '', proximo: i?.proximo ?? '',
});

const ItemSheet: React.FC<{
    item: ItemDoPlano | 'novo' | null; dados: ManutencaoDoPredio; identidade: IdentidadeDoSindico; condominioId: string;
    onClose: () => void; onSalvo: (m: string) => void;
}> = ({ item, dados, identidade, condominioId, onClose, onSalvo }) => {
    const atual = item && item !== 'novo' ? item : null;
    const [form, setForm] = React.useState<FormItem>(formDoItem(null));
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    React.useEffect(() => { if (item) { setForm(formDoItem(atual)); setErro(null); } }, [item]); // eslint-disable-line react-hooks/exhaustive-deps

    const set = <K extends keyof FormItem>(k: K, v: FormItem[K]) => setForm(f => ({ ...f, [k]: v }));
    const sujo = !!item && JSON.stringify(form) !== JSON.stringify(formDoItem(atual));
    const valor = Number(form.valor);
    const motivo = salvando ? 'Gravando…' : !form.descricao.trim() ? 'Descreva o serviço.'
        : !(Number.isInteger(valor) && valor >= 1) ? 'Informe a cada quanto tempo o serviço se repete.' : atual && !sujo ? 'Nada mudou.' : null;

    const salvar = async () => {
        if (motivo) return;
        setSalvando(true);
        setErro(null);
        try {
            await sindicoPortalService.salvarItemDoPlano(identidade, condominioId, atual?.id ?? null, {
                descricao: form.descricao.trim(), sistemaId: form.sistemaId || null, periodicidadeValor: valor,
                periodicidadeUnidade: form.unidade, responsavel: form.responsavel || null, proximo: form.proximo || null,
            });
            onSalvo(atual ? 'Item do plano salvo.' : dados.plano ? 'Item incluído no plano.' : 'Plano de manutenção criado com o primeiro item.');
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível salvar o item.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={!!item} onClose={onClose} size="md" dirty={sujo && !salvando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>{atual ? 'Editar item do plano' : 'Incluir no plano'}</SheetTitle>
                <SheetDescription>{dados.plano?.nome ?? 'O plano de manutenção nasce com este item'}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-4 md:p-6">
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                    <div className="space-y-1.5">
                        <label className={ROTULO} htmlFor="item-descricao">Serviço *</label>
                        <input id="item-descricao" className={CAMPO} value={form.descricao} placeholder="Ex.: Recarga dos extintores"
                            onChange={e => set('descricao', e.target.value)} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="item-valor">Repete a cada *</label>
                            <div className="flex gap-2">
                                <input id="item-valor" type="number" min={1} className={`${CAMPO} w-20`} value={form.valor} onChange={e => set('valor', e.target.value)} />
                                <select aria-label="Unidade" className={CAMPO} value={form.unidade} onChange={e => set('unidade', e.target.value as UnidadePeriodo)}>
                                    <option value="DIA">dias</option><option value="SEMANA">semanas</option><option value="MES">meses</option><option value="ANO">anos</option>
                                </select>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="item-proximo">Próximo vencimento</label>
                            <input id="item-proximo" type="date" className={CAMPO} value={form.proximo} onChange={e => set('proximo', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="item-sistema">Sistema</label>
                            <select id="item-sistema" className={CAMPO} value={form.sistemaId} onChange={e => set('sistemaId', e.target.value)}>
                                <option value="">—</option>
                                {dados.sistemas.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="item-responsavel">Responsável</label>
                            <select id="item-responsavel" className={CAMPO} value={form.responsavel} onChange={e => set('responsavel', e.target.value as Responsavel | '')}>
                                <option value="">—</option>
                                {(Object.keys(ROTULO_RESPONSAVEL) as Responsavel[]).map(r => <option key={r} value={r}>{ROTULO_RESPONSAVEL[r]}</option>)}
                            </select>
                        </div>
                    </div>
                </div>
            </SheetPanel>
            <RodapeComMotivo erro={erro} motivo={motivo} salvando={salvando} onClose={onClose} onSalvar={salvar} rotulo={atual ? 'Salvar' : 'Incluir'} />
        </Sheet>
    );
};

export const RodapeComMotivo: React.FC<{
    erro: string | null; motivo: string | null; salvando: boolean; onClose: () => void; onSalvar: () => void; rotulo: string; voltar?: string;
}> = ({ erro, motivo, salvando, onClose, onSalvar, rotulo, voltar = 'Cancelar' }) => (
    <SheetFooter>
        <div className="flex items-center justify-end gap-3 w-full">
            {erro && <p className="mr-auto flex items-center gap-1.5 text-sm text-red-600"><AlertCircle className="w-4 h-4 shrink-0" /> {erro}</p>}
            <GhostButton onClick={onClose}>{voltar}</GhostButton>
            <span title={motivo ?? undefined}>
                <PrimaryButton onClick={onSalvar} disabled={!!motivo} className={motivo ? 'pointer-events-none' : ''}>
                    {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    {rotulo}
                </PrimaryButton>
            </span>
        </div>
    </SheetFooter>
);

export default PainelManutencaoDoSindico;
