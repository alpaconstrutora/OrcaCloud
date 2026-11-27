import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, Plus, Users } from 'lucide-react';
import {
    CardHeader, GhostButton, PortalCard, PortalEmpty, PortalLoading, PortalTabs, PrimaryButton, StatusPill, Td, TextLinkButton, Th, fmtDate,
} from '../portal/PortalKit';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import { usePersistedState } from '../ui/TableUtils';
import PainelUnidadesDoPredio from './PainelUnidadesDoPredio';
import { sindicoPortalService, type CondominioDoSindico, type IdentidadeDoSindico, type PortalSindico } from '../../services/sindicoPortalService';
import {
    ROTULO_PAPEL, motivoDoEmail, motivoDoMorador, motivoNaoConvida, motivoNaoEncerra, pessoasDoPredio,
    type FormMorador, type OcupacaoDoPredio, type PapelDoMorador, type UnidadeComMoradores,
} from '../../utils/moradoresDoSindico';
import { MOTIVO_SEM_LOGIN } from '../../utils/financeiroDoSindico';
import { hojeEmBrasilia } from '../../utils/mandatoSindico';

/**
 * Portal do Síndico › Unidades (G6, 26/11/2026): sub-abas "Unidades e cotas" (a de antes,
 * `PainelUnidadesDoPredio`) e "Moradores" — cadastrar morador numa unidade, corrigir o
 * contato, encerrar a ocupação e CONVIDAR ao portal.
 * Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md
 * Pronto quando: síndico cadastra um morador e envia o acesso ao portal.
 *
 * O convite sai pela Edge `portal-invite-user` (a mesma do app): o link de criar senha vai
 * SÓ para o e-mail do morador. O síndico é externo, e o link do Portal do Cliente abre tudo
 * o que a pessoa tem com a organização (contratos, cobranças) — ele nunca o vê.
 */

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E1553C]/20 focus:border-[#E1553C]';
const CAMPO_DO_TOPO = 'h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#E1553C]/20 focus:border-[#E1553C]';

const Acao: React.FC<{ motivo: string | null; onClick: () => void; children: React.ReactNode }> = ({ motivo, onClick, children }) => (
    <span title={motivo ?? undefined} className={motivo ? 'cursor-not-allowed' : undefined}>
        <TextLinkButton onClick={onClick} disabled={!!motivo} className={motivo ? 'pointer-events-none text-gray-300 disabled:opacity-100' : ''}>
            {children}
        </TextLinkButton>
    </span>
);

interface PropsDaAba {
    identidade: IdentidadeDoSindico;
    dados: PortalSindico;
    logado: boolean;
    notify: (m: string, t?: 'success' | 'error') => void;
    onAlterado: () => void;
}

/** A aba Unidades inteira: as duas sub-abas. */
export const AbaUnidadesDoSindico: React.FC<PropsDaAba> = ({ identidade, dados, logado, notify, onAlterado }) => {
    const [sub, setSub] = usePersistedState<string>('sindicoPortal:unidades:subaba', 'cotas');
    return (
        <>
            <PortalCard className="overflow-hidden">
                <PortalTabs tabs={[{ id: 'cotas', label: 'Unidades e cotas' }, { id: 'moradores', label: 'Moradores' }]}
                    active={sub === 'moradores' ? 'moradores' : 'cotas'} onChange={setSub} />
            </PortalCard>
            {sub === 'moradores'
                ? <PainelMoradoresDoSindico identidade={identidade} condominios={dados.condominios} logado={logado} notify={notify} onAlterado={onAlterado} />
                : <PainelUnidadesDoPredio condominios={dados.condominios} unidades={dados.unidades} rateios={dados.rateios} />}
        </>
    );
};

interface Props {
    identidade: IdentidadeDoSindico;
    condominios: CondominioDoSindico[];
    logado: boolean;
    notify: (m: string, t?: 'success' | 'error') => void;
    /** "Unidades e cotas" e a visão geral leem o payload do portal: reler depois de mudar. */
    onAlterado: () => void;
}

const PainelMoradoresDoSindico: React.FC<Props> = ({ identidade, condominios, logado, notify, onAlterado }) => {
    const confirm = useConfirm();
    const [salvo, setCondominioId] = usePersistedState<string>('sindicoPortal:moradores:condominio', condominios[0]?.id ?? '');
    const condominioId = condominios.some(c => c.id === salvo) ? salvo : (condominios[0]?.id ?? '');
    const [unidades, setUnidades] = React.useState<UnidadeComMoradores[] | null>(null);
    const [motivoDoPredio, setMotivoDoPredio] = React.useState<string | null>(null);
    const [erro, setErro] = React.useState<string | null>(null);
    const [versao, setVersao] = React.useState(0);
    const [verEncerradas, setVerEncerradas] = React.useState(false);
    const [novo, setNovo] = React.useState(false);
    const [contato, setContato] = React.useState<OcupacaoDoPredio | null>(null);
    const [encerrando, setEncerrando] = React.useState<OcupacaoDoPredio | null>(null);
    const [convidando, setConvidando] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!condominioId) return;
        let vivo = true;
        setErro(null);
        sindicoPortalService.getMoradores(identidade, condominioId)
            .then(r => { if (vivo) { setUnidades(r.unidades); setMotivoDoPredio(r.motivoNaoOpera); } })
            .catch(e => { if (vivo) { setUnidades(null); setErro(e instanceof Error ? e.message : 'Não foi possível carregar os moradores.'); } });
        return () => { vivo = false; };
    }, [identidade, condominioId, versao]);

    const motivoBase = !logado ? MOTIVO_SEM_LOGIN : !unidades ? 'Carregando o condomínio…' : motivoDoPredio;
    const recarregar = () => { setVersao(v => v + 1); onAlterado(); };
    const depois = (m: string) => { setNovo(false); setContato(null); setEncerrando(null); notify(m); recarregar(); };

    const convidar = async (o: OcupacaoDoPredio) => {
        const ok = await confirm({
            title: `Convidar ${o.nome} para o portal?`,
            message: `O convite vai para ${o.email}. Ele cria a senha e passa a ver o condomínio no Portal do Cliente — avisos, documentos e as cotas da unidade.`,
            confirmLabel: 'Enviar convite',
        });
        if (!ok) return;
        setConvidando(o.id);
        try {
            const r = await sindicoPortalService.convidarMorador(identidade, condominioId, o.clientId);
            notify(r.kind === 'recovery'
                ? `${o.nome} já tinha conta: enviamos o link para definir uma nova senha.`
                : `Convite enviado para ${o.email}.`);
            recarregar();
        } catch (e) {
            notify(e instanceof Error ? e.message : 'Não foi possível enviar o convite.', 'error');
        } finally {
            setConvidando(null);
        }
    };

    const linhas = (unidades ?? []).flatMap(u => u.ocupacoes.filter(o => verEncerradas || o.vigente).map(o => ({ u, o })));
    // PESSOAS, não ocupações: o dono costuma ser também o responsável financeiro (o Bella Vista
    // tem 8 pessoas em 16 ocupações — a 1ª versão dizia "16 sem e-mail").
    const semEmail = new Set((unidades ?? []).flatMap(u => u.ocupacoes).filter(o => o.vigente && !o.email).map(o => o.clientId)).size;

    return (
        <>
            <PortalCard>
                <CardHeader
                    title="Moradores"
                    subtitle="Quem é dono, mora ou paga em cada unidade — e quem já tem acesso ao portal"
                    right={
                        <div className="flex flex-wrap items-center gap-3">
                            {condominios.length > 1 && (
                                <label className="flex items-center gap-2 text-[13px] text-[#8A8F9A] min-w-0">
                                    Condomínio
                                    <select value={condominioId} onChange={e => setCondominioId(e.target.value)} className={`${CAMPO_DO_TOPO} min-w-0 max-w-[16rem]`}>
                                        {condominios.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                                    </select>
                                </label>
                            )}
                            <span title={motivoBase ?? undefined}>
                                <PrimaryButton onClick={() => setNovo(true)} disabled={!!motivoBase} className={motivoBase ? 'pointer-events-none' : ''}>
                                    <Plus className="w-4 h-4" /> Novo morador
                                </PrimaryButton>
                            </span>
                        </div>
                    }
                />
                {unidades && semEmail > 0 && (
                    <p className="px-5 pb-3 text-[13px] text-amber-700 flex items-start gap-1.5">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        {semEmail} {semEmail === 1 ? 'morador está' : 'moradores estão'} sem e-mail — sem ele não há convite para o portal nem voto pela internet nas assembleias.
                    </p>
                )}
                {erro ? (
                    <p className="px-5 pb-5 text-sm text-[#4A505C] flex items-start gap-2"><AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" /> {erro}</p>
                ) : !unidades ? (
                    <PortalLoading label="Carregando os moradores..." />
                ) : linhas.length === 0 ? (
                    <PortalEmpty icon={<Users className="w-8 h-8" />} title="Nenhum morador cadastrado"
                        subtitle="Cadastre o proprietário e quem mora em cada unidade para convidá-los ao portal." />
                ) : (
                    <div className="overflow-x-auto border-t border-[#ECECEF]">
                        <table className="w-full min-w-[860px]">
                            <thead className="border-b border-[#ECECEF]">
                                <tr><Th>Unidade</Th><Th>Pessoa</Th><Th>Contato</Th><Th>Portal</Th><Th>Ações</Th></tr>
                            </thead>
                            <tbody className="divide-y divide-[#ECECEF]">
                                {linhas.map(({ u, o }) => (
                                    <tr key={o.id} className={`hover:bg-gray-50/70 transition-colors align-top ${o.vigente ? '' : 'opacity-60'}`}>
                                        <Td className="whitespace-nowrap text-[#1F2430]">
                                            {u.unidade}
                                            {u.torre && <span className="block text-[11px] text-gray-400">{u.torre}</span>}
                                        </Td>
                                        <Td className="text-[#1F2430]">
                                            {o.nome}
                                            <span className="block text-[11px] text-gray-400">
                                                {ROTULO_PAPEL[o.papel]} · desde {fmtDate(o.desde)}{o.ate ? ` · saiu ${fmtDate(o.ate)}` : ''}
                                            </span>
                                        </Td>
                                        <Td>
                                            {o.email || <span className="text-amber-700">Sem e-mail</span>}
                                            {o.telefone && <span className="block text-[11px] text-gray-400">{o.telefone}</span>}
                                        </Td>
                                        <Td className="whitespace-nowrap">
                                            {o.convidadoEm
                                                ? <StatusPill tone="good">Convidado {fmtDate(o.convidadoEm.slice(0, 10))}</StatusPill>
                                                : <StatusPill tone="muted">Não convidado</StatusPill>}
                                        </Td>
                                        <Td className="whitespace-nowrap">
                                            <span className="inline-flex items-center gap-3">
                                                <Acao motivo={convidando === o.id ? 'Enviando…' : motivoNaoConvida(o, motivoBase)} onClick={() => convidar(o)}>
                                                    {o.convidadoEm ? 'Convidar de novo' : 'Convidar'}
                                                </Acao>
                                                <Acao motivo={motivoBase ?? (o.vigente ? null : 'Só o contato de quem mora no condomínio muda por aqui.')} onClick={() => setContato(o)}>Contato</Acao>
                                                <Acao motivo={motivoNaoEncerra(o, motivoBase)} onClick={() => setEncerrando(o)}>Encerrar</Acao>
                                            </span>
                                        </Td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <label className="flex items-center gap-2 text-[13px] text-[#4A505C]">
                        <input type="checkbox" checked={verEncerradas} onChange={e => setVerEncerradas(e.target.checked)} className="accent-[#E1553C]" />
                        Mostrar quem já saiu
                    </label>
                    {motivoBase && unidades && <p className="text-xs text-gray-500">{motivoBase}</p>}
                </div>
            </PortalCard>

            {unidades && (
                <>
                    <NovoMoradorSheet open={novo} unidades={unidades} identidade={identidade} condominioId={condominioId}
                        onClose={() => setNovo(false)} onSalvo={depois} />
                    <ContatoSheet ocupacao={contato} identidade={identidade} condominioId={condominioId} onClose={() => setContato(null)} onSalvo={depois} />
                    <EncerrarSheet ocupacao={encerrando} identidade={identidade} condominioId={condominioId} onClose={() => setEncerrando(null)} onSalvo={depois} />
                </>
            )}
        </>
    );
};

const Rodape: React.FC<{ erro: string | null; motivo: string | null; salvando: boolean; onClose: () => void; onSalvar: () => void; rotulo: string }> =
    ({ erro, motivo, salvando, onClose, onSalvar, rotulo }) => (
        <SheetFooter>
            <div className="flex items-center justify-end gap-3 w-full">
                {erro && <p className="mr-auto flex items-center gap-1.5 text-sm text-red-600"><AlertCircle className="w-4 h-4 shrink-0" /> {erro}</p>}
                <GhostButton onClick={onClose}>Cancelar</GhostButton>
                <span title={motivo ?? undefined}>
                    <PrimaryButton onClick={onSalvar} disabled={!!motivo} className={motivo ? 'pointer-events-none' : ''}>
                        {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        {rotulo}
                    </PrimaryButton>
                </span>
            </div>
        </SheetFooter>
    );

// ── Novo morador ─────────────────────────────────────────────────────────────
const formVazio = (unidades: UnidadeComMoradores[]): FormMorador => ({
    unitId: unidades[0]?.unitId ?? '', papel: 'MORADOR', desde: hojeEmBrasilia(), clientId: '',
    nome: '', documento: '', email: '', telefone: '',
});

const NovoMoradorSheet: React.FC<{
    open: boolean; unidades: UnidadeComMoradores[]; identidade: IdentidadeDoSindico; condominioId: string;
    onClose: () => void; onSalvo: (m: string) => void;
}> = ({ open, unidades, identidade, condominioId, onClose, onSalvo }) => {
    const [form, setForm] = React.useState<FormMorador>(formVazio(unidades));
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    React.useEffect(() => { if (open) { setForm(formVazio(unidades)); setErro(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const set = <K extends keyof FormMorador>(k: K, v: FormMorador[K]) => setForm(f => ({ ...f, [k]: v }));
    const pessoas = React.useMemo(() => pessoasDoPredio(unidades), [unidades]);
    const sujo = open && JSON.stringify(form) !== JSON.stringify(formVazio(unidades));
    const motivo = salvando ? 'Gravando…' : motivoDoMorador(form);

    const salvar = async () => {
        if (motivo) return;
        setSalvando(true);
        setErro(null);
        try {
            const r = await sindicoPortalService.salvarMorador(identidade, condominioId, form);
            onSalvo(r.reaproveitado ? 'Morador cadastrado — a pessoa já tinha cadastro e ele foi reaproveitado.' : 'Morador cadastrado.');
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível cadastrar o morador.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} size="md" dirty={sujo && !salvando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Novo morador</SheetTitle>
                <SheetDescription>Dono, inquilino, morador ou responsável financeiro de uma unidade</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-4 md:p-6">
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="mor-unidade">Unidade *</label>
                            <select id="mor-unidade" className={CAMPO} value={form.unitId} onChange={e => set('unitId', e.target.value)}>
                                {unidades.map(u => <option key={u.unitId} value={u.unitId}>{u.torre ? `${u.torre} — ${u.unidade}` : u.unidade}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="mor-papel">Papel</label>
                            <select id="mor-papel" className={CAMPO} value={form.papel} onChange={e => set('papel', e.target.value as PapelDoMorador)}>
                                {(Object.keys(ROTULO_PAPEL) as PapelDoMorador[]).map(p => <option key={p} value={p}>{ROTULO_PAPEL[p]}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="mor-desde">Desde</label>
                            <input id="mor-desde" type="date" className={CAMPO} value={form.desde} onChange={e => set('desde', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="mor-pessoa">Pessoa</label>
                            <select id="mor-pessoa" className={CAMPO} value={form.clientId} onChange={e => set('clientId', e.target.value)}>
                                <option value="">Cadastrar pessoa nova</option>
                                {pessoas.map(p => <option key={p.clientId} value={p.clientId}>{p.nome}</option>)}
                            </select>
                        </div>
                    </div>
                    {!form.clientId && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 pt-2 border-t border-gray-100">
                            <div className="space-y-1.5 sm:col-span-2">
                                <label className={ROTULO} htmlFor="mor-nome">Nome *</label>
                                <input id="mor-nome" className={CAMPO} value={form.nome} onChange={e => set('nome', e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="mor-doc">CPF ou CNPJ</label>
                                <input id="mor-doc" className={CAMPO} inputMode="numeric" value={form.documento} onChange={e => set('documento', e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="mor-tel">Telefone</label>
                                <input id="mor-tel" className={CAMPO} value={form.telefone} onChange={e => set('telefone', e.target.value)} />
                            </div>
                            <div className="space-y-1.5 sm:col-span-2">
                                <label className={ROTULO} htmlFor="mor-email">E-mail</label>
                                <input id="mor-email" type="email" className={CAMPO} value={form.email} onChange={e => set('email', e.target.value)} />
                                <p className="text-[11px] text-gray-400">Com o e-mail, a pessoa pode ser convidada ao portal e votar pela internet nas assembleias.</p>
                            </div>
                        </div>
                    )}
                </div>
            </SheetPanel>
            <Rodape erro={erro} motivo={motivo} salvando={salvando} onClose={onClose} onSalvar={salvar} rotulo="Cadastrar" />
        </Sheet>
    );
};

// ── Contato ──────────────────────────────────────────────────────────────────
const ContatoSheet: React.FC<{
    ocupacao: OcupacaoDoPredio | null; identidade: IdentidadeDoSindico; condominioId: string;
    onClose: () => void; onSalvo: (m: string) => void;
}> = ({ ocupacao, identidade, condominioId, onClose, onSalvo }) => {
    const [email, setEmail] = React.useState('');
    const [telefone, setTelefone] = React.useState('');
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    React.useEffect(() => { if (ocupacao) { setEmail(ocupacao.email ?? ''); setTelefone(ocupacao.telefone ?? ''); setErro(null); } }, [ocupacao]);

    const sujo = !!ocupacao && (email !== (ocupacao.email ?? '') || telefone !== (ocupacao.telefone ?? ''));
    const motivo = salvando ? 'Gravando…' : !sujo ? 'Nada mudou.' : motivoDoEmail(email);

    const salvar = async () => {
        if (!ocupacao || motivo) return;
        setSalvando(true);
        setErro(null);
        try {
            await sindicoPortalService.contatoMorador(identidade, condominioId, ocupacao.clientId, { email: email.trim(), telefone: telefone.trim() });
            onSalvo('Contato salvo.');
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível salvar o contato.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={!!ocupacao} onClose={onClose} size="sm" dirty={sujo && !salvando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Contato do morador</SheetTitle>
                <SheetDescription>{ocupacao?.nome}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-4 md:p-6">
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                    <div className="space-y-1.5">
                        <label className={ROTULO} htmlFor="contato-email">E-mail</label>
                        <input id="contato-email" type="email" className={CAMPO} value={email} onChange={e => setEmail(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={ROTULO} htmlFor="contato-tel">Telefone</label>
                        <input id="contato-tel" className={CAMPO} value={telefone} onChange={e => setTelefone(e.target.value)} />
                    </div>
                </div>
            </SheetPanel>
            <Rodape erro={erro} motivo={motivo} salvando={salvando} onClose={onClose} onSalvar={salvar} rotulo="Salvar" />
        </Sheet>
    );
};

// ── Encerrar (saída) ─────────────────────────────────────────────────────────
const EncerrarSheet: React.FC<{
    ocupacao: OcupacaoDoPredio | null; identidade: IdentidadeDoSindico; condominioId: string;
    onClose: () => void; onSalvo: (m: string) => void;
}> = ({ ocupacao, identidade, condominioId, onClose, onSalvo }) => {
    const [data, setData] = React.useState('');
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    React.useEffect(() => { if (ocupacao) { setData(hojeEmBrasilia()); setErro(null); } }, [ocupacao]);
    const motivo = salvando ? 'Gravando…' : !data ? 'Informe a data de saída.'
        : ocupacao && data < ocupacao.desde ? 'A saída não pode ser antes da entrada.' : null;

    const salvar = async () => {
        if (!ocupacao || motivo) return;
        setSalvando(true);
        setErro(null);
        try {
            await sindicoPortalService.encerrarMorador(identidade, condominioId, ocupacao.id, data);
            onSalvo(`${ocupacao.nome} saiu da unidade em ${fmtDate(data)}. O histórico fica.`);
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível encerrar a ocupação.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={!!ocupacao} onClose={onClose} size="sm">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Encerrar ocupação</SheetTitle>
                <SheetDescription>{ocupacao ? `${ocupacao.nome} · ${ROTULO_PAPEL[ocupacao.papel]}` : ''}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-4 md:p-6">
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-3">
                    <p className="text-sm text-[#4A505C]">Encerrar registra a saída — o histórico da unidade continua. Para corrigir um cadastro errado, fale com a administradora.</p>
                    <div className="space-y-1.5">
                        <label className={ROTULO} htmlFor="encerrar-data">Saiu em *</label>
                        <input id="encerrar-data" type="date" className={CAMPO} value={data} onChange={e => setData(e.target.value)} />
                    </div>
                </div>
            </SheetPanel>
            <Rodape erro={erro} motivo={motivo} salvando={salvando} onClose={onClose} onSalvar={salvar} rotulo="Encerrar" />
        </Sheet>
    );
};

export default PainelMoradoresDoSindico;
