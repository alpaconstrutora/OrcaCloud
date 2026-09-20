/**
 * Webhooks (20/09/2026, E9.3) — a política pura compartilhada com a Edge
 * Function `planta-webhooks`: eventos, validação da assinatura (URL https
 * pública, nome, ≥ 1 evento), retentativa (1 min, 5 min, 30 min, 2 h, 12 h,
 * depois desiste) e a assinatura HMAC-SHA256 do corpo (a mesma conta que o
 * receptor faz para conferir `X-Opura-Signature`).
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { assinar, assinaturaConfere, esperaAposFalha, EVENTOS_ASSINAVEIS, EVENTOS_DE_WEBHOOK, exemploDeReceptor, MAX_TENTATIVAS, ROTULO_DO_EVENTO, validarUrlDeWebhook, validarWebhook } from '../supabase/functions/planta-webhooks/politica';

describe('webhooks (E9.3) · política', () => {
  it('eventos: 4 assináveis + teste.ping; todos com rótulo', () => {
    expect(EVENTOS_ASSINAVEIS).toEqual(['versao.publicada', 'versao.aprovada', 'comentario.criado', 'alternativa.principal']);
    expect(EVENTOS_DE_WEBHOOK).toContain('teste.ping');
    for (const e of EVENTOS_DE_WEBHOOK) expect(ROTULO_DO_EVENTO[e]).toBeTruthy();
  });

  it('URL: só https pública; sem credenciais; localhost, .local e faixas privadas são recusados', () => {
    expect(validarUrlDeWebhook('https://erp.exemplo.com.br/opura')).toBeNull();
    expect(validarUrlDeWebhook('http://erp.exemplo.com.br/opura')).toMatch(/https/);
    expect(validarUrlDeWebhook('https://user:pass@erp.exemplo.com.br/')).toMatch(/usuário e senha/);
    expect(validarUrlDeWebhook('https://localhost:3000/x')).toMatch(/pública/);
    expect(validarUrlDeWebhook('https://10.0.0.5/x')).toMatch(/pública/);
    expect(validarUrlDeWebhook('https://172.20.1.1/x')).toMatch(/pública/);
    expect(validarUrlDeWebhook('https://172.32.1.1/x')).toBeNull(); // fora da faixa 172.16–31
    expect(validarUrlDeWebhook('https://192.168.0.10/x')).toMatch(/pública/);
    expect(validarUrlDeWebhook('https://servidor.local/x')).toMatch(/pública/);
    expect(validarUrlDeWebhook('não é url')).toBe('URL inválida');
  });

  it('validarWebhook junta os erros: nome, URL e pelo menos um evento conhecido', () => {
    expect(validarWebhook({ nome: '', url: 'ftp://x', eventos: [] })).toEqual(['nome é obrigatório', 'a URL tem de ser https', 'marque pelo menos um evento']);
    expect(validarWebhook({ nome: 'ERP', url: 'https://erp.exemplo.com/h', eventos: ['inventado'] })).toEqual(['marque pelo menos um evento']);
    expect(validarWebhook({ nome: 'ERP', url: 'https://erp.exemplo.com/h', eventos: ['versao.publicada'] })).toEqual([]);
    expect(validarWebhook({ nome: 'x'.repeat(81), url: 'https://erp.exemplo.com/h', eventos: ['versao.aprovada'] })).toEqual(['nome maior que 80 caracteres']);
  });

  it('retentativa: 1 min, 5 min, 30 min, 2 h, 12 h; na 6ª falha desiste', () => {
    expect([1, 2, 3, 4, 5].map(esperaAposFalha)).toEqual([60, 300, 1800, 7200, 43200]);
    expect(esperaAposFalha(6)).toBeNull();
    expect(esperaAposFalha(9)).toBeNull();
    expect(MAX_TENTATIVAS).toBe(6);
  });

  it('assinatura: HMAC-SHA256 do corpo, hex, prefixo sha256= — bate com o node:crypto do receptor; conferência em tempo constante recusa o que difere', async () => {
    const corpo = JSON.stringify({ id: 'e1', evento: 'versao.publicada', dados: { revisao: 3 } });
    const segredo = 'a'.repeat(48);
    const assinatura = await assinar(segredo, corpo);
    expect(assinatura).toBe('sha256=' + createHmac('sha256', segredo).update(corpo).digest('hex'));
    expect(await assinaturaConfere(segredo, corpo, assinatura)).toBe(true);
    expect(await assinaturaConfere(segredo, corpo + ' ', assinatura)).toBe(false);
    expect(await assinaturaConfere('b'.repeat(48), corpo, assinatura)).toBe(false);
    expect(await assinaturaConfere(segredo, corpo, null)).toBe(false);
    expect(await assinaturaConfere(segredo, corpo, 'sha256=00')).toBe(false);
    expect(exemploDeReceptor()).toMatch(/X-Opura-Signature/);
    expect(exemploDeReceptor()).toMatch(/timingSafeEqual/);
  });
});
