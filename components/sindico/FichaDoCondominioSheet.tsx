import React from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { GhostButton, PortalLoading, PrimaryButton, fmtDate } from '../portal/PortalKit';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { sindicoPortalService, type CondominioDoSindico, type IdentidadeDoSindico } from '../../services/sindicoPortalService';
import { formDaFicha, motivoDaFicha, type FichaDoCondominio, type FormFicha } from '../../utils/fichaDoSindico';
import { MOTIVO_SEM_LOGIN } from '../../utils/financeiroDoSindico';
import { hojeEmBrasilia } from '../../utils/mandatoSindico';

/**
 * Portal do Síndico › Visão geral › Editar ficha (G7, 26/11/2026).
 * Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md
 * Pronto quando: multa/juros alterados pelo síndico entram na próxima cobrança.
 *
 * O síndico edita os dados do condomínio (razão social, CNPJ, instalação, multa e juros) —
 * a cobrança lê multa e juros daqui. Síndico, mandato e a exigência de aprovação do rateio
 * aparecem só para leitura: são da administradora (o banco recusa igual).
 */

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E1553C]/20 focus:border-[#E1553C]';

interface Props {
    condominio: CondominioDoSindico | null;
    identidade: IdentidadeDoSindico;
    /** Pode gravar: síndico com e-mail e senha, sessão do link, ou a administradora pelo app. */
    logado: boolean;
    onClose: () => void;
    onSalvo: (m: string) => void;
}

const FichaDoCondominioSheet: React.FC<Props> = ({ condominio, identidade, logado, onClose, onSalvo }) => {
    const [ficha, setFicha] = React.useState<FichaDoCondominio | null>(null);
    const [motivoDoPredio, setMotivoDoPredio] = React.useState<string | null>(null);
    const [form, setForm] = React.useState<FormFicha>(formDaFicha(null));
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    const hoje = hojeEmBrasilia();

    React.useEffect(() => {
        if (!condominio) return;
        let vivo = true;
        setFicha(null); setErro(null);
        sindicoPortalService.getFicha(identidade, condominio.id)
            .then(r => { if (vivo) { setFicha(r.ficha); setMotivoDoPredio(r.motivoNaoOpera); setForm(formDaFicha(r.ficha)); } })
            .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Não foi possível carregar a ficha.'); });
        return () => { vivo = false; };
    }, [condominio, identidade]);

    const set = <K extends keyof FormFicha>(k: K, v: FormFicha[K]) => setForm(f => ({ ...f, [k]: v }));
    const sujo = !!ficha && JSON.stringify(form) !== JSON.stringify(formDaFicha(ficha));
    const motivo = salvando ? 'Gravando…' : !logado ? MOTIVO_SEM_LOGIN : !ficha ? 'Carregando a ficha…'
        : motivoDoPredio ?? (!sujo ? 'Nada mudou.' : motivoDaFicha(form, hoje));

    const salvar = async () => {
        if (!condominio || motivo) return;
        setSalvando(true);
        setErro(null);
        try {
            await sindicoPortalService.salvarFicha(identidade, condominio.id, form);
            const mudouCobranca = ficha && (form.multa !== formDaFicha(ficha).multa || form.juros !== formDaFicha(ficha).juros);
            onSalvo(mudouCobranca ? 'Ficha salva. A multa e os juros novos valem para as próximas cobranças.' : 'Ficha salva.');
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível salvar a ficha.');
        } finally {
            setSalvando(false);
        }
    };

    const mandato = ficha && (ficha.mandatoInicio || ficha.mandatoFim)
        ? `${ficha.mandatoInicio ? fmtDate(ficha.mandatoInicio) : 'sem início'} a ${ficha.mandatoFim ? fmtDate(ficha.mandatoFim) : 'sem prazo'}`
        : 'Sem prazo definido';

    return (
        <Sheet open={!!condominio} onClose={onClose} size="md" dirty={sujo && !salvando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Ficha do condomínio</SheetTitle>
                <SheetDescription>{condominio?.nome}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-4 md:p-6 space-y-4">
                {!ficha ? (
                    erro ? <p className="text-sm text-red-600">{erro}</p> : <PortalLoading label="Carregando a ficha..." />
                ) : (
                    <>
                        <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="ficha-razao">Razão social</label>
                                <input id="ficha-razao" className={CAMPO} value={form.razaoSocial} onChange={e => set('razaoSocial', e.target.value)} />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                                <div className="space-y-1.5">
                                    <label className={ROTULO} htmlFor="ficha-cnpj">CNPJ</label>
                                    <input id="ficha-cnpj" className={CAMPO} inputMode="numeric" value={form.cnpj} onChange={e => set('cnpj', e.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                    <label className={ROTULO} htmlFor="ficha-instalado">Instalado em</label>
                                    <input id="ficha-instalado" type="date" max={hoje} className={CAMPO} value={form.instaladoEm} onChange={e => set('instaladoEm', e.target.value)} />
                                </div>
                            </div>
                            <p className="pt-2 text-[13px] font-semibold text-[#1F2430]">Cobrança das cotas em atraso</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                                <div className="space-y-1.5">
                                    <label className={ROTULO} htmlFor="ficha-multa">Multa (%)</label>
                                    <input id="ficha-multa" className={CAMPO} inputMode="decimal" value={form.multa} onChange={e => set('multa', e.target.value)} />
                                    <p className="text-[11px] text-gray-400">Até 2% (Código Civil, art. 1.336, § 1º).</p>
                                </div>
                                <div className="space-y-1.5">
                                    <label className={ROTULO} htmlFor="ficha-juros">Juros ao mês (%)</label>
                                    <input id="ficha-juros" className={CAMPO} inputMode="decimal" value={form.juros} onChange={e => set('juros', e.target.value)} />
                                    <p className="text-[11px] text-gray-400">1% ao mês quando a convenção não diz outro.</p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-2">
                            <p className="text-[13px] font-semibold text-[#1F2430]">Definido pela administradora</p>
                            <p className="text-sm text-[#4A505C]">Seu mandato: {mandato}</p>
                            <p className="text-sm text-[#4A505C]">
                                Rateio {ficha.exigeAprovacao ? 'exige' : 'não exige'} a aprovação do síndico.
                            </p>
                        </div>
                    </>
                )}
            </SheetPanel>
            <SheetFooter>
                <div className="flex items-center justify-end gap-3 w-full">
                    {erro && ficha && <p className="mr-auto flex items-center gap-1.5 text-sm text-red-600"><AlertCircle className="w-4 h-4 shrink-0" /> {erro}</p>}
                    <GhostButton onClick={onClose}>Cancelar</GhostButton>
                    <span title={motivo ?? undefined}>
                        <PrimaryButton onClick={salvar} disabled={!!motivo} className={motivo ? 'pointer-events-none' : ''}>
                            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            Salvar
                        </PrimaryButton>
                    </span>
                </div>
            </SheetFooter>
        </Sheet>
    );
};

export default FichaDoCondominioSheet;
