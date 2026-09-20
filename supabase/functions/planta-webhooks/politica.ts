// supabase/functions/planta-webhooks/politica.ts
//
// WEBHOOKS da Planta Inteligente (20/09/2026, roadmap E9.3) — a parte PURA,
// compartilhada entre a Edge Function (Deno) e o app (vitest/Vite): os
// eventos, a validação de um webhook, a política de retentativa e a
// assinatura HMAC do corpo. Sem import nenhum, para valer nos dois lados.

export const EVENTOS_DE_WEBHOOK = ['versao.publicada', 'versao.aprovada', 'comentario.criado', 'alternativa.principal', 'teste.ping'] as const;
export type EventoDeWebhook = (typeof EVENTOS_DE_WEBHOOK)[number];

/** Os que a pessoa marca; `teste.ping` é só o botão "Testar" e vai para todo webhook. */
export const EVENTOS_ASSINAVEIS: readonly EventoDeWebhook[] = ['versao.publicada', 'versao.aprovada', 'comentario.criado', 'alternativa.principal'];

export const ROTULO_DO_EVENTO: Record<EventoDeWebhook, string> = {
  'versao.publicada': 'Versão publicada',
  'versao.aprovada': 'Versão aprovada',
  'comentario.criado': 'Comentário novo',
  'alternativa.principal': 'Alternativa tornada principal',
  'teste.ping': 'Teste',
};

export const DESCRICAO_DO_EVENTO: Record<EventoDeWebhook, string> = {
  'versao.publicada': 'Uma revisão nova de um estudo foi publicada (estudo, revisão, hash, kernel, ramo).',
  'versao.aprovada': 'Uma revisão publicada recebeu aprovação (estudo, revisão, hash).',
  'comentario.criado': 'Alguém comentou num estudo (estudo, autor, texto, elemento ancorado).',
  'alternativa.principal': 'Uma alternativa (ramo) virou a principal do estudo (estudo, ramo).',
  'teste.ping': 'Disparo manual pelo botão Testar.',
};

export type StatusDaEntrega = 'PENDENTE' | 'ENTREGUE' | 'FALHOU';

/** Tentativas antes de desistir (a primeira + 5 retentativas). */
export const MAX_TENTATIVAS = 6;

/**
 * Espera antes da próxima tentativa, em SEGUNDOS, pela tentativa que acabou de
 * falhar (1 = a primeira). Cresce: 1 min, 5 min, 30 min, 2 h, 12 h; a partir da
 * sexta não há próxima. `null` = desistir.
 */
export function esperaAposFalha(tentativaQueFalhou: number): number | null {
  const tabela = [60, 300, 1800, 7200, 43200];
  if (tentativaQueFalhou >= MAX_TENTATIVAS) return null;
  return tabela[Math.min(tentativaQueFalhou, tabela.length) - 1] ?? null;
}

/** Só https, com host; sem credenciais na URL; sem `localhost`/IP privado (o disparo sai da nuvem, não da máquina da pessoa). */
export function validarUrlDeWebhook(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return 'URL inválida';
  }
  if (u.protocol !== 'https:') return 'a URL tem de ser https';
  if (u.username || u.password) return 'a URL não pode levar usuário e senha';
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host === '::1') {
    return 'a URL tem de ser pública: o disparo sai do servidor, não da sua máquina';
  }
  return null;
}

export function validarWebhook(w: { nome: string; url: string; eventos: readonly string[] }): string[] {
  const erros: string[] = [];
  const nome = w.nome.trim();
  if (!nome) erros.push('nome é obrigatório');
  if (nome.length > 80) erros.push('nome maior que 80 caracteres');
  const erroUrl = validarUrlDeWebhook(w.url);
  if (erroUrl) erros.push(erroUrl);
  if (w.url.length > 2000) erros.push('URL maior que 2000 caracteres');
  const eventos = w.eventos.filter((e) => (EVENTOS_ASSINAVEIS as readonly string[]).includes(e));
  if (eventos.length === 0) erros.push('marque pelo menos um evento');
  return erros;
}

/** O corpo que o destino recebe. `dados` é o payload do evento gravado na fila. */
export interface CorpoDoWebhook {
  id: string;
  evento: EventoDeWebhook;
  criado_em: string;
  tentativa: number;
  organizacao_id: string;
  dados: Record<string, unknown>;
}

const enc = new TextEncoder();

/** HMAC-SHA256 do corpo com o segredo do webhook, em hex, no formato do header `X-Opura-Signature: sha256=<hex>`. WebCrypto: vale em Deno, Node e navegador. */
export async function assinar(segredo: string, corpo: string): Promise<string> {
  const chave = await crypto.subtle.importKey('raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', chave, enc.encode(corpo));
  return 'sha256=' + Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Para quem RECEBE conferir: recalcula e compara em tempo constante. */
export async function assinaturaConfere(segredo: string, corpo: string, header: string | null): Promise<boolean> {
  if (!header) return false;
  const esperado = await assinar(segredo, corpo);
  if (esperado.length !== header.length) return false;
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) diff |= esperado.charCodeAt(i) ^ header.charCodeAt(i);
  return diff === 0;
}

/** Trecho do exemplo de recebimento (Node) mostrado na tela. */
export function exemploDeReceptor(): string {
  return [
    "import { createHmac, timingSafeEqual } from 'node:crypto';",
    '',
    'app.post("/opura", express.raw({ type: "*/*" }), (req, res) => {',
    "  const esperado = 'sha256=' + createHmac('sha256', SEGREDO).update(req.body).digest('hex');",
    "  const recebido = req.get('X-Opura-Signature') ?? '';",
    '  if (esperado.length !== recebido.length || !timingSafeEqual(Buffer.from(esperado), Buffer.from(recebido))) return res.sendStatus(401);',
    '  const { evento, dados } = JSON.parse(req.body.toString());',
    '  // evento: "versao.publicada" · dados.estudo_id, dados.revisao, dados.hash…',
    '  res.sendStatus(204);',
    '});',
  ].join('\n');
}
