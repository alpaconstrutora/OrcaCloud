import React from 'react';
import { ShoppingCart, FileSignature, Package, Wallet, CheckCircle, Clock, Link2, Unlink } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import KpiCard from '../ui/KpiCard';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import type { ConsolidadoSuprimentos, LinhaSuprimentos } from '../../utils/warrantySuprimentos';
import { corDoStatus } from '../../utils/warrantySuprimentos';

/**
 * Pós-Obra & Garantia › chamado › aba Suprimentos (2026-10-11).
 * Plano: docs/planos/2026-10-11-pos-obra-garantia-conexao-suprimentos.md (1.7 / 2.3).
 *
 * Mostra o que o chamado gerou em Suprimentos (solicitações, pedidos,
 * contratos) e os três totais. As ações (gerar SC, novo contrato) moram aqui;
 * quem as executa é o detalhe do chamado, que conhece o chamado inteiro.
 */
interface Props {
    dados: ConsolidadoSuprimentos | null;
    carregando: boolean;
    erro: string | null;
    /** Motivo para não comprar/contratar — null = liberado. Mesmo motivo para os dois botões. */
    motivo: string | null;
    onGerarSolicitacao: () => void;
    onNovoContrato: () => void;
    onAbrir: (linha: LinhaSuprimentos) => void;
    /** Abre o drawer "Vincular existente" (SC/contrato já criados). */
    onVincular: () => void;
    /** Tira o vínculo de uma SC/contrato — pedido não se desvincula (segue a SC). */
    onDesvincular: (linha: LinhaSuprimentos) => void;
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const TIPO_LABEL: Record<LinhaSuprimentos['tipo'], string> = {
    solicitacao: 'Solicitação de compra',
    pedido: 'Pedido de compra',
    contrato: 'Contrato',
};

const COLUNAS: StandardTableColumn[] = [
    { key: 'tipo', label: 'Tipo', sortable: true, width: 170 },
    { key: 'numero', label: 'Número', sortable: true, width: 150 },
    { key: 'descricao', label: 'Descrição', sortable: true, width: 260 },
    { key: 'fornecedor', label: 'Fornecedor', sortable: true, width: 190 },
    { key: 'status', label: 'Status', sortable: true, width: 130 },
    { key: 'valor', label: 'Valor', sortable: true, width: 130, align: 'right' },
    { key: 'data', label: 'Data', sortable: true, width: 110 },
];

const BTN_PRIMARY = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';
const BTN_SECONDARY_OUTLINE = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';

const WarrantySuprimentosTab: React.FC<Props> = ({
    dados, carregando, erro, motivo, onGerarSolicitacao, onNovoContrato, onAbrir, onVincular, onDesvincular,
}) => {
    const linhas = dados?.linhas ?? [];
    return (
        <div className="space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <p className="text-sm text-gray-500">
                    Material e serviço que a execução deste chamado precisa — o ciclo de compra continua em Suprimentos.
                </p>
                <div className="flex items-center gap-2 shrink-0">
                    <button onClick={onVincular} disabled={!!motivo} title={motivo ?? 'SC ou contrato que já existe em Suprimentos'} className={BTN_SECONDARY_OUTLINE}>
                        <Link2 className="w-[15px] h-[15px]" />
                        Vincular existente
                    </button>
                    <button onClick={onNovoContrato} disabled={!!motivo} title={motivo ?? undefined} className={BTN_SECONDARY_OUTLINE}>
                        <FileSignature className="w-[15px] h-[15px]" />
                        Novo contrato
                    </button>
                    <button onClick={onGerarSolicitacao} disabled={!!motivo} title={motivo ?? undefined} className={BTN_PRIMARY}>
                        <ShoppingCart className="w-[15px] h-[15px]" />
                        Gerar solicitação de compra
                    </button>
                </div>
            </div>
            {motivo && <p className="text-xs text-amber-600 text-right">{motivo}</p>}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <KpiCard label="Previsto" value={brl(dados?.previsto ?? 0)} sub="Solicitações sem pedido, pedidos em rascunho e contratos não assinados" icon={<Clock className="w-4 h-4" />} color="gray" />
                <KpiCard label="Comprometido" value={brl(dados?.comprometido ?? 0)} sub="Pedidos enviados e contratos assinados" icon={<Wallet className="w-4 h-4" />} color="amber" />
                <KpiCard label="Realizado" value={brl(dados?.realizado ?? 0)} sub="Pedidos entregues e medições processadas" icon={<CheckCircle className="w-4 h-4" />} color="emerald" />
            </div>

            {erro && <p className="text-sm text-red-600" role="alert">{erro}</p>}

            <StandardTable<LinhaSuprimentos>
                storageKey="garantia:chamado:suprimentos"
                columns={COLUNAS}
                rows={linhas}
                rowKey={l => `${l.tipo}:${l.id}`}
                loading={carregando}
                onRowClick={onAbrir}
                actions={{
                    width: 90,
                    render: l => l.tipo === 'pedido'
                        ? <span className="text-xs text-gray-400" title="O pedido segue a solicitação de compra que o gerou">via SC</span>
                        : (
                            <ActionIconButton
                                kind="unlock"
                                title="Desvincular do chamado (continua em Suprimentos)"
                                icon={<Unlink className="w-4 h-4" />}
                                onClick={e => { e.stopPropagation(); onDesvincular(l); }}
                            />
                        ),
                }}
                sortValue={(key, l) => key === 'valor' ? l.valor : key === 'tipo' ? TIPO_LABEL[l.tipo] : (l[key as keyof LinhaSuprimentos] as string | null) ?? ''}
                renderCell={(key, l) => {
                    switch (key) {
                        case 'tipo':
                            return <span className="text-sm font-normal text-gray-700">{TIPO_LABEL[l.tipo]}</span>;
                        case 'numero':
                            return <span className="text-sm font-normal text-blue-600">{l.numero}</span>;
                        case 'descricao':
                            return <span className="block truncate text-sm font-normal text-gray-700" title={l.descricao}>{l.descricao}</span>;
                        case 'fornecedor':
                            return <span className="block truncate text-sm font-normal text-gray-700" title={l.fornecedor ?? undefined}>{l.fornecedor ?? '—'}</span>;
                        case 'status':
                            return <span className={`text-sm font-normal ${corDoStatus(l)}`}>{l.status}</span>;
                        case 'valor':
                            return <span className="text-sm font-medium text-gray-800">{brl(l.valor)}</span>;
                        case 'data':
                            return <span className="text-sm font-normal text-gray-600">{l.data ? new Date(l.data.length <= 10 ? `${l.data}T12:00:00` : l.data).toLocaleDateString('pt-BR') : '—'}</span>;
                    }
                    return null;
                }}
                empty={{
                    icon: <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: 'Nada em Suprimentos ainda',
                    subtitle: 'Gere uma solicitação de compra (material ou serviço) ou um contrato a partir deste chamado.',
                }}
            />
        </div>
    );
};

export default WarrantySuprimentosTab;
