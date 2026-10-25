import React from 'react';
import { ClipboardList, Loader2, Mail, Phone } from 'lucide-react';
import {
    PortalCard, CardHeader, PrimaryButton, GhostButton, TextLinkButton, StatusPill, PortalEmpty, Th, Td, fmtDate, type PillTone,
} from '../portal/PortalKit';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import {
    sindicoPortalService, SITUACOES_DO_CHAMADO, type ChamadoParaSindico, type IdentidadeDoSindico,
} from '../../services/sindicoPortalService';

/**
 * Portal do Síndico › Chamados (F2): os chamados abertos pelos moradores nas
 * unidades do prédio, e responder/mudar a situação. O morador fica sabendo pela
 * aba Mensagens do Portal do Cliente (mesmo canal que a equipe já usa); a nota
 * da equipe (`admin_notes`) não é tocada — cada resposta vira um evento no
 * histórico do chamado, que a equipe também vê em Condomínios › Manutenção.
 * Plano: docs/planos/2026-10-20-portal-do-sindico.md
 */

const TOM: Record<string, PillTone> = {
    Aberto: 'accent', 'Em Andamento': 'info', Aguardando: 'neutral', Resolvido: 'good', Cancelado: 'muted',
};

const AUTOR: Record<string, string> = { EQUIPE: 'Equipe', SINDICO: 'Síndico', MORADOR: 'Morador', SISTEMA: 'Sistema' };

const dataHora = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const CAMPO = 'w-full h-10 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E1553C]/20 focus:border-[#E1553C]';
const ROTULO = 'text-xs font-semibold text-slate-500';

interface Props {
    identidade: IdentidadeDoSindico;
    chamados: ChamadoParaSindico[];
    multi: boolean;
    onAlterado: () => void;
    notify: (m: string, t?: 'success' | 'error') => void;
}

const PainelChamadosDoSindico: React.FC<Props> = ({ identidade, chamados, multi, onAlterado, notify }) => {
    const [abertoId, setAbertoId] = React.useState<string | null>(null);
    const aberto = chamados.find(c => c.id === abertoId) ?? null;
    const [mensagem, setMensagem] = React.useState('');
    const [situacao, setSituacao] = React.useState('');
    const [enviando, setEnviando] = React.useState(false);

    const abrir = (c: ChamadoParaSindico) => { setAbertoId(c.id); setMensagem(''); setSituacao(c.status); };
    const pendentes = chamados.filter(c => c.status !== 'Resolvido' && c.status !== 'Cancelado').length;

    const mudouSituacao = !!aberto && situacao !== aberto.status;
    const motivoEnviar = !mensagem.trim() && !mudouSituacao ? 'Escreva uma resposta ou mude a situação.' : null;

    const enviar = async () => {
        if (!aberto || motivoEnviar || enviando) return;
        setEnviando(true);
        try {
            await sindicoPortalService.responderChamado(identidade, aberto.id, mensagem, mudouSituacao ? situacao : null);
            notify('Chamado atualizado. O morador recebe a mensagem no portal.');
            setAbertoId(null);
            onAlterado();
        } catch (e) {
            notify((e as Error).message, 'error');
        } finally {
            setEnviando(false);
        }
    };

    return (
        <>
            <PortalCard className="overflow-hidden">
                <CardHeader
                    title="Chamados dos moradores"
                    subtitle={chamados.length === 0 ? undefined : `${pendentes} em aberto · ${chamados.length} no total`}
                />
                {chamados.length === 0 ? (
                    <PortalEmpty icon={<ClipboardList className="w-10 h-10" />} title="Nenhum chamado aberto"
                        subtitle="Os chamados que os moradores abrem no portal aparecem aqui." />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="border-y border-[#ECECEF] bg-white">
                                <tr>
                                    <Th>Aberto em</Th>
                                    <Th>Unidade</Th>
                                    <Th>Chamado</Th>
                                    <Th>Morador</Th>
                                    <Th>Prioridade</Th>
                                    <Th>Situação</Th>
                                    <Th className="text-right">Ações</Th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#ECECEF]">
                                {chamados.map(c => (
                                    <tr key={c.id} className="align-top hover:bg-[#FAFAFB] cursor-pointer" onClick={() => abrir(c)}>
                                        <Td className="whitespace-nowrap">{fmtDate(c.abertoEm)}</Td>
                                        <Td className="whitespace-nowrap">
                                            {c.unidade}
                                            <span className="block text-xs text-gray-400">{[c.torre, multi ? c.condominioNome : null].filter(Boolean).join(' · ')}</span>
                                        </Td>
                                        <Td><span className="text-[#1F2430]">{c.titulo}</span><span className="block text-xs text-gray-400">{c.categoria}</span></Td>
                                        <Td>{c.morador || '—'}</Td>
                                        <Td className="whitespace-nowrap">{c.prioridade}</Td>
                                        <Td><StatusPill tone={TOM[c.status] ?? 'muted'}>{c.status}</StatusPill></Td>
                                        <Td className="text-right whitespace-nowrap">
                                            <TextLinkButton onClick={e => { e.stopPropagation(); abrir(c); }}>
                                                Responder
                                            </TextLinkButton>
                                        </Td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </PortalCard>

            <Sheet open={!!aberto} onClose={() => setAbertoId(null)} size="lg" dirty={!!mensagem.trim() && !enviando}>
                <SheetHeader onClose={() => setAbertoId(null)}>
                    <SheetTitle>{aberto?.titulo ?? 'Chamado'}</SheetTitle>
                    <SheetDescription>
                        {aberto ? [aberto.unidade, aberto.torre, multi ? aberto.condominioNome : null, `aberto em ${fmtDate(aberto.abertoEm)}`].filter(Boolean).join(' · ') : ''}
                    </SheetDescription>
                </SheetHeader>
                <SheetPanel className="p-4 md:p-6 space-y-6">
                    {aberto && (
                        <>
                            <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                                <div className="flex flex-wrap items-center gap-2">
                                    <StatusPill tone={TOM[aberto.status] ?? 'muted'}>{aberto.status}</StatusPill>
                                    <span className="text-xs text-gray-500">{aberto.categoria} · prioridade {aberto.prioridade}</span>
                                </div>
                                {aberto.descricao && <p className="text-sm text-gray-800 whitespace-pre-line">{aberto.descricao}</p>}
                                <div className="text-sm text-gray-700">
                                    <span className="text-xs font-semibold text-slate-500 block mb-1">Morador</span>
                                    {aberto.morador || '—'}
                                    <span className="flex flex-wrap gap-x-4 text-xs text-gray-500 mt-1">
                                        {aberto.moradorEmail && <a href={`mailto:${aberto.moradorEmail}`} className="inline-flex items-center gap-1 hover:text-[#C24428]"><Mail className="w-3 h-3" />{aberto.moradorEmail}</a>}
                                        {aberto.moradorTelefone && <a href={`tel:${aberto.moradorTelefone}`} className="inline-flex items-center gap-1 hover:text-[#C24428]"><Phone className="w-3 h-3" />{aberto.moradorTelefone}</a>}
                                    </span>
                                </div>
                                {aberto.notaDaEquipe && (
                                    <div className="text-sm text-gray-700">
                                        <span className="text-xs font-semibold text-slate-500 block mb-1">Nota da administração</span>
                                        <p className="whitespace-pre-line">{aberto.notaDaEquipe}</p>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-3">
                                <h3 className="text-sm font-semibold text-gray-900">Histórico</h3>
                                {aberto.eventos.length === 0 ? (
                                    <p className="text-sm text-gray-500">Nenhuma resposta ainda.</p>
                                ) : (
                                    <ol className="space-y-3">
                                        {aberto.eventos.map((ev, i) => (
                                            <li key={i} className="rounded-[10px] border border-gray-100 bg-white p-4">
                                                <p className="text-xs text-gray-500">
                                                    {ev.autorNome || AUTOR[ev.autorTipo] || ev.autorTipo} · {dataHora(ev.criadoEm)}
                                                    {ev.statusNovo ? ` · ${ev.statusAnterior ?? '—'} → ${ev.statusNovo}` : ''}
                                                </p>
                                                {ev.mensagem && <p className="text-sm text-gray-800 mt-1 whitespace-pre-line">{ev.mensagem}</p>}
                                            </li>
                                        ))}
                                    </ol>
                                )}
                            </div>

                            <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                                <div className="space-y-1.5">
                                    <label className={ROTULO} htmlFor="chamado-resposta">Resposta ao morador</label>
                                    <textarea id="chamado-resposta" rows={4} value={mensagem}
                                        className={`${CAMPO} h-auto py-2`}
                                        placeholder="O que foi feito, o que falta, quando volta a ser visto…"
                                        onChange={e => setMensagem(e.target.value)} />
                                </div>
                                <div className="grid grid-cols-2 gap-x-6">
                                    <div className="space-y-1.5">
                                        <label className={ROTULO} htmlFor="chamado-situacao">Situação</label>
                                        <select id="chamado-situacao" className={CAMPO} value={situacao} onChange={e => setSituacao(e.target.value)}>
                                            {SITUACOES_DO_CHAMADO.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </SheetPanel>
                <SheetFooter>
                    <GhostButton onClick={() => setAbertoId(null)}>Cancelar</GhostButton>
                    <PrimaryButton onClick={enviar} disabled={!!motivoEnviar || enviando} title={motivoEnviar ?? undefined}>
                        {enviando && <Loader2 className="w-4 h-4 animate-spin" />}
                        Enviar
                    </PrimaryButton>
                </SheetFooter>
            </Sheet>
        </>
    );
};

export default PainelChamadosDoSindico;
