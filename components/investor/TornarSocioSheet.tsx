import React from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import type { OpportunityInterest, InvestorOpportunity } from '../../services/investorPortalService';
import { investorPortalService } from '../../services/investorPortalService';
import { investorService, type Investor } from '../../services/investorService';
import { speService } from '../../services/speService';

const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
const CAMPO = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

/** Por que este interesse não pode virar sócio agora (undefined = pode). */
export const motivoParaNaoTornarSocio = (i: Pick<OpportunityInterest, 'stage'>, o: Pick<InvestorOpportunity, 'spe_entity_id'> | undefined) =>
    (i.stage ?? 'lead') !== 'fechado' ? 'Só interesse no estágio "Fechado" vira sócio.'
        : !o?.spe_entity_id ? 'A oportunidade não tem SPE da captação (Editar › SPE da captação).'
            : undefined;

/**
 * "Tornar sócio" (Fase 4 do plano docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md): o interesse
 * fechado vira sócio da SPE da oportunidade. O investidor é o do link; senão, o cadastrado com o mesmo
 * e-mail; senão, um novo com os dados do interesse. O capital chamado/pago segue pela SPE (chamadas).
 */
const TornarSocioSheet: React.FC<{
    interesse: OpportunityInterest | null;
    oportunidade: InvestorOpportunity | undefined;
    onClose: () => void;
    onFeito: (interesse: OpportunityInterest, investorId: string) => void;
}> = ({ interesse, oportunidade, onClose, onFeito }) => {
    const [investidor, setInvestidor] = React.useState<Investor | null | 'novo'>(null);
    const [lendo, setLendo] = React.useState(false);
    const [pct, setPct] = React.useState('');
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!interesse) return;
        setErro(null);
        setPct('');
        setInvestidor(null);
        setLendo(true);
        const achar = async (): Promise<Investor | 'novo'> => {
            if (interesse.investor_id) {
                const lista = await investorService.listInvestors(interesse.organization_id);
                const achado = (lista as Investor[]).find(x => x.id === interesse.investor_id);
                if (achado) return achado;
            }
            if (interesse.contact_email) {
                const porEmail = await investorService.getByEmail(interesse.contact_email);
                if (porEmail) return porEmail;
            }
            return 'novo';
        };
        achar().then(setInvestidor).catch(e => setErro((e as Error).message)).finally(() => setLendo(false));
    }, [interesse]);

    if (!interesse) return null;
    const participacao = pct.trim() === '' ? null : Number(pct.replace(',', '.'));
    const motivo = motivoParaNaoTornarSocio(interesse, oportunidade)
        ?? (lendo || investidor == null ? 'Procurando o investidor…' : undefined)
        ?? (participacao == null || !(participacao > 0) || participacao > 100 ? 'Informe a participação na SPE (0 a 100%).' : undefined);

    const confirmar = async () => {
        if (motivo || !oportunidade?.spe_entity_id || investidor == null) return;
        setSalvando(true);
        setErro(null);
        try {
            const inv = investidor === 'novo'
                ? await investorService.saveInvestor({
                    name: interesse.contact_name,
                    email: interesse.contact_email || undefined,
                    phone: interesse.contact_phone || undefined,
                    organization_id: interesse.organization_id,
                }) as Investor
                : investidor;
            await speService.savePartner({
                spe_entity_id: oportunidade.spe_entity_id,
                investor_id: inv.id,
                quota_count: 1,
                ownership_pct: participacao!,
                capital_calls_total: 0,
                capital_paid: 0,
            });
            await investorPortalService.vincularInvestorAoInteresse(interesse.id!, inv.id);
            onFeito(interesse, inv.id);
        } catch (e) {
            const msg = (e as { message?: string })?.message ?? 'tente novamente';
            setErro(/duplicate|unique/i.test(msg) ? 'Este investidor já é sócio desta SPE.' : `Não foi possível tornar sócio: ${msg}`);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={!!interesse} onClose={onClose} size="md">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Tornar sócio</SheetTitle>
                <SheetDescription>{interesse.contact_name} entra como sócio da SPE de "{oportunidade?.title ?? '—'}".</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-4">
                {erro && (
                    <div className="flex items-start gap-2 rounded-[10px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {erro}
                    </div>
                )}
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <dt className="text-slate-500">Investidor</dt>
                    <dd className="text-slate-900">
                        {lendo ? 'Procurando…' : investidor === 'novo' ? `Novo cadastro: ${interesse.contact_name}` : investidor?.name ?? '—'}
                    </dd>
                    <dt className="text-slate-500">Valor pretendido</dt>
                    <dd className="text-slate-900">{interesse.valor_pretendido != null ? fmtBRL(interesse.valor_pretendido) : 'Não informado'}</dd>
                </dl>
                <div className="space-y-1.5 max-w-xs">
                    <label htmlFor="tornar-socio-pct" className="text-xs font-semibold text-slate-500">Participação na SPE (%)</label>
                    <input id="tornar-socio-pct" type="number" min={0} max={100} step={0.01} value={pct} onChange={e => setPct(e.target.value)} className={CAMPO} />
                </div>
                <p className="text-xs text-slate-500">O capital entra pelas chamadas de capital da SPE (Investidor › SPEs).</p>
            </SheetPanel>
            <SheetFooter>
                <button type="button" onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">Cancelar</button>
                {/* Desligado, o botão não mostra o title: o motivo fica no invólucro (guia §9.2). */}
                <span className="inline-flex" title={motivo}>
                    <button type="button" onClick={() => void confirmar()} disabled={salvando || !!motivo}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed">
                        {salvando && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                        Tornar sócio
                    </button>
                </span>
            </SheetFooter>
        </Sheet>
    );
};

export default TornarSocioSheet;
