/**
 * `vencimentoPlausivel` — o guarda que faltava na data do boleto.
 *
 * ── O caso real que originou isto (24/09/2026) ──────────────────────────────
 * A base tinha um boleto com vencimento **`20023-09-21`**: ano de cinco
 * dígitos. Veio de um PDF cuja linha digitável não foi encontrada
 * (`metodo_extracao: pdf_text`, `confidence_score: 0`), então a data saiu do
 * texto ou da digitação, sem passar por guarda nenhum — `<input type="date">`
 * aceita ano até 275760, e o Postgres guarda o ano 20023 numa coluna `date`
 * sem reclamar.
 */
import { describe, it, expect } from 'vitest';
import { vencimentoPlausivel } from '../utils/febrabanRules';

const REF = new Date(Date.UTC(2026, 8, 24)); // 24/09/2026, âncora fixa

describe('vencimentoPlausivel', () => {
    it('o caso real: ano de CINCO dígitos é recusado', () => {
        const r = vencimentoPlausivel('20023-09-21', REF);
        expect(r.ok).toBe(false);
        expect((r as { motivo: string }).motivo).toMatch(/AAAA-MM-DD/);
    });

    it('vencimento normal passa, e volta igual', () => {
        expect(vencimentoPlausivel('2026-01-10', REF)).toEqual({ ok: true, valor: '2026-01-10' });
    });

    it('boleto antigo de verdade passa — 2017 e 2020 existem na base', () => {
        // O sistema recebeu boletos de 2017 em 15/08/2026. A janela não pode
        // recusá-los: eles são o caso NORMAL de boleto atrasado.
        expect(vencimentoPlausivel('2017-07-19', REF).ok).toBe(true);
        expect(vencimentoPlausivel('2020-01-10', REF).ok).toBe(true);
    });

    it('vazio/nulo passa como nulo — data ausente não é data errada', () => {
        expect(vencimentoPlausivel(null, REF)).toEqual({ ok: true, valor: null });
        expect(vencimentoPlausivel(undefined, REF)).toEqual({ ok: true, valor: null });
        expect(vencimentoPlausivel('', REF)).toEqual({ ok: true, valor: null });
    });

    it('anterior a 07/10/1997 é recusado — antes disso não existe fator de vencimento', () => {
        expect(vencimentoPlausivel('1997-10-06', REF).ok).toBe(false);
        expect(vencimentoPlausivel('1997-10-07', REF).ok).toBe(true);
    });

    it('mais de 5 anos no futuro é recusado; dentro da janela passa', () => {
        expect(vencimentoPlausivel('2031-09-24', REF).ok).toBe(true);
        expect(vencimentoPlausivel('2031-09-25', REF).ok).toBe(false);
    });

    it('dia que não existe no calendário é recusado, não "corrigido" em silêncio', () => {
        // `new Date('2026-02-31')` vira 03/03 — a comparação de volta é o que pega.
        const r = vencimentoPlausivel('2026-02-31', REF);
        expect(r.ok).toBe(false);
        expect((r as { motivo: string }).motivo).toMatch(/calendário/);
    });

    it('formato solto é recusado (dd/mm/aaaa, mês sem zero, lixo)', () => {
        for (const ruim of ['21/09/2023', '2026-9-1', 'ontem', '2026-09', '2026-09-21T00:00:00Z']) {
            expect(vencimentoPlausivel(ruim, REF).ok, ruim).toBe(false);
        }
    });

    it('a referência é parâmetro: a mesma data muda de veredito conforme o ano', () => {
        // Sem âncora explícita o resultado dependeria de QUANDO o teste roda —
        // a mesma armadilha que `resolverFatorVencimento` documenta.
        const alvo = '2035-01-10';
        expect(vencimentoPlausivel(alvo, new Date(Date.UTC(2026, 8, 24))).ok).toBe(false);
        expect(vencimentoPlausivel(alvo, new Date(Date.UTC(2031, 8, 24))).ok).toBe(true);
    });
});
