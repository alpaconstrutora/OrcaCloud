import React from 'react';
import { AlertCircle, Ban, CheckCircle2, Loader2, Undo2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { DetailField, GhostButton, PrimaryButton, fmtBRLCents, fmtDate } from '../portal/PortalKit';
import { sindicoPortalService, type CondominioDoFinanceiro, type IdentidadeDoSindico } from '../../services/sindicoPortalService';
import { FORMAS_PAGAMENTO } from '../../utils/baixaRecebivel';
import { hojeEmBrasilia } from '../../utils/mandatoSindico';
import type { TituloDoCondominio } from '../../utils/financeiroDoSindico';

/**
 * Portal do Síndico › Financeiro — dar baixa (pagar OU receber, pelo sentido
 * do título — G2a), desfazer a baixa e cancelar.
 * Plano: docs/planos/2026-10-24-portal-sindico-financeiro.md (pagar) e
 * docs/planos/2026-10-24-portal-sindico-gestao-completa.md (G2a: receber, desfazer).
 *
 * Dois painéis pequenos da mesma linha da tabela. Baixa = espelho de
 * `payableService.darBaixa` (data não futura, forma, conta opcional — sem conta
 * própria do condomínio a baixa sai sem conta). Cancelar pede o motivo, que vai
 * para o log `sindico_financeiro_eventos`; a linha nunca é apagada.
 */

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-10 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E1553C]/20 focus:border-[#E1553C] disabled:bg-gray-50 disabled:cursor-not-allowed';

const Resumo: React.FC<{ titulo: TituloDoCondominio }> = ({ titulo }) => (
    <div className="rounded-[10px] border border-gray-100 bg-gray-50/60 px-4 py-2">
        <DetailField label="Conta">{titulo.descricao || '—'}</DetailField>
        <DetailField label={titulo.direcao === 'CREDIT' ? 'Quem paga' : 'Credor'}>{titulo.credor || '—'}</DetailField>
        <DetailField label="Vencimento">{fmtDate(titulo.vencimento)}</DetailField>
        <DetailField label="Valor">{fmtBRLCents(Number(titulo.valor) || 0)}</DetailField>
    </div>
);

interface BaixaProps {
    titulo: TituloDoCondominio | null;
    identidade: IdentidadeDoSindico;
    condominio: CondominioDoFinanceiro | null;
    onClose: () => void;
    onSalvo: (mensagem: string) => void;
}

export const BaixaDoTituloSheet: React.FC<BaixaProps> = ({ titulo, identidade, condominio, onClose, onSalvo }) => {
    const hoje = hojeEmBrasilia();
    const [data, setData] = React.useState(hoje);
    const [forma, setForma] = React.useState<string>('');
    const [conta, setConta] = React.useState<string>('');
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!titulo) return;
        setData(hoje); setForma(titulo.formaPagamento ?? ''); setConta(titulo.contaId ?? ''); setErro(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [titulo?.id]);

    const contas = condominio?.contas ?? [];
    const receber = titulo?.direcao === 'CREDIT';
    const palavra = receber ? 'recebimento' : 'pagamento';
    const motivo = !data ? `Informe a data do ${palavra}.` : data > hoje ? `A data do ${palavra} não pode ser futura.` : null;

    const salvar = async () => {
        if (!titulo || motivo || salvando) return;
        setSalvando(true);
        setErro(null);
        try {
            const dados = { data, forma: forma || null, contaId: conta || null };
            if (receber) await sindicoPortalService.receberTitulo(identidade, titulo.id, dados);
            else await sindicoPortalService.baixarTitulo(identidade, titulo.id, dados);
            onSalvo(receber ? 'Recebimento registrado.' : 'Baixa registrada.');
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível dar baixa.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={!!titulo} onClose={onClose} size="md">
            <SheetHeader onClose={onClose}>
                <SheetTitle>{receber ? 'Registrar recebimento' : 'Dar baixa'}</SheetTitle>
                <SheetDescription>{receber ? 'Registra que este valor entrou' : 'Registra que esta conta foi paga'}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-4 md:p-6">
                {titulo && (
                    <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                        <Resumo titulo={titulo} />
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="baixa-data">Data do {palavra} *</label>
                                <input id="baixa-data" type="date" className={CAMPO} value={data} max={hoje} onChange={e => setData(e.target.value)} />
                                {motivo && <p className="text-xs text-red-600">{motivo}</p>}
                            </div>
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="baixa-forma">Forma de pagamento</label>
                                <select id="baixa-forma" className={CAMPO} value={forma} onChange={e => setForma(e.target.value)}>
                                    <option value="">—</option>
                                    {FORMAS_PAGAMENTO.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1.5 col-span-2">
                                <label className={ROTULO} htmlFor="baixa-conta">{receber ? 'Conta onde entrou' : 'Conta de pagamento'}</label>
                                <select id="baixa-conta" className={CAMPO} value={conta} onChange={e => setConta(e.target.value)}
                                    disabled={contas.length === 0} title={contas.length === 0 ? 'Nenhuma conta bancária atende este condomínio.' : undefined}>
                                    <option value="">—</option>
                                    {contas.map(a => <option key={a.id} value={a.id}>{a.name}{a.bank ? ` · ${a.bank}` : ''}</option>)}
                                </select>
                                {contas.length === 0 && (
                                    <p className="text-xs text-gray-500">O condomínio ainda não tem conta bancária cadastrada (Financeiro › Contas bancárias) — a baixa sai sem conta.</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </SheetPanel>
            <SheetFooter>
                <div className="flex items-center justify-end gap-3 w-full">
                    {erro && <p className="mr-auto flex items-center gap-1.5 text-sm text-red-600"><AlertCircle className="w-4 h-4 shrink-0" /> {erro}</p>}
                    <GhostButton onClick={onClose}>Cancelar</GhostButton>
                    <PrimaryButton onClick={salvar} disabled={!!motivo || salvando} title={motivo ?? (salvando ? 'Gravando…' : undefined)}>
                        {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        {receber ? 'Confirmar recebimento' : 'Confirmar pagamento'}
                    </PrimaryButton>
                </div>
            </SheetFooter>
        </Sheet>
    );
};

interface CancelarProps {
    titulo: TituloDoCondominio | null;
    identidade: IdentidadeDoSindico;
    onClose: () => void;
    onSalvo: (mensagem: string) => void;
}

export const CancelarTituloSheet: React.FC<CancelarProps> = ({ titulo, identidade, onClose, onSalvo }) => {
    const [motivo, setMotivo] = React.useState('');
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    React.useEffect(() => { if (titulo) { setMotivo(''); setErro(null); } }, [titulo?.id]);

    const bloqueio = !motivo.trim() ? 'Diga por que a conta está sendo cancelada.' : null;

    const salvar = async () => {
        if (!titulo || bloqueio || salvando) return;
        setSalvando(true);
        setErro(null);
        try {
            await sindicoPortalService.cancelarTitulo(identidade, titulo.id, motivo.trim());
            onSalvo('Conta cancelada.');
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível cancelar.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={!!titulo} onClose={onClose} size="md" dirty={!!motivo.trim() && !salvando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Cancelar conta</SheetTitle>
                <SheetDescription>A conta sai do que falta pagar. O registro fica, com o motivo.</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-4 md:p-6">
                {titulo && (
                    <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                        <Resumo titulo={titulo} />
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="cancelar-motivo">Motivo *</label>
                            <textarea id="cancelar-motivo" rows={4} className={`${CAMPO} h-auto py-2`} value={motivo}
                                placeholder="Ex.: lançada em dobro; serviço não realizado"
                                onChange={e => setMotivo(e.target.value)} />
                        </div>
                    </div>
                )}
            </SheetPanel>
            <SheetFooter>
                <div className="flex items-center justify-end gap-3 w-full">
                    {erro && <p className="mr-auto flex items-center gap-1.5 text-sm text-red-600"><AlertCircle className="w-4 h-4 shrink-0" /> {erro}</p>}
                    <GhostButton onClick={onClose}>Voltar</GhostButton>
                    <PrimaryButton onClick={salvar} disabled={!!bloqueio || salvando} title={bloqueio ?? (salvando ? 'Gravando…' : undefined)}>
                        {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                        Cancelar conta
                    </PrimaryButton>
                </div>
            </SheetFooter>
        </Sheet>
    );
};

interface DesfazerProps {
    titulo: TituloDoCondominio | null;
    identidade: IdentidadeDoSindico;
    onClose: () => void;
    onSalvo: (mensagem: string) => void;
}

/** Desfazer a baixa (G2a): o título volta para "em aberto"; o motivo vai para o log. */
export const DesfazerBaixaSheet: React.FC<DesfazerProps> = ({ titulo, identidade, onClose, onSalvo }) => {
    const [motivo, setMotivo] = React.useState('');
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    React.useEffect(() => { if (titulo) { setMotivo(''); setErro(null); } }, [titulo?.id]);

    const receber = titulo?.direcao === 'CREDIT';
    const bloqueio = !motivo.trim() ? 'Diga por que a baixa está sendo desfeita.' : null;

    const salvar = async () => {
        if (!titulo || bloqueio || salvando) return;
        setSalvando(true);
        setErro(null);
        try {
            await sindicoPortalService.desfazerBaixa(identidade, titulo.id, motivo.trim());
            onSalvo(receber ? 'Recebimento desfeito: o título voltou a ficar em aberto.' : 'Pagamento desfeito: a conta voltou a ficar em aberto.');
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível desfazer a baixa.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={!!titulo} onClose={onClose} size="md" dirty={!!motivo.trim() && !salvando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>{receber ? 'Desfazer o recebimento' : 'Desfazer o pagamento'}</SheetTitle>
                <SheetDescription>O título volta a ficar em aberto. O registro fica, com o motivo.</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-4 md:p-6">
                {titulo && (
                    <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                        <Resumo titulo={titulo} />
                        {titulo.pagoEm && (
                            <p className="text-sm text-[#4A505C]">{receber ? 'Recebido' : 'Pago'} em {fmtDate(titulo.pagoEm)}.</p>
                        )}
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="desfazer-motivo">Motivo *</label>
                            <textarea id="desfazer-motivo" rows={4} className={`${CAMPO} h-auto py-2`} value={motivo}
                                placeholder="Ex.: baixa lançada no título errado"
                                onChange={e => setMotivo(e.target.value)} />
                        </div>
                    </div>
                )}
            </SheetPanel>
            <SheetFooter>
                <div className="flex items-center justify-end gap-3 w-full">
                    {erro && <p className="mr-auto flex items-center gap-1.5 text-sm text-red-600"><AlertCircle className="w-4 h-4 shrink-0" /> {erro}</p>}
                    <GhostButton onClick={onClose}>Voltar</GhostButton>
                    <PrimaryButton onClick={salvar} disabled={!!bloqueio || salvando} title={bloqueio ?? (salvando ? 'Gravando…' : undefined)}>
                        {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
                        Desfazer baixa
                    </PrimaryButton>
                </div>
            </SheetFooter>
        </Sheet>
    );
};
