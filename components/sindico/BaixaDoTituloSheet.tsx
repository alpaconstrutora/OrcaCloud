import React from 'react';
import { AlertCircle, Ban, CheckCircle2, Loader2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { DetailField, GhostButton, PrimaryButton, fmtBRLCents, fmtDate } from '../portal/PortalKit';
import { sindicoPortalService, type CondominioDoFinanceiro, type IdentidadeDoSindico } from '../../services/sindicoPortalService';
import { FORMAS_PAGAMENTO } from '../../utils/baixaRecebivel';
import { hojeEmBrasilia } from '../../utils/mandatoSindico';
import type { TituloDoCondominio } from '../../utils/financeiroDoSindico';

/**
 * Portal do Síndico › Financeiro › Contas a pagar — dar baixa e cancelar.
 * Plano: docs/planos/2026-10-24-portal-sindico-financeiro.md
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
        <DetailField label="Credor">{titulo.credor || '—'}</DetailField>
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
    const motivo = !data ? 'Informe a data do pagamento.' : data > hoje ? 'A data do pagamento não pode ser futura.' : null;

    const salvar = async () => {
        if (!titulo || motivo || salvando) return;
        setSalvando(true);
        setErro(null);
        try {
            await sindicoPortalService.baixarTitulo(identidade, titulo.id, { data, forma: forma || null, contaId: conta || null });
            onSalvo('Baixa registrada.');
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível dar baixa.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={!!titulo} onClose={onClose} size="md">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Dar baixa</SheetTitle>
                <SheetDescription>Registra que esta conta foi paga</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-4 md:p-6">
                {titulo && (
                    <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                        <Resumo titulo={titulo} />
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="baixa-data">Data do pagamento *</label>
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
                                <label className={ROTULO} htmlFor="baixa-conta">Conta de pagamento</label>
                                <select id="baixa-conta" className={CAMPO} value={conta} onChange={e => setConta(e.target.value)}
                                    disabled={contas.length === 0} title={contas.length === 0 ? 'Nenhuma conta bancária atende este condomínio.' : undefined}>
                                    <option value="">—</option>
                                    {contas.map(a => <option key={a.id} value={a.id}>{a.name}{a.bank ? ` · ${a.bank}` : ''}</option>)}
                                </select>
                                {contas.length === 0 && (
                                    <p className="text-xs text-gray-500">O condomínio ainda não tem conta bancária cadastrada — a baixa sai sem conta.</p>
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
                        Confirmar pagamento
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
