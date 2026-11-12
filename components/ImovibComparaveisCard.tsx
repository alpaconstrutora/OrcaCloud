import React, { useEffect, useMemo, useState } from 'react';
import { Building, Loader2, AlertCircle, Plus } from 'lucide-react';
import { ImovibStudy } from '../types';
import { imovibService } from '../services/imovibService';
import { useImovibEdicao } from '../hooks/useImovibEdicao';
import { useImovibMath } from '../hooks/useImovibMath';
import { useToast } from '../hooks/useToast';
import { ImovibComparable, resumoDosComparaveis, posicaoDoPreco } from '../utils/imovibMercado';
import { KpiCard } from './ui/KpiCard';
import StandardTable, { type StandardTableColumn } from './ui/StandardTable';
import ActionIconButton from './ui/ActionIconButton';
import { InlineDisclosureMenu } from './ui/inline-disclosure-menu';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';

interface ImovibComparaveisCardProps {
    study: ImovibStudy;
    /** Grava a VSO da região (e a da curva) no formulário de Premissas — sai com "Salvar Premissas". */
    onUsarVso: (vsoPct: number) => void;
    /** Tipo atual da curva de vendas: a VSO mensal só vale na curva VSO. */
    tipoDaCurva: string;
}

const ROTULO_DA_CURVA: Record<string, string> = { linear: 'linear', lancamento: 'de lançamento', vso: 'VSO', custom: 'personalizada' };


const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
const fmtPct = (v: number, casas = 1) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: casas })}%`;
/** Hoje em 'AAAA-MM-DD' local (sem fuso: só o mês importa). */
const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const COLUNAS: StandardTableColumn[] = [
    { key: 'name', label: 'Empreendimento', sortable: true, width: 240 },
    { key: 'price_sqm', label: 'Preço/m²', sortable: true, width: 130, align: 'right' },
    { key: 'unidades', label: 'Vendidas / total', width: 140, align: 'right' },
    { key: 'launch_date', label: 'Lançamento', sortable: true, width: 120 },
    { key: 'distance_km', label: 'Distância', sortable: true, width: 110, align: 'right' },
];

/**
 * Comparáveis de mercado (item 7.1 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md): concorrentes com
 * preço/m², vendas e lançamento; o preço do estudo contra a média e a VSO média.
 */
const ImovibComparaveisCard: React.FC<ImovibComparaveisCardProps> = ({ study, onUsarVso, tipoDaCurva }) => {
    const { pode, motivo } = useImovibEdicao();
    const { showToast } = useToast();
    const r = useImovibMath(study);
    const [lista, setLista] = useState<ImovibComparable[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [editando, setEditando] = useState<ImovibComparable | 'novo' | null>(null);

    useEffect(() => {
        let vivo = true;
        setCarregando(true);
        imovibService.listarComparaveis(study.id)
            .then(l => { if (vivo) { setLista(l); setErro(null); } })
            .catch(e => { if (vivo) setErro((e as Error).message); })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [study.id]);

    const resumo = useMemo(() => resumoDosComparaveis(lista, hojeLocal()), [lista]);
    // Preço médio do estudo: o VGV por m² privativo do motor (sem permutadas, não vendáveis
    // nem unidades do espelho com preço e sem área) — o mesmo da Estática.
    const precoDoEstudo = r.produto.vgvPorM2Privativo ?? 0;
    const foraDaVso = [
        resumo.foraDaVso.lancamentoFuturo ? `${resumo.foraDaVso.lancamentoFuturo} com lançamento futuro` : '',
        resumo.foraDaVso.esgotado ? `${resumo.foraDaVso.esgotado} esgotado(s)` : '',
    ].filter(Boolean).join(' e ');
    const avisoDaCurva = tipoDaCurva === 'vso' ? '' : ` A curva atual é ${ROTULO_DA_CURVA[tipoDaCurva] ?? tipoDaCurva}: a VSO mensal só vale quando a curva é VSO (aba Receitas).`;
    const posicao = posicaoDoPreco(precoDoEstudo, resumo);
    const motivoVso = !pode ? motivo : resumo.vsoMediaMensal == null ? 'Sem VSO: cadastre comparáveis com total, vendidas e data de lançamento.' : undefined;

    const excluir = async (c: ImovibComparable) => {
        try {
            await imovibService.excluirComparavel(c.id);
            setLista(prev => prev.filter(x => x.id !== c.id));
        } catch (e) {
            showToast((e as Error).message, 'error');
        }
    };

    return (
        <section className="bg-white rounded-[10px] p-6 border border-slate-100 shadow-sm space-y-4" aria-labelledby="imovib-comparaveis-titulo">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 id="imovib-comparaveis-titulo" className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                        <Building className="w-5 h-5 text-indigo-500" />
                        Comparáveis
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">Empreendimentos concorrentes: o preço médio ponderado pelas unidades e a VSO de cada um (vendidas ÷ total ÷ meses desde o lançamento).</p>
                </div>
                <button
                    type="button"
                    disabled={!pode}
                    title={!pode ? motivo : undefined}
                    onClick={() => setEditando('novo')}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Plus className="w-[15px] h-[15px]" /> Novo comparável
                </button>
            </div>

            {erro && (
                <div className="flex items-start gap-2 rounded-[10px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {erro}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <KpiCard
                    label="Preço do estudo contra a média"
                    value={posicao == null ? '—' : `${posicao >= 0 ? '+' : ''}${fmtPct(posicao)}`}
                    sub={resumo.precoM2Medio == null ? 'Sem comparável com preço' : `${fmtBRL(precoDoEstudo)}/m² no estudo × ${fmtBRL(resumo.precoM2Medio)}/m² de média ${resumo.mediaDoPreco === 'ponderada' ? 'ponderada pelas unidades' : 'simples (há comparável sem total)'}`}
                    color={posicao == null ? 'gray' : Math.abs(posicao) > 15 ? 'amber' : 'emerald'}
                />
                <div className="flex flex-col gap-2">
                    <KpiCard
                        label="VSO média dos comparáveis"
                        value={resumo.vsoMediaMensal == null ? '—' : `${fmtPct(resumo.vsoMediaMensal, 2)} ao mês`}
                        sub={`Sobre o estoque, como a curva VSO. ${resumo.estoque.toLocaleString('pt-BR')} unidades em estoque${foraDaVso ? `; fora da VSO: ${foraDaVso}` : ''}`}
                        color="indigo"
                    />
                    <button
                        type="button"
                        disabled={!!motivoVso}
                        aria-label="Usar a VSO dos comparáveis na curva de vendas"
                        title={motivoVso ?? `Preenche a VSO da região e a VSO mensal da curva de vendas. Grava com "Salvar Premissas".${avisoDaCurva}`}
                        onClick={() => resumo.vsoMediaMensal != null && onUsarVso(Number(resumo.vsoMediaMensal.toFixed(2)))}
                        className="self-start h-9 px-3.5 text-[13px] font-medium rounded-[6px] border border-gray-200 bg-white text-slate-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Usar na curva de vendas
                    </button>
                </div>
            </div>

            <StandardTable<ImovibComparable>
                storageKey="imovib:comparaveis"
                columns={COLUNAS}
                rows={lista}
                rowKey={c => c.id}
                loading={carregando}
                dense
                bare
                sortValue={(k, c) => (k === 'price_sqm' ? Number(c.price_sqm) || 0 : k === 'distance_km' ? Number(c.distance_km) || 0 : k === 'launch_date' ? c.launch_date ?? '' : c.name)}
                onRowClick={c => setEditando(c)}
                renderCell={(k, c) => {
                    switch (k) {
                        case 'name': return <span className="block text-sm text-gray-700">{c.name}{c.developer ? <span className="text-slate-500"> · {c.developer}</span> : null}</span>;
                        case 'price_sqm': return <span className="text-sm text-gray-700">{c.price_sqm ? fmtBRL(Number(c.price_sqm)) : '—'}</span>;
                        case 'unidades': return <span className="text-sm text-gray-700">{c.sold_units ?? '—'} / {c.total_units ?? '—'}</span>;
                        case 'launch_date': return <span className="text-sm text-gray-700">{c.launch_date ? c.launch_date.slice(0, 7).split('-').reverse().join('/') : '—'}</span>;
                        case 'distance_km': return <span className="text-sm text-gray-700">{c.distance_km != null ? `${Number(c.distance_km).toLocaleString('pt-BR')} km` : '—'}</span>;
                        default: return null;
                    }
                }}
                actions={{
                    width: 100,
                    render: c => (
                        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                            <ActionIconButton kind="edit" title={pode ? 'Editar o comparável' : 'Ver o comparável'} onClick={() => setEditando(c)} />
                            {pode && <InlineDisclosureMenu showDelete onDelete={() => void excluir(c)} />}
                        </div>
                    ),
                }}
                empty={{
                    icon: <Building className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: 'Nenhum comparável',
                    subtitle: 'Cadastre os lançamentos concorrentes no raio do terreno: preço/m², unidades, vendidas e data de lançamento.',
                }}
            />

            <ComparavelSheet
                comparavel={editando}
                study={study}
                proximaOrdem={lista.length}
                onClose={() => setEditando(null)}
                onSalvo={(c, criado) => {
                    setLista(prev => (criado ? [...prev, c] : prev.map(x => (x.id === c.id ? c : x))));
                    // §25: criar fecha; editar permanece aberto, já com o salvo.
                    setEditando(criado ? null : c);
                }}
            />
        </section>
    );
};

const CAMPO = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
type Formulario = Record<'name' | 'developer' | 'address' | 'distance_km' | 'launch_date' | 'total_units' | 'sold_units' | 'typical_area' | 'price_sqm' | 'ticket' | 'source' | 'collected_at' | 'notes', string>;
const VAZIO: Formulario = { name: '', developer: '', address: '', distance_km: '', launch_date: '', total_units: '', sold_units: '', typical_area: '', price_sqm: '', ticket: '', source: '', collected_at: '', notes: '' };
const doRegistro = (c: ImovibComparable): Formulario => Object.fromEntries(
    (Object.keys(VAZIO) as (keyof Formulario)[]).map(k => [k, c[k] == null ? '' : String(c[k])]),
) as Formulario;

function ComparavelSheet({ comparavel, study, proximaOrdem, onClose, onSalvo }: {
    comparavel: ImovibComparable | 'novo' | null;
    study: ImovibStudy;
    proximaOrdem: number;
    onClose: () => void;
    onSalvo: (c: ImovibComparable, criado: boolean) => void;
}) {
    const { pode, motivo: motivoRo } = useImovibEdicao();
    const [form, setForm] = useState<Formulario>(VAZIO);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [mudou, setMudou] = useState(false);

    useEffect(() => {
        if (!comparavel) return;
        setForm(comparavel === 'novo' ? VAZIO : doRegistro(comparavel));
        setErro(null);
        setMudou(false);
    }, [comparavel]);

    if (!comparavel) return null;
    const novo = comparavel === 'novo';
    const num = (s: string) => (s.trim() === '' ? null : Number(s));
    const total = num(form.total_units);
    const vendidas = num(form.sold_units);
    const invalido = (Object.entries({ distance_km: form.distance_km, total_units: form.total_units, sold_units: form.sold_units, typical_area: form.typical_area, price_sqm: form.price_sqm, ticket: form.ticket }) as [string, string][])
        .some(([, v]) => v.trim() !== '' && !(Number(v) >= 0));
    const motivo = !pode ? motivoRo
        : !form.name.trim() ? 'Dê o nome do empreendimento.'
            : invalido ? 'Números não podem ser negativos.'
                : (total != null && !Number.isInteger(total)) || (vendidas != null && !Number.isInteger(vendidas)) ? 'Unidades são números inteiros.'
                : total != null && vendidas != null && vendidas > total ? 'Vendidas não pode passar do total.'
                    : !mudou ? 'Nada foi alterado.' : undefined;
    const mudar = (k: keyof Formulario, v: string) => { setForm(prev => ({ ...prev, [k]: v })); setMudou(true); };

    const salvar = async () => {
        if (motivo) return;
        setSalvando(true);
        setErro(null);
        const texto = (s: string) => s.trim() || null;
        try {
            const salvo = await imovibService.salvarComparavel({
                ...(novo ? {} : { id: comparavel.id }),
                study_id: study.id,
                name: form.name.trim(),
                developer: texto(form.developer), address: texto(form.address), source: texto(form.source), notes: texto(form.notes),
                launch_date: texto(form.launch_date), collected_at: texto(form.collected_at),
                distance_km: num(form.distance_km), total_units: total, sold_units: vendidas,
                typical_area: num(form.typical_area), price_sqm: num(form.price_sqm), ticket: num(form.ticket),
                sort_order: novo ? proximaOrdem : comparavel.sort_order ?? 0,
            });
            setMudou(false);
            onSalvo(salvo, novo);
        } catch (e) {
            setErro((e as Error).message);
        } finally {
            setSalvando(false);
        }
    };

    const campo = (rotulo: string, k: keyof Formulario, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
        <div className="space-y-1.5">
            <label htmlFor={`imovib-comp-${k}`} className="text-xs font-semibold text-slate-500">{rotulo}</label>
            <input id={`imovib-comp-${k}`} value={form[k]} onChange={e => mudar(k, e.target.value)} className={CAMPO} {...extra} />
        </div>
    );

    return (
        <Sheet open={!!comparavel} onClose={onClose} size="lg" dirty={mudou}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>{novo ? 'Novo comparável' : 'Comparável'}</SheetTitle>
                <SheetDescription>Sem data de lançamento ou sem total, o comparável entra no preço médio, mas não na VSO. Lançamento depois de hoje e empreendimento esgotado também ficam fora da VSO.</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-4">
                {erro && (
                    <div className="flex items-start gap-2 rounded-[10px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {erro}
                    </div>
                )}
                <fieldset disabled={!pode} title={!pode ? motivoRo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 space-y-4">
                    {campo('Empreendimento', 'name')}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        {campo('Incorporadora', 'developer')}
                        {campo('Distância (km)', 'distance_km', { type: 'number', min: 0, step: 0.1 })}
                        {campo('Preço/m² (R$)', 'price_sqm', { type: 'number', min: 0, step: 1 })}
                        {campo('Tíquete médio (R$)', 'ticket', { type: 'number', min: 0, step: 1000 })}
                        {campo('Unidades totais', 'total_units', { type: 'number', min: 0, step: 1 })}
                        {campo('Unidades vendidas', 'sold_units', { type: 'number', min: 0, step: 1 })}
                        {campo('Área típica (m²)', 'typical_area', { type: 'number', min: 0, step: 1 })}
                        {campo('Lançamento', 'launch_date', { type: 'date' })}
                        {campo('Fonte', 'source', { placeholder: 'Ex.: plantão de vendas, site, corretor' })}
                        {campo('Coletado em', 'collected_at', { type: 'date' })}
                    </div>
                    {campo('Endereço', 'address')}
                    <div className="space-y-1.5">
                        <label htmlFor="imovib-comp-notes" className="text-xs font-semibold text-slate-500">Observações</label>
                        <textarea id="imovib-comp-notes" rows={3} value={form.notes} onChange={e => mudar('notes', e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none" />
                    </div>
                </fieldset>
            </SheetPanel>
            <SheetFooter>
                <button type="button" onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">{novo ? 'Cancelar' : 'Fechar'}</button>
                <button type="button" onClick={() => void salvar()} disabled={salvando || !!motivo} title={motivo}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed">
                    {salvando && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                    {novo ? 'Criar comparável' : 'Salvar comparável'}
                </button>
            </SheetFooter>
        </Sheet>
    );
}

export default ImovibComparaveisCard;
