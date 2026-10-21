import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Copy, FileText, Receipt, Ungroup } from 'lucide-react';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import { formatMoney, formatDateBR } from '../ui/Format';
import { useStore } from '../../store/useStore';
import { darfService } from '../../services/darfService';
import { taxPayableService } from '../../services/taxPayableService';
import { competenciaBR, formatarLinhaDigitavel } from '../../utils/darf';
import type { Darf, DarfStatus, TaxPayable } from '../../types/financial';
import DarfSheet from './DarfSheet';

/**
 * Tributos a Pagar › aba DARFs — as guias montadas a partir dos tributos.
 * Plano: docs/planos/2026-10-21-agrupar-tributos-em-darf.md.
 *
 * Gestão da guia (editar, desagrupar, conferir a composição). O PAGAMENTO é em
 * Contas a Pagar, onde o DARF aparece como um título só ("Ver em Contas a Pagar").
 * Sem KPI nesta aba: os totais a pagar já estão na aba Tributos a Pagar.
 */

const STATUS_DARF: Record<DarfStatus, { rotulo: string; cor: string }> = {
    PREVISTO: { rotulo: 'A pagar', cor: 'text-blue-700' },
    VENCIDO:  { rotulo: 'Vencido', cor: 'text-red-600' },
    PAGO:     { rotulo: 'Pago', cor: 'text-green-700' },
    // Membros em estados diferentes: só com dado anterior à trava ou escrita fora do app.
    PARCIAL:  { rotulo: 'Inconsistente', cor: 'text-red-600' },
};

// Soma ≈ 1180 + Ações 300: cabe numa tela de 1800px com o menu lateral aberto.
const COLUNAS: StandardTableColumn[] = [
    { key: 'competencia', label: 'Competência', sortable: true, width: 120 },
    { key: 'due_date', label: 'Vencimento', sortable: true, width: 120 },
    { key: 'tributos', label: 'Tributos', sortable: true, width: 180 },
    { key: 'qtd', label: 'Qtde', sortable: true, width: 70, align: 'right' },
    { key: 'principal', label: 'Principal', sortable: true, width: 130, align: 'right' },
    { key: 'multa', label: 'Multa', sortable: true, width: 100, align: 'right' },
    { key: 'juros', label: 'Juros', sortable: true, width: 100, align: 'right' },
    { key: 'total', label: 'Total', sortable: true, width: 130, align: 'right' },
    { key: 'numero', label: 'Nº documento', sortable: true, width: 120 },
    { key: 'status', label: 'Status', sortable: true, width: 110 },
];

/** Por que não dá para desagrupar — `null` quando dá. Mesmas recusas de `fn_darf_desagrupar`. */
export function motivoNaoDesagrupa(d: Pick<Darf, 'conciliado_no_extrato' | 'n_pagos'>): string | null {
    if (d.conciliado_no_extrato) return 'Conciliado com o extrato — desfaça a conciliação em Conciliação Bancária antes de desagrupar';
    if (d.n_pagos > 0) return 'DARF pago — estorne a baixa em Contas a Pagar antes de desagrupar';
    return null;
}

interface Props {
    /** Organização do topo; `null` = "Todas" (a RLS recorta) — REGRA #5. */
    organizationId: string | null;
    /** Nome por organização, para o painel dizer de qual org é o DARF em "Todas". */
    nomeDaOrganizacao: (orgId: string) => string | null;
    /** DARF a abrir (vindo do link "DARF · venc." da aba Tributos). */
    focoDarfId: string | null;
    onFocoConsumido: () => void;
    /** Avisa a aba Tributos para recarregar (o vínculo dos tributos mudou). */
    onDarfsChanged: () => void;
    notify: (mensagem: string, tipo?: 'success' | 'error') => void;
}

export default function DarfsTab({ organizationId, nomeDaOrganizacao, focoDarfId, onFocoConsumido, onDarfsChanged, notify }: Props) {
    const confirm = useConfirm();
    const navigateToFocus = useStore(s => s.navigateToFocus);
    const [darfs, setDarfs] = useState<Darf[]>([]);
    const [tributos, setTributos] = useState<TaxPayable[]>([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [abertos, setAbertos] = useState<Set<string>>(new Set());
    const [editando, setEditando] = useState<Darf | null>(null);
    const [ocupado, setOcupado] = useState<string | null>(null);

    const carregar = useCallback(async () => {
        setLoading(true);
        setErro(null);
        try {
            // Os tributos SEM filtro da tela: a composição e o aviso de distrato
            // precisam de todos os membros, não do recorte da aba Tributos.
            const [ds, ts] = await Promise.all([
                darfService.list(organizationId),
                taxPayableService.list(organizationId),
            ]);
            setDarfs(ds);
            setTributos(ts.filter(t => !!t.darf_id));
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível carregar os DARFs.');
        } finally {
            setLoading(false);
        }
    }, [organizationId]);

    useEffect(() => { carregar(); }, [carregar]);

    // Link "DARF · venc." da aba Tributos: abre a composição daquele DARF.
    useEffect(() => {
        if (!focoDarfId || loading) return;
        if (darfs.some(d => d.id === focoDarfId)) setAbertos(prev => new Set(prev).add(focoDarfId));
        onFocoConsumido();
    }, [focoDarfId, loading, darfs, onFocoConsumido]);

    const tributosPorDarf = useMemo(() => {
        const m = new Map<string, TaxPayable[]>();
        tributos.forEach(t => { const l = m.get(t.darf_id!) ?? []; l.push(t); m.set(t.darf_id!, l); });
        return m;
    }, [tributos]);
    const distratado = (d: Darf) => (tributosPorDarf.get(d.id) ?? []).some(t => t.deal_status === 'CANCELLED');

    const alternar = (id: string) => setAbertos(prev => {
        const n = new Set(prev);
        if (n.has(id)) n.delete(id); else n.add(id);
        return n;
    });

    async function desagrupar(d: Darf) {
        const ok = await confirm({
            title: 'Desagrupar este DARF?',
            message: (
                <>
                    Os <b>{d.qtd_tributos}</b> tributo{d.qtd_tributos !== 1 ? 's' : ''} voltam a ser títulos separados em Contas a Pagar, com o vencimento original.
                    {d.multa + d.juros > 0 && <> A multa e os juros lançados no DARF (<b>{formatMoney(d.multa + d.juros)}</b>) são apagados.</>}
                    {d.documento_path && <> O PDF anexado é removido.</>}
                </>
            ),
            variant: 'warning',
            confirmLabel: 'Desagrupar DARF',
        });
        if (!ok) return;
        setOcupado(d.id);
        try {
            await darfService.desagrupar(d.id);
            setDarfs(prev => prev.filter(x => x.id !== d.id));
            setTributos(prev => prev.filter(t => t.darf_id !== d.id));
            onDarfsChanged();
            notify('DARF desagrupado. Os tributos voltaram a vencer na data original.');
        } catch (e) {
            notify(e instanceof Error ? e.message : 'Não foi possível desagrupar o DARF.', 'error');
        } finally {
            setOcupado(null);
        }
    }

    async function copiarLinha(d: Darf) {
        try {
            await navigator.clipboard.writeText(d.codigo_barras ?? '');
            notify('Linha digitável copiada.');
        } catch {
            notify('Não foi possível copiar — selecione e copie a linha na composição.', 'error');
        }
    }

    async function verDocumento(d: Darf) {
        try { window.open(await darfService.urlDoAnexo(d.documento_path!), '_blank', 'noopener'); }
        catch (e) { notify(e instanceof Error ? e.message : 'Não foi possível abrir o documento.', 'error'); }
    }

    const renderCell = (key: string, d: Darf): React.ReactNode => {
        switch (key) {
            case 'competencia':
                return (
                    <span className="flex items-center gap-1.5 text-sm font-normal text-gray-700 whitespace-nowrap">
                        <button
                            type="button"
                            onClick={() => alternar(d.id)}
                            className="text-gray-400 hover:text-gray-700"
                            title={abertos.has(d.id) ? 'Esconder a composição' : 'Ver a composição'}
                            aria-expanded={abertos.has(d.id)}
                        >
                            {abertos.has(d.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                        {competenciaBR(d.competencia)}
                    </span>
                );
            case 'due_date':
                return <span className={`text-sm font-normal whitespace-nowrap ${d.status_efetivo === 'VENCIDO' ? 'text-red-600' : 'text-gray-600'}`}>{formatDateBR(d.due_date)}</span>;
            case 'tributos':
                return (
                    <span className="flex items-center gap-1.5 min-w-0">
                        {distratado(d) && (
                            <span title="Negócio de origem distratado — confira antes de pagar" className="shrink-0">
                                <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                            </span>
                        )}
                        <span className="block truncate text-sm font-normal text-gray-700" title={d.tributos_nomes ?? ''}>{d.tributos_nomes ?? '—'}</span>
                    </span>
                );
            case 'qtd':
                return <span className="text-sm font-normal text-gray-600">{d.qtd_tributos}</span>;
            case 'principal':
                return <span className="text-sm font-medium text-gray-800 whitespace-nowrap">{formatMoney(d.principal)}</span>;
            case 'multa':
                return <span className="text-sm font-medium text-gray-800 whitespace-nowrap">{d.multa ? formatMoney(d.multa) : '—'}</span>;
            case 'juros':
                return <span className="text-sm font-medium text-gray-800 whitespace-nowrap">{d.juros ? formatMoney(d.juros) : '—'}</span>;
            case 'total':
                return <span className="text-sm font-medium text-gray-800 whitespace-nowrap">{formatMoney(d.total)}</span>;
            case 'numero':
                return <span className="block truncate text-sm font-normal text-gray-700" title={d.numero_documento ?? ''}>{d.numero_documento || '—'}</span>;
            case 'status': {
                const s = STATUS_DARF[d.status_efetivo] ?? { rotulo: d.status_efetivo, cor: 'text-gray-600' };
                return (
                    <span className={`text-sm font-normal ${s.cor}`}
                        title={d.status_efetivo === 'PARCIAL' ? 'Lançamentos do DARF em estados diferentes (parte paga, parte em aberto)' : undefined}>
                        {s.rotulo}
                    </span>
                );
            }
            default:
                return null;
        }
    };

    const sortValue = (key: string, d: Darf): string | number => {
        switch (key) {
            case 'competencia': return d.competencia;
            case 'due_date': return d.due_date;
            case 'tributos': return (d.tributos_nomes ?? '').toLowerCase();
            case 'qtd': return d.qtd_tributos;
            case 'principal': return d.principal;
            case 'multa': return d.multa;
            case 'juros': return d.juros;
            case 'total': return d.total;
            case 'numero': return (d.numero_documento ?? '').toLowerCase();
            case 'status': return STATUS_DARF[d.status_efetivo]?.rotulo ?? d.status_efetivo;
            default: return '';
        }
    };

    const renderExpanded = (d: Darf, visibleCount: number) => {
        if (!abertos.has(d.id)) return null;
        const membros = tributosPorDarf.get(d.id) ?? [];
        return (
            <tr className="bg-gray-50/50">
                <td colSpan={visibleCount} className="px-6 py-4 space-y-3">
                    {distratado(d) && (
                        <p className="flex items-center gap-1.5 text-sm text-red-600">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            Há tributo de negócio distratado neste DARF — confira antes de pagar. Para tirá-lo, desagrupe e monte o DARF de novo.
                        </p>
                    )}
                    <div className="overflow-x-auto rounded-[10px] border border-gray-100 bg-white">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                                    <th className="px-3 py-2 border-r border-gray-100">Tributo</th>
                                    <th className="px-4 py-2 border-r border-gray-100">Descrição</th>
                                    <th className="px-3 py-2 border-r border-gray-100 whitespace-nowrap">Venc. original</th>
                                    <th className="px-3 py-2 text-right">Valor</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {membros.map(t => (
                                    <tr key={t.id}>
                                        <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700 whitespace-nowrap">{t.party_name ?? '—'}</td>
                                        <td className="px-4 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">
                                            <span className="block truncate" title={t.description ?? ''}>{t.description ?? '—'}</span>
                                            {t.deal_status === 'CANCELLED' && <span className="text-xs text-red-600">Negócio distratado</span>}
                                        </td>
                                        <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600 whitespace-nowrap">{formatDateBR(t.due_date_antes_darf ?? t.due_date)}</td>
                                        <td className="px-3 py-2.5 text-right text-sm font-medium text-gray-800 whitespace-nowrap">{formatMoney(t.amount)}</td>
                                    </tr>
                                ))}
                                {d.multa > 0 && (
                                    <tr>
                                        <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">Multa</td>
                                        <td className="px-4 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">Multa e Juros de Mora</td>
                                        <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">—</td>
                                        <td className="px-3 py-2.5 text-right text-sm font-medium text-gray-800">{formatMoney(d.multa)}</td>
                                    </tr>
                                )}
                                {d.juros > 0 && (
                                    <tr>
                                        <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">Juros</td>
                                        <td className="px-4 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">Multa e Juros de Mora</td>
                                        <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">—</td>
                                        <td className="px-3 py-2.5 text-right text-sm font-medium text-gray-800">{formatMoney(d.juros)}</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {(d.codigo_barras || d.observacao) && (
                        <div className="text-sm text-gray-700 space-y-1">
                            {d.codigo_barras && <p><span className="text-xs font-semibold text-slate-500 mr-2">Linha digitável</span>{formatarLinhaDigitavel(d.codigo_barras)}</p>}
                            {d.observacao && <p><span className="text-xs font-semibold text-slate-500 mr-2">Observação</span>{d.observacao}</p>}
                        </div>
                    )}
                </td>
            </tr>
        );
    };

    const renderAcoes = (d: Darf) => {
        const motivoDesagrupa = motivoNaoDesagrupa(d);
        return (
            <div className="flex items-center gap-1.5">
                <button
                    type="button"
                    onClick={() => navigateToFocus('contas-a-pagar', d.id, 'CONTA_PAGAR')}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all whitespace-nowrap"
                    title={d.status_efetivo === 'PAGO' ? 'Abrir em Contas a Pagar (estorno da baixa)' : 'Abrir em Contas a Pagar para dar baixa'}
                >
                    Ver em Contas a Pagar
                </button>
                <ActionIconButton kind="edit" title="Editar DARF" onClick={() => setEditando(d)} />
                <span title={motivoDesagrupa ?? undefined}>
                    <ActionIconButton
                        kind="settings"
                        title="Desagrupar DARF"
                        icon={<Ungroup className="w-4 h-4" />}
                        disabled={!!motivoDesagrupa || ocupado === d.id}
                        onClick={() => desagrupar(d)}
                    />
                </span>
                {d.documento_path && (
                    <ActionIconButton kind="view" title="Ver o PDF do DARF" icon={<FileText className="w-4 h-4" />} onClick={() => verDocumento(d)} />
                )}
                {d.codigo_barras && (
                    <ActionIconButton kind="duplicate" title="Copiar a linha digitável" icon={<Copy className="w-4 h-4" />} onClick={() => copiarLinha(d)} />
                )}
            </div>
        );
    };

    return (
        <>
            {erro && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-[10px] text-sm text-red-700 font-semibold">{erro}</div>
            )}
            <StandardTable<Darf>
                storageKey="tributosPagar:darfs"
                columns={COLUNAS}
                rows={darfs}
                rowKey={d => d.id}
                renderCell={renderCell}
                sortValue={sortValue}
                searchText={d => [competenciaBR(d.competencia), d.tributos_nomes, d.numero_documento, d.observacao, (tributosPorDarf.get(d.id) ?? []).map(t => t.description).join(' ')].filter(Boolean).join(' ')}
                searchPlaceholder="Buscar por tributo, competência, nº do documento ou descrição..."
                actions={{ render: renderAcoes, width: 300 }}
                renderExpanded={renderExpanded}
                rowClassName={d => (d.status_efetivo === 'VENCIDO' ? 'bg-red-50/30' : '')}
                loading={loading}
                empty={{
                    icon: <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: 'Nenhum DARF montado',
                    subtitle: 'Na aba Tributos a Pagar, marque os tributos da mesma competência e use "Agrupar em DARF".',
                }}
            />
            {editando && (
                <DarfSheet
                    open
                    darf={editando}
                    organizationId={editando.organization_id}
                    organizacaoNome={organizationId ? null : nomeDaOrganizacao(editando.organization_id)}
                    onClose={() => setEditando(null)}
                    onSaved={({ mensagem }) => {
                        setEditando(null);
                        notify(mensagem);
                        // O vencimento e os encargos mudam a lista de tributos e o total: relê os dois.
                        carregar();
                        onDarfsChanged();
                    }}
                />
            )}
        </>
    );
}
