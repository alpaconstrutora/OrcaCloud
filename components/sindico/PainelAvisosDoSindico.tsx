import React from 'react';
import { Megaphone, Plus, Loader2 } from 'lucide-react';
import { PortalCard, CardHeader, PrimaryButton, GhostButton, StatusPill, PortalEmpty, fmtDate } from '../portal/PortalKit';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import {
    sindicoPortalService, CATEGORIAS_DE_AVISO, type AvisoParaSindico, type CondominioDoSindico, type IdentidadeDoSindico,
} from '../../services/sindicoPortalService';
import { hojeEmBrasilia } from '../../utils/mandatoSindico';

/**
 * Portal do Síndico › Avisos (F2): o mural do prédio — vigentes e encerrados,
 * com quantos moradores leram — e "Publicar aviso". O aviso publicado aqui cai
 * no MESMO mural que o morador vê na aba Condomínio do Portal do Cliente.
 * Plano: docs/planos/2026-10-20-portal-do-sindico.md
 *
 * Publicar é painel lateral (REGRA #4 / UI_PATTERNS), não modal: o síndico está
 * escrevendo, não confirmando. Encerrar não apaga (as leituras ficam): só
 * vence a validade, e só nos avisos que ele mesmo publicou.
 */

const ROTULO_CATEGORIA: Record<string, string> = Object.fromEntries(CATEGORIAS_DE_AVISO.map(c => [c.id, c.label]));

interface Props {
    identidade: IdentidadeDoSindico;
    avisos: AvisoParaSindico[];
    condominios: CondominioDoSindico[];
    somenteLeitura: boolean;
    onAlterado: () => void;
    notify: (m: string, t?: 'success' | 'error') => void;
}

const CAMPO = 'w-full h-10 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E1553C]/20 focus:border-[#E1553C]';
const ROTULO = 'text-xs font-semibold text-slate-500';

const PainelAvisosDoSindico: React.FC<Props> = ({ identidade, avisos, condominios, somenteLeitura, onAlterado, notify }) => {
    const confirm = useConfirm();
    const multi = condominios.length > 1;
    const [aberto, setAberto] = React.useState(false);
    const [salvando, setSalvando] = React.useState(false);
    const [encerrando, setEncerrando] = React.useState<string | null>(null);
    const vazio = { condominioId: condominios[0]?.id ?? '', titulo: '', corpo: '', categoria: 'AVISO', validoAte: '' };
    const [form, setForm] = React.useState(vazio);
    const sujo = !!(form.titulo || form.corpo || form.validoAte);

    const abrir = () => { setForm({ ...vazio, condominioId: condominios[0]?.id ?? '' }); setAberto(true); };

    const motivoPublicar = !form.titulo.trim() ? 'Informe o título do aviso.' : !form.condominioId ? 'Escolha o condomínio.' : null;

    const publicar = async () => {
        if (motivoPublicar || salvando) return;
        setSalvando(true);
        try {
            await sindicoPortalService.publicarAviso(identidade, { ...form, validoAte: form.validoAte || null });
            notify('Aviso publicado. Os moradores já veem no portal.');
            setAberto(false);
            onAlterado();
        } catch (e) {
            notify((e as Error).message, 'error');
        } finally {
            setSalvando(false);
        }
    };

    const encerrar = async (a: AvisoParaSindico) => {
        const ok = await confirm({
            title: 'Encerrar este aviso?',
            message: `"${a.titulo}" sai do mural dos moradores. Ele continua aqui, com as leituras.`,
            variant: 'warning',
            confirmLabel: 'Encerrar',
        });
        if (!ok) return;
        setEncerrando(a.id);
        try {
            await sindicoPortalService.encerrarAviso(identidade, a.id);
            notify('Aviso encerrado.');
            onAlterado();
        } catch (e) {
            notify((e as Error).message, 'error');
        } finally {
            setEncerrando(null);
        }
    };

    return (
        <>
            <PortalCard>
                <CardHeader
                    title="Avisos do condomínio"
                    subtitle="O que você publica aparece no mural dos moradores"
                    right={!somenteLeitura && (
                        <PrimaryButton onClick={abrir}><Plus className="w-4 h-4" /> Publicar aviso</PrimaryButton>
                    )}
                />
                {avisos.length === 0 ? (
                    <PortalEmpty icon={<Megaphone className="w-10 h-10" />} title="Nenhum aviso publicado"
                        subtitle={somenteLeitura ? undefined : 'Publique o primeiro: assembleia, obra, manutenção…'} />
                ) : (
                    <ul className="divide-y divide-[#ECECEF] border-t border-[#ECECEF]">
                        {avisos.map(a => (
                            <li key={a.id} className="px-5 py-4 flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-semibold text-[#1F2430]">{a.titulo}</span>
                                        <StatusPill tone={a.categoria === 'URGENTE' ? 'accent' : 'info'}>{ROTULO_CATEGORIA[a.categoria] ?? a.categoria}</StatusPill>
                                        {!a.vigente && <StatusPill tone="muted">Encerrado</StatusPill>}
                                    </div>
                                    {a.corpo && <p className="text-sm text-[#4A505C] mt-1 whitespace-pre-line">{a.corpo}</p>}
                                    <p className="text-xs text-gray-400 mt-1.5">
                                        {[
                                            a.publicadoEm ? fmtDate(a.publicadoEm) : null,
                                            a.publicadoPor,
                                            multi ? a.condominioNome : null,
                                            a.validoAte ? `válido até ${fmtDate(a.validoAte)}` : null,
                                            `${a.leituras} ${a.leituras === 1 ? 'leitura' : 'leituras'}`,
                                        ].filter(Boolean).join(' · ')}
                                    </p>
                                </div>
                                {!somenteLeitura && a.meu && a.vigente && (
                                    <GhostButton onClick={() => encerrar(a)} disabled={encerrando === a.id}>
                                        {encerrando === a.id && <Loader2 className="w-4 h-4 animate-spin" />}
                                        Encerrar
                                    </GhostButton>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </PortalCard>

            <Sheet open={aberto} onClose={() => setAberto(false)} size="md" dirty={sujo && !salvando}>
                <SheetHeader onClose={() => setAberto(false)}>
                    <SheetTitle>Publicar aviso</SheetTitle>
                    <SheetDescription>Vai para o mural dos moradores no portal</SheetDescription>
                </SheetHeader>
                <SheetPanel className="p-4 md:p-6">
                    <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                        {multi && (
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="aviso-condominio">Condomínio</label>
                                <select id="aviso-condominio" className={CAMPO} value={form.condominioId}
                                    onChange={e => setForm(f => ({ ...f, condominioId: e.target.value }))}>
                                    {condominios.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                                </select>
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="aviso-titulo">Título</label>
                            <input id="aviso-titulo" className={CAMPO} value={form.titulo} maxLength={160}
                                placeholder="Ex.: Assembleia geral ordinária"
                                onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="aviso-corpo">Texto</label>
                            <textarea id="aviso-corpo" rows={6} value={form.corpo}
                                className={`${CAMPO} h-auto py-2`}
                                placeholder="Data, horário, local, o que muda para o morador…"
                                onChange={e => setForm(f => ({ ...f, corpo: e.target.value }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="aviso-categoria">Categoria</label>
                                <select id="aviso-categoria" className={CAMPO} value={form.categoria}
                                    onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                                    {CATEGORIAS_DE_AVISO.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="aviso-validade">Válido até (opcional)</label>
                                <input id="aviso-validade" type="date" className={CAMPO} value={form.validoAte} min={hojeEmBrasilia()}
                                    onChange={e => setForm(f => ({ ...f, validoAte: e.target.value }))} />
                            </div>
                        </div>
                    </div>
                </SheetPanel>
                <SheetFooter>
                    <GhostButton onClick={() => setAberto(false)}>Cancelar</GhostButton>
                    <PrimaryButton onClick={publicar} disabled={!!motivoPublicar || salvando} title={motivoPublicar ?? undefined}>
                        {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
                        Publicar
                    </PrimaryButton>
                </SheetFooter>
            </Sheet>
        </>
    );
};

export default PainelAvisosDoSindico;
