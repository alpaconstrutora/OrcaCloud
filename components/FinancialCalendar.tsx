import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    List,
    TrendingUp,
    TrendingDown,
    Wallet,
    X,
    Loader2,
    AlertCircle,
} from 'lucide-react';
import { financialCalendarService } from '../services/financialCalendarService';
import type { CalendarEvent, CalendarDayTitle } from '../types/financial';

// ─── helpers ────────────────────────────────────────────────
const fmt = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const fmtFull = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Parse 'YYYY-MM-DD' to {year, month, day} WITHOUT timezone shift
function parseYMD(s: string): { year: number; month: number; day: number } {
    const [y, m, d] = s.split('-').map(Number);
    return { year: y, month: m, day: d };
}

function ymd(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDays(base: string, n: number): string {
    const [y, m, d] = base.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + n);
    return ymd(dt);
}

function monthLabel(year: number, month: number): string {
    return new Date(year, month - 1, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
}

// Return all {year, month} combos within [dateFrom, dateTo]
function monthsInRange(from: string, to: string): { year: number; month: number }[] {
    const { year: fy, month: fm } = parseYMD(from);
    const { year: ty, month: tm } = parseYMD(to);
    const result: { year: number; month: number }[] = [];
    let y = fy, m = fm;
    while (y < ty || (y === ty && m <= tm)) {
        result.push({ year: y, month: m });
        m++;
        if (m > 12) { m = 1; y++; }
    }
    return result;
}

// Calendar grid cells for one month
function buildGrid(year: number, month: number): (number | null)[] {
    const first = new Date(year, month - 1, 1).getDay(); // 0=Sun
    const days  = new Date(year, month, 0).getDate();
    // Rotate so Mon=0 (Brazil)
    const offset = (first + 6) % 7;
    const cells: (number | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= days; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
}

// ─── Status chip ────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
    PREVISTO: 'bg-gray-100 text-gray-700',
    EMITIDO:  'bg-blue-100 text-blue-700',
    ENVIADO:  'bg-purple-100 text-purple-700',
    RECEBIDO: 'bg-green-100 text-green-700',
    PAGO:     'bg-green-100 text-green-700',
    VENCIDO:  'bg-red-100 text-red-700',
    APROVADO: 'bg-green-100 text-green-700',
    AGUARDANDO_APROVACAO: 'bg-yellow-100 text-yellow-700',
    BLOQUEADO:'bg-red-100 text-red-700',
    CONCILIATED: 'bg-green-100 text-green-700',
    PENDING:     'bg-gray-100 text-gray-600',
    CANCELLED:   'bg-gray-200 text-gray-500 line-through',
};

function StatusChip({ label }: { label?: string }) {
    if (!label) return null;
    const cls = STATUS_COLORS[label] ?? 'bg-gray-100 text-gray-600';
    return (
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cls}`}>
            {label}
        </span>
    );
}

// ─── Day Drawer ──────────────────────────────────────────────
function DayDrawer({
    date,
    titles,
    loading,
    onClose,
}: {
    date: string;
    titles: CalendarDayTitle[];
    loading: boolean;
    onClose: () => void;
}) {
    const { day, month, year } = parseYMD(date);
    const label = new Date(year, month - 1, day).toLocaleDateString('pt-BR', {
        weekday: 'long', day: 'numeric', month: 'long',
    });

    const credits = titles.filter(t => t.direction === 'CREDIT');
    const debits  = titles.filter(t => t.direction === 'DEBIT');
    const totalC  = credits.reduce((s, t) => s + t.amount, 0);
    const totalD  = debits.reduce((s, t) => s + t.amount, 0);

    return (
        <div className="fixed inset-y-0 right-0 w-full sm:w-96 bg-white shadow-2xl z-50 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
                <div>
                    <p className="text-xs text-gray-500 capitalize">{label}</p>
                    <p className="text-sm font-semibold text-gray-800 mt-0.5">
                        Títulos do dia
                    </p>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
                >
                    <X className="w-4 h-4 text-gray-500" />
                </button>
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 gap-3 p-4 border-b border-gray-100">
                <div className="bg-green-50 rounded-lg p-2.5">
                    <p className="text-[10px] text-green-600 font-medium uppercase tracking-wide">A Receber</p>
                    <p className="text-sm font-bold text-green-700 mt-0.5">{fmtFull(totalC)}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-2.5">
                    <p className="text-[10px] text-red-600 font-medium uppercase tracking-wide">A Pagar</p>
                    <p className="text-sm font-bold text-red-700 mt-0.5">{fmtFull(totalD)}</p>
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loading && (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                    </div>
                )}

                {!loading && titles.length === 0 && (
                    <p className="text-center text-sm text-gray-400 py-10">
                        Nenhum título neste dia.
                    </p>
                )}

                {!loading && credits.length > 0 && (
                    <div>
                        <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" /> Entradas ({credits.length})
                        </p>
                        <div className="space-y-2">
                            {credits.map(t => (
                                <div key={t.id} className="bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-gray-800 truncate">
                                                {t.party_name ?? t.description ?? '—'}
                                            </p>
                                            {t.project_name && (
                                                <p className="text-xs text-gray-500 truncate">{t.project_name}</p>
                                            )}
                                            <div className="mt-1 flex items-center gap-1.5">
                                                <StatusChip label={t.business_status ?? t.status} />
                                            </div>
                                        </div>
                                        <p className="text-sm font-bold text-green-700 whitespace-nowrap shrink-0">
                                            {fmtFull(t.amount)}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {!loading && debits.length > 0 && (
                    <div>
                        <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                            <TrendingDown className="w-3 h-3" /> Saídas ({debits.length})
                        </p>
                        <div className="space-y-2">
                            {debits.map(t => (
                                <div key={t.id} className="bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-gray-800 truncate">
                                                {t.party_name ?? t.description ?? '—'}
                                            </p>
                                            {t.project_name && (
                                                <p className="text-xs text-gray-500 truncate">{t.project_name}</p>
                                            )}
                                            <div className="mt-1 flex items-center gap-1.5">
                                                <StatusChip label={t.business_status ?? t.status} />
                                            </div>
                                        </div>
                                        <p className="text-sm font-bold text-red-700 whitespace-nowrap shrink-0">
                                            {fmtFull(t.amount)}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Month Grid ──────────────────────────────────────────────
const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function MonthGrid({
    year,
    month,
    eventMap,
    today,
    rangeFrom,
    rangeTo,
    selectedDate,
    onSelectDate,
}: {
    year: number;
    month: number;
    eventMap: Map<string, CalendarEvent>;
    today: string;
    rangeFrom: string;
    rangeTo: string;
    selectedDate: string | null;
    onSelectDate: (d: string) => void;
}) {
    const cells = buildGrid(year, month);

    return (
        <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 capitalize">
                {monthLabel(year, month)}
            </h3>
            <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden border border-gray-200">
                {WEEKDAYS.map(w => (
                    <div key={w} className="bg-gray-50 text-center text-[10px] font-medium text-gray-500 py-1">
                        {w}
                    </div>
                ))}
                {cells.map((day, i) => {
                    if (!day) {
                        return <div key={`e-${i}`} className="bg-white h-16" />;
                    }
                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const ev = eventMap.get(dateStr);
                    const isToday    = dateStr === today;
                    const isSelected = dateStr === selectedDate;
                    const inRange    = dateStr >= rangeFrom && dateStr <= rangeTo;
                    const isPast     = dateStr < today;

                    return (
                        <button
                            key={dateStr}
                            onClick={() => ev && onSelectDate(dateStr)}
                            className={[
                                'bg-white h-16 flex flex-col items-start justify-start p-1 text-left transition-colors',
                                ev ? 'cursor-pointer hover:bg-blue-50' : 'cursor-default',
                                isSelected ? 'ring-2 ring-inset ring-blue-500' : '',
                                isToday ? 'bg-blue-50' : '',
                                !inRange ? 'opacity-30' : '',
                            ].join(' ')}
                        >
                            <span className={[
                                'text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full',
                                isToday ? 'bg-blue-600 text-white' : isPast ? 'text-gray-400' : 'text-gray-700',
                            ].join(' ')}>
                                {day}
                            </span>
                            {ev && (
                                <div className="mt-auto w-full space-y-0.5">
                                    {(ev.credit_previsto + ev.credit_realizado) > 0 && (
                                        <div className="text-[9px] font-medium text-green-700 bg-green-100 rounded px-1 truncate leading-4">
                                            +{fmt(ev.credit_previsto + ev.credit_realizado)}
                                        </div>
                                    )}
                                    {(ev.debit_previsto + ev.debit_realizado) > 0 && (
                                        <div className="text-[9px] font-medium text-red-700 bg-red-100 rounded px-1 truncate leading-4">
                                            −{fmt(ev.debit_previsto + ev.debit_realizado)}
                                        </div>
                                    )}
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Agenda View ─────────────────────────────────────────────
function AgendaView({
    events,
    today,
    selectedDate,
    onSelectDate,
}: {
    events: CalendarEvent[];
    today: string;
    selectedDate: string | null;
    onSelectDate: (d: string) => void;
}) {
    if (events.length === 0) {
        return (
            <div className="text-center py-16 text-gray-400">
                <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Nenhum vencimento no período.</p>
            </div>
        );
    }

    // Group by month label
    let prevMonth = '';

    return (
        <div className="space-y-1">
            {events.map(ev => {
                const { year, month, day } = parseYMD(ev.event_date);
                const monthKey = `${year}-${String(month).padStart(2, '0')}`;
                const showHeader = monthKey !== prevMonth;
                prevMonth = monthKey;
                const isToday    = ev.event_date === today;
                const isSelected = ev.event_date === selectedDate;
                const isPast     = ev.event_date < today;

                const totalC = ev.credit_previsto + ev.credit_realizado;
                const totalD = ev.debit_previsto  + ev.debit_realizado;
                const saldo  = totalC - totalD;

                return (
                    <React.Fragment key={ev.event_date}>
                        {showHeader && (
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-4 pb-1 capitalize border-t border-gray-100 first:border-0 first:pt-0">
                                {monthLabel(year, month)}
                            </p>
                        )}
                        <button
                            onClick={() => onSelectDate(ev.event_date)}
                            className={[
                                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
                                isSelected ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-50',
                                isToday ? 'font-semibold' : '',
                            ].join(' ')}
                        >
                            {/* Day badge */}
                            <div className={[
                                'shrink-0 w-9 h-9 rounded-full flex flex-col items-center justify-center text-center',
                                isToday ? 'bg-blue-600 text-white' : isPast ? 'bg-gray-100 text-gray-400' : 'bg-gray-100 text-gray-700',
                            ].join(' ')}>
                                <span className="text-button font-bold leading-none">{day}</span>
                                <span className="text-[8px] leading-none capitalize">
                                    {new Date(year, month - 1, day).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                                </span>
                            </div>

                            {/* Amounts */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 flex-wrap">
                                    {totalC > 0 && (
                                        <span className="text-xs text-green-700 font-medium">
                                            ↑ {fmt(totalC)}
                                        </span>
                                    )}
                                    {totalD > 0 && (
                                        <span className="text-xs text-red-700 font-medium">
                                            ↓ {fmt(totalD)}
                                        </span>
                                    )}
                                </div>
                                <p className="text-[10px] text-gray-500 mt-0.5">
                                    {ev.n_titulos} título{ev.n_titulos !== 1 ? 's' : ''}
                                </p>
                            </div>

                            {/* Net */}
                            <span className={['text-sm font-semibold', saldo >= 0 ? 'text-green-700' : 'text-red-700'].join(' ')}>
                                {saldo >= 0 ? '+' : ''}{fmt(saldo)}
                            </span>
                        </button>
                    </React.Fragment>
                );
            })}
        </div>
    );
}

// ─── Main Component ──────────────────────────────────────────
const HORIZONS = [7, 30, 60, 90, 180, 365] as const;
type Horizon = typeof HORIZONS[number];

interface Props {
    organizationId: string;
}

export default function FinancialCalendar({ organizationId }: Props) {
    const todayStr = ymd(new Date());

    const [horizon, setHorizon]       = useState<Horizon>(30);
    const [viewMode, setViewMode]     = useState<'calendar' | 'agenda'>('calendar');
    const [events, setEvents]         = useState<CalendarEvent[]>([]);
    const [loading, setLoading]       = useState(false);
    const [error, setError]           = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [dayTitles, setDayTitles]   = useState<CalendarDayTitle[]>([]);
    const [loadingTitles, setLoadingTitles] = useState(false);
    // Calendar navigation: current display month
    const [navMonth, setNavMonth]     = useState<{ year: number; month: number }>(() => {
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() + 1 };
    });

    const rangeFrom = todayStr;
    const rangeTo   = addDays(todayStr, horizon - 1);

    // Reload events when org or horizon changes
    const loadEvents = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        setError(null);
        try {
            const data = await financialCalendarService.getCalendarEvents(organizationId, rangeFrom, rangeTo);
            setEvents(data);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Erro ao carregar calendário.');
        } finally {
            setLoading(false);
        }
    }, [organizationId, rangeFrom, rangeTo]);

    useEffect(() => { loadEvents(); }, [loadEvents]);

    // Load titles when a date is selected
    useEffect(() => {
        if (!selectedDate || !organizationId) return;
        setLoadingTitles(true);
        financialCalendarService.getTitlesForDay(organizationId, selectedDate)
            .then(setDayTitles)
            .catch(() => setDayTitles([]))
            .finally(() => setLoadingTitles(false));
    }, [selectedDate, organizationId]);

    const eventMap = useMemo(() => {
        const m = new Map<string, CalendarEvent>();
        events.forEach(ev => m.set(ev.event_date, ev));
        return m;
    }, [events]);

    // KPIs
    const totalC = useMemo(() => events.reduce((s, e) => s + e.credit_previsto + e.credit_realizado, 0), [events]);
    const totalD = useMemo(() => events.reduce((s, e) => s + e.debit_previsto + e.debit_realizado, 0), [events]);
    const saldoL = totalC - totalD;

    // Months to render in calendar mode (those within range, limited to 4)
    const months = useMemo(() => {
        const ms = monthsInRange(rangeFrom, rangeTo);
        return ms.slice(0, 4);
    }, [rangeFrom, rangeTo]);

    function handleNavMonth(dir: -1 | 1) {
        setNavMonth(prev => {
            let m = prev.month + dir;
            let y = prev.year;
            if (m < 1) { m = 12; y--; }
            if (m > 12) { m = 1; y++; }
            return { year: y, month: m };
        });
    }

    function handleHorizonChange(h: Horizon) {
        setHorizon(h);
        setSelectedDate(null);
        // Reset calendar to current month
        const now = new Date();
        setNavMonth({ year: now.getFullYear(), month: now.getMonth() + 1 });
    }

    return (
        <div className="relative min-h-screen bg-gray-50">
            {/* Overlay for drawer */}
            {selectedDate && (
                <div
                    className="fixed inset-0 bg-black/20 z-40"
                    onClick={() => setSelectedDate(null)}
                />
            )}

            {/* Day Drawer */}
            {selectedDate && (
                <DayDrawer
                    date={selectedDate}
                    titles={dayTitles}
                    loading={loadingTitles}
                    onClose={() => setSelectedDate(null)}
                />
            )}

            <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <CalendarDays className="w-5 h-5 text-blue-600" />
                        <h1 className="text-lg font-bold text-gray-900">Calendário Financeiro</h1>
                    </div>

                    {/* View toggle */}
                    <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <button
                            onClick={() => setViewMode('calendar')}
                            className={['flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors',
                                viewMode === 'calendar' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'].join(' ')}
                        >
                            <CalendarDays className="w-3.5 h-3.5" />
                            Calendário
                        </button>
                        <button
                            onClick={() => setViewMode('agenda')}
                            className={['flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors',
                                viewMode === 'agenda' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'].join(' ')}
                        >
                            <List className="w-3.5 h-3.5" />
                            Agenda
                        </button>
                    </div>
                </div>

                {/* Horizon selector */}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-500 font-medium">Horizonte:</span>
                    {HORIZONS.map(h => (
                        <button
                            key={h}
                            onClick={() => handleHorizonChange(h)}
                            className={[
                                'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                                horizon === h
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300',
                            ].join(' ')}
                        >
                            {h === 7 ? '7 dias' : h === 30 ? '30 dias' : h === 60 ? '60 dias' : h === 90 ? '90 dias' : h === 180 ? '6 meses' : '1 ano'}
                        </button>
                    ))}
                    <span className="text-button text-gray-400 ml-1">
                        {new Date(...(rangeFrom.split('-').map(Number) as [number, number, number])).toLocaleDateString('pt-BR')}
                        {' → '}
                        {new Date(...(rangeTo.split('-').map(Number) as [number, number, number])).toLocaleDateString('pt-BR')}
                    </span>
                </div>

                {/* Error */}
                {error && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {error}
                    </div>
                )}

                {/* KPI row */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                            <TrendingUp className="w-4 h-4 text-green-600" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">A Receber</p>
                            <p className="text-sm font-bold text-green-700 truncate">{fmt(totalC)}</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                            <TrendingDown className="w-4 h-4 text-red-600" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">A Pagar</p>
                            <p className="text-sm font-bold text-red-700 truncate">{fmt(totalD)}</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
                        <div className={['w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                            saldoL >= 0 ? 'bg-blue-100' : 'bg-orange-100'].join(' ')}>
                            <Wallet className={['w-4 h-4', saldoL >= 0 ? 'text-blue-600' : 'text-orange-600'].join(' ')} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">Saldo Projetado</p>
                            <p className={['text-sm font-bold truncate', saldoL >= 0 ? 'text-blue-700' : 'text-orange-700'].join(' ')}>
                                {saldoL >= 0 ? '+' : ''}{fmt(saldoL)}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Loading skeleton */}
                {loading && (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    </div>
                )}

                {/* Calendar view */}
                {!loading && viewMode === 'calendar' && (
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="flex items-center justify-between mb-4">
                            <button
                                onClick={() => handleNavMonth(-1)}
                                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4 text-gray-500" />
                            </button>
                            <span className="text-sm font-semibold text-gray-700 capitalize">
                                {monthLabel(navMonth.year, navMonth.month)}
                            </span>
                            <button
                                onClick={() => handleNavMonth(1)}
                                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <ChevronRight className="w-4 h-4 text-gray-500" />
                            </button>
                        </div>
                        <MonthGrid
                            year={navMonth.year}
                            month={navMonth.month}
                            eventMap={eventMap}
                            today={todayStr}
                            rangeFrom={rangeFrom}
                            rangeTo={rangeTo}
                            selectedDate={selectedDate}
                            onSelectDate={setSelectedDate}
                        />
                        {horizon > 31 && (
                            <p className="text-[10px] text-gray-400 mt-3 text-center">
                                Use as setas para navegar entre os meses do horizonte selecionado.
                            </p>
                        )}
                    </div>
                )}

                {/* Agenda view */}
                {!loading && viewMode === 'agenda' && (
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                        <AgendaView
                            events={events}
                            today={todayStr}
                            selectedDate={selectedDate}
                            onSelectDate={setSelectedDate}
                        />
                    </div>
                )}

                {/* Legend */}
                {!loading && (
                    <div className="flex items-center gap-4 text-[10px] text-gray-400 justify-center pb-4">
                        <span className="flex items-center gap-1">
                            <span className="w-3 h-2 rounded bg-green-100 inline-block" /> Entradas (CR)
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-3 h-2 rounded bg-red-100 inline-block" /> Saídas (DB)
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-3 h-3 rounded-full bg-blue-600 inline-block" /> Hoje
                        </span>
                        <span>Clique em um dia para ver os títulos</span>
                    </div>
                )}
            </div>
        </div>
    );
}
