// components/condominio/FracoesTab.tsx
// Transcrição da fração ideal da CONVENÇÃO DE CONDOMÍNIO.
// Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md
//
// Esta tela COPIA um documento, não calcula nada. A fração ideal registrada
// define peso de voto em assembleia e a divisão do rateio — inventar um número
// aqui para "fechar a soma" é pior que deixar em branco, porque o erro só
// aparece meses depois, no boleto do condômino.
//
// Por isso: nenhum botão de distribuir/sugerir/ratear proporcionalmente. A soma
// é CONFERIDA e o desvio é mostrado, mas não trava o salvamento — transcrever
// 200 unidades é trabalho em etapas, e travar obrigaria a inventar número para
// poder salvar.
import React from 'react';
import { Scale, Search, RefreshCw, Save, AlertTriangle, CheckCircle2, AlertCircle } from 'lucide-react';
import {
    ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState,
} from '../ui/TableUtils';
import { KpiCard } from '../ui/KpiCard';
import { empreendimentoService } from '../../services/empreendimentoService';
import { fracaoIdealService, conferirSoma, type TranscricaoItem } from '../../services/fracaoIdealService';
import type { Empreendimento, EmpreendimentoUnit } from '../../types/empreendimento';

const COLUMNS: ColumnConfig[] = [
    { key: 'torre', label: 'Torre', sortable: true },
    { key: 'unidade', label: 'Unidade', sortable: true },
    { key: 'area', label: 'Área privativa', sortable: true },
    { key: 'origem', label: 'Origem', sortable: true },
    { key: 'fracao', label: 'Fração ideal (%)', sortable: true },
];

type UnidadeLinha = EmpreendimentoUnit & { _tower_name: string };

interface Props { empreendimento: Empreendimento }

const FracoesTab: React.FC<Props> = ({ empreendimento }) => {
    const [searchTerm, setSearchTerm] = usePersistedState<string>('condominio:fracoes:search', '');
    const tableColumns = useTableColumns(COLUMNS, 'fracoesColumns');

    const [unidades, setUnidades] = React.useState<UnidadeLinha[]>([]);
    /** Edições pendentes, por unidade, em PERCENTUAL como digitado. */
    const [edicoes, setEdicoes] = React.useState<Record<string, string>>({});
    const [fonte, setFonte] = React.useState('');
    const [loading, setLoading] = React.useState(true);
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const carregar = React.useCallback(async () => {
        setLoading(true);
        setErro(null);
        try {
            const units = await empreendimentoService.listAllUnitsForEmpreendimento(empreendimento.id);
            setUnidades(units);
            setEdicoes({});
            const comFonte = units.find(u => u.fracao_ideal_fonte);
            if (comFonte?.fracao_ideal_fonte) setFonte(comFonte.fracao_ideal_fonte);
        } catch (e: any) {
            setErro(e?.message || 'Erro ao carregar as unidades.');
        } finally {
            setLoading(false);
        }
    }, [empreendimento.id]);

    React.useEffect(() => { carregar(); }, [carregar]);

    /** Fração vigente de uma unidade, já considerando o que está sendo digitado. */
    const fracaoAtual = React.useCallback((u: UnidadeLinha): number | null => {
        const editado = edicoes[u.id];
        if (editado !== undefined) {
            const n = Number(editado.replace(',', '.'));
            return editado.trim() === '' || Number.isNaN(n) ? null : n / 100;
        }
        return u.fracao_ideal_decimal ?? null;
    }, [edicoes]);

    const conferencia = React.useMemo(
        () => conferirSoma(unidades.map(u => ({ fracao_ideal_decimal: fracaoAtual(u) }))),
        [unidades, fracaoAtual],
    );

    const temPendencia = Object.keys(edicoes).length > 0;

    const filtradas = React.useMemo(() => {
        const t = searchTerm.trim().toLowerCase();
        const base = t
            ? unidades.filter(u => u.name.toLowerCase().includes(t) || u._tower_name.toLowerCase().includes(t))
            : unidades;

        const valor = (u: UnidadeLinha, col: string): string | number => {
            switch (col) {
                case 'torre': return u._tower_name;
                case 'unidade': return u.name;
                case 'area': return u.private_area ?? -1;
                case 'origem': return u.fracao_ideal_origem || '';
                case 'fracao': return fracaoAtual(u) ?? -1;
                default: return '';
            }
        };

        return [...base].sort((a, b) => {
            if (tableColumns.sortColumn) {
                const va = valor(a, tableColumns.sortColumn);
                const vb = valor(b, tableColumns.sortColumn);
                const cmp = typeof va === 'number' && typeof vb === 'number'
                    ? va - vb
                    : String(va).localeCompare(String(vb), 'pt-BR');
                return tableColumns.sortDirection === 'desc' ? -cmp : cmp;
            }
            return a.name.localeCompare(b.name, 'pt-BR', { numeric: true });
        });
    }, [unidades, searchTerm, tableColumns.sortColumn, tableColumns.sortDirection, fracaoAtual]);

    const salvar = async () => {
        setSalvando(true);
        try {
            const itens: TranscricaoItem[] = Object.entries(edicoes).map(([unitId, texto]) => {
                const n = Number(texto.replace(',', '.'));
                return {
                    unitId,
                    fracaoDecimal: texto.trim() === '' || Number.isNaN(n) ? null : n / 100,
                };
            });
            const hoje = new Date().toISOString().slice(0, 10);
            const r = await fracaoIdealService.transcrever(itens, fonte.trim(), hoje);

            // §22 — costura no array local em vez de recarregar a aba inteira.
            setUnidades(prev => prev.map(u => {
                const item = itens.find(i => i.unitId === u.id);
                if (!item) return u;
                return {
                    ...u,
                    fracao_ideal_decimal: item.fracaoDecimal,
                    fracao_ideal_origem: item.fracaoDecimal != null ? 'CONVENCAO' : null,
                    fracao_ideal_fonte: item.fracaoDecimal != null ? fonte.trim() || null : null,
                };
            }));
            setEdicoes({});
            notify(
                r.erros.length > 0
                    ? `${r.gravadas} unidade(s) salvas. ${r.erros[0]}`
                    : `${r.gravadas} unidade(s) transcritas da convenção.`,
                r.erros.length > 0 ? 'error' : 'success',
            );
        } catch (e: any) {
            notify(e?.message || 'Erro ao salvar as frações.', 'error');
        } finally {
            setSalvando(false);
        }
    };

    const v = tableColumns.visibleColumns;
    const pct = (n: number) => `${(n * 100).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}%`;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-3">
                <KpiCard
                    label="SOMA DAS FRAÇÕES"
                    value={pct(conferencia.soma)}
                    sub={conferencia.fecha
                        ? 'Fecha em 100%'
                        : `${conferencia.desvio > 0 ? 'Excede' : 'Falta'} ${pct(Math.abs(conferencia.desvio))}`}
                    icon={conferencia.fecha ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                    color={conferencia.fecha ? 'emerald' : 'amber'}
                />
                <KpiCard
                    label="UNIDADES COM FRAÇÃO"
                    value={`${conferencia.unidadesComFracao} / ${conferencia.unidadesTotal}`}
                    icon={<Scale className="w-5 h-5" />}
                    color="blue"
                />
                <KpiCard
                    label="TRANSCRITAS DA CONVENÇÃO"
                    value={unidades.filter(u => u.fracao_ideal_origem === 'CONVENCAO').length}
                    sub="O motor de áreas não sobrescreve estas"
                    icon={<Scale className="w-5 h-5" />}
                    color="teal"
                />
            </div>

            {erro && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-[10px] px-4 py-3 text-sm">{erro}</div>
            )}

            <div className="bg-white p-4 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <label className="text-xs font-semibold text-slate-500">Documento de origem</label>
                <input
                    type="text"
                    value={fonte}
                    onChange={e => setFonte(e.target.value)}
                    placeholder="Ex: Convenção registrada sob nº 12.345, 2º RI de Campinas"
                    className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">
                    Esta tela transcreve a convenção registrada — não calcula fração. Uma vez
                    transcrita, a fração só muda por averbação, e o motor de áreas deixa de sobrescrevê-la.
                </p>
            </div>

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-2 border-b border-gray-100 bg-white">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por unidade ou torre..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>
                        <button
                            onClick={carregar}
                            className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                            title="Recarregar (descarta o que não foi salvo)"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>
                        <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>
                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={COLUMNS}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
                            />
                        </div>
                        <button
                            onClick={salvar}
                            disabled={salvando || !temPendencia}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 shrink-0"
                        >
                            <Save className="w-[15px] h-[15px]" />
                            {salvando ? 'Salvando...' : `Salvar ${Object.keys(edicoes).length || ''}`.trim()}
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : filtradas.length === 0 ? (
                    <div className="text-center py-12">
                        <Scale className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">
                            {unidades.length === 0 ? 'Nenhuma unidade cadastrada' : 'Nenhum resultado'}
                        </h3>
                        <p className="text-sm text-gray-500 max-w-md mx-auto">
                            {unidades.length === 0
                                ? 'As unidades vêm do Empreendimento, na aba Torres e Unidades.'
                                : 'Tente ajustar a busca.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {v.includes('torre') && <SortableHeader colKey="torre" label="Torre" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('unidade') && <SortableHeader colKey="unidade" label="Unidade" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('area') && <SortableHeader colKey="area" label="Área privativa" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('origem') && <SortableHeader colKey="origem" label="Origem" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('fracao') && <SortableHeader colKey="fracao" label="Fração ideal (%)" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filtradas.map(u => {
                                    const editado = edicoes[u.id] !== undefined;
                                    const valorCampo = editado
                                        ? edicoes[u.id]
                                        : u.fracao_ideal_decimal != null
                                            ? (u.fracao_ideal_decimal * 100).toFixed(4)
                                            : '';
                                    return (
                                        <tr key={u.id} className="hover:bg-blue-50/50 transition-colors group">
                                            {v.includes('torre') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{u._tower_name}</td>}
                                            {v.includes('unidade') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">{u.name}</td>}
                                            {v.includes('area') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                    {u.private_area != null ? `${u.private_area.toLocaleString('pt-BR')} m²` : '—'}
                                                </td>
                                            )}
                                            {v.includes('origem') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    {u.fracao_ideal_origem === 'CONVENCAO'
                                                        ? <span className="text-sm font-normal text-teal-600">Convenção</span>
                                                        : u.fracao_ideal_origem === 'MOTOR'
                                                            ? <span className="text-sm font-normal text-blue-600">Motor de áreas</span>
                                                            : <span className="text-sm font-normal text-gray-400">Não informada</span>}
                                                </td>
                                            )}
                                            {v.includes('fracao') && (
                                                /* §7.1 — campo editável dentro de TD usa a MESMA tipografia
                                                   da célula de texto: text-sm font-normal, nunca text-xs
                                                   nem font-bold. */
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    {/* O placeholder só faz sentido como PERCENTUAL. O "0,0000"
                                                        anterior parecia um decimal, e em 31/08/2026 o mesmo erro
                                                        de escala aconteceu DUAS vezes seguidas: digitou-se 0,0833
                                                        (1/12 em decimal) onde o campo pede 8,3333, e a soma
                                                        fechou em 1% em vez de 100%. Duas vezes é padrão, não
                                                        descuido — a dica é que estava errada. */}
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={valorCampo}
                                                        onChange={e => setEdicoes(prev => ({ ...prev, [u.id]: e.target.value }))}
                                                        placeholder="8,3333"
                                                        className={`text-sm font-normal px-2 py-1 w-32 rounded border transition-all ${
                                                            editado
                                                                ? 'text-gray-900 bg-amber-50 border-amber-200'
                                                                : valorCampo
                                                                    ? 'text-gray-900 bg-gray-50 border-gray-100'
                                                                    : 'text-gray-400 bg-white border-dashed border-gray-200'
                                                        }`}
                                                    />
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {notification.message}
                </div>
            )}
        </div>
    );
};

export default FracoesTab;
