import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowLeft, Plus, Search, BookOpen, Camera, X, Loader2, AlertTriangle,
    Users, ClipboardList, CheckCircle2, Trash2, ChevronRight, Sun, Cloud,
    CloudRain, BarChart3, Image as ImageIcon, CalendarDays, Ban,
} from 'lucide-react';
import { DiaryEntry, DiaryActivity, LaborEntry, WeatherShift, ProjectSettings } from '../types';
import { projectService } from '../services/projectService';
import { uploadDiaryMedia, removeDiaryMedia, diaryEntryMediaRefs } from '../services/diaryMediaService';
import { salvarRegistroDiario, excluirRegistroDiario, sincronizarEvolucaoNoPlanejamento, DiaryWriteResult } from '../services/diaryEntryService';
import { useDiaryMediaUrls } from '../hooks/useDiaryMediaUrls';
import { onlyDiarios, isObra } from '../utils/projectClassification';
import { hojeLocal } from '../utils/baixaRecebivel';
import { sugestoesDosRecursos, comColaboradoresDoRh, nomeEstaNaLista, aplicarNomeNoEfetivo, SugestaoEfetivo } from '../utils/diaryLabor';
import { laborService } from '../services/laborService';
import { useOrgContext } from '../hooks/useOrgContext';
import { useStore } from '../store/useStore';
import { salvarRascunho, lerRascunho, apagarRascunho, listarRascunhos, rascunhoDifere, quandoFoiGuardado, RascunhoDiario } from '../utils/diaryDraft';
import { isUnplannedActivity, setUnplanned } from '../utils/diaryActivities';
import { vincularAtividade, temAtividadeVinculada, ItemVinculavel } from '../utils/diaryPlanningLink';
import { useDiaryLinkedPlanning } from '../hooks/useDiaryLinkedPlanning';

/**
 * Diário de Obras — aplicativo mobile.
 *
 * Mesma fonte de dados da tela desktop (`ProjectDiaryManager`): os registros
 * moram em `projects.settings.diaryEntries` (JSONB). Lê-se o projeto pelo
 * `projectService`; grava-se UM registro por vez (`diaryEntryService`) — salvar
 * o projeto inteiro apagava o registro que outra pessoa lançou no meio tempo.
 *
 * É usado em dois lugares (o mesmo arranjo de `TasksMobileApp`):
 *  - celular de verdade  → `DiaryProjectsList` / `ProjectDiaryManager` devolvem
 *    este componente no lugar da tela. Ele fica DENTRO do Layout (o cabeçalho
 *    com menu e seletor de organização continua valendo) e ocupa a área de
 *    conteúdo inteira — anula o gutter do `<main>` e não desenha barra de status
 *    (o telefone já tem a dele);
 *  - desktop             → dentro de `MobilePreviewFrame` (botão "Mobile"), com
 *    `previa`: aí o iframe é o "telefone" e a barra de status falsa fica, porque
 *    a moldura desenha o notch por cima dos 24px do topo.
 *
 * O rodapé soma `env(safe-area-inset-bottom)` (barra de gestos do iPhone); no
 * iframe da prévia isso vale 0.
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
    organization_id?: string;
}

interface DiaryMobileAppProps {
    /** Lista completa (`allProjects`) — diário não vive em `projects` (CLAUDE.md REGRA #3). */
    projects: ProjectSummary[];
    /** Diário já aberto no desktop: entra direto na lista de registros dele. */
    initialProjectId?: string | null;
    /** Dentro da moldura de prévia do desktop (barra de status falsa, altura do iframe). */
    previa?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** `YYYY-MM-DD` sem passar por `new Date(iso)` — evita o recuo de fuso. */
function parseISODate(iso?: string): Date | null {
    if (!iso) return null;
    const [y, m, d] = iso.split('T')[0].split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
}

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
        // Na hora de abrir, não ao carregar o módulo: app instalado aberto desde ontem
        // fazia o registro novo nascer com a data de ontem.
        date: hojeLocal(),
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

/** Onde a foto vai parar no bucket: `{org}/{projeto}/…` — a org é o que a policy lê. */
interface UploadTarget {
    orgId: string | null;
    projectId: string;
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

const EntryCard = React.memo<{ entry: DiaryEntry; naoSalvo?: boolean; onPress: (e: DiaryEntry) => void }>(({ entry, naoSalvo, onPress }) => {
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
                        {naoSalvo && (
                            <span className="flex items-center gap-1 text-orange-600" title="Há alterações deste registro guardadas só neste aparelho">
                                <AlertTriangle className="w-3 h-3" />Não salvo
                            </span>
                        )}
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
    const fotoUrls = useDiaryMediaUrls(useMemo(() => ultimasFotos.map(f => f.src), [ultimasFotos]));

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
                            fotoUrls[f.src]
                                ? <img key={i} src={fotoUrls[f.src]} alt={`Foto de ${fmtShort(f.date)}`} className="w-full h-20 object-cover rounded-xl" />
                                : <div key={i} className="w-full h-20 rounded-xl bg-slate-100 animate-pulse" />
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
    previa: boolean;
    entry: DiaryEntry;
    isNew: boolean;
    saving: boolean;
    upload: UploadTarget;
    /** Itens do cronograma do Planejamento ligado ao diário (vazio = diário sem cronograma). */
    itens: ItemVinculavel[];
    onClose: () => void;
    onSave: (e: DiaryEntry) => void;
    onDelete: (id: string) => void;
    /** Falha ao salvar/excluir: a folha continua aberta, então o aviso mora NELA — o toast fica atrás (z-20 < z-30). */
    erroSalvar: string | null;
    /** Nomes do RH e dos recursos da organização — mesma lista do desktop. */
    sugestoesEfetivo: SugestaoEfetivo[];
}> = ({ previa, entry, isNew, saving, upload, itens, onClose, onSave, onDelete, erroSalvar, sugestoesEfetivo }) => {
    const [form, setForm] = useState<DiaryEntry>(entry);
    // Rascunho no aparelho (sinal caiu / aba descarregada ao abrir a câmera). Registro novo usa a chave "novo".
    const chaveId = isNew ? null : entry.id;
    const [pendente, setPendente] = useState<RascunhoDiario | null>(() => {
        const r = lerRascunho(upload.projectId, chaveId);
        return r && rascunhoDifere(r.entry, entry) ? r : null;
    });
    const formRef = useRef(form);
    formRef.current = form;
    const inicialRef = useRef(entry);
    const guardar = useCallback(() => {
        const f = formRef.current;
        if (rascunhoDifere(f, inicialRef.current)) salvarRascunho(upload.projectId, chaveId, f);
    }, [upload.projectId, chaveId]);
    useEffect(() => {
        if (!rascunhoDifere(form, inicialRef.current)) return;
        // Editou sem escolher: o rascunho antigo é substituído pelo que está na tela.
        setPendente(null);
        const t = window.setTimeout(guardar, 400);
        return () => window.clearTimeout(t);
    }, [form, guardar]);
    useEffect(() => {
        // Abrir a câmera põe a página em segundo plano — é quando o celular descarrega a aba.
        const aoEsconder = () => { if (document.visibilityState === 'hidden') guardar(); };
        document.addEventListener('visibilitychange', aoEsconder);
        window.addEventListener('pagehide', guardar);
        return () => {
            document.removeEventListener('visibilitychange', aoEsconder);
            window.removeEventListener('pagehide', guardar);
        };
    }, [guardar]);
    const recuperar = () => {
        if (!pendente) return;
        const r = pendente;
        setPendente(null);
        setForm(r.entry);
    };
    const descartar = () => {
        apagarRascunho(upload.projectId, chaveId);
        setPendente(null);
    };
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    /** Falha de envio de foto: aparece NO cartão de Fotos — quem enviou está rolado ali, não no topo. */
    const [erroFoto, setErroFoto] = useState<string | null>(null);
    /** Fotos subindo: quantas já foram de quantas (null = nada subindo). */
    const [enviando, setEnviando] = useState<{ feitas: number; total: number } | null>(null);
    const fotoRef = useRef<HTMLInputElement>(null);
    const fotoUrls = useDiaryMediaUrls(form.images);

    // Cancelar depois de tirar foto: o objeto já subiu — sai do bucket junto.
    const cancelar = () => {
        const originais = new Set(diaryEntryMediaRefs(entry));
        void removeDiaryMedia((form.images || []).filter(r => !originais.has(r)));
        // Cancelar é descartar de propósito — o rascunho do aparelho vai junto.
        apagarRascunho(upload.projectId, chaveId);
        onClose();
    };

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
        if (!upload.orgId) { setErroFoto('Diário sem organização: não há onde guardar a foto.'); return; }
        const lista = Array.from(files);
        let falhas = 0;
        setErroFoto(null);
        setEnviando({ feitas: 0, total: lista.length });
        // Uma por vez (4G do canteiro) e cada uma entra no registro assim que sobe:
        // uma falha no meio não perde as que já foram.
        for (let k = 0; k < lista.length; k++) {
            try {
                const path = await uploadDiaryMedia({ orgId: upload.orgId, projectId: upload.projectId, file: lista[k] });
                setForm(p => ({ ...p, images: [...(p.images || []), path] }));
            } catch (err) {
                falhas++;
                console.error('Erro ao enviar foto do diário:', err);
            }
            setEnviando({ feitas: k + 1, total: lista.length });
        }
        setEnviando(null);
        if (falhas > 0) {
            setErroFoto(falhas === lista.length
                ? (lista.length === 1 ? 'A foto não subiu. Tente novamente.' : 'Nenhuma das fotos subiu. Tente novamente.')
                : `${falhas} de ${lista.length} fotos não subiram — as outras já estão no registro. Envie de novo as que faltaram.`);
        }
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
            {previa && <StatusBar />}
            {/* Cabeçalho */}
            <div className="bg-white px-4 py-3 flex items-center gap-3 border-b border-slate-100 flex-shrink-0">
                <button onClick={cancelar} className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
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
                {pendente && (
                    <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 space-y-2.5">
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
                            <p className="text-xs font-bold text-orange-700">
                                Há alterações não salvas deste registro guardadas neste aparelho ({quandoFoiGuardado(pendente.salvoEm)}).
                                Se você continuar editando, elas são substituídas.
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={recuperar} className="flex-1 h-10 rounded-xl bg-orange-600 text-white text-xs font-black">
                                Recuperar
                            </button>
                            <button onClick={descartar} className="flex-1 h-10 rounded-xl bg-white border border-orange-200 text-orange-700 text-xs font-bold">
                                Descartar
                            </button>
                        </div>
                    </div>
                )}
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
                            {/* Mesmo vínculo do desktop: a evolução do item vai para o cronograma ao salvar.
                                Não prevista não tem vínculo — o seletor some (setUnplanned limpa o itemId). */}
                            {itens.length > 0 && !isUnplannedActivity(a) && (
                                <div className="space-y-1">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Item do cronograma</span>
                                    <select
                                        value={a.itemId || ''}
                                        onChange={e => {
                                            const vinculo = itens.find(x => x.schedule.id === e.target.value);
                                            setForm(p => ({
                                                ...p,
                                                activities: (p.activities || []).map((x, k) => (k === i ? vincularAtividade(x, vinculo) : x)),
                                            }));
                                        }}
                                        className={`w-full h-11 px-3 bg-white border rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${a.itemId ? 'border-blue-200 text-blue-700' : 'border-slate-200 text-slate-500'}`}
                                    >
                                        <option value="">Sem vínculo — escolha o item</option>
                                        {itens.map(({ schedule: it, budget: b }) => (
                                            <option key={it.id} value={it.id}>{b.sinapiItem?.description}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
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
                            <label className="flex items-center gap-2 min-h-[40px] text-sm text-slate-600 select-none">
                                <input
                                    type="checkbox"
                                    checked={isUnplannedActivity(a)}
                                    onChange={e => {
                                        const marcar = e.target.checked;
                                        setForm(p => ({
                                            ...p,
                                            activities: (p.activities || []).map((x, k) => (k === i ? setUnplanned(x, marcar) : x)),
                                        }));
                                    }}
                                    className="w-5 h-5 accent-amber-600"
                                />
                                Não prevista no cronograma
                            </label>
                            {itens.length > 0 && !isUnplannedActivity(a) && !a.itemId && (
                                <p className="text-[11px] font-medium text-amber-600">
                                    Sem item vinculado, a evolução não chega ao cronograma.
                                </p>
                            )}
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
                    {/* Lista nativa do celular: escolher daqui mantém o nome igual ao do RH —
                        nome digitado de qualquer jeito vira equipe nova na "Análise de equipes". */}
                    <datalist id="diario-mobile-efetivo">
                        {sugestoesEfetivo.map(s => (
                            <option key={`${s.type}-${s.id}`} value={s.name}>{s.subLabel}</option>
                        ))}
                    </datalist>
                    {sugestoesEfetivo.length > 0 && (form.labor || []).length > 0 && (
                        <p className="text-[11px] font-medium text-slate-400">Escolha da lista para o nome sair igual ao do RH.</p>
                    )}
                    {(form.labor || []).map((l, i) => (
                        <div key={i} className="space-y-1">
                        <div className="flex items-center gap-2">
                            <input
                                list="diario-mobile-efetivo"
                                value={l.category}
                                onChange={e => {
                                    const nome = e.target.value;
                                    setForm(p => ({
                                        ...p,
                                        labor: (p.labor || []).map((x, k) => (k === i ? aplicarNomeNoEfetivo(x, nome, sugestoesEfetivo) : x)),
                                    }));
                                }}
                                placeholder="Colaborador, equipe ou função"
                                className="flex-1 min-w-0 h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
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
                        {l.observations && (
                            <p className="text-[11px] font-medium text-slate-400 pl-1">{l.observations}</p>
                        )}
                        {sugestoesEfetivo.length > 0 && l.category.trim() !== '' && !nomeEstaNaLista(l.category, sugestoesEfetivo) && (
                            <p className="text-[11px] font-medium text-amber-600 pl-1">Fora da lista do RH e dos recursos — confira a grafia.</p>
                        )}
                        </div>
                    ))}
                </div>

                {/* Fotos */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 space-y-3">
                    <SectionTitle icon={Camera} label="Fotos" />
                    {erroFoto && (
                        <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs font-bold text-red-600">{erroFoto}</p>
                        </div>
                    )}
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
                        disabled={!!enviando}
                        className="w-full h-12 rounded-xl border-2 border-dashed border-slate-200 text-slate-500 text-sm font-bold flex items-center justify-center gap-2 active:bg-slate-50 disabled:opacity-60"
                    >
                        {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                        {enviando
                            ? (enviando.total > 1 ? `Enviando ${Math.min(enviando.feitas + 1, enviando.total)} de ${enviando.total}…` : 'Enviando…')
                            : 'Tirar foto ou escolher'}
                    </button>
                    {(form.images || []).length > 0 && (
                        <div className="grid grid-cols-3 gap-1.5">
                            {(form.images || []).map((src, i) => (
                                <div key={i} className="relative">
                                    {fotoUrls[src]
                                        ? <img src={fotoUrls[src]} alt={`Foto ${i + 1}`} className="w-full h-20 object-cover rounded-xl" />
                                        : <div className="w-full h-20 rounded-xl bg-slate-100 animate-pulse" />}
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
            {erroSalvar && (
                <div role="alert" className="bg-red-50 border-t border-red-100 px-4 py-2.5 flex items-start gap-2 flex-shrink-0">
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs font-bold text-red-600">{erroSalvar}</p>
                </div>
            )}
            <div className="bg-white border-t border-slate-100 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex items-center gap-2 flex-shrink-0">
                <button
                    onClick={cancelar}
                    className="h-12 px-5 rounded-xl bg-slate-100 text-slate-600 text-sm font-bold active:scale-95 transition-all"
                >
                    Cancelar
                </button>
                <button
                    onClick={submit}
                    disabled={saving || !!enviando}
                    title={enviando ? 'Aguarde as fotos terminarem de subir' : undefined}
                    className="flex-1 h-12 rounded-xl bg-blue-600 text-white text-sm font-black flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-60"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    {saving ? 'Salvando…' : enviando ? 'Aguardando fotos…' : 'Salvar registro'}
                </button>
            </div>

            {/* §14 — confirmação própria: `useConfirm()` renderiza no documento pai e
                não apareceria dentro do iframe da prévia. */}
            {confirmDelete && (
                <div className="absolute inset-0 z-40 bg-black/50 flex items-end">
                    <div className="w-full bg-white rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-3">
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

const DiaryMobileApp: React.FC<DiaryMobileAppProps> = ({ projects, initialProjectId, previa = false }) => {
    const [selectedId, setSelectedId] = useState<string | null>(initialProjectId || null);
    const [project, setProject] = useState<LoadedProject | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [nav, setNav] = useState<NavTab>('registros');
    const [filter, setFilter] = useState<FilterTab>('todos');
    const [editing, setEditing] = useState<DiaryEntry | null>(null);
    const [isNew, setIsNew] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [erroSalvar, setErroSalvar] = useState<string | null>(null);

    // Efetivo: recursos das organizações + colaboradores ATIVOS do RH da org do topo (REGRA #5).
    const organizations = useStore(st => st.organizations);
    const { orgId } = useOrgContext();
    const [colaboradores, setColaboradores] = useState<{ id: string; name: string; role?: string | null; status?: string | null }[]>([]);
    useEffect(() => {
        let ativo = true;
        laborService.listEmployees(orgId)
            .then(l => { if (ativo) setColaboradores(l); })
            .catch(err => console.warn('[diário] colaboradores do RH indisponíveis para sugestão:', err));
        return () => { ativo = false; };
    }, [orgId]);
    const sugestoesEfetivo = useMemo(
        () => comColaboradoresDoRh(sugestoesDosRecursos(organizations || []), colaboradores),
        [organizations, colaboradores],
    );

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
    // parcial (e a org do bucket de fotos mora no projeto).
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

    // Cronograma do Planejamento ligado ao diário — mesma peça da tela desktop.
    const planejamento = useDiaryLinkedPlanning(project?.settings?.linkedProjectId, projects);

    const entries = useMemo<DiaryEntry[]>(() => {
        const list = (project?.settings?.diaryEntries || []) as DiaryEntry[];
        return [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }, [project]);

    const visible = useMemo(() => entries.filter(e => {
        if (filter === 'rascunho') return (e.status || 'Rascunho') === 'Rascunho';
        if (filter === 'impedimentos') return hasImpediment(e);
        return true;
    }), [entries, filter]);

    /** Grava um registro por vez; a lista que volta é a do BANCO (traz o que outra pessoa lançou). */
    const persist = useCallback(async (
        gravar: (projectId: string) => Promise<DiaryWriteResult>,
        msg: string,
        refsQueFicam: string[] = [],
        sincronizarCronograma = false,
    ) => {
        if (!project) return;
        setSaving(true);
        setErroSalvar(null);
        try {
            const { entries: gravadas, anterior } = await gravar(project.id);
            // §22 — estado local com a lista devolvida, sem recarregar o projeto.
            setProject(p => (p ? { ...p, settings: { ...p.settings, diaryEntries: gravadas } } : p));
            setEditing(null);
            // Evolução das atividades vinculadas → cronograma (lista do BANCO), igual ao desktop.
            let aviso = msg;
            if (sincronizarCronograma && planejamento.planejamentoId && planejamento.schedule) {
                try {
                    const gravado = await sincronizarEvolucaoNoPlanejamento(planejamento.planejamentoId, gravadas);
                    if (gravado) planejamento.setSchedule(gravado);
                } catch (err) {
                    console.error('Erro ao sincronizar diário com o planejamento:', err);
                    aviso = 'Registro salvo, mas a evolução não chegou ao cronograma.';
                }
            }
            notify(aviso);
            // Órfãos contra a versão anterior SEGUNDO O BANCO, DEPOIS do save.
            const ficam = new Set(refsQueFicam);
            const orfaos = diaryEntryMediaRefs(anterior).filter(r => !ficam.has(r));
            if (orfaos.length > 0) void removeDiaryMedia(orfaos);
        } catch (err) {
            console.error('Erro ao salvar registro do diário:', err);
            // A folha continua aberta e o rascunho segue guardado no aparelho.
            setErroSalvar(typeof navigator !== 'undefined' && navigator.onLine === false
                ? 'Sem conexão. O registro ficou guardado neste aparelho — salve de novo quando o sinal voltar.'
                : 'Falha ao salvar. O registro ficou guardado neste aparelho — tente de novo.');
        } finally {
            setSaving(false);
        }
    }, [project, notify, planejamento]);

    const handleSaveEntry = useCallback((entry: DiaryEntry) => {
        const existe = entries.some(e => e.id === entry.id);
        persist(
            async id => {
                const r = await salvarRegistroDiario(id, entry);
                // Gravou no banco: o rascunho do aparelho deixa de ser necessário.
                apagarRascunho(id, isNew ? null : entry.id);
                apagarRascunho(id, entry.id);
                return r;
            },
            existe ? 'Registro atualizado.' : 'Registro salvo.',
            diaryEntryMediaRefs(entry),
            temAtividadeVinculada(entry.activities),
        );
    }, [entries, persist, isNew]);

    const handleDeleteEntry = useCallback((id: string) => {
        persist(async projectId => {
            const r = await excluirRegistroDiario(projectId, id);
            apagarRascunho(projectId, id);
            return r;
        }, 'Registro excluído.');
    }, [persist]);

    // Rascunhos deste diário guardados no aparelho — relidos sempre que a folha fecha.
    const rascunhos = useMemo(
        () => (project && !editing ? listarRascunhos(project.id) : []),
        [project, editing],
    );
    const idsNaoSalvos = useMemo(() => new Set(rascunhos.map(r => r.entryId).filter(Boolean)), [rascunhos]);
    const novoNaoSalvo = rascunhos.find(r => r.entryId === null)?.rascunho || null;

    const diarioAtual = diarios.find(d => d.id === selectedId);
    const podeVoltar = !initialProjectId && !!selectedId;

    return (
        <div className={`flex flex-col bg-[#eef2ff] font-sans overflow-hidden relative ${previa
            ? 'h-screen'
            // Celular: ocupa o <main> inteiro — anula o gutter §20.2 (16px; 24px a partir de md, no telefone deitado).
            : '-m-4 md:-m-6 h-[calc(100%+2rem)] md:h-[calc(100%+3rem)]'}`}
        >
            {previa && <StatusBar />}

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
                            {novoNaoSalvo && (
                                <button
                                    onClick={() => { setToast(null); setErroSalvar(null); setIsNew(true); setEditing(novoNaoSalvo.entry); }}
                                    className="w-full text-left bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 flex items-center gap-3 active:bg-orange-100"
                                >
                                    <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-black text-orange-700">Registro novo não salvo</p>
                                        <p className="text-[11px] font-medium text-orange-600 truncate">
                                            Guardado neste aparelho {quandoFoiGuardado(novoNaoSalvo.salvoEm)} · {fmtLong(novoNaoSalvo.entry.date)}
                                        </p>
                                    </div>
                                    <span className="text-xs font-black text-orange-700">Continuar</span>
                                </button>
                            )}
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
                                    naoSalvo={idsNaoSalvos.has(e.id)}
                                    onPress={entry => { setToast(null); setErroSalvar(null); setIsNew(false); setEditing(entry); }}
                                />
                            ))}
                            <div className="h-24" />
                        </div>
                    )}

                    {/* FAB */}
                    {nav === 'registros' && !loading && (
                        <div className="absolute bottom-[calc(72px+env(safe-area-inset-bottom))] right-5 z-10">
                            <button
                                onClick={() => { setToast(null); setErroSalvar(null); setIsNew(true); setEditing(emptyEntry()); }}
                                className="w-14 h-14 rounded-full bg-blue-600 text-white shadow-xl shadow-blue-300 flex items-center justify-center active:scale-95 transition-all"
                            >
                                <Plus className="w-6 h-6" />
                            </button>
                        </div>
                    )}

                    {/* Navegação inferior */}
                    <div className="bg-white border-t border-slate-100 px-8 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex items-center justify-around flex-shrink-0">
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
                    previa={previa}
                    entry={editing}
                    isNew={isNew}
                    saving={saving}
                    itens={planejamento.itens}
                    upload={{ orgId: project?.organization_id ?? project?.settings?.organizationId ?? null, projectId: project?.id ?? '' }}
                    onClose={() => { setEditing(null); setErroSalvar(null); }}
                    onSave={handleSaveEntry}
                    onDelete={handleDeleteEntry}
                    erroSalvar={erroSalvar}
                    sugestoesEfetivo={sugestoesEfetivo}
                />
            )}

            {toast && (
                <div className="absolute bottom-[calc(78px+env(safe-area-inset-bottom))] left-4 right-24 z-20 bg-slate-900 text-white rounded-2xl px-4 py-3 shadow-xl">
                    <p className="text-sm font-bold">{toast}</p>
                </div>
            )}
        </div>
    );
};

export default DiaryMobileApp;
