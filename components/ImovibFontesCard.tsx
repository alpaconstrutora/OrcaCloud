import React, { useEffect, useState } from 'react';
import { HandCoins, Loader2, AlertCircle, Plus } from 'lucide-react';
import { ImovibStudy, ImovibFundingSource } from '../types';
import { imovibService } from '../services/imovibService';
import { useImovibEdicao } from '../hooks/useImovibEdicao';
import { useToast } from '../hooks/useToast';
import { ROTULO_DO_TIPO_DE_FONTE, ROTULO_DO_SISTEMA, comoEPaga } from '../utils/imovibFontes';
import StandardTable, { type StandardTableColumn } from './ui/StandardTable';
import ActionIconButton from './ui/ActionIconButton';
import { InlineDisclosureMenu } from './ui/inline-disclosure-menu';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';

interface ImovibFontesCardProps {
    study: ImovibStudy;
    onDataChanged: () => void;
}

const ROTULO_DA_REMUNERACAO: Record<ImovibFundingSource['remuneration'], string> = {
    juros: 'Juros (devolve com parcelas)',
    participacao: 'Participação nas distribuições',
};

const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

const COLUNAS: StandardTableColumn[] = [
    { key: 'name', label: 'Fonte', sortable: true, width: 220 },
    { key: 'amount', label: 'Valor', sortable: true, width: 150, align: 'right' },
    { key: 'entry_month', label: 'Entra no mês', sortable: true, width: 120, align: 'right' },
    { key: 'como', label: 'Como é paga', width: 360 },
];

/**
 * Outras fontes de capital do estudo (item 4.4 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, decisão D3): mútuo,
 * CRI, SCP, investidor. Cada uma muda o fluxo do incorporador; o cálculo é
 * utils/imovibFontes.ts. Gravar recarrega o estudo para o motor recalcular.
 */
const ImovibFontesCard: React.FC<ImovibFontesCardProps> = ({ study, onDataChanged }) => {
    const { pode, motivo } = useImovibEdicao();
    const { showToast } = useToast();
    const [fontes, setFontes] = useState<ImovibFundingSource[]>(study.funding_sources ?? []);
    const [editando, setEditando] = useState<ImovibFundingSource | 'nova' | null>(null);

    // O estudo recarregado (depois de gravar) é a fonte da verdade.
    useEffect(() => { setFontes(study.funding_sources ?? []); }, [study.funding_sources]);

    const excluir = async (f: ImovibFundingSource) => {
        try {
            await imovibService.excluirFonte(f.id);
            setFontes(prev => prev.filter(x => x.id !== f.id));
            onDataChanged();
        } catch (e) {
            showToast((e as Error).message, 'error');
        }
    };

    return (
        <section className="bg-white rounded-[10px] p-6 border border-gray-200 space-y-4" aria-labelledby="imovib-fontes-titulo">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-[6px]">
                        <HandCoins className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 id="imovib-fontes-titulo" className="text-lg font-semibold text-gray-900">Outras fontes de capital</h2>
                        <p className="text-slate-500 text-sm">Mútuo, CRI, SCP ou investidor: dinheiro de terceiros que entra num mês e é devolvido com juros ou com parte das distribuições.</p>
                    </div>
                </div>
                <button
                    type="button"
                    disabled={!pode}
                    title={!pode ? motivo : undefined}
                    onClick={() => setEditando('nova')}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Plus className="w-[15px] h-[15px]" /> Nova fonte
                </button>
            </div>

            <StandardTable<ImovibFundingSource>
                storageKey="imovib:fontes"
                columns={COLUNAS}
                rows={fontes}
                rowKey={f => f.id}
                dense
                bare
                sortValue={(k, f) => (k === 'amount' ? Number(f.amount) : k === 'entry_month' ? f.entry_month : f.name)}
                onRowClick={f => setEditando(f)}
                renderCell={(k, f) => {
                    switch (k) {
                        case 'name': return (
                            <span className="block text-sm text-gray-700">
                                {f.name} <span className="text-slate-500">· {ROTULO_DO_TIPO_DE_FONTE[f.kind]}</span>
                            </span>
                        );
                        case 'amount': return <span className="text-sm text-gray-700">{fmtBRL(Number(f.amount) || 0)}</span>;
                        case 'entry_month': return <span className="text-sm text-gray-700">{f.entry_month}</span>;
                        case 'como': return <span className="block text-sm text-gray-600 whitespace-normal">{comoEPaga(f)}</span>;
                        default: return null;
                    }
                }}
                actions={{
                    width: 100,
                    render: f => (
                        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                            <ActionIconButton kind="edit" title={pode ? 'Editar a fonte' : 'Ver a fonte'} onClick={() => setEditando(f)} />
                            {pode && <InlineDisclosureMenu showDelete onDelete={() => void excluir(f)} />}
                        </div>
                    ),
                }}
                empty={{
                    icon: <HandCoins className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: 'Nenhuma outra fonte',
                    subtitle: 'O empreendimento é pago com capital próprio, financiamento à produção e permuta.',
                }}
            />

            <FonteSheet
                fonte={editando}
                study={study}
                proximaOrdem={fontes.length}
                onClose={() => setEditando(null)}
                onSalva={(f, criada) => {
                    setFontes(prev => (criada ? [...prev, f] : prev.map(x => (x.id === f.id ? f : x))));
                    // §25: criar fecha; editar permanece aberto, já com o salvo.
                    setEditando(criada ? null : f);
                    onDataChanged();
                }}
            />
        </section>
    );
};

const CAMPO = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

type Formulario = {
    name: string; kind: ImovibFundingSource['kind']; amount: string; entry_month: string;
    remuneration: ImovibFundingSource['remuneration']; rate_annual: string; profit_share_percent: string;
    amortization: ImovibFundingSource['amortization']; term_months: string; grace_months: string;
};

const VAZIO: Formulario = {
    name: '', kind: 'mutuo', amount: '', entry_month: '1', remuneration: 'juros', rate_annual: '',
    profit_share_percent: '', amortization: 'BULLET', term_months: '24', grace_months: '0',
};

const doRegistro = (f: ImovibFundingSource): Formulario => ({
    name: f.name, kind: f.kind, amount: String(f.amount ?? ''), entry_month: String(f.entry_month ?? 1),
    remuneration: f.remuneration, rate_annual: f.rate_annual == null ? '' : String(f.rate_annual),
    profit_share_percent: f.profit_share_percent == null ? '' : String(f.profit_share_percent),
    amortization: f.amortization, term_months: f.term_months == null ? '' : String(f.term_months),
    grace_months: f.grace_months == null ? '0' : String(f.grace_months),
});

function FonteSheet({ fonte, study, proximaOrdem, onClose, onSalva }: {
    fonte: ImovibFundingSource | 'nova' | null;
    study: ImovibStudy;
    proximaOrdem: number;
    onClose: () => void;
    onSalva: (f: ImovibFundingSource, criada: boolean) => void;
}) {
    const { pode, motivo: motivoRo } = useImovibEdicao();
    const [form, setForm] = useState<Formulario>(VAZIO);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [mudou, setMudou] = useState(false);

    useEffect(() => {
        if (!fonte) return;
        setForm(fonte === 'nova' ? VAZIO : doRegistro(fonte));
        setErro(null);
        setMudou(false);
    }, [fonte]);

    if (!fonte) return null;
    const nova = fonte === 'nova';
    const juros = form.remuneration === 'juros';
    // BULLET não amortiza antes do vencimento: a carência fica escondida e não conta.
    const usaCarencia = juros && form.amortization !== 'BULLET';
    const n = (s: string) => (s.trim() === '' ? NaN : Number(s));
    const valor = n(form.amount);
    const mes = n(form.entry_month);
    const taxa = n(form.rate_annual);
    const parte = n(form.profit_share_percent);
    const prazo = n(form.term_months);
    const carencia = n(form.grace_months);

    const motivo = !pode ? motivoRo
        : !form.name.trim() ? 'Dê um nome à fonte.'
            : !(valor > 0) ? 'Informe o valor que entra.'
                : !(Number.isInteger(mes) && mes >= 1) ? 'O mês de entrada é um número inteiro a partir de 1.'
                    : juros && !(taxa >= 0) ? 'Informe a taxa de juros (% ao ano).'
                        : juros && !(Number.isInteger(prazo) && prazo >= 1) ? 'O prazo é um número inteiro de meses, a partir de 1.'
                            : usaCarencia && !(Number.isInteger(carencia) && carencia >= 0 && carencia < prazo) ? 'A carência é um número inteiro de meses, menor que o prazo.'
                                : !juros && !(parte > 0 && parte <= 100) ? 'A participação vai de mais de 0% até 100% de cada distribuição.'
                                    : !mudou ? 'Nada foi alterado.' : undefined;
    const mudar = <K extends keyof Formulario>(k: K, v: Formulario[K]) => { setForm(prev => ({ ...prev, [k]: v })); setMudou(true); };

    const salvar = async () => {
        if (motivo) return;
        setSalvando(true);
        setErro(null);
        try {
            const salva = await imovibService.salvarFonte({
                ...(nova ? {} : { id: fonte.id }),
                study_id: study.id,
                name: form.name.trim(),
                kind: form.kind,
                amount: valor,
                entry_month: mes,
                remuneration: form.remuneration,
                rate_annual: juros ? taxa : null,
                profit_share_percent: juros ? null : parte,
                amortization: form.amortization,
                term_months: juros ? prazo : null,
                grace_months: !juros ? null : usaCarencia ? carencia : 0,
                sort_order: nova ? proximaOrdem : fonte.sort_order,
            });
            setMudou(false);
            onSalva(salva, nova);
        } catch (e) {
            setErro((e as Error).message);
        } finally {
            setSalvando(false);
        }
    };

    const campo = (id: string, rotulo: string, k: keyof Formulario, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
        <div className="space-y-1.5">
            <label htmlFor={id} className="text-xs font-semibold text-slate-500">{rotulo}</label>
            <input id={id} value={form[k]} onChange={e => mudar(k, e.target.value as never)} className={CAMPO} {...extra} />
        </div>
    );

    return (
        <Sheet open={!!fonte} onClose={onClose} size="lg" dirty={mudou}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>{nova ? 'Nova fonte de capital' : 'Fonte de capital'}</SheetTitle>
                <SheetDescription>O dinheiro entra no mês informado. A juros, volta em parcelas a partir do mês seguinte; por participação, recebe a parte dele de cada distribuição.</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-4">
                {erro && (
                    <div className="flex items-start gap-2 rounded-[10px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {erro}
                    </div>
                )}
                <fieldset disabled={!pode} title={!pode ? motivoRo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 space-y-4">
                    {campo('imovib-fonte-nome', 'Nome', 'name')}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label htmlFor="imovib-fonte-tipo" className="text-xs font-semibold text-slate-500">Tipo</label>
                            <select id="imovib-fonte-tipo" value={form.kind} onChange={e => mudar('kind', e.target.value as Formulario['kind'])} className={`${CAMPO} cursor-pointer`}>
                                {(Object.keys(ROTULO_DO_TIPO_DE_FONTE) as Formulario['kind'][]).map(k => <option key={k} value={k}>{ROTULO_DO_TIPO_DE_FONTE[k]}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="imovib-fonte-remuneracao" className="text-xs font-semibold text-slate-500">Remuneração</label>
                            <select id="imovib-fonte-remuneracao" value={form.remuneration} onChange={e => mudar('remuneration', e.target.value as Formulario['remuneration'])} className={`${CAMPO} cursor-pointer`}>
                                {(Object.keys(ROTULO_DA_REMUNERACAO) as Formulario['remuneration'][]).map(k => <option key={k} value={k}>{ROTULO_DA_REMUNERACAO[k]}</option>)}
                            </select>
                        </div>
                        {campo('imovib-fonte-valor', 'Valor (R$)', 'amount', { type: 'number', min: 0, step: 1000 })}
                        {campo('imovib-fonte-mes', 'Entra no mês', 'entry_month', { type: 'number', min: 1, step: 1 })}
                        {juros ? (
                            <>
                                {campo('imovib-fonte-taxa', 'Juros (% a.a.)', 'rate_annual', { type: 'number', min: 0, step: 0.1 })}
                                <div className="space-y-1.5">
                                    <label htmlFor="imovib-fonte-sistema" className="text-xs font-semibold text-slate-500">Amortização</label>
                                    <select id="imovib-fonte-sistema" value={form.amortization} onChange={e => mudar('amortization', e.target.value as Formulario['amortization'])} className={`${CAMPO} cursor-pointer`}>
                                        {(Object.keys(ROTULO_DO_SISTEMA) as Formulario['amortization'][]).map(k => <option key={k} value={k}>{ROTULO_DO_SISTEMA[k]}</option>)}
                                    </select>
                                </div>
                                {campo('imovib-fonte-prazo', 'Prazo (meses)', 'term_months', { type: 'number', min: 1, step: 1 })}
                                {usaCarencia && campo('imovib-fonte-carencia', 'Carência do principal (meses)', 'grace_months', { type: 'number', min: 0, step: 1 })}
                            </>
                        ) : (
                            campo('imovib-fonte-participacao', 'Participação (% de cada distribuição)', 'profit_share_percent', { type: 'number', min: 0, max: 100, step: 1 })
                        )}
                    </div>
                </fieldset>
            </SheetPanel>
            <SheetFooter>
                <button type="button" onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">{nova ? 'Cancelar' : 'Fechar'}</button>
                <button type="button" onClick={() => void salvar()} disabled={salvando || !!motivo} title={motivo}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed">
                    {salvando && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                    {nova ? 'Criar fonte' : 'Salvar fonte'}
                </button>
            </SheetFooter>
        </Sheet>
    );
}

export default ImovibFontesCard;
