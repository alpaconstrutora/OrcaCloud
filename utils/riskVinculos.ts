/**
 * Módulo Riscos — Fase 2 (F2.2): o objeto de outro módulo que pode ser vinculado a um risco,
 * e o rótulo GRAVADO no vínculo (`risk_links.external_label`, "rótulo do momento").
 * Plano: docs/planos/2026-11-13-modulo-riscos.md.
 *
 * O rótulo é gravado porque o objeto de origem pode mudar de nome ou sumir: o histórico
 * do risco continua legível ("Contrato 012 · Locação de grua"). O id gravado é o do
 * sistema de origem (CA10) — o rótulo é só leitura.
 */
import type { RiskModuloVinculo } from '../types/risk';

/** Um objeto oferecido no seletor "Vincular" da ficha. */
export interface ObjetoVinculavel {
    modulo: RiskModuloVinculo;
    /** Id no sistema de origem (CA10). Cronograma: id da linha do orçamento/cronograma. */
    id: string;
    /** Rótulo gravado no vínculo. */
    rotulo: string;
    /** Situação na origem, como a origem a mostra (status do contrato, do pedido…). */
    situacao: string | null;
    /** A data que importa para o sinal (fim do contrato, entrega, prazo, validade, fim da tarefa). */
    data: string | null;
    /** `external_ref` gravado. Cronograma: `{ planningProjectId }`. */
    ref?: Record<string, unknown>;
}

/** Nome da coluna de data no seletor, por módulo. */
export const ROTULO_DATA_DO_MODULO: Record<RiskModuloVinculo, string> = {
    contrato: 'Fim do contrato',
    pedido_compra: 'Entrega prevista',
    nao_conformidade: 'Prazo',
    documento: 'Validade',
    cronograma: 'Término',
};

const limpo = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const corta = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function rotuloContrato(c: { number: string | null; title: string | null }): string {
    const numero = limpo(c.number);
    const titulo = limpo(c.title);
    return `Contrato ${numero || 'sem número'}${titulo ? ` · ${corta(titulo, 90)}` : ''}`;
}

export function rotuloPedido(p: { number: string | null }): string {
    return `Pedido ${limpo(p.number) || 'sem número'}`;
}

export function rotuloNaoConformidade(nc: { description: string | null; work_order?: { code: string | null; title: string | null } | null }): string {
    const os = limpo(nc.work_order?.code) || limpo(nc.work_order?.title);
    return `NC${os ? ` ${corta(os, 40)}` : ''} · ${corta(limpo(nc.description) || 'sem descrição', 90)}`;
}

export function rotuloDocumento(d: { nome: string | null }): string {
    return `Documento · ${corta(limpo(d.nome) || 'sem nome', 100)}`;
}

export function rotuloTarefa(descricao: string | null | undefined): string {
    return `Tarefa · ${corta(limpo(descricao) || 'sem descrição', 100)}`;
}

/** Severidade da NC como a tela de Ordens de Serviço chama. */
export const ROTULO_SEVERIDADE_NC: Record<string, string> = { minor: 'Leve', moderate: 'Moderada', major: 'Grave' };
export const ROTULO_STATUS_NC: Record<string, string> = { open: 'Aberta', in_treatment: 'Em tratamento', closed: 'Encerrada' };

/** O erro do UNIQUE (risco, módulo, id) — vincular o mesmo objeto duas vezes. */
export function ehVinculoDuplicado(e: unknown): boolean {
    const o = e as { code?: string; message?: string } | null;
    return o?.code === '23505' || /risk_links_unico/.test(o?.message ?? '');
}

export const MENSAGEM_VINCULO_DUPLICADO = 'Este objeto já está vinculado a este risco.';
