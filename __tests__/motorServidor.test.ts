/**
 * Só cai para o motor do navegador quando o servidor NÃO está rodando.
 * Plano 2026-10-01-conciliacao-motor-duplicado.
 */
import { describe, it, expect } from 'vitest';
import { decidirAposMotorServidor, MOTOR_CONTINUA_NO_SERVIDOR, MOTOR_JA_RODANDO } from '../utils/motorServidor';

describe('decidirAposMotorServidor', () => {
    it('200 → usa o resultado do servidor', () => {
        const corpo = { auto_matched: 3, suggestions: 741 };
        expect(decidirAposMotorServidor({ tipo: 'resposta', status: 200, corpo })).toEqual({ acao: 'usar', corpo });
    });

    it('nosso corte de tempo → NÃO roda no navegador (o servidor pode estar rodando) — o caso de 01/10/2026', () => {
        expect(decidirAposMotorServidor({ tipo: 'cortada' })).toEqual({ acao: 'erro', mensagem: MOTOR_CONTINUA_NO_SERVIDOR });
    });

    it('409 → já está rodando: NÃO roda no navegador, e repassa a mensagem do servidor', () => {
        expect(decidirAposMotorServidor({ tipo: 'resposta', status: 409, corpo: { error: 'Já há uma execução…', code: 'ALREADY_RUNNING' } }))
            .toEqual({ acao: 'erro', mensagem: 'Já há uma execução…' });
        expect(decidirAposMotorServidor({ tipo: 'resposta', status: 409, corpo: null }))
            .toEqual({ acao: 'erro', mensagem: MOTOR_JA_RODANDO });
    });

    it('401/403 → sem permissão: o navegador teria a mesma resposta, não tenta', () => {
        expect(decidirAposMotorServidor({ tipo: 'resposta', status: 403, corpo: { error: 'Sem acesso' } }))
            .toEqual({ acao: 'erro', mensagem: 'Sem acesso' });
    });

    it('servidor inalcançável, 404 ou 5xx → a execução dele terminou: cai para o navegador', () => {
        expect(decidirAposMotorServidor({ tipo: 'sem_rede', mensagem: 'Failed to fetch' }).acao).toBe('navegador');
        expect(decidirAposMotorServidor({ tipo: 'resposta', status: 404, corpo: {} }).acao).toBe('navegador');
        const d = decidirAposMotorServidor({ tipo: 'resposta', status: 500, corpo: { error: 'canceling statement due to statement timeout' } });
        expect(d).toEqual({ acao: 'navegador', motivo: 'servidor respondeu 500: canceling statement due to statement timeout' });
    });
});
