/**
 * Pós-Obra & Garantia ↔ Suprimentos — o que o chamado já gerou em compras.
 *
 * Plano: docs/planos/2026-10-11-pos-obra-garantia-conexao-suprimentos.md (Fases 1–2).
 *
 * Pura (sem Supabase): o serviço carrega SCs, pedidos e contratos ligados ao
 * chamado e esta função consolida em três números e uma lista.
 *
 *   Previsto     = o que ainda não virou compromisso: itens de SC ativa sem
 *                  pedido (preço estimado), pedidos em Rascunho e contratos
 *                  ainda não assinados;
 *   Comprometido = pedidos enviados em diante (≠ Rascunho/Cancelado) e
 *                  contratos assinados/ativos/concluídos;
 *   Realizado    = parte do comprometido já entregue/medida: pedidos
 *                  Entregue/Recebido/Divergência e medições Processada/Paga.
 *
 * Valor do pedido = `totalEfetivoDoPedido` (cotado quando há, senão referência)
 * — trava `pedidoValorCotacaoTrava.test.ts`.
 */
import { totalEfetivoDoPedido, type ItemComPrecos } from './pedidoItemValor';
import { STATUS_LABEL, itemAtivo, statusDaSolicitacao } from './solicitacaoCompra';
import type { PurchaseRequest } from '../types/purchaseRequest';
import type { ClaimState } from '../types/warranty';
import { motivoBloqueio } from './warrantyLifecycle';

export interface PedidoDoChamado {
    id: string;
    number?: string | null;
    status: string;
    supplierName?: string | null;
    items?: ItemComPrecos[] | null;
    createdAt?: string | null;
}

export interface ContratoDoChamado {
    id: string;
    number?: string | null;
    title?: string | null;
    status: string;
    currentValue?: number | null;
    supplierName?: string | null;
    startDate?: string | null;
    medicoes?: { totalValue?: number | null; status: string }[];
}

export type TipoLinha = 'solicitacao' | 'pedido' | 'contrato';

export interface LinhaSuprimentos {
    tipo: TipoLinha;
    id: string;
    numero: string;
    descricao: string;
    fornecedor: string | null;
    status: string;
    valor: number;
    data: string | null;
}

export interface ConsolidadoSuprimentos {
    previsto: number;
    comprometido: number;
    realizado: number;
    linhas: LinhaSuprimentos[];
}

const PEDIDO_COMPROMETIDO_EXCLUI = new Set(['Rascunho', 'Cancelado']);
const PEDIDO_REALIZADO = new Set(['Entregue', 'Recebido', 'Divergência']);
const CONTRATO_ASSINADO = new Set(['Assinado', 'Ativo', 'Suspenso', 'Concluído', 'Encerrado']);
const MEDICAO_REALIZADA = new Set(['Processada', 'Paga']);

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Cor de texto do status na tabela (§8 — texto colorido, sem pílula). */
export function corDoStatus(linha: Pick<LinhaSuprimentos, 'tipo' | 'status'>): string {
    const s = linha.status;
    if (/Cancelad|Reprovad/.test(s)) return 'text-red-700';
    if (/Rascunho|Minuta/.test(s)) return 'text-gray-500';
    if (/Recebido|Entregue|Atendida|Concluído|Encerrado/.test(s)) return 'text-green-700';
    if (/Ativo|Assinado|Aprovad/.test(s)) return 'text-teal-700';
    return 'text-blue-700';
}

export function consolidarSuprimentos(
    scs: readonly PurchaseRequest[],
    pedidos: readonly PedidoDoChamado[],
    contratos: readonly ContratoDoChamado[],
): ConsolidadoSuprimentos {
    let previsto = 0, comprometido = 0, realizado = 0;
    const linhas: LinhaSuprimentos[] = [];

    for (const sc of scs) {
        const status = statusDaSolicitacao(sc);
        // Itens ativos ainda sem pedido: o que falta virar compra.
        const semPedido = sc.items
            .filter(i => itemAtivo(i) && !i.purchaseOrderId)
            .reduce((s, i) => s + Number(i.quantity || 0) * Number(i.estimatedUnitPrice || 0), 0);
        if (status !== 'cancelada' && status !== 'reprovada') previsto += semPedido;
        linhas.push({
            tipo: 'solicitacao', id: sc.id, numero: sc.number ?? '—', descricao: sc.title,
            fornecedor: null, status: STATUS_LABEL[status], valor: r2(sc.estimatedTotal || 0),
            data: sc.createdAt ?? null,
        });
    }

    const vistos = new Set<string>();
    for (const p of pedidos) {
        if (vistos.has(p.id)) continue;      // o mesmo pedido pode chegar pelo item e pela cotação
        vistos.add(p.id);
        const valor = totalEfetivoDoPedido(p.items);
        if (p.status === 'Rascunho') previsto += valor;
        else if (!PEDIDO_COMPROMETIDO_EXCLUI.has(p.status)) {
            comprometido += valor;
            if (PEDIDO_REALIZADO.has(p.status)) realizado += valor;
        }
        linhas.push({
            tipo: 'pedido', id: p.id, numero: p.number ?? '—', descricao: 'Pedido de compra',
            fornecedor: p.supplierName ?? null, status: p.status, valor: r2(valor), data: p.createdAt ?? null,
        });
    }

    for (const c of contratos) {
        const valor = Number(c.currentValue || 0);
        if (c.status === 'Cancelado') { /* não conta */ }
        else if (CONTRATO_ASSINADO.has(c.status)) {
            comprometido += valor;
            realizado += (c.medicoes ?? [])
                .filter(m => MEDICAO_REALIZADA.has(m.status))
                .reduce((s, m) => s + Number(m.totalValue || 0), 0);
        } else previsto += valor;
        linhas.push({
            tipo: 'contrato', id: c.id, numero: c.number ?? '—', descricao: c.title ?? 'Contrato',
            fornecedor: c.supplierName ?? null, status: c.status, valor: r2(valor), data: c.startDate ?? null,
        });
    }

    linhas.sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''));
    return { previsto: r2(previsto), comprometido: r2(comprometido), realizado: r2(Math.min(realizado, comprometido)), linhas };
}

/** Custo real sugerido no encerramento: o realizado; nada realizado → sem sugestão. */
export function sugestaoCustoReal(c: Pick<ConsolidadoSuprimentos, 'realizado'>): number | null {
    return c.realizado > 0 ? c.realizado : null;
}

export interface ChamadoParaCompra {
    state: ClaimState;
    in_warranty?: boolean | null;
    project_id?: string | null;
    organization_id: string;
}

/**
 * Por que o chamado não pode gerar Solicitação de Compra / contrato — ou null.
 * A frase diz onde resolver (regra do app: botão desligado sempre diz o motivo).
 *
 * `orgDaObra`: organização da obra do chamado, como o store a conhece; `null`
 * quando a obra não está na lista do usuário.
 */
export function motivoNaoComprar(
    claim: ChamadoParaCompra,
    opts: { podeUsarSuprimentos: boolean; orgDaObra: string | null | undefined },
): string | null {
    if (!opts.podeUsarSuprimentos) {
        return 'Seu perfil não tem acesso a Suprimentos › Compras — peça ao administrador da organização.';
    }
    const ciclo = motivoBloqueio('suprimentos', claim);
    if (ciclo) return ciclo;
    if (!claim.project_id) return 'Informe a obra do chamado (Editar › Obra) — a compra é sempre de uma obra.';
    if (!opts.orgDaObra) return 'A obra deste chamado não está entre as obras que você acessa.';
    if (opts.orgDaObra !== claim.organization_id) {
        return 'A obra deste chamado pertence a outra organização — corrija a obra (Editar › Obra).';
    }
    return null;
}

/** Rascunho da SC com o que o chamado já sabe (regra: não pedir o que o app sabe). */
export function rascunhoDaSolicitacao(claim: {
    id: string;
    project_id?: string | null;
    organization_id: string;
    sistema_descricao: string;
    descricao: string;
    local_afetado?: string | null;
    unidade_ref?: string | null;
    severity: string;
    sla_deadline?: string | null;
    cost_center_id?: string | null;
    plano_de_contas_id?: string | null;
}, hoje: string, orgDaObra: string | null | undefined) {
    const mesmaOrg = orgDaObra === claim.organization_id;
    const titulo = ['Garantia', claim.sistema_descricao, claim.unidade_ref].filter(Boolean).join(' — ');
    const justificativa = [claim.descricao, claim.local_afetado && `Local: ${claim.local_afetado}`]
        .filter(Boolean).join('\n');
    return {
        projectId: claim.project_id ?? '',
        title: titulo.slice(0, 200),
        justification: justificativa,
        priority: (claim.severity === 'alta' || claim.severity === 'critica') ? 'urgente' as const : 'normal' as const,
        needDate: claim.sla_deadline && claim.sla_deadline > hoje ? claim.sla_deadline : '',
        // CC e plano são da organização do chamado: só valem se a obra for da mesma.
        costCenterId: mesmaOrg ? claim.cost_center_id ?? '' : '',
        planoDeContasId: mesmaOrg ? claim.plano_de_contas_id ?? '' : '',
        warrantyClaimId: claim.id,
    };
}
