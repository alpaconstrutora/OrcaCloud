/**
 * Abas de Boletos a Pagar (16/10/2026): a captura por e-mail saiu de uma aba só
 * (4 tabelas empilhadas) para três abas no mesmo trilho. Plano:
 * docs/planos/2026-10-15-captura-boletos-por-email.md.
 */
import { describe, it, expect } from 'vitest';
import { ABAS_BOLETOS, CABECALHO_DA_ABA, normalizarAba, secaoDaAba } from '../components/boletos/abasBoletos';

describe('abas de Boletos a Pagar', () => {
    it('quatro abas, cada uma com título e subtítulo próprios (guia §19.1)', () => {
        expect(ABAS_BOLETOS.map(a => a.id)).toEqual(['boletos', 'captura_caixas', 'captura_buscas', 'captura_historico']);
        for (const a of ABAS_BOLETOS) {
            expect(CABECALHO_DA_ABA[a.id].titulo).toBeTruthy();
            expect(CABECALHO_DA_ABA[a.id].subtitulo).toBeTruthy();
        }
        expect(new Set(ABAS_BOLETOS.map(a => CABECALHO_DA_ABA[a.id].titulo)).size).toBe(4);
    });

    it('aba salva antiga "captura" abre Caixas e remetentes; valor estranho volta para Boletos', () => {
        expect(normalizarAba('captura')).toBe('captura_caixas');
        expect(normalizarAba('captura_historico')).toBe('captura_historico');
        expect(normalizarAba('qualquer')).toBe('boletos');
        expect(normalizarAba(null)).toBe('boletos');
    });

    it('seção da captura de cada aba', () => {
        expect(secaoDaAba('boletos')).toBeNull();
        expect(secaoDaAba('captura_caixas')).toBe('caixas');
        expect(secaoDaAba('captura_buscas')).toBe('buscas');
        expect(secaoDaAba('captura_historico')).toBe('historico');
    });
});
