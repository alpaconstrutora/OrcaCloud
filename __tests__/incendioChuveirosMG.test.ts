/**
 * D1.2 (plano `2026-10-01-incendio-backlog-pos-roadmap.md`) — o que a IT 18 do CBMMG acrescenta à
 * NBR 10897: reservas somadas (5.11), hidrantes antes da VGA (5.13), recalque dos chuveiros (5.12).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_HIDRAULICAS_INCENDIO_PADRAO as HIP, calculoDeIncendio, criterioDaReserva } from '../utils/blueprintCalculoIncendio';
import { HIPOTESES_SPRINKLERS_PADRAO as HS, criterioDeSprinklers } from '../utils/blueprintSprinklersIncendio';
import { ALTURA_DO_RECALQUE_DOS_CHUVEIROS_MM, DEFLETOR_AO_ESTOQUE_MM, combateDepoisDaVga, itensDaIT18 } from '../utils/blueprintIncendioChuveirosMG';
import { conferenciaDeIncendio } from '../utils/blueprintConferenciaIncendio';

const LEVE = criterioDeSprinklers({ ...HS, risco: 'LEVE' }, null);
const texto = readFileSync(join(__dirname, '..', 'docs', 'normas', 'incendio-mg', 'it18-itens.txt'), 'utf-8');

/** Bomba, coluna até o forro, 10 sprinklers num ramal e um hidrante; `vga` põe a VGA antes ou depois do hidrante. */
function rede(vga: 'NENHUMA' | 'DEPOIS_DO_HIDRANTE' | 'ANTES_DO_HIDRANTE', extra: Command[] = []): BlueprintModel {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  const t = (ax: number, ca: number, bx: number, cb: number, dn = 50): Command => ({ type: 'AddTrecho', levelId: l, disciplina: 'INCENDIO', a: point(ax, 0), b: point(bx, 0), cotaAMm: ca, cotaBMm: cb, bitolaMm: dn }) as Command;
  const p = (tipo: string, x: number, cota: number, more: Record<string, unknown> = {}): Command => ({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo, at: point(x, 0), cotaMm: cota, tipoHidraulico: tipo, ...more }) as Command;
  const xs = Array.from({ length: 10 }, (_, i) => 3000 * (i + 1));
  const base: Command[] = [p('BOMBA_INCENDIO', 0, 300), t(0, 300, 0, 1300, 65), t(0, 1300, 0, 2600, 65), ...xs.map((x) => t(x - 3000, 2600, x, 2600)), ...xs.map((x) => p('SPRINKLER', x, 2600, { fatorK: 80 }))];
  // O hidrante: no nó de 1,30 m (antes do forro) ou num braço que sai do forro (x = −2 m).
  const hidranteAntes = [p('HIDRANTE_SIMPLES', 0, 1300)];
  const hidranteNoForro = [t(0, 2600, -2000, 2600, 65), p('HIDRANTE_SIMPLES', -2000, 2600)];
  const cmds =
    vga === 'NENHUMA'
      ? [...base, ...hidranteAntes]
      : vga === 'ANTES_DO_HIDRANTE'
        ? [...base, p('VGA', 0, 1300), ...hidranteNoForro] // a VGA na coluna, o hidrante depois dela
        : [...base, ...hidranteAntes, p('VGA', 0, 2600)]; // o hidrante na coluna, a VGA no forro
  return applyBatch(m, [...cmds, ...extra]).model;
}

describe('D1.2 · IT 18 do CBMMG', () => {
  it('os itens usados estão na transcrição', () => {
    for (const k of ['5.9', '5.11', '5.12', '5.12.1', '5.12.2', '5.13']) expect(texto).toMatch(new RegExp(`^${k.replace(/\./g, '\\.')} `, 'm'));
    expect(DEFLETOR_AO_ESTOQUE_MM).toEqual({ standard: 456, especial: 916 });
    expect(ALTURA_DO_RECALQUE_DOS_CHUVEIROS_MM).toEqual({ min: 600, max: 1000 });
  });

  it('⚠️ 5.11: com hidrantes e chuveiros, as reservas SE SOMAM — a da Tabela 4 da IT 17 + vazão × duração dos chuveiros', () => {
    const m = rede('NENHUMA');
    const c = calculoDeIncendio(m, HIP, LEVE, { litros: 8000, descricao: 'tipo 2, reserva de 8 m³', fonte: 'IT 17' });
    const s = c.porSistema.sprinklers!;
    const chuveiros = s.cenario!.vazaoNaFonteLmin * s.autonomiaMin;
    expect(c.rti.parcelas).toEqual({ hidrantesL: 8000, chuveirosL: chuveiros });
    expect(c.rti.exigidaL).toBeCloseTo(8000 + chuveiros, 6);
    expect(criterioDaReserva(c)).toMatch(/somadas, IT 18 do CBMMG, 5\.11/);
    // Sem tabela (outro estado), a regra antiga: a vazão do que governa × a duração.
    const sem = calculoDeIncendio(m, HIP, LEVE);
    expect(sem.rti.parcelas).toBeUndefined();
  });

  it('5.13: o hidrante que só se alcança passando pela VGA é FALTA; antes dela, atende', () => {
    expect(combateDepoisDaVga(rede('NENHUMA'))).toBeNull();
    const depois = rede('ANTES_DO_HIDRANTE');
    const d = combateDepoisDaVga(depois)!;
    expect(d.hidrantes).toHaveLength(1);
    const item = itensDaIT18(depois).find((i) => i.item.startsWith('Hidrantes ligados antes'))!;
    expect(item).toMatchObject({ estado: 'FALTA', alvos: d.hidrantes });
    const antes = rede('DEPOIS_DO_HIDRANTE');
    expect(combateDepoisDaVga(antes)!.hidrantes).toEqual([]);
    expect(itensDaIT18(antes).find((i) => i.item.startsWith('Hidrantes ligados antes'))!.estado).toBe('ATENDE');
  });

  it('5.12: o recalque na fachada a 0,60–1,00 m atende; na caixa do passeio fica para o responsável; a 1,5 m falta', () => {
    const recalque = (cota: number): Command => ({ type: 'AddTerminal', levelId: '', disciplina: 'INCENDIO', tipo: 'HIDRANTE_RECALQUE', tipoHidraulico: 'HIDRANTE_RECALQUE', at: point(-5000, 3000), cotaMm: cota }) as Command;
    const com = (cota: number) => {
      const m = rede('NENHUMA');
      const c = { ...recalque(cota), levelId: m.levels[0].id } as Command;
      return itensDaIT18(applyBatch(m, [c]).model).find((i) => i.item.startsWith('Recalque dos chuveiros'))!.estado;
    };
    expect(com(800)).toBe('ATENDE');
    expect(com(-300)).toBe('NAO_AVALIADO');
    expect(com(1500)).toBe('FALTA');
  });

  it('a conferência da rede traz os itens da IT 18; sem chuveiros, nenhum', () => {
    const m = rede('ANTES_DO_HIDRANTE');
    const c = calculoDeIncendio(m, HIP, LEVE);
    expect(conferenciaDeIncendio(m, c, HIP).some((i) => i.item === 'Hidrantes ligados antes da válvula de governo e alarme')).toBe(true);
    const semSpk = { ...m, terminais: (m.terminais ?? []).filter((t) => t.tipoHidraulico !== 'SPRINKLER') };
    expect(itensDaIT18(semSpk)).toEqual([]);
  });
});
