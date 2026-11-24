import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CalendarX, Percent } from 'lucide-react';
import StandardTable, { StandardTableColumn } from '../ui/StandardTable';
import { KpiCard } from '../ui/KpiCard';
import { useConfirm } from '../ui/confirm';
import ActionIconButton from '../ui/ActionIconButton';
import { contractIndexService, ReajusteLocacao } from '../../services/contractIndexService';
import { contractService } from '../../services/contractService';
import { Client } from '../../types';

/**
 * Locações › Reajustes — o reajuste ANUAL do aluguel, separado da renovação
 * (pedido 24/11/2026: "Aba renovações é para tratar renovar um contrato que chega
 * ao fim, e não de reajuste anual do contrato"). Plano:
 * docs/planos/2026-11-24-locacoes-reajustes-separados-das-renovacoes.md.
 *
 * Lista os contratos de locação ativos com índice cujo reajuste venceu ou vence
 * nos próximos 30 dias. "Aplicar" usa o índice cadastrado
 * (contractService.aplicarReajustePeloIndice) e só liga a partir da data.
 */

const DIAS_A_FRENTE = 30;

const COLUMNS: StandardTableColumn[] = [
    { key: 'number', label: 'Contrato', sortable: true, width: 200 },
    { key: 'client', label: 'Locatário', sortable: true, width: 220 },
    { key: 'index', label: 'Índice', sortable: true, width: 110 },
    { key: 'data_base', label: 'Data-base', sortable: true, width: 130 },
    { key: 'proximo', label: 'Reajuste em', sortable: true, width: 130 },
    { key: 'situacao', label: 'Situação', sortable: true, width: 170 },
    { key: 'value', label: 'Aluguel atual', sortable: true, width: 140, align: 'right' },
];

/** Data BR por split — `new Date(iso)` retrocede um dia em UTC-3. */
const fmtDate = (iso?: string | null) => {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
};
const fmtCur = (n?: number | null) =>
    (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Dias de hoje até a data (negativo = já passou), em datas de calendário. */
const diasAte = (iso: string) => {
    const hoje = new Date();
    const h = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - h) / 86400000);
};
const situacao = (dias: number) =>
    dias < 0 ? { texto: `Venceu há ${Math.abs(dias)} dia(s)`, cor: 'text-red-600' }
        : dias === 0 ? { texto: 'Vence hoje', cor: 'text-amber-800' }
        : { texto: `Vence em ${dias} dia(s)`, cor: 'text-amber-800' };

interface Props {
    organizationId: string | null;
    clients?: Client[];
    /** Abre a negociação do contrato (Gerenciar Negociação). */
    onOpenContract?: (contractId: string) => void;
    onNotify: (msg: string, type: 'success' | 'error') => void;
}

const RentalReajustes: React.FC<Props> = ({ organizationId, clients = [], onOpenContract, onNotify }) => {
    const [linhas, setLinhas] = useState<ReajusteLocacao[]>([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [aplicandoId, setAplicandoId] = useState<string | null>(null);
    const confirm = useConfirm();

    const carregar = useCallback(async () => {
        setLoading(true);
        setErro(null);
        try {
            setLinhas(await contractIndexService.listReajustesLocacao(organizationId, DIAS_A_FRENTE));
        } catch (e) {
            setErro(`Não foi possível carregar os reajustes: ${e instanceof Error ? e.message : 'erro desconhecido'}`);
        } finally {
            setLoading(false);
        }
    }, [organizationId]);

    useEffect(() => { carregar(); }, [carregar]);

    const nomeDoCliente = useMemo(() => {
        const mapa = new Map(clients.map(c => [c.id, c.name]));
        return (id?: string | null) => (id && mapa.get(id)) || '—';
    }, [clients]);

    const vencidos = linhas.filter(l => diasAte(l.reajuste_proximo) <= 0).length;
    const proximos = linhas.length - vencidos;

    const aplicar = async (l: ReajusteLocacao) => {
        const ok = await confirm({
            title: `Aplicar o reajuste do contrato ${l.number}?`,
            message: `O aluguel de ${fmtCur(l.current_value ?? l.original_value)} é corrigido pelo ${l.reajuste_index} `
                + `desde a data-base (${fmtDate(l.reajuste_data_base)}). As parcelas em aberto com vencimento a partir `
                + 'de hoje passam ao valor novo; as pagas, conciliadas ou com valor alterado à mão não mudam.',
            variant: 'warning',
            confirmLabel: 'Aplicar reajuste',
        });
        if (!ok) return;
        setAplicandoId(l.id);
        try {
            const r = await contractService.aplicarReajustePeloIndice(l.id);
            onNotify(`Reajuste aplicado ao contrato ${r.contract.number}: ${fmtCur(r.contract.current_value)} (${r.indice} ${r.mesBase} → ${r.mesAtual}).`, 'success');
            // O contrato reajustado sai da fila (próximo reajuste daqui a 12 meses).
            setLinhas(prev => prev.filter(x => x.id !== l.id));
        } catch (e) {
            onNotify(e instanceof Error ? e.message : 'Erro ao aplicar o reajuste.', 'error');
        } finally {
            setAplicandoId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <KpiCard size="sm" label="Reajuste vencido" value={vencidos} icon={<CalendarX className="w-4 h-4" />} color="red" />
                <KpiCard size="sm" label={`Vencem em ${DIAS_A_FRENTE} dias`} value={proximos} icon={<CalendarClock className="w-4 h-4" />} color="amber" />
            </div>

            {erro && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 rounded-[10px] p-4 text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{erro} <button type="button" onClick={carregar} className="font-medium underline">Tentar de novo</button></span>
                </div>
            )}

            <StandardTable<ReajusteLocacao>
                storageKey="rentals:reajustes"
                columns={COLUMNS}
                rows={linhas}
                rowKey={l => l.id}
                rowLabel={l => `Contrato ${l.number}`}
                loading={loading}
                searchText={l => `${l.number} ${l.title} ${nomeDoCliente(l.client_id)} ${l.reajuste_index}`}
                searchPlaceholder="Buscar por contrato, locatário ou índice..."
                defaultSort={{ column: 'proximo', direction: 'asc' }}
                sortValue={(key, l) => {
                    switch (key) {
                        case 'number': return l.number;
                        case 'client': return nomeDoCliente(l.client_id);
                        case 'index': return l.reajuste_index;
                        case 'data_base': return l.reajuste_data_base ?? '';
                        case 'proximo': case 'situacao': return l.reajuste_proximo;
                        case 'value': return Number(l.current_value ?? l.original_value ?? 0);
                        default: return '';
                    }
                }}
                renderCell={(key, l) => {
                    switch (key) {
                        case 'number': return <span className="block truncate text-sm font-normal text-gray-700" title={l.title}>{l.number}</span>;
                        case 'client': {
                            const nome = nomeDoCliente(l.client_id);
                            return <span className="block truncate text-sm font-normal text-gray-700" title={nome}>{nome}</span>;
                        }
                        case 'index': return <span className="text-sm font-normal text-gray-600">{l.reajuste_index}</span>;
                        case 'data_base': return <span className="text-sm font-normal text-gray-600">{fmtDate(l.reajuste_data_base)}</span>;
                        case 'proximo': return <span className="text-sm font-normal text-gray-600">{fmtDate(l.reajuste_proximo)}</span>;
                        case 'situacao': {
                            const s = situacao(diasAte(l.reajuste_proximo));
                            return <span className={`text-sm font-normal ${s.cor}`}>{s.texto}</span>;
                        }
                        case 'value': return <span className="text-sm font-medium text-gray-800">{fmtCur(l.current_value ?? l.original_value)}</span>;
                        default: return null;
                    }
                }}
                actions={{
                    width: 200,
                    render: l => {
                        const dias = diasAte(l.reajuste_proximo);
                        const motivo = aplicandoId === l.id ? 'Aplicando o reajuste…'
                            : aplicandoId ? 'Aguarde: outro reajuste está sendo aplicado.'
                            : dias > 0 ? `O reajuste vence em ${fmtDate(l.reajuste_proximo)} — aplique a partir dessa data.`
                            : null;
                        return (
                            <div className="flex items-center justify-end gap-1.5">
                                <span className="inline-flex" title={motivo ?? undefined}>
                                    <button
                                        type="button"
                                        onClick={() => aplicar(l)}
                                        disabled={!!motivo}
                                        className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all disabled:text-gray-400 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                                    >
                                        {aplicandoId === l.id ? 'Aplicando…' : 'Aplicar reajuste'}
                                    </button>
                                </span>
                                {onOpenContract && (
                                    <ActionIconButton kind="view" title="Abrir a negociação do contrato" onClick={() => onOpenContract(l.id)} />
                                )}
                            </div>
                        );
                    },
                }}
                empty={{
                    icon: <Percent className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: 'Nenhum reajuste a fazer',
                    subtitle: `Nenhum contrato de locação com reajuste vencido ou nos próximos ${DIAS_A_FRENTE} dias.`,
                }}
            />
        </div>
    );
};

export default RentalReajustes;
