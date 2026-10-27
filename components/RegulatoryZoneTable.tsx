// components/RegulatoryZoneTable.tsx
//
// Tabela de zonas urbanísticas (macroárea/zona/C.A./gabarito/recuos/vagas) — extraída de
// MapaRegulatorioEditor.tsx para ser reutilizada também no cadastro de Mapas Regulatórios por
// cidade (RegulatoryMapDetail). As duas telas editam tabelas diferentes no banco
// (empreendimento_regulatory_zones × regulatory_map_zones) mas o mesmo shape de 21 campos —
// este componente não sabe de onde vêm os dados, só recebe callbacks.
import React from 'react';
import { Plus, Loader2, Map, Search, MoveHorizontal } from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { useConfirm } from './ui/confirm';
import { ColumnConfig, useTableColumns, useResizableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';

export type ZoneField =
    | 'macroarea' | 'zona' | 'ca_minimo' | 'ca_basico' | 'ca_maximo'
    | 'taxa_ocupacao_maxima' | 'taxa_permeabilidade_minima' | 'gabarito_altura_maxima'
    | 'uso_permitido' | 'recuo_frente' | 'recuo_lateral_direita' | 'recuo_lateral_esquerda'
    | 'recuo_fundos' | 'gabarito_pavimentos' | 'regra_vagas' | 'vagas_por_unidade'
    | 'area_minima_unidade' | 'lei_referencia' | 'documento_fonte' | 'nivel_confianca' | 'observacoes'
    // Desde 03/10/2026: o que a Planta Inteligente lê (antes só digitado à mão em cada estudo).
    | 'testada_minima' | 'area_minima_lote' | 'insolacao_minima' | 'afastamento_progressivo' | 'recuo_frente_escalonado';

export type ZoneLike = { id: string } & Partial<Record<ZoneField, string | undefined>>;

export const ZONE_SELECT_OPTIONS: Partial<Record<ZoneField, readonly string[]>> = {
    macroarea: ['Urbanização Consolidada', 'Qualificação Urbana', 'Transição Urbana', 'Resiliência Urbana'],
    zona: ['ZC', 'ZDSE', 'ZEEP', 'ZEIS 1', 'ZEIS 2', 'ZEIS 3', 'ZEM', 'ZEP', 'ZEPAM 1', 'ZEPAM 2', 'ZEPAM 3', 'ZEPEC 1a', 'ZEPEC 1b', 'ZEPEC 2', 'ZEPEC 3', 'ZM 1', 'ZM 2', 'ZM 3', 'ZM 4', 'ZPU'],
    ca_minimo: ['N.A.', '0,05', '0,25', '1'],
    ca_basico: ['N.A.', '2', '2,5', '3'],
    ca_maximo: ['N.A.', '3', '4', '5', '6'],
    taxa_ocupacao_maxima: ['N.A.', '0,7', '0,75', '0,8', '0,9'],
    taxa_permeabilidade_minima: ['N.A.', '0,05', '0,1'],
    gabarito_altura_maxima: ['N.A.', '10', '11,6', '18'],
    nivel_confianca: ['Baixo', 'Médio', 'Alto', 'Validado por profissional', 'Validado na prefeitura'],
};

/** `width` em px — largura inicial da coluna (padding incluso); o usuário redimensiona e o autoFit (§6.1.2) mede o conteúdo. */
interface ColDef { key: ZoneField; label: string; width: number; type: 'select' | 'text'; placeholder?: string; }

export const ZONE_COLUMNS: ColDef[] = [
    { key: 'macroarea',                  label: 'Macroárea',           width: 176, type: 'select' },
    { key: 'zona',                       label: 'Zona',                width: 112, type: 'select' },
    { key: 'uso_permitido',              label: 'Uso permitido',       width: 160, type: 'text', placeholder: 'Residencial, misto…' },
    { key: 'ca_minimo',                  label: 'C.A. mínimo',         width: 112, type: 'select' },
    { key: 'ca_basico',                  label: 'C.A. básico',         width: 112, type: 'select' },
    { key: 'ca_maximo',                  label: 'C.A. máximo',         width: 112, type: 'select' },
    { key: 'taxa_ocupacao_maxima',       label: 'T.O. máx.',           width: 96, type: 'select' },
    { key: 'taxa_permeabilidade_minima', label: 'T.perm. mín.',        width: 96, type: 'select' },
    { key: 'gabarito_altura_maxima',     label: 'Gabarito (m)',        width: 112, type: 'select' },
    { key: 'gabarito_pavimentos',        label: 'Gabarito (pav.)',     width: 112, type: 'text', placeholder: 'nº' },
    { key: 'recuo_frente',               label: 'Recuo frente (m)',    width: 112, type: 'text', placeholder: '0' },
    { key: 'recuo_fundos',               label: 'Recuo fundos (m)',    width: 112, type: 'text', placeholder: '0' },
    { key: 'recuo_lateral_direita',      label: 'Recuo lat. dir. (m)', width: 128, type: 'text', placeholder: '0' },
    { key: 'recuo_lateral_esquerda',     label: 'Recuo lat. esq. (m)', width: 128, type: 'text', placeholder: '0' },
    { key: 'regra_vagas',                label: 'Regra de vagas',      width: 160, type: 'text', placeholder: 'por unidade, por m²…' },
    { key: 'vagas_por_unidade',          label: 'Vagas / unidade',     width: 112, type: 'text', placeholder: '0' },
    { key: 'area_minima_unidade',        label: 'Área mín. unid. (m²)', width: 128, type: 'text', placeholder: '0' },
    { key: 'testada_minima',             label: 'Testada mín. (m)',    width: 112, type: 'text', placeholder: '0' },
    { key: 'area_minima_lote',           label: 'Área mín. lote (m²)', width: 128, type: 'text', placeholder: '0' },
    { key: 'insolacao_minima',           label: 'Insolação mín. (h)',  width: 112, type: 'text', placeholder: '2 h' },
    { key: 'afastamento_progressivo',    label: 'Afastamento progressivo', width: 224, type: 'text', placeholder: 'acima de 6 m: (H − 6)/10' },
    { key: 'recuo_frente_escalonado',    label: 'Recuo frente escalonado', width: 224, type: 'text', placeholder: '5 m a partir do 3º pavimento' },
    { key: 'lei_referencia',             label: 'Lei de referência',   width: 176, type: 'text', placeholder: 'Lei nº…' },
    { key: 'documento_fonte',            label: 'Documento fonte',     width: 176, type: 'text' },
    { key: 'nivel_confianca',            label: 'Nível de confiança',  width: 192, type: 'select' },
    { key: 'observacoes',                label: 'Observações',         width: 224, type: 'text' },
];

// §2 do guia: mesmas colunas, só na forma que useTableColumns/ColumnConfigButton esperam.
const COLUMNS_FOR_CONFIG: ColumnConfig[] = ZONE_COLUMNS.map(c => ({ key: c.key, label: c.label, sortable: true }));

// §6.1: larguras iniciais por coluna (as mesmas de antes, quando eram classes `w-*`),
// mais a de Ações. Soma ~4.300 px — a tabela rola na horizontal de propósito: são 26
// parâmetros da lei, e esconder coluna é escolha do usuário na engrenagem.
const ZONE_COL_WIDTHS: Record<string, number> = {
    ...Object.fromEntries(ZONE_COLUMNS.map(c => [c.key, c.width])),
    actions: 80,
};

// Busca por texto — campos onde faz sentido localizar uma zona rapidamente entre muitas.
const SEARCHABLE_FIELDS: ZoneField[] = ['macroarea', 'zona', 'uso_permitido', 'lei_referencia', 'documento_fonte'];

function parseNumeric(value?: string): number | null {
    if (!value) return null;
    const norm = value.trim().toLowerCase();
    if (!norm || norm === 'n.a.') return null;
    const n = parseFloat(norm.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}

// Ordem numérica quando os dois valores são comparáveis como número (C.A., recuos, vagas…);
// senão cai para ordem alfabética (pt-BR) — cobre tanto colunas numéricas quanto de texto livre.
function compareZoneValues<T extends ZoneLike>(a: T, b: T, key: ZoneField, direction: 'asc' | 'desc'): number {
    const rawA = (a[key] as string) ?? '';
    const rawB = (b[key] as string) ?? '';
    const numA = parseNumeric(rawA);
    const numB = parseNumeric(rawB);
    const cmp = (numA !== null && numB !== null) ? numA - numB : rawA.localeCompare(rawB, 'pt-BR');
    return direction === 'asc' ? cmp : -cmp;
}

// O valor gravado entra como opção quando não está na lista (26/10/2026): as opções são as do
// PDE de São Paulo, e o mapa de Cambuí traz "ZM1", "ZV - Eixo Vert.", "Industrialização e
// Desenvolvimento Econômico"… — sem isso o <select> caía em "—" com o dado gravado.
const SelectCell: React.FC<{ value?: string; options: readonly string[]; onChange: (v: string) => void; saving: boolean }> =
    ({ value, options, onChange, saving }) => (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)} disabled={saving}
        className="w-full bg-transparent border-none focus:ring-0 text-sm font-normal text-gray-700 cursor-pointer py-0.5 disabled:opacity-50">
        <option value="">—</option>
        {value && !options.includes(value) && <option value={value}>{value}</option>}
        {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
);

/** "ZEPEC 2 · Urbanização Consolidada" — o mesmo rótulo que a Planta grava (`zona_rotulo`). */
function rotuloDaLinha(z: ZoneLike): string {
    return [z.zona, z.macroarea].filter(Boolean).join(' · ') || 'Zona sem nome';
}

/** Coluna estrutural "Aplicável" (fora da engrenagem, como o checkbox de lote do §10). */
const LARGURA_APLICAVEL = 96;

const TextCell: React.FC<{ value?: string; onCommit: (v: string) => void; saving: boolean; placeholder?: string }> =
    ({ value, onCommit, saving, placeholder }) => (
    <input type="text" defaultValue={value ?? ''} placeholder={placeholder} disabled={saving}
        onBlur={(e) => { if ((e.target.value ?? '') !== (value ?? '')) onCommit(e.target.value); }}
        className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-400 rounded text-sm font-normal text-gray-700 py-0.5 disabled:opacity-50" />
);

interface Props<T extends ZoneLike> {
    /** Identificador único desta tabela na tela (chave de localStorage para busca/colunas/ordenação — §3). */
    tableId: string;
    title: string;
    subtitle: string;
    zones: T[];
    loading: boolean;
    adding: boolean;
    savingId: string | null;
    onAdd: () => void;
    onUpdate: (id: string, field: ZoneField, value: string) => void;
    onDelete: (id: string) => void;
    /** Slot extra ao lado do botão "Nova Zona" (ex.: "Importar de mapa cadastrado"). */
    headerActions?: React.ReactNode;
    emptyLabel?: string;
    /**
     * Motivo do modo só leitura (ex.: estudo de viabilidade aberto sem canEditImovib).
     * Presente: "Nova zona", ações do cabeçalho, células e excluir ficam travados;
     * busca, colunas e ordenação continuam livres. Ausente: tudo editável, como antes.
     */
    somenteLeitura?: string;
    /**
     * Zona que vale para o terreno (só no empreendimento — o cadastro da cidade não passa).
     * Presente: 1ª coluna "Aplicável" com rádio e a zona marcada dita no cabeçalho.
     * Plano docs/planos/2026-10-26-zona-aplicavel-do-empreendimento.md.
     */
    aplicavel?: { zonaId: string | null; onMarcar: (zonaId: string | null) => void };
}

export function RegulatoryZoneTable<T extends ZoneLike>({
    tableId, title, subtitle, zones, loading, adding, savingId, onAdd, onUpdate, onDelete, headerActions, emptyLabel, somenteLeitura, aplicavel,
}: Props<T>) {
    const travado = !!somenteLeitura;
    const zonaAplicavel = aplicavel?.zonaId ? zones.find(z => z.id === aplicavel.zonaId) ?? null : null;
    const confirm = useConfirm();
    const [search, setSearch] = usePersistedState<string>(`${tableId}:search`, '');
    const tableColumns = useTableColumns(COLUMNS_FOR_CONFIG, `${tableId}Columns`);
    const cols = useResizableColumns(ZONE_COL_WIDTHS, `${tableId}ColWidths`);

    const handleDelete = async (id: string) => {
        const ok = await confirm({
            title: 'Excluir zona regulatória?',
            message: 'A zona e seus parâmetros serão removidos.',
            confirmLabel: 'Excluir', variant: 'danger',
        });
        if (!ok) return;
        onDelete(id);
    };

    const filteredZones = React.useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return zones;
        return zones.filter(z => SEARCHABLE_FIELDS.some(f => (z[f] as string | undefined)?.toLowerCase().includes(q)));
    }, [zones, search]);

    // Sem coluna selecionada, mantém a ordem recebida (sort_order — reflete a ordem do
    // documento legal da prefeitura, não é decorativa; ver §6.3/§6.4 do guia).
    const visibleZones = React.useMemo(() => {
        if (!tableColumns.sortColumn) return filteredZones;
        const key = tableColumns.sortColumn as ZoneField;
        return [...filteredZones].sort((a, b) => compareZoneValues(a, b, key, tableColumns.sortDirection));
    }, [filteredZones, tableColumns.sortColumn, tableColumns.sortDirection]);

    // Ordem escolhida pelo usuário (drag do cabeçalho), não a ordem fixa de ZONE_COLUMNS.
    // (lookup por objeto, não Map — `Map` aqui é o ícone importado de lucide-react, não a classe global)
    const zoneColumnsByKey = React.useMemo(
        () => Object.fromEntries(ZONE_COLUMNS.map(c => [c.key, c])) as Partial<Record<ZoneField, ColDef>>,
        [],
    );
    const visibleColumnDefs = tableColumns.orderedVisibleColumns
        .map(key => zoneColumnsByKey[key as ZoneField])
        .filter((c): c is ColDef => !!c);

    if (loading) {
        return (
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm">
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-500">Carregando zonas...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div>
                    <h2 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                        <Map className="w-4 h-4 text-indigo-500" /> {title}
                    </h2>
                    <p className="text-gray-500 text-xs mt-1 font-medium">{subtitle}</p>
                    {aplicavel && (
                        zonaAplicavel ? (
                            <p className="text-xs mt-1 text-gray-600 flex items-center gap-2">
                                <span>Zona aplicável: <span className="font-semibold text-gray-900">{rotuloDaLinha(zonaAplicavel)}</span></span>
                                <button
                                    type="button"
                                    onClick={() => aplicavel.onMarcar(null)}
                                    disabled={travado}
                                    title={somenteLeitura ?? 'Nenhuma zona fica marcada; a Planta volta a pedir a escolha'}
                                    className="text-blue-600 hover:text-blue-800 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    Desmarcar
                                </button>
                            </p>
                        ) : (
                            <p className="text-xs mt-1 text-gray-600">
                                Nenhuma zona marcada como aplicável. Marque na coluna "Aplicável" a que vale para o terreno — a Planta já vem com ela.
                            </p>
                        )
                    )}
                </div>
                <fieldset disabled={travado} title={somenteLeitura} className="imovib-ro min-w-0 border-0 p-0 m-0 flex items-center gap-2 shrink-0">
                    {headerActions}
                    <button
                        onClick={onAdd}
                        disabled={adding}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-60"
                    >
                        {adding ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Plus className="w-[15px] h-[15px]" />}
                        Nova zona
                    </button>
                </fieldset>
            </div>

            <div className="flex flex-col md:flex-row gap-2.5 items-center px-4 py-3 border-b border-gray-100">
                <div className="flex-1 relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar por macroárea, zona, uso permitido ou lei..."
                        className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                </div>
                <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                    <ColumnConfigButton
                        columns={COLUMNS_FOR_CONFIG}
                        visibleColumns={tableColumns.visibleColumns}
                        showColumnConfig={tableColumns.showColumnConfig}
                        onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                        onToggleColumn={tableColumns.toggleColumn}
                        onReset={tableColumns.resetColumns}
                    />
                    {/* Ajustar largura ao conteúdo — §6.1.2. Mede o VALOR de cada campo
                        editável, não a caixa do input. */}
                    <button
                        onClick={() => cols.autoFit()}
                        className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                        title="Ajustar largura das colunas ao conteúdo"
                    >
                        <MoveHorizontal className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {zones.length === 0 ? (
                <div className="text-center py-12">
                    <Map className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma zona cadastrada</h3>
                    <p className="text-sm text-gray-500">{emptyLabel || 'Clique em "Nova Zona" para adicionar'}</p>
                </div>
            ) : visibleZones.length === 0 ? (
                <div className="text-center py-12">
                    <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma zona encontrada</h3>
                    <p className="text-sm text-gray-500">Tente ajustar sua busca.</p>
                </div>
            ) : (
                <div className="overflow-auto max-h-[70vh]">
                    <table
                        ref={cols.tableRef}
                        className="text-left border-collapse"
                        style={{
                            tableLayout: 'fixed',
                            width: (aplicavel ? LARGURA_APLICAVEL : 0)
                                + visibleColumnDefs.reduce((soma, c) => soma + cols.getWidth(c.key), 0) + cols.getWidth('actions'),
                            minWidth: '100%',
                        }}
                    >
                        <colgroup>
                            {aplicavel && <col style={{ width: `${LARGURA_APLICAVEL}px` }} />}
                            {visibleColumnDefs.map(col => (
                                <col key={col.key} data-col-key={col.key} style={{ width: `${cols.getWidth(col.key)}px` }} />
                            ))}
                            {/* espaçador — absorve a folga ANTES de Ações (§6.1.1) */}
                            <col />
                            <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />
                        </colgroup>
                        <thead>
                            <tr className="sticky top-0 z-10 bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                                {aplicavel && (
                                    <th className="px-4 py-2 border-r border-gray-100 text-center text-table-header font-semibold text-gray-700">Aplicável</th>
                                )}
                                {visibleColumnDefs.map(col => (
                                    <SortableHeader
                                        key={col.key}
                                        colKey={col.key}
                                        label={col.label}
                                        uppercase={false}
                                        sortColumn={tableColumns.sortColumn}
                                        sortDirection={tableColumns.sortDirection}
                                        onSort={tableColumns.handleColumnSort}
                                        onMoveColumn={tableColumns.moveColumn}
                                        className="px-6 py-2 border-r border-gray-100 overflow-hidden"
                                    >
                                        <cols.ResizeHandle colKey={col.key} />
                                    </SortableHeader>
                                ))}
                                <th aria-hidden="true" className="border-r border-gray-100"></th>
                                <th className="px-6 py-2 text-right text-sm font-semibold text-gray-500">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {visibleZones.map(zone => (
                                <tr key={zone.id} className={`hover:bg-blue-50/50 transition-colors ${aplicavel?.zonaId === zone.id ? 'bg-blue-50/60' : ''} ${savingId === zone.id ? 'opacity-60' : ''}`}>
                                    {aplicavel && (
                                        <td className="px-4 py-2.5 border-r border-gray-100 text-center">
                                            <input
                                                type="radio"
                                                name={`${tableId}-aplicavel`}
                                                checked={aplicavel.zonaId === zone.id}
                                                onChange={() => aplicavel.onMarcar(zone.id)}
                                                disabled={travado}
                                                title={somenteLeitura ?? `Marcar ${rotuloDaLinha(zone)} como a zona que vale para o terreno`}
                                                aria-label={`Zona aplicável: ${rotuloDaLinha(zone)}`}
                                                className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                                            />
                                        </td>
                                    )}
                                    {visibleColumnDefs.map(col => (
                                        <td key={col.key} title={somenteLeitura} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                            {col.type === 'select' ? (
                                                <SelectCell
                                                    value={zone[col.key] as string | undefined}
                                                    options={ZONE_SELECT_OPTIONS[col.key] ?? []}
                                                    onChange={(v) => onUpdate(zone.id, col.key, v)}
                                                    saving={savingId === zone.id || travado}
                                                />
                                            ) : (
                                                <TextCell
                                                    value={zone[col.key] as string | undefined}
                                                    onCommit={(v) => onUpdate(zone.id, col.key, v)}
                                                    saving={savingId === zone.id || travado}
                                                    placeholder={col.placeholder}
                                                />
                                            )}
                                        </td>
                                    ))}
                                    <td aria-hidden="true"></td>
                                    <td className="px-6 py-2.5 text-right">
                                        <fieldset disabled={travado} title={somenteLeitura} onClick={(e) => e.stopPropagation()} className="imovib-ro min-w-0 border-0 p-0 m-0 inline-block">
                                            <ActionIconButton kind="delete" title="Excluir zona" onClick={() => handleDelete(zone.id)} />
                                        </fieldset>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default RegulatoryZoneTable;
