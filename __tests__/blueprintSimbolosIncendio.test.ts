/**
 * INCÊNDIO E1.3 (30/09/2026): o símbolo técnico de cada peça da rede de
 * incêndio — fonte única para o canvas e para a prancha — e a rede inteira
 * saindo da vista de uma vez.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../utils/blueprintKernel';
import { DesenhistaDeProva } from '../utils/blueprintExport';
import {
  TIPOS_COM_SIMBOLO_DE_INCENDIO,
  desenharSimboloDeIncendio,
  idsDaRedeDeIncendio,
  simboloDeIncendio,
  temSimboloDeIncendio,
} from '../utils/blueprintSimbolosIncendio';
import { FICHA_DO_PONTO_HIDRAULICO } from '../utils/blueprintHidraulica';

describe('incêndio E1.3 · símbolos', () => {
  it('todo tipo de incêndio tem símbolo, e os dez são DIFERENTES entre si', () => {
    const assinaturas = TIPOS_COM_SIMBOLO_DE_INCENDIO.map((t) => JSON.stringify(simboloDeIncendio(t)));
    expect(assinaturas.every((a) => a !== '[]')).toBe(true);
    expect(new Set(assinaturas).size).toBe(TIPOS_COM_SIMBOLO_DE_INCENDIO.length);
    // E a lista é exatamente a dos tipos do grupo de incêndio.
    const doGrupo = Object.entries(FICHA_DO_PONTO_HIDRAULICO).filter(([, f]) => f.grupo.startsWith('Incêndio')).map(([t]) => t).sort();
    expect([...TIPOS_COM_SIMBOLO_DE_INCENDIO].sort()).toEqual(doGrupo);
  });

  it('⚠️ a FORMA de fora separa quem tem seta: chave de fluxo é quadrada, o sprinkler lateral é redondo', () => {
    // O harness visual de 30/09 mostrou os dois idênticos com contorno redondo — coordenada diferente não bastava.
    const contorno = (t: Parameters<typeof simboloDeIncendio>[0], pos?: 'LATERAL') => simboloDeIncendio(t, pos)[0].tipo;
    expect(contorno('CHAVE_FLUXO')).toBe('poligono');
    expect(contorno('SPRINKLER', 'LATERAL')).toBe('circulo');
  });

  it('tipo de outra rede não tem símbolo de incêndio', () => {
    expect(temSimboloDeIncendio('CHUVEIRO')).toBe(false);
    expect(temSimboloDeIncendio(null)).toBe(false);
    expect(simboloDeIncendio('CHUVEIRO')).toEqual([]);
  });

  it('o sprinkler muda com a posição: pendente, em pé e lateral são três desenhos', () => {
    const p = JSON.stringify(simboloDeIncendio('SPRINKLER', 'PENDENTE'));
    const e = JSON.stringify(simboloDeIncendio('SPRINKLER', 'EM_PE'));
    const l = JSON.stringify(simboloDeIncendio('SPRINKLER', 'LATERAL'));
    expect(new Set([p, e, l]).size).toBe(3);
    // Sem posição declarada vale a da ficha: pendente.
    expect(JSON.stringify(simboloDeIncendio('SPRINKLER'))).toBe(p);
  });

  it('tudo cabe no quadrado unitário centrado na origem', () => {
    for (const t of TIPOS_COM_SIMBOLO_DE_INCENDIO) {
      for (const pr of simboloDeIncendio(t)) {
        const pts: [number, number][] =
          pr.tipo === 'linha' ? [[pr.x1, pr.y1], [pr.x2, pr.y2]] : pr.tipo === 'poligono' ? pr.pontos : pr.tipo === 'circulo' ? [[pr.cx + pr.r, pr.cy], [pr.cx - pr.r, pr.cy]] : [[pr.x, pr.y]];
        for (const [x, y] of pts) {
          expect(Math.abs(x), t).toBeLessThanOrEqual(0.5 + 1e-9);
          expect(Math.abs(y), t).toBeLessThanOrEqual(0.5 + 1e-9);
        }
      }
    }
  });

  it('na PRANCHA, o mesmo desenho em mm de papel: o hidrante de 6 mm fica dentro de 6 mm', () => {
    const d = new DesenhistaDeProva();
    desenharSimboloDeIncendio(d, 'HIDRANTE_SIMPLES', 100, 50, 6, { espessuraMm: 0.25, cor: '#ea580c' });
    const poligonos = d.chamadas.filter((c) => c.tipo === 'poligono');
    expect(poligonos).toHaveLength(2);
    // A metade cheia vai na cor; o abrigo, em branco.
    expect(poligonos.map((c) => c.args[1]).sort()).toEqual(['#ea580c', '#ffffff']);
    for (const c of d.chamadas.filter((x) => x.tipo === 'linha')) {
      const [x1, y1, x2, y2] = c.args as number[];
      for (const [x, y] of [[x1, y1], [x2, y2]]) {
        expect(Math.abs(x - 100)).toBeLessThanOrEqual(3 + 1e-9);
        expect(Math.abs(y - 50)).toBeLessThanOrEqual(3 + 1e-9);
      }
    }
  });
});

describe('incêndio E1.3 · a rede na vista', () => {
  it('idsDaRedeDeIncendio pega trechos e peças de incêndio, e nada das outras redes', () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const l = m.levels[0].id;
    m = applyBatch(m, [
      { type: 'AddTrecho', levelId: l, disciplina: 'INCENDIO', a: point(0, 0), b: point(3000, 0), cotaAMm: 2600, cotaBMm: 2600, bitolaMm: 65 } as Command,
      { type: 'AddTrecho', levelId: l, disciplina: 'AGUA_FRIA', a: point(0, 1000), b: point(3000, 1000), cotaAMm: 2200, cotaBMm: 2200, bitolaMm: 25 } as Command,
      { type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo: 'SPK', at: point(1000, 0), cotaMm: 2600, tipoHidraulico: 'SPRINKLER' } as Command,
    ]).model;
    const ids = idsDaRedeDeIncendio(m);
    expect(ids).toHaveLength(2);
    expect(ids).not.toContain(m.trechos!.find((t) => t.disciplina === 'AGUA_FRIA')!.id);
  });
});
