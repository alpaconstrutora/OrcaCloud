/**
 * Webhooks da Planta Inteligente (20/09/2026, E9.3).
 *
 * `blueprint_webhooks` é configuração da organização (RLS por membro: criar,
 * editar, apagar direto). `blueprint_webhook_entregas` é a fila/log: o app só
 * LÊ; testar e reenviar passam pelas RPCs, que conferem o membro e cutucam o
 * despachante (`planta-webhooks`).
 */
import { supabase } from '../lib/supabase';
import type { EventoDeWebhook, StatusDaEntrega } from '../supabase/functions/planta-webhooks/politica';

export interface Webhook {
  id: string;
  organizationId: string;
  nome: string;
  url: string;
  segredo: string;
  eventos: EventoDeWebhook[];
  active: boolean;
  createdAt: string;
  ultimaEntregaAt: string | null;
  ultimoStatus: number | null;
}

export interface EntregaDeWebhook {
  id: string;
  webhookId: string;
  evento: EventoDeWebhook;
  payload: Record<string, unknown>;
  status: StatusDaEntrega;
  tentativas: number;
  httpStatus: number | null;
  erro: string | null;
  proximaTentativaAt: string;
  createdAt: string;
  entregueAt: string | null;
}

export interface NovoWebhook {
  nome: string;
  url: string;
  eventos: EventoDeWebhook[];
  active?: boolean;
}

const COLS = 'id, organization_id, nome, url, segredo, eventos, active, created_at, ultima_entrega_at, ultimo_status';
const COLS_ENTREGA = 'id, webhook_id, evento, payload, status, tentativas, http_status, erro, proxima_tentativa_at, created_at, entregue_at';

function fail(op: string, e: { message: string }): never {
  throw new Error(`blueprintWebhook/${op}: ${e.message}`);
}

function mapear(r: Record<string, unknown>): Webhook {
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    nome: String(r.nome),
    url: String(r.url),
    segredo: String(r.segredo),
    eventos: (Array.isArray(r.eventos) ? r.eventos : []) as EventoDeWebhook[],
    active: Boolean(r.active),
    createdAt: String(r.created_at),
    ultimaEntregaAt: (r.ultima_entrega_at as string | null) ?? null,
    ultimoStatus: r.ultimo_status == null ? null : Number(r.ultimo_status),
  };
}

function mapearEntrega(r: Record<string, unknown>): EntregaDeWebhook {
  return {
    id: String(r.id),
    webhookId: String(r.webhook_id),
    evento: String(r.evento) as EventoDeWebhook,
    payload: (r.payload && typeof r.payload === 'object' ? r.payload : {}) as Record<string, unknown>,
    status: String(r.status) as StatusDaEntrega,
    tentativas: Number(r.tentativas ?? 0),
    httpStatus: r.http_status == null ? null : Number(r.http_status),
    erro: (r.erro as string | null) ?? null,
    proximaTentativaAt: String(r.proxima_tentativa_at),
    createdAt: String(r.created_at),
    entregueAt: (r.entregue_at as string | null) ?? null,
  };
}

export const blueprintWebhookService = {
  /** `organizationId` nulo (topo em "Todas") = de todas as organizações do usuário; a RLS filtra. */
  async list(organizationId: string | null): Promise<Webhook[]> {
    let q = supabase.from('blueprint_webhooks').select(COLS).order('created_at', { ascending: false });
    if (organizationId) q = q.eq('organization_id', organizationId);
    const { data, error } = await q;
    if (error) fail('list', error);
    return (data ?? []).map((r) => mapear(r as Record<string, unknown>));
  },

  async create(organizationId: string, w: NovoWebhook): Promise<Webhook> {
    const { data, error } = await supabase
      .from('blueprint_webhooks')
      .insert({ organization_id: organizationId, nome: w.nome.trim(), url: w.url.trim(), eventos: w.eventos, active: w.active ?? true })
      .select(COLS)
      .single();
    if (error) fail('create', error);
    return mapear(data as Record<string, unknown>);
  },

  async update(id: string, w: Partial<NovoWebhook>): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (w.nome !== undefined) patch.nome = w.nome.trim();
    if (w.url !== undefined) patch.url = w.url.trim();
    if (w.eventos !== undefined) patch.eventos = w.eventos;
    if (w.active !== undefined) patch.active = w.active;
    const { error } = await supabase.from('blueprint_webhooks').update(patch).eq('id', id);
    if (error) fail('update', error);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('blueprint_webhooks').delete().eq('id', id);
    if (error) fail('remove', error);
  },

  /** As últimas entregas (todas as dos webhooks visíveis, ou de um só). */
  async listEntregas(webhookId: string | null, limite = 50): Promise<EntregaDeWebhook[]> {
    let q = supabase.from('blueprint_webhook_entregas').select(COLS_ENTREGA).order('created_at', { ascending: false }).limit(limite);
    if (webhookId) q = q.eq('webhook_id', webhookId);
    const { data, error } = await q;
    if (error) fail('listEntregas', error);
    return (data ?? []).map((r) => mapearEntrega(r as Record<string, unknown>));
  },

  /** Enfileira um `teste.ping` e cutuca o despachante. Devolve o id da entrega. */
  async testar(webhookId: string): Promise<string> {
    const { data, error } = await supabase.rpc('blueprint_webhook_testar', { p_webhook_id: webhookId });
    if (error) fail('testar', error);
    return String(data);
  },

  async reenviar(entregaId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('blueprint_webhook_reenviar', { p_entrega_id: entregaId });
    if (error) fail('reenviar', error);
    return Boolean(data);
  },
};
