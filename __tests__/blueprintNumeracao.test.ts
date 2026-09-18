/**
 * Etiquetas de abertura, cota de nível e volume do ambiente (18/09/2026, E0.2).
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point } from '../utils/blueprintKernel';
import { linhasDeComponentes } from '../utils/blueprintComponentes';
import { etiquetasDasAberturas, rotuloDeNivel, rotuloDeNivelDoPavimento, volumeDoAmbienteM3 } from '../utils/blueprintNumeracao';

function cena() {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2800, defaultHeightMm: 2600 }).model;
  const [t, s] = m.levels.map((l) => l.id);
  let r = applyCommand(m, { type: 'AddWall', levelId: t, a: point(0, 0), b: point(8000, 0), thicknessMm: 150, heightMm: 2800 });
  m = r.model;
  const w1 = r.diff.created[0];
  r = applyCommand(m, { type: 'AddWall', levelId: s, a: point(0, 0), b: point(8000, 0), thicknessMm: 150, heightMm: 2600 });
  m = r.model;
  const w2 = r.diff.created[0];
  m = applyBatch(m, [
    { type: 'AddOpening', wallId: w1, kind: 'window', offsetMm: 500, widthMm: 1200, heightMm: 1200, sillMm: 1000 },
    { type: 'AddOpening', wallId: w1, kind: 'door', offsetMm: 2500, widthMm: 900, heightMm: 2100, sillMm: 0 },
    { type: 'AddOpening', wallId: w2, kind: 'door', offsetMm: 1000, widthMm: 800, heightMm: 2100, sillMm: 0 },
    { type: 'AddOpening', wallId: w1, kind: 'door', offsetMm: 5000, widthMm: 900, heightMm: 2100, sillMm: 0 },
    { type: 'AddOpening', wallId: w1, kind: 'sliding', offsetMm: 6500, widthMm: 1200, heightMm: 2100, sillMm: 0 },
  ]).model;
  return { m, t, s, w1, w2 };
}

describe('etiquetasDasAberturas', () => {
  it('numera por tipo, na ordem de criação, só as aberturas do pavimento; siglas não colidem com a estrutura', () => {
    const { m, w1 } = cena();
    const terreo = etiquetasDasAberturas(m.walls.filter((w) => w.id === w1), m.openings);
    const textos = m.openings.filter((o) => o.wallId === w1).map((o) => terreo.get(o.id)?.texto);
    expect(textos).toEqual(['J1', 'PT1', 'PT2', 'PC1']);
    // A porta do andar não entra no térreo — e no andar ela é a PT1 dele.
    expect(terreo.size).toBe(4);
    const andar = etiquetasDasAberturas(m.walls.filter((w) => w.id !== w1), m.openings);
    expect([...andar.values()].map((e) => e.texto)).toEqual(['PT1']);
  });

  it('é o MESMO número que o navegador mostra ("Porta 2" ↔ "PT2")', () => {
    const { m, w1 } = cena();
    const paredes = m.walls.filter((w) => w.id === w1);
    const aberturas = m.openings.filter((o) => o.wallId === w1);
    const linhas = linhasDeComponentes(paredes, aberturas, []);
    const etiquetas = etiquetasDasAberturas(paredes, aberturas);
    for (const o of aberturas) {
      const linha = linhas.find((l) => l.id === o.id)!;
      expect(linha.rotulo.endsWith(String(etiquetas.get(o.id)!.numero))).toBe(true);
    }
    expect(linhas.find((l) => l.id === aberturas[2].id)?.rotulo).toBe('Porta 2');
  });
});

describe('rotuloDeNivel e volume', () => {
  it('escreve ±0,00, +2,80 e −1,20 (menos tipográfico); pavimento inexistente dá null', () => {
    expect(rotuloDeNivel(0)).toBe('±0,00');
    expect(rotuloDeNivel(2800)).toBe('+2,80');
    expect(rotuloDeNivel(-1200)).toBe('−1,20');
    expect(rotuloDeNivel(-4)).toBe('±0,00');
    const { m, s } = cena();
    expect(rotuloDeNivelDoPavimento(m.levels, s)).toBe('+2,80');
    expect(rotuloDeNivelDoPavimento(m.levels, 'nada')).toBeNull();
  });

  it('volume = piso × pé-direito do pavimento, duas casas', () => {
    expect(volumeDoAmbienteM3(12.345, 2800)).toBe(34.57);
    expect(volumeDoAmbienteM3(0, 2800)).toBe(0);
  });
});
