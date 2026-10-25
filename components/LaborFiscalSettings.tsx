import React, { useState, useEffect, useMemo } from 'react';
import {
    Calendar, Shield, Building2, AlertCircle, Plus, TrendingUp, Info, Loader2, Check, X, Copy,
} from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import TabsBar from './ui/TabsBar';
import StandardTable, { StandardTableColumn } from './ui/StandardTable';
import { usePersistedState } from './ui/TableUtils';
import { useConfirm } from './ui/confirm';
import { useToast } from '../hooks/useToast';
import { fiscalService, INSSBracket, IRRFBracket, FGTSConfig } from '../services/fiscalService';

type FiscalTab = 'inss' | 'irrf' | 'fgts';
/** As duas tabelas progressivas têm a mesma forma (faixa, alíquota, parcela a deduzir). */
type TabelaFaixas = 'inss' | 'irrf';
type Faixa = INSSBracket & IRRFBracket;

// Uma aba por tabela (§19.1). O título é o da tela; o subtítulo acompanha a aba (§20).
const SUBTITULOS: Record<FiscalTab, string> = {
    inss: 'Faixas progressivas do INSS do empregado, por ano de vigência.',
    irrf: 'Faixas do Imposto de Renda retido na fonte, com a parcela a deduzir.',
    fgts: 'Alíquota do Fundo de Garantia — custo direto do empregador.',
};

// Colunas das tabelas padrão (§6.10). Soma ~1040px + Ações: cabe em 1290px úteis.
const FAIXA_COLUMNS: StandardTableColumn[] = [
    { key: 'faixa', label: 'Faixa', sortable: true, width: 90 },
    { key: 'vigencia', label: 'Vigência', sortable: true, width: 230 },
    { key: 'de', label: 'Base inicial', sortable: true, width: 180, align: 'right' },
    { key: 'ate', label: 'Base final', sortable: true, width: 180, align: 'right' },
    { key: 'aliquota', label: 'Alíquota', sortable: true, width: 140, align: 'right' },
    { key: 'deducao', label: 'Parcela a deduzir', sortable: true, width: 190, align: 'right' },
];
const FGTS_COLUMNS: StandardTableColumn[] = [
    { key: 'vigencia', label: 'Vigência', sortable: true, width: 280 },
    { key: 'aliquota', label: 'Alíquota', sortable: true, width: 160, align: 'right' },
];

/** id da faixa que ainda não foi gravada — só existe no rascunho até confirmar. */
const NOVA = '__nova__';

const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const fmtPct = (rate: number) => `${(rate * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
/** Data ISO → dd/mm/aaaa sem passar por `new Date` (fuso). */
const fmtData = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const vigenciaTexto = (v: { valid_from: string; valid_to: string | null }) =>
    v.valid_to ? `${fmtData(v.valid_from)} a ${fmtData(v.valid_to)}` : `Desde ${fmtData(v.valid_from)}`;
/** Aceita vírgula decimal; vazio/inválido vira 0. */
const num = (s: string) => {
    const n = parseFloat(s.replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
};

interface Rascunho {
    ano: string;
    min: string;
    /** vazio = "em diante" (última faixa). */
    max: string;
    /** em %, como o usuário digita. */
    rate: string;
    deduction: string;
}
interface Edicao { tab: FiscalTab; id: string; anoOriginal: string; draft: Rascunho }

const INPUT_CELULA = 'h-8 text-right text-sm font-normal text-gray-900 border border-blue-400 rounded-[6px] px-2 outline-none focus:ring-2 focus:ring-blue-500/20';
const BOTAO_SECUNDARIO = 'flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';
const BOTAO_PRIMARIO = 'flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';

const LaborFiscalSettings: React.FC = () => {
    const confirm = useConfirm();
    const { localToast, showToast } = useToast();
    const [activeTab, setActiveTab] = usePersistedState<FiscalTab>('labor:fiscal:tab', 'inss');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [inssBrackets, setInssBrackets] = useState<INSSBracket[]>([]);
    const [irrfBrackets, setIrrfBrackets] = useState<IRRFBracket[]>([]);
    const [fgtsConfig, setFgtsConfig] = useState<FGTSConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [edicao, setEdicao] = useState<Edicao | null>(null);
    const [saving, setSaving] = useState(false);
    // Busca controlada (§3, mesma chave que o StandardTable usaria): "Nova faixa" limpa o termo,
    // senão a linha do rascunho podia nascer escondida pelo filtro.
    const [buscaInss, setBuscaInss] = usePersistedState<string>('labor:fiscal:inss:search', '');
    const [buscaIrrf, setBuscaIrrf] = usePersistedState<string>('labor:fiscal:irrf:search', '');

    // Do primeiro ano com tabela cadastrada até o próximo (o ano seguinte é preparado antes de virar).
    const years = useMemo(() => {
        const ultimo = Math.max(new Date().getFullYear() + 1, selectedYear);
        return Array.from({ length: ultimo - 2023 + 1 }, (_, i) => 2023 + i);
    }, [selectedYear]);

    const loadData = async () => {
        setLoading(true);
        setEdicao(null);
        const refDate = `${selectedYear}-06-01`;
        try {
            const [inss, irrf, fgts] = await Promise.all([
                fiscalService.getINSSBrackets(refDate),
                fiscalService.getIRRFBrackets(refDate),
                fiscalService.getFGTSConfig(refDate)
            ]);
            setInssBrackets(inss);
            setIrrfBrackets(irrf);
            setFgtsConfig(fgts);
        } catch (err) {
            console.error('Erro ao carregar dados fiscais:', err);
            showToast('Erro ao carregar as tabelas fiscais', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [selectedYear]);

    const listaDe = (t: TabelaFaixas): Faixa[] => (t === 'inss' ? inssBrackets : irrfBrackets);
    const setListaDe = (t: TabelaFaixas) => (t === 'inss' ? setInssBrackets : setIrrfBrackets);
    const nomeDe = (t: TabelaFaixas) => (t === 'inss' ? 'INSS' : 'IRRF');

    /** Ordinal da faixa pela base inicial — não muda quando a tabela é reordenada pelo cabeçalho. */
    const ordinais = useMemo(() => {
        const m = new Map<string, number>();
        (['inss', 'irrf'] as TabelaFaixas[]).forEach(t => {
            [...listaDe(t)].sort((a, b) => a.min_value - b.min_value).forEach((f, i) => { if (f.id) m.set(`${t}:${f.id}`, i + 1); });
        });
        return m;
    }, [inssBrackets, irrfBrackets]);

    // ── Edição por linha (§7.1) ─────────────────────────────────────────
    const editando = (t: FiscalTab, id?: string) => !!edicao && edicao.tab === t && edicao.id === id;
    const setDraft = (patch: Partial<Rascunho>) => setEdicao(e => (e ? { ...e, draft: { ...e.draft, ...patch } } : e));

    const iniciarEdicao = (t: FiscalTab, v: { id?: string; valid_from: string; min_value?: number; max_value?: number | null; rate: number; deduction?: number }) => {
        if (!v.id) return;
        const ano = v.valid_from.slice(0, 4);
        setEdicao({
            tab: t, id: v.id, anoOriginal: ano,
            draft: {
                ano,
                min: String(v.min_value ?? 0),
                max: v.max_value ? String(v.max_value) : '',
                rate: String(+(v.rate * 100).toFixed(4)),
                deduction: String(v.deduction ?? 0),
            },
        });
    };

    const novaFaixa = (t: TabelaFaixas) => {
        // A nova faixa começa onde a última termina — é o caso comum ao montar a tabela.
        const ultima = [...listaDe(t)].sort((a, b) => a.min_value - b.min_value).pop();
        const min = ultima?.max_value ? +(ultima.max_value + 0.01).toFixed(2) : 0;
        (t === 'inss' ? setBuscaInss : setBuscaIrrf)('');
        setEdicao({
            tab: t, id: NOVA, anoOriginal: String(selectedYear),
            draft: { ano: String(selectedYear), min: String(min), max: '', rate: '', deduction: '0' },
        });
    };

    /** Vigência só muda se o ano foi trocado — faixa aberta ("desde") continua aberta. */
    const vigenciaDoRascunho = (e: Edicao) => (e.draft.ano !== e.anoOriginal || e.id === NOVA
        ? { valid_from: `${e.draft.ano}-01-01`, valid_to: `${e.draft.ano}-12-31` }
        : {});

    const salvarFaixa = async (t: TabelaFaixas) => {
        if (!edicao) return;
        const d = edicao.draft;
        const campos = {
            min_value: num(d.min),
            max_value: d.max.trim() === '' ? null : num(d.max),
            rate: num(d.rate) / 100,
            deduction: num(d.deduction),
        };
        setSaving(true);
        try {
            if (edicao.id === NOVA) {
                const vig = vigenciaDoRascunho(edicao) as { valid_from: string; valid_to: string };
                const nova = { ...vig, ...campos };
                const criada = t === 'inss' ? await fiscalService.createINSSBracket(nova) : await fiscalService.createIRRFBracket(nova);
                // Faixa de outro ano não vale no ano em tela — grava, mas não entra na lista.
                if (vig.valid_from.startsWith(String(selectedYear))) setListaDe(t)(prev => [...prev, criada]);
                showToast(`Faixa de ${nomeDe(t)} criada`, 'success');
            } else {
                const patch = { ...vigenciaDoRascunho(edicao), ...campos };
                if (t === 'inss') await fiscalService.updateINSSBracket(edicao.id, patch);
                else await fiscalService.updateIRRFBracket(edicao.id, patch);
                setListaDe(t)(prev => prev.map(f => (f.id === edicao.id ? { ...f, ...patch } : f)));
                showToast(`Faixa de ${nomeDe(t)} atualizada`, 'success');
            }
            setEdicao(null);
        } catch (err) {
            console.error(err);
            showToast(`Erro ao salvar a faixa de ${nomeDe(t)}`, 'error');
        } finally {
            setSaving(false);
        }
    };

    const salvarFGTS = async () => {
        if (!edicao || !fgtsConfig?.id) return;
        const patch = { ...vigenciaDoRascunho(edicao), rate: num(edicao.draft.rate) / 100 };
        setSaving(true);
        try {
            await fiscalService.updateFGTSConfig(fgtsConfig.id, patch);
            setFgtsConfig({ ...fgtsConfig, ...patch });
            setEdicao(null);
            showToast('FGTS atualizado', 'success');
        } catch (err) {
            console.error(err);
            showToast('Erro ao salvar o FGTS', 'error');
        } finally {
            setSaving(false);
        }
    };

    const excluirFaixa = async (t: TabelaFaixas, f: Faixa) => {
        if (!f.id) return;
        const ok = await confirm({
            title: `Excluir faixa de ${nomeDe(t)}?`,
            message: `${fmtBRL(f.min_value)} ${f.max_value ? `até ${fmtBRL(f.max_value)}` : 'em diante'} · ${fmtPct(f.rate)}. A folha deixa de usar esta faixa.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            if (t === 'inss') await fiscalService.deleteINSSBracket(f.id);
            else await fiscalService.deleteIRRFBracket(f.id);
            setListaDe(t)(prev => prev.filter(b => b.id !== f.id));
            showToast(`Faixa de ${nomeDe(t)} excluída`, 'success');
        } catch (err) {
            showToast('Erro ao excluir faixa', 'error');
        }
    };

    const clonarTabelas = async () => {
        const origem = { ano: selectedYear - 1 };
        const jaTem = inssBrackets.length > 0 || irrfBrackets.length > 0 || !!fgtsConfig;
        const ok = await confirm({
            title: `Clonar tabelas para ${selectedYear}?`,
            message: (
                <div className="space-y-3">
                    <label className="flex items-center justify-center gap-2 text-sm text-gray-700">
                        Copiar do ano
                        <select
                            defaultValue={origem.ano}
                            onChange={e => { origem.ano = Number(e.target.value); }}
                            className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        >
                            {years.filter(y => y !== selectedYear).map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </label>
                    <p>INSS, IRRF e FGTS vigentes no ano escolhido são copiados com vigência de 01/01 a 31/12/{selectedYear}.</p>
                    {jaTem && <p className="text-amber-700">{selectedYear} já tem tabelas: as copiadas entram junto, sem substituir as atuais.</p>}
                </div>
            ),
            variant: jaTem ? 'warning' : 'default',
            confirmLabel: 'Clonar',
        });
        if (!ok) return;
        setSaving(true);
        try {
            await fiscalService.duplicateYear(origem.ano, selectedYear);
            showToast(`Tabelas de ${origem.ano} clonadas para ${selectedYear}`, 'success');
            // Clonagem cria várias linhas de três tabelas de uma vez — aqui recarregar é o certo (§22).
            loadData();
        } catch (err) {
            console.error(err);
            showToast('Erro ao clonar tabelas', 'error');
        } finally {
            setSaving(false);
        }
    };

    // ── Células ─────────────────────────────────────────────────────────
    const tecla = (salvar: () => void) => (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') salvar();
        if (e.key === 'Escape') setEdicao(null);
    };

    const celulaAno = (salvar: () => void) => (
        <select
            value={edicao?.draft.ano}
            onChange={e => setDraft({ ano: e.target.value })}
            onKeyDown={tecla(salvar)}
            className="h-8 px-2 text-sm font-normal text-gray-900 bg-white border border-blue-400 rounded-[6px] outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
            title="Ano de vigência (01/01 a 31/12)"
        >
            {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
        </select>
    );

    const celulaNumero = (campo: keyof Rascunho, salvar: () => void, opts: { largura?: string; sufixo?: string; placeholder?: string; autoFocus?: boolean } = {}) => (
        <div className="flex items-center justify-end gap-1">
            <input
                type="number"
                step="0.01"
                min="0"
                autoFocus={opts.autoFocus}
                value={edicao?.draft[campo] ?? ''}
                placeholder={opts.placeholder}
                onChange={e => setDraft({ [campo]: e.target.value } as Partial<Rascunho>)}
                onKeyDown={tecla(salvar)}
                className={`${opts.largura ?? 'w-32'} ${INPUT_CELULA} placeholder:text-gray-400`}
            />
            {opts.sufixo && <span className="text-sm font-normal text-gray-500">{opts.sufixo}</span>}
        </div>
    );

    const renderFaixa = (t: TabelaFaixas) => (key: string, f: Faixa) => {
        const salvar = () => salvarFaixa(t);
        if (editando(t, f.id)) {
            switch (key) {
                case 'faixa': return <span className="text-sm font-normal text-gray-600">{f.id === NOVA ? `${listaDe(t).length + 1}ª` : `${ordinais.get(`${t}:${f.id}`)}ª`}</span>;
                case 'vigencia': return celulaAno(salvar);
                case 'de': return celulaNumero('min', salvar, { autoFocus: true });
                case 'ate': return celulaNumero('max', salvar, { placeholder: 'em diante' });
                case 'aliquota': return celulaNumero('rate', salvar, { largura: 'w-20', sufixo: '%' });
                case 'deducao': return celulaNumero('deduction', salvar);
                default: return null;
            }
        }
        switch (key) {
            case 'faixa': return <span className="text-sm font-normal text-gray-600">{ordinais.get(`${t}:${f.id}`)}ª</span>;
            case 'vigencia': return <span className="text-sm font-normal text-gray-700">{vigenciaTexto(f)}</span>;
            case 'de': return <span className="text-sm font-medium text-gray-800">{fmtBRL(f.min_value)}</span>;
            case 'ate': return f.max_value
                ? <span className="text-sm font-medium text-gray-800">{fmtBRL(f.max_value)}</span>
                : <span className="text-sm font-normal text-gray-600">Em diante</span>;
            case 'aliquota': return <span className="text-sm font-normal text-gray-900">{fmtPct(f.rate)}</span>;
            case 'deducao': return <span className="text-sm font-medium text-gray-800">{fmtBRL(f.deduction)}</span>;
            default: return null;
        }
    };

    const ordenarFaixa = (key: string, f: Faixa) => {
        switch (key) {
            case 'faixa': return f.min_value;
            case 'vigencia': return f.valid_from;
            case 'de': return f.min_value;
            // "Em diante" é a faixa mais alta.
            case 'ate': return f.max_value ?? Number.MAX_SAFE_INTEGER;
            case 'aliquota': return f.rate;
            case 'deducao': return f.deduction;
            default: return null;
        }
    };

    const motivoOcupado = saving ? 'Aguarde a gravação em andamento' : edicao ? 'Termine a edição da linha aberta (Enter grava, Esc cancela)' : null;

    /** Ações da linha: lápis + lixeira; na linha em edição, gravar + cancelar. */
    const acoesDaLinha = (t: FiscalTab, id: string | undefined, salvar: () => void, excluir?: () => void) => {
        if (editando(t, id)) {
            return (<>
                <ActionIconButton kind="edit" size="sm" title="Gravar (Enter)" onClick={salvar} disabled={saving}
                    icon={saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 text-emerald-600" />} />
                <ActionIconButton kind="edit" size="sm" title="Cancelar (Esc)" onClick={() => setEdicao(null)} disabled={saving}
                    icon={<X className="w-3.5 h-3.5" />} />
            </>);
        }
        return (<>
            <span className="inline-flex" title={motivoOcupado ?? 'Editar'}>
                <ActionIconButton kind="edit" size="sm" disabled={!!motivoOcupado} onClick={() => iniciarEdicao(t, (t === 'fgts' ? fgtsConfig : listaDe(t).find(f => f.id === id))!)} />
            </span>
            {excluir && (
                <span className="inline-flex" title={motivoOcupado ?? 'Excluir faixa'}>
                    <ActionIconButton kind="delete" size="sm" disabled={!!motivoOcupado} onClick={excluir} />
                </span>
            )}
        </>);
    };

    const linhasDe = (t: TabelaFaixas): Faixa[] => {
        const lista = listaDe(t);
        if (edicao?.tab !== t || edicao.id !== NOVA) return lista;
        // A faixa nova aparece como linha em edição no fim da tabela até ser gravada.
        return [...lista, { id: NOVA, valid_from: `${selectedYear}-01-01`, valid_to: `${selectedYear}-12-31`, min_value: Number.MAX_SAFE_INTEGER, max_value: null, rate: 0, deduction: 0 }];
    };
    const linhasInss = useMemo(() => linhasDe('inss'), [inssBrackets, edicao?.tab, edicao?.id, selectedYear]);
    const linhasIrrf = useMemo(() => linhasDe('irrf'), [irrfBrackets, edicao?.tab, edicao?.id, selectedYear]);
    const linhasFgts = useMemo(() => (fgtsConfig ? [fgtsConfig] : []), [fgtsConfig]);

    const notaVigencia = (
        <div className="flex items-start gap-2 px-6 py-3 border-t border-gray-100">
            <Info className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-500">
                A folha usa as faixas vigentes na competência. Para preparar um ano novo, use "Clonar tabelas" e ajuste só o que mudou —
                a vigência de um ano não encerra a do anterior sozinha.
            </p>
        </div>
    );

    const tabelaFaixas = (t: TabelaFaixas, rows: Faixa[]) => (
        <StandardTable<Faixa>
            storageKey={`labor:fiscal:${t}`}
            columns={FAIXA_COLUMNS}
            rows={rows}
            rowKey={f => f.id ?? `${f.valid_from}:${f.min_value}`}
            searchText={f => `${ordinais.get(`${t}:${f.id}`) ?? ''}ª ${vigenciaTexto(f)} ${fmtBRL(f.min_value)} ${f.max_value ? fmtBRL(f.max_value) : 'em diante'} ${fmtPct(f.rate)} ${fmtBRL(f.deduction)}`}
            search={t === 'inss' ? buscaInss : buscaIrrf}
            onSearchChange={t === 'inss' ? setBuscaInss : setBuscaIrrf}
            searchPlaceholder={`Buscar faixa de ${nomeDe(t)}...`}
            sortValue={ordenarFaixa}
            renderCell={renderFaixa(t)}
            rowClassName={f => (editando(t, f.id) ? 'bg-blue-50/40' : '')}
            actions={{ width: 110, render: f => acoesDaLinha(t, f.id, () => salvarFaixa(t), f.id === NOVA ? undefined : () => excluirFaixa(t, f)) }}
            loading={loading}
            empty={{
                icon: <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                title: `Nenhuma faixa de ${nomeDe(t)} vigente em ${selectedYear}`,
                subtitle: 'Use "Nova faixa" ou "Clonar tabelas" para copiar de outro ano.',
            }}
            footer={notaVigencia}
        />
    );

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* 1. Título */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Configurações Fiscais</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">{SUBTITULOS[activeTab]}</p>
            </div>

            {/* 2. Toolbar de abas (§19.1) — à direita, o escopo (ano, §5.3) e a ação primária da aba (§17) */}
            <TabsBar<FiscalTab>
                tabs={[
                    { id: 'inss', label: 'Tabela INSS', icon: <Shield className="w-4 h-4" />, badge: loading ? undefined : inssBrackets.length, badgeTitulo: `Faixas vigentes em ${selectedYear}` },
                    { id: 'irrf', label: 'Tabela IRRF', icon: <TrendingUp className="w-4 h-4" />, badge: loading ? undefined : irrfBrackets.length, badgeTitulo: `Faixas vigentes em ${selectedYear}` },
                    { id: 'fgts', label: 'Fundo de Garantia (FGTS)', icon: <Building2 className="w-4 h-4" /> },
                ]}
                value={activeTab}
                onChange={t => { setEdicao(null); setActiveTab(t); }}
            >
                <label className="text-xs font-semibold text-slate-500 flex items-center gap-1" htmlFor="fiscal-ano">
                    <Calendar className="w-3 h-3" /> Ano de referência
                </label>
                <select
                    id="fiscal-ano"
                    value={selectedYear}
                    onChange={e => setSelectedYear(parseInt(e.target.value))}
                    className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
                >
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <span className="inline-flex" title={motivoOcupado ?? (loading ? 'Carregando as tabelas' : `Copia as tabelas de outro ano para ${selectedYear}`)}>
                    <button onClick={clonarTabelas} disabled={!!motivoOcupado || loading} className={BOTAO_SECUNDARIO}>
                        {saving && !edicao ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Copy className="w-[15px] h-[15px]" />}
                        Clonar tabelas
                    </button>
                </span>
                {activeTab !== 'fgts' && (
                    <span className="inline-flex" title={motivoOcupado ?? (loading ? 'Carregando as tabelas' : `Nova faixa de ${nomeDe(activeTab)} em ${selectedYear}`)}>
                        <button onClick={() => novaFaixa(activeTab)} disabled={!!motivoOcupado || loading} className={BOTAO_PRIMARIO}>
                            <Plus className="w-[15px] h-[15px]" />
                            Nova faixa
                        </button>
                    </span>
                )}
            </TabsBar>

            {/* 3. Tabela da aba (§6.10) — toolbar acoplada com busca, colunas e ajuste de largura */}
            {activeTab === 'inss' && tabelaFaixas('inss', linhasInss)}
            {activeTab === 'irrf' && tabelaFaixas('irrf', linhasIrrf)}
            {activeTab === 'fgts' && (
                <StandardTable<FGTSConfig>
                    storageKey="labor:fiscal:fgts"
                    columns={FGTS_COLUMNS}
                    rows={linhasFgts}
                    rowKey={c => c.id ?? c.valid_from}
                    searchText={c => `${vigenciaTexto(c)} ${fmtPct(c.rate)}`}
                    searchPlaceholder="Buscar vigência do FGTS..."
                    sortValue={(key, c) => (key === 'vigencia' ? c.valid_from : key === 'aliquota' ? c.rate : null)}
                    renderCell={(key, c) => {
                        if (editando('fgts', c.id)) {
                            if (key === 'vigencia') return celulaAno(salvarFGTS);
                            if (key === 'aliquota') return celulaNumero('rate', salvarFGTS, { largura: 'w-20', sufixo: '%', autoFocus: true });
                            return null;
                        }
                        if (key === 'vigencia') return <span className="text-sm font-normal text-gray-700">{vigenciaTexto(c)}</span>;
                        if (key === 'aliquota') return <span className="text-sm font-normal text-gray-900">{fmtPct(c.rate)}</span>;
                        return null;
                    }}
                    rowClassName={c => (editando('fgts', c.id) ? 'bg-blue-50/40' : '')}
                    actions={{ width: 110, render: c => acoesDaLinha('fgts', c.id, salvarFGTS) }}
                    loading={loading}
                    empty={{
                        icon: <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                        title: `Nenhuma alíquota de FGTS vigente em ${selectedYear}`,
                        subtitle: 'Use "Clonar tabelas" para copiar a de outro ano.',
                    }}
                    footer={notaVigencia}
                />
            )}

            {localToast && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {localToast.message}
                </div>
            )}
        </div>
    );
};

export default LaborFiscalSettings;
