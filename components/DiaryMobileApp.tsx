import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowLeft, Plus, Search, BookOpen, Camera, X, Loader2, AlertTriangle,
    Users, ClipboardList, CheckCircle2, Trash2, ChevronRight, Sun, Cloud,
    CloudRain, BarChart3, Image as ImageIcon, CalendarDays, Ban,
} from 'lucide-react';
import { DiaryEntry, DiaryActivity, LaborEntry, WeatherShift, ProjectSettings, BudgetEntry } from '../types';
import { projectService } from '../services/projectService';
import { onlyDiarios, isObra } from '../utils/projectClassification';

/**
 * Diário de Obras — aplicativo mobile.
 *
 * Mesma fonte de dados da tela desktop (`ProjectDiaryManager`): os registros
 * moram em `projects.settings.diaryEntries` (JSONB), lidos e gravados pelo
 * `projectService`. Não há tabela própria — por isso aqui também se salva o
 * projeto inteiro, não um registro isolado.
 *
 * É usado em dois lugares (o mesmo arranjo de `TasksMobileApp`):
 *  - celular de verdade  → `DiaryProjectsList` / `ProjectDiaryManager` devolvem
 *    este componente no lugar da tela;
 *  - desktop             → dentro de `MobilePreviewFrame` (botão "Mobile").
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySettings = any;

interface ProjectSummary {
    id: string;
    name: string;
    code?: string;
    updated_at?: string;
    created_at?: string;
    settings?: AnySettings;
}

interface LoadedProject {
    id: string;
    name: string;
    settings: ProjectSettings;
    budget?: BudgetEntry[];
    empresa_id?: string;
    organization_id?: string;
}

interface DiaryMobileAppProps {
    /** Lista completa (`allProjects`) — diário não vive em `projects` (CLAUDE.md REGRA #3). */
    projects: ProjectSummary[];
    /** Diário já aberto no desktop: entra direto na lista de registros dele. */
    initialProjectId?: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** `YYYY-MM-DD` sem passar por `new Date(iso)` — evita o recuo de fuso. */
function parseISODate(iso?: string): Date | null {
    if (!iso) return null;
    const [y, m, d] = iso.split('T')[0].split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
}

function toISODate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const TODAY_ISO = toISODate(new Date());

const WEEKDAY = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function fmtLong(iso?: string): string {
    const d = parseISODate(iso);
    if (!d) return '—';
    return `${WEEKDAY[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtShort(iso?: string): string {
    const d = parseISODate(iso);
    if (!d) return '—';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function daysSince(iso?: string): number | null {
    const d = parseISODate(iso);
    if (!d) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
}

const WEATHER_ICON: Record<string, React.ElementType> = {
    'Claro': Sun,
    'Nublado': Cloud,
    'Chuvoso': CloudRain,
};

const WEATHER_COLOR: Record<string, string> = {
    'Claro': 'text-amber-500',
    'Nublado': 'text-slate-400',
    'Chuvoso': 'text-blue-500',
};

const STATUS_COLOR: Record<string, string> = {
    'Rascunho': 'text-slate-500 bg-slate-100',
    'Em Análise': 'text-amber-600 bg-amber-50',
    'Aprovado': 'text-emerald-600 bg-emerald-50',
    'Recusado': 'text-red-600 bg-red-50',
};

const TURNS: WeatherShift['turn'][] = ['Manhã', 'Tarde', 'Noite'];
const WEATHERS: WeatherShift['weather'][] = ['Claro', 'Nublado', 'Chuvoso'];
const STATUSES: NonNullable<DiaryEntry['status']>[] = ['Rascunho', 'Em Análise', 'Aprovado', 'Recusado'];

function emptyEntry(): DiaryEntry {
    return {
        id: crypto.randomUUID(),
        date: TODAY_ISO,
        weather: 'Ensolarado',
        temperature: '',
        description: '',
        status: 'Rascunho',
        weatherShifts: TURNS.map(turn => ({ turn, weather: 'Claro' as const, condition: 'Praticável' as const })),
        activities: [],
        labor: [],
        images: [],
        videos: [],
        documents: [],
        impediments: '',
    };
}

function hasImpediment(e: DiaryEntry): boolean {
    return !!e.impediments && e.impediments.trim() !== '';
}

/** Lê arquivos como data URL — mesmo formato que a tela desktop grava. */
function readAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = ev => resolve(ev.target?.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

// ── Peças de UI ──────────────────────────────────────────────────────────────

const StatusBar: React.FC = () => {
    const time = useMemo(
        () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        [],
    );
    return (
        <div className="flex items-center justify-between px-5 pt-3 pb-1 bg-white flex-shrink-0">
            <span className="text-xs font-black text-slate-700">{time}</span>
            <div className="flex items-center gap-1.5">
                <div className="flex gap-0.5 items-end h-3">
                    {[3, 5, 7, 9].map((h, i) => (
                        <div key={i} className="w-1 bg-slate-700 rounded-sm" style={{ height: h }} />
                    ))}
                </div>
                <div className="w-6 h-3 border border-slate-700 rounded-sm relative">
                    <div className="absolute inset-0.5 bg-slate-700 rounded-[1px]" style={{ width: '70%' }} />
                    <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-0.5 h-1.5 bg-slate-700 rounded-r" />
                </div>
            </div>
        </div>
    );
};

const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
    <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</label>
        {children}
        {hint && <p className="text-[11px] text-slate-400 font-medium">{hint}</p>}
    </div>
);

const SectionTitle: React.FC<{ icon: React.ElementType; label: string; right?: React.ReactNode }> = ({ icon: Icon, label, right }) => (
    <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-black text-slate-900">{label}</h2>
        </div>
        {right}
    </div>
);

const INPUT = 'w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';

// ── Cartão de registro ───────────────────────────────────────────────────────

const EntryCard = React.memo<{ entry: DiaryEntry; onPress: (e: DiaryEntry) => void }>(({ entry, onPress }) => {
    const shifts = entry.weatherShifts || [];
    const impraticavel = shifts.some(s => s.condition === 'Impraticável');
    const fotos = entry.images?.length || 0;
    const atividades = entry.activities?.length || 0;
    const efetivo = (entry.labor || []).reduce((s, l) => s + (Number(l.quantity) || 0), 0);

    return (
        <div
            onClick={() => onPress(entry)}
            className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3.5 active:bg-slate-50 cursor-pointer"
        >
            <div className="flex items-start gap-3">
                <div className="w-12 flex-shrink-0 text-center">
                    <p className="text-lg font-black text-slate-900 leading-none">
                        {String(parseISODate(entry.date)?.getDate() ?? 0).padStart(2, '0')}
                    </p>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                        {MONTH_SHORT[parseISODate(entry.date)?.getMonth() ?? 0]}
                    </p>
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        {shifts.map((s, i) => {
                            const Icon = WEATHER_ICON[s.weather] || Sun;
                            return <Icon key={i} className={`w-3.5 h-3.5 ${WEATHER_COLOR[s.weather] || 'text-slate-400'}`} />;
                        })}
                        {impraticavel && <Ban className="w-3.5 h-3.5 text-red-500" />}
                        <span className={`ml-auto px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${STATUS_COLOR[entry.status || 'Rascunho']}`}>
                            {entry.status || 'Rascunho'}
                        </span>
                    </div>

                    <p className="text-sm font-medium text-slate-700 line-clamp-2 leading-snug">
                        {entry.description?.trim() || (atividades > 0 ? `${atividades} atividade(s) registrada(s)` : 'Sem descrição')}
                    </p>

                    <div className="flex items-center gap-3 mt-2 text-[11px] font-bold text-slate-400">
                        {atividades > 0 && <span className="flex items-center gap-1"><ClipboardList className="w-3 h-3" />{atividades}</span>}
                        {efetivo > 0 && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{efetivo}</span>}
                        {fotos > 0 && <span className="flex items-center gap-1"><ImageIcon className="w-3 h-3" />{fotos}</span>}
                        {hasImpediment(entry) && (
                            <span className="flex items-center gap-1 text-amber-600"><AlertTriangle className="w-3 h-3" />Impedimento</span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
});
EntryCard.displayName = 'EntryCard';

// ── Tela: escolher diário ────────────────────────────────────────────────────

interface DiarioResumo {
    id: string;
    name: string;
    obra: string;
    entries: number;
    lastEntry: string | null;
    impediments: number;
}

const PickerScreen: React.FC<{
    diarios: DiarioResumo[];
    onSelect: (id: string) => void;
}> = ({ diarios, onSelect }) => {
    // §3.1 — busca dentro de um seletor é transitória: não persiste.
    const [term, setTerm] = useState('');

    const visible = useMemo(() => {
        const t = term.trim().toLowerCase();
        if (!t) return diarios;
        return diarios.filter(d => d.name.toLowerCase().includes(t) || d.obra.toLowerCase().includes(t));
    }, [diarios, term]);

    return (
        <>
            <div className="bg-white px-4 pb-3 flex-shrink-0 border-b border-slate-100">
                <h1 className="text-xl font-black text-slate-900 tracking-tight mb-0.5">Diário de Obras</h1>
                <p className="text-xs font-medium text-slate-400 mb-3">Escolha o diário para registrar o dia.</p>
                <div className="relative">
                    <Search className="w-4 h-4 text-slate-300 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        value={term}
                        onChange={e => setTerm(e.target.value)}
                        placeholder="Buscar diário ou obra"
                        className="w-full h-10 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {visible.length === 0 ? (
                    <div className="flex flex-col items-center py-16 gap-3">
                        <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center shadow-sm">
                            <BookOpen className="w-8 h-8 text-blue-200" />
                        </div>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest text-center">
                            Nenhum diário encontrado
                        </p>
                    </div>
                ) : visible.map(d => {
                    const dias = daysSince(d.lastEntry || undefined);
                    return (
                        <button
                            key={d.id}
                            onClick={() => onSelect(d.id)}
                            className="w-full text-left bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3.5 flex items-center gap-3 active:bg-slate-50"
                        >
                            <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                                <BookOpen className="w-5 h-5 text-blue-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-black text-slate-900 truncate">{d.name}</p>
                                {d.obra && <p className="text-[11px] font-medium text-slate-400 truncate">{d.obra}</p>}
                                <div className="flex items-center gap-3 mt-1 text-[11px] font-bold text-slate-400">
                                    <span>{d.entries} registro(s)</span>
                                    {dias !== null && (
                                        <span className={dias > 7 ? 'text-amber-600' : 'text-emerald-600'}>
                                            {dias === 0 ? 'hoje' : `há ${dias} dia(s)`}
                                        </span>
                                    )}
                                    {d.impediments > 0 && (
                                        <span className="text-amber-600 flex items-center gap-1">
                                            <AlertTriangle className="w-3 h-3" />{d.impediments}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                        </button>
                    );
                })}
                <div className="h-6" />
            </div>
        </>
    );
};

// ── Tela: resumo ─────────────────────────────────────────────────────────────

const ResumoScreen: React.FC<{ entries: DiaryEntry[] }> = ({ entries }) => {
    const kpis = useMemo(() => {
        const ultimos7 = entries.filter(e => {
            const d = daysSince(e.date);
            return d !== null && d >= 0 && d <= 7;
        }).length;
        const impedimentos = entries.filter(hasImpediment).length;
        const rascunhos = entries.filter(e => (e.status || 'Rascunho') === 'Rascunho').length;
        const fotos = entries.reduce((s, e) => s + (e.images?.length || 0), 0);
        const efetivo = entries.reduce((s, e) => s + (e.labor || []).reduce((t, l) => t + (Number(l.quantity) || 0), 0), 0);
        const impraticaveis = entries.filter(e => (e.weatherShifts || []).some(s => s.condition === 'Impraticável')).length;
        return { total: entries.length, ultimos7, impedimentos, rascunhos, fotos, efetivo, impraticaveis };
    }, [entries]);

    const cards = [
        { label: 'Registros', value: kpis.total, tone: 'text-slate-900' },
        { label: 'Últimos 7 dias', value: kpis.ultimos7, tone: 'text-blue-600' },
        { label: 'Impedimentos', value: kpis.impedimentos, tone: kpis.impedimentos > 0 ? 'text-amber-600' : 'text-slate-900' },
        { label: 'Rascunhos', value: kpis.rascunhos, tone: 'text-slate-900' },
        { label: 'Turnos impraticáveis', value: kpis.impraticaveis, tone: kpis.impraticaveis > 0 ? 'text-red-600' : 'text-slate-900' },
        { label: 'Fotos', value: kpis.fotos, tone: 'text-slate-900' },
    ];

    const ultimasFotos = useMemo(
        () => entries.flatMap(e => (e.images || []).map(src => ({ src, date: e.date }))).slice(0, 9),
        [entries],
    );

    return (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            <div className="grid grid-cols-2 gap-2">
                {cards.map(c => (
                    <div key={c.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">{c.label}</p>
                        <p className={`text-2xl font-black mt-1 ${c.tone}`}>{c.value}</p>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3">
                <SectionTitle icon={Users} label="Efetivo acumulado" />
                <p className="text-3xl font-black text-slate-900 mt-1">{kpis.efetivo}</p>
                <p className="text-[11px] font-medium text-slate-400">homens-dia somados em todos os registros</p>
            </div>

            {ultimasFotos.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3">
                    <SectionTitle icon={ImageIcon} label="Fotos recentes" />
                    <div className="grid grid-cols-3 gap-1.5 mt-3">
                        {ultimasFotos.map((f, i) => (
                            <img key={i} src={f.src} alt={`Foto de ${fmtShort(f.date)}`} className="w-full h-20 object-cover rounded-xl" />
                        ))}
                    </div>
                </div>
            )}
            <div className="h-24" />
        </div>
    );
};

// ── Folha: criar/editar registro ─────────────────────────────────────────────

const EntrySheet: React.FC<{
    entry: DiaryEntry;
    isNew: boolean;
    saving: boolean;
    onClose: () => void;
    onSave: (e: DiaryEntry) => void;
    onDelete: (id: string) => void;
}> = ({ entry, isNew, saving, onClose, onSave, onDelete }) => {
    const [form, setForm] = useState<DiaryEntry>(entry);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const fotoRef = useRef<HTMLInputElement>(null);

    const set = <K extends keyof DiaryEntry>(k: K, v: DiaryEntry[K]) => setForm(p => ({ ...p, [k]: v }));

    const setShift = (i: number, field: keyof WeatherShift, value: string) => {
        setForm(p => {
            const shifts = [...(p.weatherShifts || [])];
            shifts[i] = { ...shifts[i], [field]: value } as WeatherShift;
            return { ...p, weatherShifts: shifts };
        });
    };

    const setActivity = (i: number, field: keyof DiaryActivity, value: string | number) => {
        setForm(p => {
            const list = [...(p.activities || [])];
            if (field === 'evolution') {
                const pct = Math.max(0, Math.min(100, parseInt(String(value), 10) || 0));
                const planned = list[i].plannedQty || 0;
                list[i] = {
                    ...list[i],
                    evolution: pct,
                    realizedQty: (pct / 100) * planned,
                    status: pct === 100 ? 'Finalizada' : 'Em Andamento',
                };
            } else {
                list[i] = { ...list[i], [field]: value } as DiaryActivity;
            }
            return { ...p, activities: list };
        });
    };

    const setLabor = (i: number, field: keyof LaborEntry, value: string | number) => {
        setForm(p => {
            const list = [...(p.labor || [])];
            list[i] = { ...list[i], [field]: value } as LaborEntry;
            return { ...p, labor: list };
        });
    };

    const addFotos = async (files: FileList | null) => {
        if (!files?.length) return;
        const urls = await Promise.all(Array.from(files).map(readAsDataURL));
        setForm(p => ({ ...p, images: [...(p.images || []), ...urls] }));
    };

    const submit = () => {
        const temConteudo = !!form.description?.trim() || (form.activities || []).length > 0;
        if (!form.date || !temConteudo) {
            setErro('Informe a data e ao menos uma descrição ou atividade.');
            return;
        }
        setErro(null);
        onSave(form);
    };

    const efetivo = (form.labor || []).reduce((s, l) => s + (Number(l.quantity) || 0), 0);

    return (
        <div className="absolute inset-0 z-30 bg-[#eef2ff] flex flex-col">
            <StatusBar />
            {/* Cabeçalho */}
            <div className="bg-white px-4 py-3 flex items-center gap-3 border-b border-slate-100 flex-shrink-0">
                <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                    <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="flex-1 min-w-0">
                    <h1 className="text-base font-black text-slate-900 leading-tight">
                        {isNew ? 'Novo registro' : 'Editar registro'}
                    </h1>
                    <p className="text-[11px] font-medium text-slate-400 truncate">{fmtLong(form.date)}</p>
                </div>
                {!isNew && (
                    <button
                        onClick={() => setConfirmDelete(true)}
                        className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center text-red-500"
                        title="Excluir registro"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {erro && (
                    <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs font-bold text-red-600">{erro}</p>
                    </div>
                )}

                {/* Data e situação */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 space-y-3">
                    <SectionTitle icon={CalendarDays} label="Dia" />
                    <Field label="Data">
                        <input type="date" value={form.date} onChange={e => set('date', e.target.value)} className={INPUT} />
                    </Field>
                    <Field label="Situação">
                        <div className="flex flex-wrap gap-1.5">
                            {STATUSES.map(s => (
                                <button
                                    key={s}
                                    onClick={() => set('status', s)}
                                    className={`h-9 px-3 rounded-xl text-xs font-bold transition-all ${(form.status || 'Rascunho') === s
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-slate-50 text-slate-500 border border-slate-200'}`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </Field>
                    <Field label="Temperatura" hint="Ex.: 28°/18°">
                        <input
                            value={form.temperature || ''}
                            onChange={e => set('temperature', e.target.value)}
                            placeholder="28°/18°"
                            className={INPUT}
                        />
                    </Field>
                </div>

                {/* Clima por turno */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 space-y-3">
                    <SectionTitle icon={Sun} label="Clima por turno" />
                    {(form.weatherShifts || []).map((s, i) => (
                        <div key={s.turn} className="space-y-2">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{s.turn}</p>
                            <div className="flex gap-1.5">
                                {WEATHERS.map(w => {
                                    const Icon = WEATHER_ICON[w];
                                    const on = s.weather === w;
                                    return (
                                        <button
                                            key={w}
                                            onClick={() => setShift(i, 'weather', w)}
                                            className={`flex-1 h-11 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all ${on
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-slate-50 text-slate-500 border border-slate-200'}`}
                                        >
                                            <Icon className="w-4 h-4" />
                                            <span className="text-[9px] font-black uppercase tracking-widest">{w}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="flex gap-1.5">
                                {(['Praticável', 'Impraticável'] as const).map(c => (
                                    <button
                                        key={c}
                                        onClick={() => setShift(i, 'condition', c)}
                                        className={`flex-1 h-9 rounded-xl text-xs font-bold transition-all ${s.condition === c
                                            ? (c === 'Praticável' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white')
                                            : 'bg-slate-50 text-slate-500 border border-slate-200'}`}
                                    >
                                        {c}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Atividades */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 space-y-3">
                    <SectionTitle
                        icon={ClipboardList}
                        label="Atividades"
                        right={
                            <button
                                onClick={() => setForm(p => ({
                                    ...p,
                                    activities: [...(p.activities || []), {
                                        itemId: '', description: '', plannedQty: 0, realizedQty: 0,
                                        evolution: 0, status: 'Em Andamento' as const, comment: '',
                                    }],
                                }))}
                                className="h-8 px-3 rounded-xl bg-blue-50 text-blue-600 text-xs font-bold flex items-center gap-1"
                            >
                                <Plus className="w-3.5 h-3.5" />Adicionar
                            </button>
                        }
                    />
                    {(form.activities || []).length === 0 && (
                        <p className="text-xs font-medium text-slate-400 py-2">Nenhuma atividade registrada neste dia.</p>
                    )}
                    {(form.activities || []).map((a, i) => (
                        <div key={i} className="bg-slate-50 rounded-xl p-3 space-y-2.5 border border-slate-100">
                            <div className="flex items-start gap-2">
                                <input
                                    value={a.description}
                                    onChange={e => setActivity(i, 'description', e.target.value)}
                                    placeholder="O que foi executado"
                                    className="flex-1 h-10 px-3 bg-white border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                />
                                <button
                                    onClick={() => setForm(p => ({ ...p, activities: (p.activities || []).filter((_, k) => k !== i) }))}
                                    className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 flex-shrink-0"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Evolução</span>
                                    <span className={`text-xs font-black ${a.evolution === 100 ? 'text-emerald-600' : 'text-blue-600'}`}>
                                        {a.evolution}%
                                    </span>
                                </div>
                                <input
                                    type="range" min={0} max={100} step={5}
                                    value={a.evolution}
                                    onChange={e => setActivity(i, 'evolution', e.target.value)}
                                    className="w-full accent-blue-600"
                                />
                            </div>
                            <input
                                value={a.comment || ''}
                                onChange={e => setActivity(i, 'comment', e.target.value)}
                                placeholder="Observação (opcional)"
                                className="w-full h-10 px-3 bg-white border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            />
                        </div>
                    ))}
                </div>

                {/* Efetivo */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 space-y-3">
                    <SectionTitle
                        icon={Users}
                        label={`Efetivo${efetivo > 0 ? ` (${efetivo})` : ''}`}
                        right={
                            <button
                                onClick={() => setForm(p => ({ ...p, labor: [...(p.labor || []), { category: '', quantity: 1, observations: '' }] }))}
                                className="h-8 px-3 rounded-xl bg-blue-50 text-blue-600 text-xs font-bold flex items-center gap-1"
                            >
                                <Plus className="w-3.5 h-3.5" />Adicionar
                            </button>
                        }
                    />
                    {(form.labor || []).length === 0 && (
                        <p className="text-xs font-medium text-slate-400 py-2">Nenhum efetivo lançado.</p>
                    )}
                    {(form.labor || []).map((l, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <input
                                value={l.category}
                                onChange={e => setLabor(i, 'category', e.target.value)}
                                placeholder="Função / equipe"
                                className="flex-1 h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            />
                            <input
                                type="number" inputMode="numeric" min={0}
                                value={l.quantity}
                                onChange={e => setLabor(i, 'quantity', parseInt(e.target.value, 10) || 0)}
                                className="w-16 h-10 px-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-center focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            />
                            <button
                                onClick={() => setForm(p => ({ ...p, labor: (p.labor || []).filter((_, k) => k !== i) }))}
                                className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 flex-shrink-0"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>

                {/* Fotos */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 space-y-3">
                    <SectionTitle icon={Camera} label="Fotos" />
                    <input
                        ref={fotoRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        multiple
                        onChange={e => { addFotos(e.target.files); e.target.value = ''; }}
                        className="hidden"
                    />
                    <button
                        onClick={() => fotoRef.current?.click()}
                        className="w-full h-12 rounded-xl border-2 border-dashed border-slate-200 text-slate-500 text-sm font-bold flex items-center justify-center gap-2 active:bg-slate-50"
                    >
                        <Camera className="w-4 h-4" />
                        Tirar foto ou escolher
                    </button>
                    {(form.images || []).length > 0 && (
                        <div className="grid grid-cols-3 gap-1.5">
                            {(form.images || []).map((src, i) => (
                                <div key={i} className="relative">
                                    <img src={src} alt={`Foto ${i + 1}`} className="w-full h-20 object-cover rounded-xl" />
                                    <button
                                        onClick={() => setForm(p => ({ ...p, images: (p.images || []).filter((_, k) => k !== i) }))}
                                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Relato e impedimentos */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 space-y-3">
                    <SectionTitle icon={BookOpen} label="Relato do dia" />
                    <Field label="Descrição">
                        <textarea
                            value={form.description || ''}
                            onChange={e => set('description', e.target.value)}
                            rows={4}
                            placeholder="O que aconteceu na obra hoje"
                            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                        />
                    </Field>
                    <Field label="Impedimentos" hint="Deixe em branco se não houve.">
                        <textarea
                            value={form.impediments || ''}
                            onChange={e => set('impediments', e.target.value)}
                            rows={3}
                            placeholder="Chuva, falta de material, acesso bloqueado…"
                            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                        />
                    </Field>
                </div>

                <div className="h-4" />
            </div>

            {/* Rodapé de ação */}
            <div className="bg-white border-t border-slate-100 px-4 py-3 flex items-center gap-2 flex-shrink-0">
                <button
                    onClick={onClose}
                    className="h-12 px-5 rounded-xl bg-slate-100 text-slate-600 text-sm font-bold active:scale-95 transition-all"
                >
                    Cancelar
                </button>
                <button
                    onClick={submit}
                    disabled={saving}
                    className="flex-1 h-12 rounded-xl bg-blue-600 text-white text-sm font-black flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-60"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    {saving ? 'Salvando…' : 'Salvar registro'}
                </button>
            </div>

            {/* §14 — confirmação própria: `useConfirm()` renderiza no documento pai e
                não apareceria dentro do iframe da prévia. */}
            {confirmDelete && (
                <div className="absolute inset-0 z-40 bg-black/50 flex items-end">
                    <div className="w-full bg-white rounded-t-3xl p-5 space-y-3">
                        <h3 className="text-base font-black text-slate-900">Excluir registro?</h3>
                        <p className="text-sm font-medium text-slate-500">
                            O registro de {fmtLong(form.date)} será removido do diário. Não dá para desfazer.
                        </p>
                        <div className="flex gap-2 pt-1">
                            <button
                                onClick={() => setConfirmDelete(false)}
                                className="flex-1 h-12 rounded-xl bg-slate-100 text-slate-600 text-sm font-bold"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => { setConfirmDelete(false); onDelete(form.id); }}
                                className="flex-1 h-12 rounded-xl bg-red-600 text-white text-sm font-black"
                            >
                                Excluir
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ── App ──────────────────────────────────────────────────────────────────────

type NavTab = 'registros' | 'resumo';
type FilterTab = 'todos' | 'rascunho' | 'impedimentos';

const DiaryMobileApp: React.FC<DiaryMobileAppProps> = ({ projects, initialProjectId }) => {
    const [selectedId, setSelectedId] = useState<string | null>(initialProjectId || null);
    const [project, setProject] = useState<LoadedProject | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [nav, setNav] = useState<NavTab>('registros');
    const [filter, setFilter] = useState<FilterTab>('todos');
    const [editing, setEditing] = useState<DiaryEntry | null>(null);
    const [isNew, setIsNew] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    const notify = useCallback((msg: string) => {
        setToast(msg);
        window.setTimeout(() => setToast(null), 3000);
    }, []);

    /** Diários disponíveis — mesma regra da lista desktop: projetos DIARIO, mais
     *  obras que já têm registros pendurados. */
    const diarios = useMemo<DiarioResumo[]>(() => {
        return projects
            .filter(p => onlyDiarios([p]).length > 0 || (isObra(p) && (p.settings?.diaryEntries?.length || 0) > 0))
            .map(p => {
                const entries: DiaryEntry[] = p.settings?.diaryEntries || [];
                const last = entries.reduce<string | null>(
                    (acc, e) => (!acc || (e.date || '') > acc ? e.date || acc : acc), null,
                );
                return {
                    id: p.id,
                    name: p.name,
                    obra: p.settings?.linkedProjectName || '',
                    entries: entries.length,
                    lastEntry: last,
                    impediments: entries.filter(hasImpediment).length,
                };
            })
            .sort((a, b) => (b.lastEntry || '').localeCompare(a.lastEntry || ''));
    }, [projects]);

    // Carrega o diário escolhido — o `settings` que vem da lista pode estar
    // parcial, e o save precisa do projeto inteiro (budget, empresa, org).
    useEffect(() => {
        let cancelled = false;
        if (!selectedId) { setProject(null); return; }
        setLoading(true);
        projectService.loadProject(selectedId)
            .then(p => { if (!cancelled) setProject((p as LoadedProject) || null); })
            .catch(err => {
                console.error('Erro ao abrir diário:', err);
                if (!cancelled) notify('Não foi possível abrir o diário.');
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [selectedId, notify]);

    const entries = useMemo<DiaryEntry[]>(() => {
        const list = (project?.settings?.diaryEntries || []) as DiaryEntry[];
        return [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }, [project]);

    const visible = useMemo(() => entries.filter(e => {
        if (filter === 'rascunho') return (e.status || 'Rascunho') === 'Rascunho';
        if (filter === 'impedimentos') return hasImpediment(e);
        return true;
    }), [entries, filter]);

    /** Grava a lista inteira — os registros são JSONB do projeto, não linha de tabela. */
    const persist = useCallback(async (next: DiaryEntry[], msg: string) => {
        if (!project) return;
        setSaving(true);
        try {
            const settings = { ...project.settings, diaryEntries: next };
            await projectService.saveProject({
                id: project.id,
                name: project.name,
                settings,
                budget: project.budget || [],
                ...(project.empresa_id ? { empresa_id: project.empresa_id } : {}),
                ...(project.organization_id ? { organization_id: project.organization_id } : {}),
            });
            // §22 — estado local, sem recarregar a lista inteira.
            setProject(p => (p ? { ...p, settings } : p));
            setEditing(null);
            notify(msg);
        } catch (err) {
            console.error('Erro ao salvar registro do diário:', err);
            notify('Falha ao salvar. Tente novamente.');
        } finally {
            setSaving(false);
        }
    }, [project, notify]);

    const handleSaveEntry = useCallback((entry: DiaryEntry) => {
        const list = (project?.settings?.diaryEntries || []) as DiaryEntry[];
        const exists = list.some(e => e.id === entry.id);
        const next = exists ? list.map(e => (e.id === entry.id ? entry : e)) : [entry, ...list];
        next.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        persist(next, exists ? 'Registro atualizado.' : 'Registro salvo.');
    }, [project, persist]);

    const handleDeleteEntry = useCallback((id: string) => {
        const list = (project?.settings?.diaryEntries || []) as DiaryEntry[];
        persist(list.filter(e => e.id !== id), 'Registro excluído.');
    }, [project, persist]);

    const diarioAtual = diarios.find(d => d.id === selectedId);
    const podeVoltar = !initialProjectId && !!selectedId;

    return (
        <div className="flex flex-col h-screen bg-[#eef2ff] font-sans overflow-hidden relative">
            <StatusBar />

            {!selectedId ? (
                <PickerScreen diarios={diarios} onSelect={setSelectedId} />
            ) : (
                <>
                    {/* Cabeçalho do diário */}
                    <div className="bg-white px-4 pb-3 flex-shrink-0 border-b border-slate-100">
                        <div className="flex items-center gap-2 mb-3">
                            {podeVoltar && (
                                <button
                                    onClick={() => { setSelectedId(null); setNav('registros'); setFilter('todos'); }}
                                    className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 flex-shrink-0"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                </button>
                            )}
                            <div className="flex-1 min-w-0">
                                <h1 className="text-base font-black text-slate-900 leading-tight truncate">
                                    {project?.name || diarioAtual?.name || 'Diário'}
                                </h1>
                                <p className="text-[11px] font-medium text-slate-400 truncate">
                                    {diarioAtual?.obra || 'Diário de obras'}
                                </p>
                            </div>
                        </div>

                        {nav === 'registros' && (
                            <div className="flex items-center gap-1.5">
                                {([
                                    { key: 'todos', label: 'Todos', count: entries.length },
                                    { key: 'rascunho', label: 'Rascunhos', count: entries.filter(e => (e.status || 'Rascunho') === 'Rascunho').length },
                                    { key: 'impedimentos', label: 'Impedimentos', count: entries.filter(hasImpediment).length },
                                ] as const).map(({ key, label, count }) => (
                                    <button
                                        key={key}
                                        onClick={() => setFilter(key)}
                                        className={`flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-bold transition-all ${filter === key
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-slate-50 text-slate-500 border border-slate-200'}`}
                                    >
                                        {label}
                                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${filter === key ? 'bg-white/20' : 'bg-slate-100 text-slate-400'}`}>
                                            {count}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Conteúdo */}
                    {loading ? (
                        <div className="flex-1 flex justify-center pt-16">
                            <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                        </div>
                    ) : nav === 'resumo' ? (
                        <ResumoScreen entries={entries} />
                    ) : (
                        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                            {visible.length === 0 ? (
                                <div className="flex flex-col items-center py-16 gap-3">
                                    <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center shadow-sm">
                                        <BookOpen className="w-8 h-8 text-blue-200" />
                                    </div>
                                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest text-center px-8">
                                        {filter === 'todos'
                                            ? 'Nenhum registro neste diário'
                                            : filter === 'rascunho'
                                                ? 'Nenhum rascunho'
                                                : 'Nenhum impedimento registrado'}
                                    </p>
                                </div>
                            ) : visible.map(e => (
                                <EntryCard
                                    key={e.id}
                                    entry={e}
                                    onPress={entry => { setToast(null); setIsNew(false); setEditing(entry); }}
                                />
                            ))}
                            <div className="h-24" />
                        </div>
                    )}

                    {/* FAB */}
                    {nav === 'registros' && !loading && (
                        <div className="absolute bottom-[72px] right-5 z-10">
                            <button
                                onClick={() => { setToast(null); setIsNew(true); setEditing(emptyEntry()); }}
                                className="w-14 h-14 rounded-full bg-blue-600 text-white shadow-xl shadow-blue-300 flex items-center justify-center active:scale-95 transition-all"
                            >
                                <Plus className="w-6 h-6" />
                            </button>
                        </div>
                    )}

                    {/* Navegação inferior */}
                    <div className="bg-white border-t border-slate-100 px-8 py-3 flex items-center justify-around flex-shrink-0">
                        {([
                            { key: 'registros', icon: BookOpen, label: 'Registros' },
                            { key: 'resumo', icon: BarChart3, label: 'Resumo' },
                        ] as const).map(({ key, icon: Icon, label }) => (
                            <button
                                key={key}
                                onClick={() => setNav(key)}
                                className={`flex flex-col items-center gap-1 transition-colors ${nav === key ? 'text-blue-600' : 'text-slate-300'}`}
                            >
                                <Icon className="w-5 h-5" />
                                <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
                            </button>
                        ))}
                    </div>
                </>
            )}

            {editing && (
                <EntrySheet
                    entry={editing}
                    isNew={isNew}
                    saving={saving}
                    onClose={() => setEditing(null)}
                    onSave={handleSaveEntry}
                    onDelete={handleDeleteEntry}
                />
            )}

            {toast && (
                <div className="absolute bottom-[78px] left-4 right-24 z-20 bg-slate-900 text-white rounded-2xl px-4 py-3 shadow-xl">
                    <p className="text-sm font-bold">{toast}</p>
                </div>
            )}
        </div>
    );
};

export default DiaryMobileApp;
