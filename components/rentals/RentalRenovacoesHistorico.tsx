import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, History } from 'lucide-react';
import StandardTable, { StandardTableColumn } from '../ui/StandardTable';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import { contractRenewalService, motivoParaNaoEditarAditivo, RegistroDeRenovacao } from '../../services/contractRenewalService';
import { filaDoEmpreendimento } from '../../utils/reajusteAniversario';
import { fmtDate, fmtDataHora, fmtCur } from './reajusteFormatos';
import RenovacaoRegistroSheet from './RenovacaoRegistroSheet';

/**
 * Locações › Renovações › Histórico (pedido de 25/11/2026: "verifique se o
 * renovações tem historico como tem reajustes" → "sim"). Todas as renovações —
 * aditivos de prorrogação (inclusive cancelados) e contratos novos gerados por
 * renovação —, recortadas pelo empreendimento aberto, como a fila.
 *
 * Ações: Ver (detalhes), Editar (leva à negociação já editando o aditivo —
 * salvar = substituí-lo) e Excluir (desfaz; a linha fica, como cancelada).
 * Editar e Excluir só na última renovação de cada contrato.
 */

const COLUMNS: StandardTableColumn[] = [
    { key: 'number', label: 'Contrato', sortable: true, width: 170 },
    { key: 'client', label: 'Locatário', sortable: true, width: 200 },
    { key: 'renovacao', label: 'Renovação', sortable: true, width: 190 },
    { key: 'periodo', label: 'Período', sortable: true, width: 200 },
    { key: 'aluguel', label: 'Aluguel', sortable: true, width: 220, align: 'right' },
    { key: 'parcelas', label: 'Parcelas', sortable: true, width: 90, align: 'right' },
    { key: 'situacao', label: 'Situação', sortable: true, width: 140 },
    { key: 'quem', label: 'Feito por', sortable: true, width: 220 },
    { key: 'quando', label: 'Em', sortable: true, width: 140 },
];

const ROTULO_VIA: Record<RegistroDeRenovacao['via'], string> = { ADITIVO: 'Aditivo', CONTRATO: 'Novo contrato' };
const cancelado = (r: RegistroDeRenovacao) => r.status === 'Cancelado';

interface Props {
    organizationId?: string;
    negociacoesDoEmpreendimento: Set<string> | null;
    nomeDoCliente: (id?: string | null) => string;
    onOpenContract?: (contractId: string) => void;
    onEditRenewal?: (contractId: string, addendumId: string) => void;
    /** Desfez uma renovação: a fila do pai relê e avisa. */
    onMudou: (mensagem: string) => void;
}

const RentalRenovacoesHistorico: React.FC<Props> = ({ organizationId, negociacoesDoEmpreendimento, nomeDoCliente, onOpenContract, onEditRenewal, onMudou }) => {
    const [todos, setTodos] = useState<RegistroDeRenovacao[]>([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [vendo, setVendo] = useState<RegistroDeRenovacao | null>(null);
    const [desfazendo, setDesfazendo] = useState<string | null>(null);
    const confirm = useConfirm();
    const registros = useMemo(() => filaDoEmpreendimento(todos, negociacoesDoEmpreendimento), [todos, negociacoesDoEmpreendimento]);

    const carregar = useCallback(async () => {
        setLoading(true);
        setErro(null);
        try {
            setTodos(await contractRenewalService.historicoGeral(organizationId ?? null));
        } catch (e) {
            setErro(`Não foi possível carregar o histórico: ${e instanceof Error ? e.message : 'erro desconhecido'}`);
        } finally {
            setLoading(false);
        }
    }, [organizationId]);

    useEffect(() => { carregar(); }, [carregar]);

    // Sobre TODAS as renovações lidas (não só as do empreendimento): "a última do
    // contrato" não pode depender do recorte da tela.
    const aditivosPorContrato = useMemo(() => {
        const m = new Map<string, NonNullable<RegistroDeRenovacao['aditivo']>[]>();
        todos.forEach(r => { if (r.aditivo) m.set(r.contract_id, [...(m.get(r.contract_id) ?? []), r.aditivo]); });
        return m;
    }, [todos]);
    // Contrato renovado por contrato novo: o que veio antes dele não se mexe mais.
    const renovadosPorContratoNovo = useMemo(
        () => new Map(todos.filter(r => r.via === 'CONTRATO' && !cancelado(r)).map(r => [r.contract_id, r.numero])),
        [todos],
    );

    /** Por que Editar/Excluir estão desligados — null = ligados. */
    const motivoDe = (r: RegistroDeRenovacao, acao: 'editar' | 'excluir'): string | null => {
        if (desfazendo) return 'Aguarde: a operação anterior ainda está sendo gravada.';
        if (r.via === 'CONTRATO') {
            if (acao === 'editar') return 'Renovação por contrato novo não se edita — exclua e renove de novo.';
            if (r.filhoTemRenovacao) return `O contrato ${r.numero} já foi renovado: só a última renovação pode ser excluída.`;
            return null;
        }
        const filho = renovadosPorContratoNovo.get(r.contract_id);
        if (filho) return `O contrato foi renovado depois pelo ${filho}: só a última renovação pode ser alterada.`;
        if (!cancelado(r) && r.contrato.status && !['Ativo', 'Assinado'].includes(r.contrato.status)) {
            return `O contrato ${r.contrato.number} está "${r.contrato.status}": reabra-o antes.`;
        }
        return r.aditivo ? motivoParaNaoEditarAditivo(r.aditivo, aditivosPorContrato.get(r.contract_id) ?? []) : 'Aditivo não encontrado.';
    };

    const excluir = async (r: RegistroDeRenovacao) => {
        const ok = await confirm({
            title: `Excluir a renovação ${r.numero} do contrato ${r.contrato.number}?`,
            message: r.via === 'ADITIVO'
                ? `A vigência volta para ${fmtDate(r.fimAnterior)} e as parcelas do período prorrogado são apagadas. A linha fica no histórico, como cancelada. Se alguma parcela já tiver sido paga ou conciliada, ou se houver reajuste aplicado depois, a operação é recusada.`
                : `O contrato ${r.numero} é excluído com as parcelas dele, e o ${r.contrato.number} volta a ficar Ativo com as parcelas restauradas. Se alguma parcela do contrato novo já tiver sido paga, a operação é recusada.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        setDesfazendo(r.id);
        try {
            if (r.via === 'ADITIVO') await contractRenewalService.undoAddendumRenewal(r.id);
            else await contractRenewalService.undoRenewal(r.filhoId!);
            await carregar();
            onMudou(`Renovação ${r.numero} do contrato ${r.contrato.number} excluída.`);
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Erro ao excluir a renovação.');
        } finally {
            setDesfazendo(null);
        }
    };

    return (
        <div className="space-y-4">
            {erro && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 rounded-[10px] p-4 text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{erro} <button type="button" onClick={carregar} className="font-medium underline">Recarregar</button></span>
                </div>
            )}
            <StandardTable<RegistroDeRenovacao>
                storageKey="rentals:renovacoes:historico"
                columns={COLUMNS}
                rows={registros}
                rowKey={r => r.id}
                rowLabel={r => `Renovação ${r.numero} do contrato ${r.contrato.number}`}
                loading={loading}
                searchText={r => `${r.contrato.number} ${r.contrato.title ?? ''} ${nomeDoCliente(r.contrato.client_id)} ${r.numero} ${ROTULO_VIA[r.via]} ${r.status} ${r.criado_por ?? ''} ${r.cancelado_por ?? ''}`}
                searchPlaceholder="Buscar por contrato, locatário, aditivo ou quem fez..."
                defaultSort={{ column: 'quando', direction: 'desc' }}
                sortValue={(key, r) => {
                    switch (key) {
                        case 'number': return r.contrato.number;
                        case 'client': return nomeDoCliente(r.contrato.client_id);
                        case 'renovacao': return r.numero;
                        case 'periodo': return r.inicio ?? '';
                        case 'aluguel': return Number(r.valor ?? 0);
                        case 'parcelas': return r.parcelas ?? -1;
                        case 'situacao': return r.status;
                        case 'quem': return r.criado_por ?? '';
                        case 'quando': return r.criado_em;
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
                        case 'renovacao': return <span className="block truncate text-sm font-normal text-gray-700" title={r.descricao ?? undefined}>{r.numero} · {ROTULO_VIA[r.via]}</span>;
                        case 'periodo': return <span className="text-sm font-normal text-gray-600 whitespace-nowrap">{fmtDate(r.inicio)} a {fmtDate(r.fim)}</span>;
                        case 'aluguel': return (
                            <span className="text-sm font-medium text-gray-800 whitespace-nowrap">
                                {r.valorAnterior != null && r.valor != null && Math.abs(r.valorAnterior - r.valor) >= 0.01
                                    ? `${fmtCur(r.valorAnterior)} → ${fmtCur(r.valor)}` : fmtCur(r.valor)}
                            </span>
                        );
                        case 'parcelas': return <span className="text-sm font-normal text-gray-700">{r.parcelas ?? '—'}</span>;
                        case 'situacao': return cancelado(r) ? (
                            <span
                                className="block truncate text-sm font-normal text-red-600"
                                title={r.cancelado_em ? `Cancelado por ${r.cancelado_por ?? '—'} em ${fmtDataHora(r.cancelado_em)}` : 'Cancelado antes de o sistema registrar quem e quando (o registro começou em 25/11/2026).'}
                            >
                                Cancelado
                            </span>
                        ) : (
                            <span className={`text-sm font-normal ${r.status === 'Aprovado' || r.status === 'Ativo' ? 'text-emerald-700' : 'text-amber-800'}`}>{r.status}</span>
                        );
                        case 'quem': return <span className="block truncate text-sm font-normal text-gray-600" title={r.criado_por ?? 'Não registrado (o registro começou em 25/11/2026)'}>{r.criado_por ?? '—'}</span>;
                        case 'quando': return <span className="text-sm font-normal text-gray-600">{fmtDataHora(r.criado_em)}</span>;
                        default: return null;
                    }
                }}
                actions={{
                    width: 120,
                    render: r => {
                        const motivoEditar = motivoDe(r, 'editar') ?? (onEditRenewal ? null : 'Abra a negociação para editar.');
                        const motivoExcluir = motivoDe(r, 'excluir');
                        return (
                            <div className="flex items-center justify-end gap-1">
                                <ActionIconButton kind="view" title="Ver a renovação" onClick={() => setVendo(r)} />
                                {/* Desligado: o title vai no span — o botão desligado não recebe hover. */}
                                <span className="inline-flex" title={motivoEditar ?? undefined}>
                                    <ActionIconButton
                                        kind="edit"
                                        title={motivoEditar ?? `Editar o ${r.numero}`}
                                        disabled={!!motivoEditar}
                                        onClick={() => onEditRenewal?.(r.contract_id, r.id)}
                                    />
                                </span>
                                <span className="inline-flex" title={motivoExcluir ?? undefined}>
                                    <ActionIconButton
                                        kind="delete"
                                        title={motivoExcluir ?? `Excluir a renovação ${r.numero}`}
                                        disabled={!!motivoExcluir}
                                        onClick={() => excluir(r)}
                                    />
                                </span>
                            </div>
                        );
                    },
                }}
                empty={{
                    icon: <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: 'Nenhuma renovação',
                    subtitle: negociacoesDoEmpreendimento
                        ? 'Nenhuma renovação nas locações deste empreendimento.'
                        : 'As renovações feitas pela negociação (Contrato › Renovações) aparecem aqui.',
                }}
            />

            <RenovacaoRegistroSheet
                registro={vendo}
                nomeDoCliente={nomeDoCliente}
                onClose={() => setVendo(null)}
                onOpenContract={onOpenContract ? id => { setVendo(null); onOpenContract(id); } : undefined}
            />
        </div>
    );
};

export default RentalRenovacoesHistorico;
