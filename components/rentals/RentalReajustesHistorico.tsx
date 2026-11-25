import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, History } from 'lucide-react';
import StandardTable, { StandardTableColumn } from '../ui/StandardTable';
import ActionIconButton from '../ui/ActionIconButton';
import { reajusteLocacaoService, RegistroComContrato } from '../../services/reajusteLocacaoService';
import { filaDoEmpreendimento } from '../../utils/reajusteAniversario';
import { ROTULO_DECISAO, fmtDate, fmtDataHora, fmtCur, fmtPct } from './reajusteFormatos';

/**
 * Locações › Reajustes › Histórico — todas as decisões de reajuste, inclusive dos
 * contratos que já saíram da fila (pedido de 24/11/2026: "quero ver historico de
 * reajuste"). Recortado pelo empreendimento aberto, como a fila.
 */

const COLUMNS: StandardTableColumn[] = [
    { key: 'number', label: 'Contrato', sortable: true, width: 170 },
    { key: 'client', label: 'Locatário', sortable: true, width: 200 },
    { key: 'aniversario', label: 'Reajuste em', sortable: true, width: 120 },
    { key: 'periodo', label: 'Período', sortable: true, width: 200 },
    { key: 'decisao', label: 'Decisão', sortable: true, width: 170 },
    { key: 'percentual', label: 'Reajuste', sortable: true, width: 100, align: 'right' },
    { key: 'aluguel', label: 'Aluguel', sortable: true, width: 220, align: 'right' },
    { key: 'parcelas', label: 'Parcelas', sortable: true, width: 90, align: 'right' },
    { key: 'quem', label: 'Decidido por', sortable: true, width: 220 },
    { key: 'quando', label: 'Em', sortable: true, width: 140 },
];

interface Props {
    organizationId: string | null;
    negociacoesDoEmpreendimento: Set<string> | null;
    nomeDoCliente: (id?: string | null) => string;
    onOpenContract?: (contractId: string) => void;
    /** Muda quando a fila grava uma decisão — o histórico relê. */
    versao: number;
}

const RentalReajustesHistorico: React.FC<Props> = ({ organizationId, negociacoesDoEmpreendimento, nomeDoCliente, onOpenContract, versao }) => {
    const [todos, setTodos] = useState<RegistroComContrato[]>([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const registros = useMemo(() => filaDoEmpreendimento(todos, negociacoesDoEmpreendimento), [todos, negociacoesDoEmpreendimento]);

    const carregar = useCallback(async () => {
        setLoading(true);
        setErro(null);
        try {
            setTodos(await reajusteLocacaoService.historicoGeral(organizationId));
        } catch (e) {
            setErro(`Não foi possível carregar o histórico: ${e instanceof Error ? e.message : 'erro desconhecido'}`);
        } finally {
            setLoading(false);
        }
    }, [organizationId]);

    useEffect(() => { carregar(); }, [carregar, versao]);

    return (
        <div className="space-y-4">
            {erro && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 rounded-[10px] p-4 text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{erro} <button type="button" onClick={carregar} className="font-medium underline">Tentar de novo</button></span>
                </div>
            )}
            <StandardTable<RegistroComContrato>
                storageKey="rentals:reajustes:historico"
                columns={COLUMNS}
                rows={registros}
                rowKey={r => r.id}
                rowLabel={r => `Reajuste de ${fmtDate(r.aniversario)} do contrato ${r.contrato.number}`}
                loading={loading}
                searchText={r => `${r.contrato.number} ${r.contrato.title ?? ''} ${nomeDoCliente(r.contrato.client_id)} ${ROTULO_DECISAO[r.decisao]} ${r.criado_por ?? ''} ${r.observacao ?? ''}`}
                searchPlaceholder="Buscar por contrato, locatário, decisão ou quem decidiu..."
                defaultSort={{ column: 'quando', direction: 'desc' }}
                sortValue={(key, r) => {
                    switch (key) {
                        case 'number': return r.contrato.number;
                        case 'client': return nomeDoCliente(r.contrato.client_id);
                        case 'aniversario': return r.aniversario;
                        case 'periodo': return r.data_base;
                        case 'decisao': return ROTULO_DECISAO[r.decisao];
                        case 'percentual': return Number(r.percentual_aplicado);
                        case 'aluguel': return Number(r.valor_novo);
                        case 'parcelas': return r.parcelas_atualizadas;
                        case 'quem': return r.criado_por ?? '';
                        case 'quando': return r.created_at;
                        default: return '';
                    }
                }}
                renderCell={(key, r) => {
                    switch (key) {
                        case 'number': return <span className="block truncate text-sm font-normal text-gray-700" title={r.contrato.title ?? undefined}>{r.contrato.number}</span>;
                        case 'client': {
                            const nome = nomeDoCliente(r.contrato.client_id);
                            return <span className="block truncate text-sm font-normal text-gray-700" title={nome}>{nome}</span>;
                        }
                        case 'aniversario': return <span className="text-sm font-normal text-gray-700">{fmtDate(r.aniversario)}</span>;
                        case 'periodo': return <span className="text-sm font-normal text-gray-600">{fmtDate(r.data_base)} a {fmtDate(r.aniversario)}</span>;
                        case 'decisao': return (
                            <span className="block truncate text-sm font-normal text-gray-700" title={r.observacao ? `Observação: ${r.observacao}` : undefined}>
                                {ROTULO_DECISAO[r.decisao]}
                            </span>
                        );
                        case 'percentual': return (
                            <span className="text-sm font-normal text-gray-700" title={r.percentual_indice != null ? `${r.indice} no período: ${fmtPct(Number(r.percentual_indice))}` : undefined}>
                                {r.decisao === 'NAO_APLICADO' ? '—' : fmtPct(Number(r.percentual_aplicado))}
                            </span>
                        );
                        case 'aluguel': return (
                            <span className="text-sm font-medium text-gray-800 whitespace-nowrap">
                                {r.decisao === 'NAO_APLICADO' ? fmtCur(r.valor_anterior) : `${fmtCur(r.valor_anterior)} → ${fmtCur(r.valor_novo)}`}
                            </span>
                        );
                        case 'parcelas': return <span className="text-sm font-normal text-gray-700">{r.parcelas_atualizadas}</span>;
                        case 'quem': return <span className="block truncate text-sm font-normal text-gray-600" title={r.criado_por ?? undefined}>{r.criado_por ?? '—'}</span>;
                        case 'quando': return <span className="text-sm font-normal text-gray-600">{fmtDataHora(r.created_at)}</span>;
                        default: return null;
                    }
                }}
                actions={onOpenContract ? {
                    width: 70,
                    render: r => <ActionIconButton kind="view" title="Abrir a negociação do contrato" onClick={() => onOpenContract(r.contract_id)} />,
                } : undefined}
                empty={{
                    icon: <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: 'Nenhum reajuste decidido',
                    subtitle: negociacoesDoEmpreendimento
                        ? 'Nenhuma decisão de reajuste nas locações deste empreendimento.'
                        : 'As decisões tomadas em "A decidir" aparecem aqui.',
                }}
            />
        </div>
    );
};

export default RentalReajustesHistorico;
