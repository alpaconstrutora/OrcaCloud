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
    classificarEnvio, comandoIdEnvioAutomatico, escolherVinculo, esperaAposFalha, espelhoDoLog, estadoDaConexao,
    idsDeMensagemIguais, lerResultadoDoWorker, montarTextoDoPedido, planoDoReporte, statusDoAck,
    telefoneDoRemetente,
} from '../utils/whatsappOpenwa';
import { formatarValorBRL } from '../utils/whatsappPedido';
import type { StatusSaida } from '../utils/whatsappOpenwa';

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

describe('estadoDaConexao (vivo do worker)', () => {
    it('normaliza o estado bruto do OpenWA', () => {
        expect(estadoDaConexao('ready')).toBe('conectado');
        expect(estadoDaConexao('qr_ready')).toBe('aguardando_qr');
        expect(estadoDaConexao('authenticating')).toBe('aguardando_qr');
        expect(estadoDaConexao('disconnected')).toBe('desconectado');
        expect(estadoDaConexao('action_required')).toBe('desconectado');
        expect(estadoDaConexao('failed')).toBe('erro');
        expect(estadoDaConexao('  READY ')).toBe('conectado');
    });
    it('estado desconhecido ou ausente nunca vira conectado', () => {
        expect(estadoDaConexao('initializing')).toBe('desconectado');
        expect(estadoDaConexao('')).toBe('desconectado');
        expect(estadoDaConexao(null)).toBe('desconectado');
        expect(estadoDaConexao(42)).toBe('desconectado');
    });
});

describe('lerResultadoDoWorker', () => {
    const ID = '0b5c3f0e-1d2a-4c3b-9e8f-112233445566';
    it('aceita o formato do worker', () => {
        expect(lerResultadoDoWorker({ id: ID, httpStatus: 201, erro: null, messageId: 'true_5511@c.us_ABC' }))
            .toEqual({ id: ID, httpStatus: 201, erro: null, messageId: 'true_5511@c.us_ABC' });
        expect(lerResultadoDoWorker({ id: ID.toUpperCase(), httpStatus: null, erro: 'timeout' }))
            .toEqual({ id: ID.toUpperCase(), httpStatus: null, erro: 'timeout', messageId: null });
    });
    it('id que não é uuid, status fora de 100–599, erro desconhecido ou messageId estranho → null', () => {
        expect(lerResultadoDoWorker({ id: 'x', httpStatus: 200, erro: null, messageId: null })).toBeNull();
        expect(lerResultadoDoWorker({ id: ID, httpStatus: 99, erro: null, messageId: null })).toBeNull();
        expect(lerResultadoDoWorker({ id: ID, httpStatus: 200.5, erro: null, messageId: null })).toBeNull();
        expect(lerResultadoDoWorker({ id: ID, httpStatus: '200', erro: null, messageId: null })).toBeNull();
        expect(lerResultadoDoWorker({ id: ID, httpStatus: null, erro: 'outro', messageId: null })).toBeNull();
        expect(lerResultadoDoWorker({ id: ID, httpStatus: 200, erro: null, messageId: 'a'.repeat(301) })).toBeNull();
        expect(lerResultadoDoWorker({ id: ID, httpStatus: 200, erro: null, messageId: 7 })).toBeNull();
        expect(lerResultadoDoWorker(null)).toBeNull();
        expect(lerResultadoDoWorker('x')).toBeNull();
    });
    it('messageId vazio vira null', () => {
        expect(lerResultadoDoWorker({ id: ID, httpStatus: 200, erro: null, messageId: '  ' })?.messageId).toBeNull();
    });
});

describe('planoDoReporte', () => {
    const AGORA = Date.parse('2026-11-23T12:00:00Z');
    const haUmaHora = new Date(AGORA - HORA).toISOString();
    const linha = (tentativas: number, criadoEm = haUmaHora, status: 'enviando' | 'pendente' | 'aceita' = 'enviando') =>
        ({ status, tentativas, criadoEm });
    const ok = { httpStatus: 201, erro: null, messageId: 'MID' } as const;
    const r503 = { httpStatus: 503, erro: null, messageId: null } as const;

    it('só aplica em linha que está enviando (relato atrasado ou repetido não regride)', () => {
        expect(planoDoReporte(linha(1, haUmaHora, 'aceita'), ok, AGORA)).toEqual({ tipo: 'ignorar' });
        expect(planoDoReporte(linha(1, haUmaHora, 'pendente'), r503, AGORA)).toEqual({ tipo: 'ignorar' });
    });
    it('2xx → aceita com o id da mensagem', () => {
        expect(planoDoReporte(linha(1), ok, AGORA)).toEqual({ tipo: 'aceita', status: 'aceita', providerMessageId: 'MID' });
    });
    it('primeira falha passageira (tentativas = 1, já contando a atual) espera 30 s', () => {
        const p = planoDoReporte(linha(1), r503, AGORA);
        expect(p.tipo).toBe('repetir');
        if (p.tipo !== 'repetir') return;
        expect(p.status).toBe('pendente');
        expect(Date.parse(p.proximaTentativaEm) - AGORA).toBe(ESPERAS_MS[0]);
        expect(p.erro).toContain('503');
    });
    it('a espera cresce com as tentativas: tentativas N espera ESPERAS_MS[N-1]', () => {
        for (let n = 1; n <= ESPERAS_MS.length; n++) {
            const p = planoDoReporte(linha(n), { httpStatus: null, erro: 'recusada', messageId: null }, AGORA);
            expect(p.tipo, String(n)).toBe('repetir');
            if (p.tipo === 'repetir') expect(Date.parse(p.proximaTentativaEm) - AGORA, String(n)).toBe(ESPERAS_MS[n - 1]);
        }
    });
    it('esgotou as tentativas → incerta (pode ter saído), não falhou', () => {
        const p = planoDoReporte(linha(ESPERAS_MS.length + 1), r503, AGORA);
        expect(p.tipo).toBe('incerta');
        if (p.tipo === 'incerta') expect(p.erro).toContain('esgotou as tentativas');
    });
    it('recusa definitiva → falhou mesmo com as tentativas esgotadas', () => {
        const p = planoDoReporte(linha(ESPERAS_MS.length + 1), { httpStatus: 422, erro: null, messageId: null }, AGORA);
        expect(p.tipo).toBe('falhou');
        if (p.tipo === 'falhou') expect(p.erro).toContain('422');
    });
    it('passageira com comando de mais de 23 h → incerta', () => {
        const velha = new Date(AGORA - 23 * HORA - 1).toISOString();
        expect(planoDoReporte(linha(1, velha), r503, AGORA).tipo).toBe('incerta');
    });
    it('criado_em ilegível → incerta (falha fechado)', () => {
        expect(planoDoReporte(linha(1, 'ontem'), r503, AGORA).tipo).toBe('incerta');
    });
    it('sem resposta e sem erro → incerta', () => {
        expect(planoDoReporte(linha(1), { httpStatus: null, erro: null, messageId: null }, AGORA).tipo).toBe('incerta');
    });
});

describe('espelhoDoLog (varredura do vivo)', () => {
    const pend = (metadata: Record<string, unknown> | null = { wa_mensagem_id: 'm' }) => ({ status: 'pending', metadata });
    const msg = (status: StatusSaida, providerMessageId: string | null = null, erro: string | null = null) =>
        ({ status, providerMessageId, erro });

    it('aceita, entregue ou lida → sent com o id da mensagem', () => {
        for (const st of ['aceita', 'entregue', 'lida'] as const) {
            expect(espelhoDoLog(msg(st, 'MID'), pend()), st).toEqual({ acao: 'sent', waMessageId: 'MID' });
        }
    });
    it('falhou → failed com o erro gravado (ou um texto padrão)', () => {
        expect(espelhoDoLog(msg('falhou', null, 'O WhatsApp não aceitou'), pend())).toEqual({ acao: 'failed', erro: 'O WhatsApp não aceitou' });
        const semErro = espelhoDoLog(msg('falhou'), pend());
        expect(semErro.acao).toBe('failed');
        if (semErro.acao === 'failed') expect(semErro.erro.length).toBeGreaterThan(0);
    });
    it('incerta → continua pending com confirmação pendente; já marcada → nada', () => {
        expect(espelhoDoLog(msg('incerta', null, 'pode ter saído'), pend())).toEqual({ acao: 'confirmacao_pendente', erro: 'pode ter saído' });
        expect(espelhoDoLog(msg('incerta'), pend({ wa_mensagem_id: 'm', confirmacao: 'pendente' }))).toEqual({ acao: 'nada' });
    });
    it('log que já saiu de pending nunca é sobrescrito', () => {
        for (const st of ['sent', 'failed']) {
            expect(espelhoDoLog(msg('aceita', 'MID'), { status: st, metadata: null }), st).toEqual({ acao: 'nada' });
            expect(espelhoDoLog(msg('falhou', null, 'x'), { status: st, metadata: null }), st).toEqual({ acao: 'nada' });
        }
    });
    it('mensagem ainda na fila, enviando ou cancelada → nada', () => {
        for (const st of ['pendente', 'enviando', 'cancelada'] as const) {
            expect(espelhoDoLog(msg(st), pend()), st).toEqual({ acao: 'nada' });
        }
    });
});
