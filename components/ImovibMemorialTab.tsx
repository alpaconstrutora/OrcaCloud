import React, { useMemo } from 'react';
import { BookOpen } from 'lucide-react';
import { ImovibStudy } from '../types';
import { useImovibEdicao } from '../hooks/useImovibEdicao';
import { memorialDePremissas, premissasSemFonte, type LinhaDoMemorial } from '../utils/imovibMemorial';
import StandardTable, { type StandardTableColumn } from './ui/StandardTable';

interface Props {
    study: ImovibStudy;
    /** Formulário de Premissas: as fontes gravam com "Salvar Premissas". */
    formData: Partial<ImovibStudy>;
    setCampo: (field: keyof ImovibStudy, valor: unknown) => void;
}

const COLUNAS: StandardTableColumn[] = [
    { key: 'grupo', label: 'Grupo', sortable: true, width: 160 },
    { key: 'premissa', label: 'Premissa', sortable: true, width: 240 },
    { key: 'valor', label: 'Valor', width: 200, align: 'right' },
    { key: 'fonte', label: 'Fonte', width: 280 },
    { key: 'data', label: 'Data', width: 170 },
];

const CAMPO = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed';

const valorFormatado = (l: LinhaDoMemorial): string => {
    if (l.valor == null) return '—';
    if (typeof l.valor === 'string') return l.valor;
    if (l.unidade === 'R$') return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(l.valor);
    const n = l.valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    return l.unidade.startsWith('%') ? `${n}${l.unidade}` : `${n} ${l.unidade}`.trim();
};

/**
 * Memorial de premissas (item 10.1 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md): toda premissa que o
 * motor lê, se está no padrão do sistema, e a fonte e a data de cada uma. Mostra o
 * formulário ainda não salvo, e as fontes gravam junto com as outras sub-abas.
 */
const ImovibMemorialTab: React.FC<Props> = ({ study, formData, setCampo }) => {
    const { pode, motivo } = useImovibEdicao();
    const estudo = useMemo(() => ({ ...study, ...formData }) as ImovibStudy, [study, formData]);
    const linhas = useMemo(() => memorialDePremissas(estudo), [estudo]);
    const semFonte = premissasSemFonte(linhas);

    const anotar = (campo: string, k: 'fonte' | 'data', v: string) => {
        const notas = { ...(estudo.premise_notes ?? {}) };
        const nota = { ...(notas[campo] ?? {}), [k]: v || null };
        if (!nota.fonte && !nota.data) delete notas[campo];
        else notas[campo] = nota;
        setCampo('premise_notes', Object.keys(notas).length ? notas : null);
    };

    return (
        <section className="bg-white rounded-[10px] p-6 border border-slate-100 shadow-sm space-y-4" aria-labelledby="imovib-memorial-titulo">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 id="imovib-memorial-titulo" className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-indigo-500" />
                        Memorial de premissas
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">Toda premissa que o cálculo usa, com o valor que vale hoje. "Padrão" é o valor do sistema para campo vazio. Anote de onde veio cada número; grava com "Salvar Premissas".</p>
                </div>
                <span className={`text-sm font-medium ${semFonte ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {semFonte} de {linhas.length} premissas sem fonte
                </span>
            </div>

            <StandardTable<LinhaDoMemorial>
                storageKey="imovib:memorial"
                columns={COLUNAS}
                rows={linhas}
                rowKey={l => String(l.campo)}
                dense
                bare
                sortValue={(k, l) => (k === 'grupo' ? l.grupo : l.premissa)}
                searchText={l => `${l.grupo} ${l.premissa} ${l.fonte ?? ''}`}
                renderCell={(k, l) => {
                    switch (k) {
                        case 'grupo': return <span className="text-sm text-gray-700">{l.grupo}</span>;
                        case 'premissa': return (
                            <span className="block text-sm text-gray-700" title={l.observacao ?? undefined}>
                                {l.premissa}
                                {l.observacao && <span className="block text-xs text-slate-500">{l.observacao}</span>}
                            </span>
                        );
                        case 'valor': return (
                            <span className="text-sm text-gray-800">
                                {valorFormatado(l)}
                                {l.ehPadrao && <span className="ml-2 text-xs text-slate-500">padrão</span>}
                            </span>
                        );
                        case 'fonte': return (
                            <input
                                aria-label={`Fonte de ${l.premissa}`}
                                value={l.fonte ?? ''}
                                placeholder="Ex.: comitê, pesquisa, contrato"
                                disabled={!pode}
                                title={!pode ? motivo : undefined}
                                onChange={e => anotar(String(l.campo), 'fonte', e.target.value)}
                                className={CAMPO}
                            />
                        );
                        case 'data': return (
                            <input
                                type="date"
                                aria-label={`Data de ${l.premissa}`}
                                value={l.data ?? ''}
                                disabled={!pode}
                                title={!pode ? motivo : undefined}
                                onChange={e => anotar(String(l.campo), 'data', e.target.value)}
                                className={CAMPO}
                            />
                        );
                        default: return null;
                    }
                }}
            />
        </section>
    );
};

export default ImovibMemorialTab;
