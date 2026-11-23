/**
 * Regras puras do envio pelo OpenWA (utils/whatsappOpenwa.ts) — o texto do
 * pedido, o chatId, a chave de idempotência, o status que só avança, a
 * política de retentativa (repetir só com a mesma chave, dentro de 23 h), a
 * assinatura do webhook e o vínculo da resposta ao pedido. As Edge Functions
 * `whatsapp-openwa`, `whatsapp-openwa-worker` e `whatsapp-openwa-webhook`
 * importam este módulo; se a regra mudar aqui, muda nos três.
 */
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
    ESPERAS_MS, JANELA_VINCULO_DIAS, assinaturaConfere, avancarStatus, chatIdDoTelefone,
    classificarEnvio, comandoIdEnvioAutomatico, escolherVinculo, esperaAposFalha,
    idsDeMensagemIguais, montarTextoDoPedido, statusDoAck, telefoneDoRemetente,
} from '../utils/whatsappOpenwa';
import { formatarValorBRL } from '../utils/whatsappPedido';

const HORA = 3600_000;

describe('montarTextoDoPedido', () => {
    const base = {
        empresa: 'Alpa Construtora e Incorporadora', fornecedor: 'X', numero: '42', obra: 'Y',
        quantidadeDeItens: 3, total: 1234.5, dataDeEntrega: '2026-11-20', link: 'https://exemplo/p/abc',
    };

    it('primeira linha diz a empresa e o número; corpo traz fornecedor, obra, itens, total e entrega', () => {
        const texto = montarTextoDoPedido(base);
        const linhas = texto.split('\n');
        expect(linhas[0]).toBe('*Alpa Construtora e Incorporadora* — Pedido de compra nº 42');
        expect(texto).toContain('Fornecedor: X');
        expect(texto).toContain('Obra: Y');
        expect(texto).toContain(`Itens: 3 · Total: ${formatarValorBRL(1234.5)}`);
        // O helper usa espaço não separável depois de "R$" — o que importa é o valor.
        expect(formatarValorBRL(1234.5).replace(/\s/g, ' ')).toBe('R$ 1.234,50');
        expect(texto).toContain('Entrega: 20/11/2026');
        expect(texto.endsWith('Ver o pedido completo: https://exemplo/p/abc')).toBe(true);
    });

    it('sem data de entrega → "A definir"', () => {
        expect(montarTextoDoPedido({ ...base, dataDeEntrega: null })).toContain('Entrega: A definir');
    });
});

describe('chatIdDoTelefone', () => {
    it('telefone vira <E.164>@c.us', () => {
        expect(chatIdDoTelefone('(11) 99999-0000')).toBe('5511999990000@c.us');
    });
    it('sem telefone → vazio', () => {
        expect(chatIdDoTelefone('')).toBe('');
        expect(chatIdDoTelefone(null)).toBe('');
        expect(chatIdDoTelefone(undefined)).toBe('');
        expect(chatIdDoTelefone('sem número')).toBe('');
    });
});

describe('comandoIdEnvioAutomatico', () => {
    it('uma chave por transição para Enviado', () => {
        expect(comandoIdEnvioAutomatico('o1', '2026-11-23T10:00:00Z')).toBe('pedido:o1:enviado:2026-11-23T10:00:00Z');
        expect(comandoIdEnvioAutomatico('o1', '2026-11-23T11:00:00Z'))
            .not.toBe(comandoIdEnvioAutomatico('o1', '2026-11-23T10:00:00Z'));
    });
});

describe('statusDoAck', () => {
    it('mapeia o ack do OpenWA para o status de saída', () => {
        expect(statusDoAck('sent')).toBe('aceita');
        expect(statusDoAck('delivered')).toBe('entregue');
        expect(statusDoAck('read')).toBe('lida');
        expect(statusDoAck('played')).toBe('lida');
        expect(statusDoAck('failed')).toBe('falhou');
        expect(statusDoAck('pending')).toBeNull();
        expect(statusDoAck('qualquer')).toBeNull();
    });
});

describe('avancarStatus', () => {
    it('status só avança; evento atrasado não regride', () => {
        expect(avancarStatus('lida', 'entregue')).toBe('lida');
        expect(avancarStatus('aceita', 'entregue')).toBe('entregue');
        expect(avancarStatus('incerta', 'aceita')).toBe('aceita');
        expect(avancarStatus('falhou', 'entregue')).toBe('entregue');
    });
    it('cancelada é final', () => {
        expect(avancarStatus('cancelada', 'aceita')).toBe('cancelada');
    });
});

describe('classificarEnvio', () => {
    it('2xx → aceita', () => {
        expect(classificarEnvio({ httpStatus: 201, erro: null }, 0)).toBe('aceita');
    });
    it('recusa definitiva do gateway → falhou', () => {
        for (const s of [400, 401, 403, 404, 413, 422, 501]) {
            expect(classificarEnvio({ httpStatus: s, erro: null }, HORA), String(s)).toBe('falhou');
        }
    });
    it('passageiro: repete até 23 h (mesma chave); depois → incerta', () => {
        const casos = [
            { httpStatus: 429, erro: null }, { httpStatus: 503, erro: null }, { httpStatus: 409, erro: null },
            { httpStatus: null, erro: 'recusada' as const }, { httpStatus: null, erro: 'timeout' as const },
        ];
        for (const r of casos) {
            expect(classificarEnvio(r, HORA), JSON.stringify(r)).toBe('repetir');
            expect(classificarEnvio(r, 23 * HORA + 1), JSON.stringify(r)).toBe('incerta');
        }
    });
    it('idade ilegível falha fechado → incerta', () => {
        expect(classificarEnvio({ httpStatus: 503, erro: null }, NaN)).toBe('incerta');
        expect(classificarEnvio({ httpStatus: null, erro: 'timeout' }, NaN)).toBe('incerta');
    });
    it('sem resposta e sem erro → incerta', () => {
        expect(classificarEnvio({ httpStatus: null, erro: null }, 0)).toBe('incerta');
    });
});

describe('esperaAposFalha', () => {
    it('espera crescente e limite', () => {
        expect(ESPERAS_MS).toEqual([30e3, 60e3, 120e3, 300e3, 600e3, 1800e3]);
        expect(esperaAposFalha(0)).toBe(30000);
        expect(esperaAposFalha(5)).toBe(1800000);
        expect(esperaAposFalha(6)).toBeNull();
    });
});

describe('assinaturaConfere', () => {
    const segredo = 'segredo-de-teste';
    const corpo = new TextEncoder().encode('{"event":"message.ack","data":{"status":"read"}}');
    const assinar = (s: string, c: Uint8Array) => 'sha256=' + createHmac('sha256', s).update(c).digest('hex');

    it('confere com HMAC-SHA256 dos bytes originais', async () => {
        expect(await assinaturaConfere(corpo, assinar(segredo, corpo), segredo)).toBe(true);
    });
    it('recusa segredo errado, cabeçalho ausente, sem prefixo, hex truncado e corpo alterado', async () => {
        const boa = assinar(segredo, corpo);
        expect(await assinaturaConfere(corpo, assinar('outro', corpo), segredo)).toBe(false);
        expect(await assinaturaConfere(corpo, null, segredo)).toBe(false);
        expect(await assinaturaConfere(corpo, boa.slice('sha256='.length), segredo)).toBe(false);
        expect(await assinaturaConfere(corpo, boa.slice(0, -2), segredo)).toBe(false);
        const comEspaco = new TextEncoder().encode('{"event":"message.ack","data":{"status":"read"}} ');
        expect(await assinaturaConfere(comEspaco, boa, segredo)).toBe(false);
    });
});

describe('telefoneDoRemetente', () => {
    it('c.us → telefone; @lid → senderPhone; grupo ou sem telefone → vazio', () => {
        expect(telefoneDoRemetente({ from: '5511999990000@c.us' })).toBe('5511999990000');
        expect(telefoneDoRemetente({ from: '123@lid', senderPhone: '5511999990000' })).toBe('5511999990000');
        expect(telefoneDoRemetente({ from: '123@lid' })).toBe('');
        expect(telefoneDoRemetente({ from: '1203@g.us' })).toBe('');
    });
});

describe('idsDeMensagemIguais', () => {
    it('id serializado e id curto da mesma mensagem são iguais', () => {
        expect(idsDeMensagemIguais('true_5511@c.us_3EB0AB', '3EB0AB')).toBe(true);
        expect(idsDeMensagemIguais('true_5511@c.us_3EB0AB', '3EB0CD')).toBe(false);
        expect(idsDeMensagemIguais('3EB0AB', '3EB0CD')).toBe(false);
    });
});

describe('escolherVinculo', () => {
    const c = (organizationId: string, orderId: string, providerMessageId: string | null, enviadoEm: string) =>
        ({ organizationId, orderId, providerMessageId, enviadoEm });

    it('citação casa com a mensagem enviada → aquele pedido, mesmo com outra org na lista', () => {
        const lista = [
            c('orgA', 'pA', 'true_5511@c.us_AAA', '2026-11-20T10:00:00Z'),
            c('orgB', 'pB', 'true_5511@c.us_BBB', '2026-11-22T10:00:00Z'),
        ];
        expect(escolherVinculo(lista, 'AAA')).toEqual({ tipo: 'citacao', organizationId: 'orgA', orderId: 'pA' });
    });
    it('sem citação e uma só org → o pedido mais recente dela', () => {
        const lista = [
            c('orgA', 'p1', null, '2026-11-20T10:00:00Z'),
            c('orgA', 'p2', null, '2026-11-22T10:00:00Z'),
            c('orgA', 'p3', null, '2026-11-21T10:00:00Z'),
        ];
        expect(escolherVinculo(lista, null)).toEqual({ tipo: 'unico', organizationId: 'orgA', orderId: 'p2' });
    });
    it('duas orgs sem citação → sem vínculo (nunca por palpite)', () => {
        const lista = [c('orgA', 'p1', null, '2026-11-20T10:00:00Z'), c('orgB', 'p2', null, '2026-11-22T10:00:00Z')];
        expect(escolherVinculo(lista, null)).toEqual({ tipo: 'sem_vinculo' });
    });
    it('citou mensagem que não está na lista (pedido da org B fora da janela) → sem vínculo, nunca a org A por palpite', () => {
        // Org B mandou pedido há 90 dias (fora da janela, quem chama já filtrou); org A há 10 dias.
        const lista = [c('orgA', 'pA', 'true_5511@c.us_AAA', '2026-11-13T10:00:00Z')];
        expect(escolherVinculo(lista, 'true_5511@c.us_BBB')).toEqual({ tipo: 'sem_vinculo' });
    });
    it('lista vazia → sem vínculo', () => {
        expect(escolherVinculo([], null)).toEqual({ tipo: 'sem_vinculo' });
        expect(escolherVinculo([], 'AAA')).toEqual({ tipo: 'sem_vinculo' });
    });
    it('janela de 60 dias', () => {
        expect(JANELA_VINCULO_DIAS).toBe(60);
    });
});
