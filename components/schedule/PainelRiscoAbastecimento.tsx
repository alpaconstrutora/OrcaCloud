import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from '../ui/sheet';
import StandardTable, { StandardTableColumn } from '../ui/StandardTable';
import { formatMoney } from '../ui/Format';
import type { HierarchyNode } from '../../types';

/**
 * Engenharia › Planejamento — etapas em risco de abastecimento, em painel lateral.
 *
 * Era um banner entre o ribbon e a grade, sem como ocultar (pedido de 10/10/2026:
 * *"o banner de alerta nao deve ficar ocupando espaco vertical. e o pior e que nao
 * é possivel ocultar"*). Virou o §5.3 do guia — aviso que é estado normal da tela
 * vira ícone com contador na linha de cima, e o clique abre o painel: o ícone mora
 * no ribbon (`ScheduleHeader`, slot `direita`) e a lista que o banner expandia mora
 * aqui.
 *
 * Os números são os mesmos de antes, calculados em `FinancialSchedule.tsx`
 * (`taskInsights`/`insightSummary`) — este painel só mostra.
 */

export interface RiscoDeAbastecimento {
    /** Nós da EAP com alerta (grupo, etapa ou tarefa — `taskInsights` é recursivo). */
    etapas: number;
    /** Tarefas-folha distintas com insumo sem pedido de compra aprovado. */
    insumos: number;
    custo: number;
}

type Insight = { missingItems: number; missingCost: number };

interface Linha {
    id: string;
    item: string;
    etapa: string;
    insumos: number;
    custo: number;
}

// Soma 572px: cabe nos ~624px úteis do Sheet 2xl (672 − p-6), sem rolagem lateral.
// "Insumos" e não "Insumos sem pedido": o subtítulo do painel já diz o que contam,
// e o rótulo longo quebrava em duas linhas no cabeçalho.
const COLUMNS: StandardTableColumn[] = [
    { key: 'item', label: 'Item', sortable: true, width: 72 },
    { key: 'etapa', label: 'Etapa', sortable: true, width: 240 },
    { key: 'insumos', label: 'Insumos', sortable: true, width: 110, align: 'right' },
    { key: 'custo', label: 'Custo estimado', sortable: true, width: 150, align: 'right' },
];

export function rotuloDoRisco(r: RiscoDeAbastecimento): string {
    return `${r.etapas} ${r.etapas === 1 ? 'etapa em risco' : 'etapas em risco'} de abastecimento · ${r.insumos} ${r.insumos === 1 ? 'insumo' : 'insumos'} sem pedido de compra · custo estimado ${formatMoney(r.custo)}`;
}

interface Props {
    open: boolean;
    onClose: () => void;
    resumo: RiscoDeAbastecimento;
    taskInsights: Record<string, Insight>;
    hierarchy: HierarchyNode[];
}

export default function PainelRiscoAbastecimento({ open, onClose, resumo, taskInsights, hierarchy }: Props) {
    const linhas = React.useMemo<Linha[]>(() => {
        if (!open) return [];
        // Um passeio só pela EAP — o banner procurava o nome nó a nó, para cada alerta.
        const nos = new Map<string, HierarchyNode>();
        const walk = (ns: HierarchyNode[]) => ns.forEach((n) => { nos.set(n.id, n); if (n.children) walk(n.children); });
        walk(hierarchy);
        return Object.entries(taskInsights).map(([id, insight]) => {
            const no = nos.get(id);
            return {
                id,
                item: no?.wbsCode ?? '',
                etapa: no?.name || no?.data?.sinapiItem?.description || id,
                insumos: insight.missingItems,
                custo: insight.missingCost,
            };
        });
    }, [open, taskInsights, hierarchy]);

    // Fechado, não fica no DOM: o `Sheet` mantém os filhos montados.
    if (!open) return null;

    return (
        // zIndex 150, não o 50 padrão: o Sheet não sai por portal, e o cabeçalho
        // fixo do Gantt (ScheduleGantt.tsx: `sticky z-50`, coluna fixa `z-60`,
        // popovers `z-[100]`) vem DEPOIS no DOM — com 50 ele pintava por cima do
        // painel (print do usuário, 10/10/2026). Abaixo do confirm (`z-[200]`) e
        // dos modais desta tela (`z-[200]`/`z-[210]`).
        <Sheet open={open} onClose={onClose} size="2xl" zIndex={150}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Etapas em risco de abastecimento</SheetTitle>
                <SheetDescription>
                    {resumo.insumos} {resumo.insumos === 1 ? 'insumo' : 'insumos'} sem pedido de compra aprovado, em tarefas que começam entre 30 dias atrás e daqui a 30 dias — custo estimado {formatMoney(resumo.custo)}.
                </SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-6">
                <StandardTable<Linha>
                    storageKey="planejamento:risco-abastecimento"
                    columns={COLUMNS}
                    rows={linhas}
                    rowKey={(l) => l.id}
                    dense
                    searchText={(l) => `${l.item} ${l.etapa}`}
                    searchPlaceholder="Buscar por item ou etapa..."
                    sortValue={(k, l) => (k === 'insumos' ? l.insumos : k === 'custo' ? l.custo : k === 'item' ? l.item : l.etapa)}
                    renderCell={(k, l) => {
                        if (k === 'custo') return <span className="text-sm font-medium text-gray-800">{formatMoney(l.custo)}</span>;
                        if (k === 'insumos') return <span className="text-sm font-normal text-gray-600">{l.insumos}</span>;
                        if (k === 'item') return <span className="text-sm font-normal text-gray-600">{l.item || '—'}</span>;
                        // Texto livre em drawer QUEBRA, não trunca (nome cortado lê como coluna cortada).
                        return <span className="block break-words text-sm font-normal text-gray-700">{l.etapa}</span>;
                    }}
                    empty={{
                        icon: <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                        title: 'Nenhuma etapa em risco',
                    }}
                />
            </SheetPanel>
        </Sheet>
    );
}
