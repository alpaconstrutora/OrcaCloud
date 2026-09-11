/** SVG e CSV do perfil altimétrico (fase 3). */
import { describe, expect, it } from 'vitest';
import { amostradorDaGrade, nosDaGrade, planejarGrade } from '../utils/blueprintTopografia';
import { estatisticasDoPerfil, perfilAoLongo } from '../utils/blueprintTopografiaAnalises';
import { csvDoPerfil, svgDoPerfil } from '../utils/blueprintTopografiaExport';

const LOTE = [
  { x: 0, y: 0 },
  { x: 20000, y: 0 },
  { x: 20000, y: 20000 },
  { x: 0, y: 20000 },
];

function perfil() {
  const base = planejarGrade(LOTE, 1000);
  const grade = { ...base, cotasM: nosDaGrade(base).map((n) => (n.x > 12000 && n.x < 15000 ? null : 100 + n.x / 10000)) };
  const p = perfilAoLongo(amostradorDaGrade(grade), [{ x: 0, y: 5000 }, { x: 20000, y: 5000 }], 500);
  return { p, e: estatisticasDoPerfil(p) };
}

describe('svgDoPerfil', () => {
  it('quebra a linha no nodata, marca início e fim, e declara o exagero vertical', () => {
    const { p, e } = perfil();
    const svg = svgDoPerfil(p, e, { titulo: 'Corte A' });
    expect((svg.match(/stroke="#92400e"/g) ?? []).length).toBeGreaterThanOrEqual(2); // dois pedaços
    expect(svg).toContain('Corte A');
    expect(svg).toContain('exagero vertical');
    expect(svg).toContain('100,00 m');
    expect(svg).toContain('102,00 m');
  });
});

describe('csvDoPerfil', () => {
  it('uma linha por ponto, com nodata marcado e as estatísticas no cabeçalho', () => {
    const { p, e } = perfil();
    const csv = csvDoPerfil(p, e, 'Corte A');
    const dados = csv.split('\r\n').filter((l) => !l.startsWith('#') && !l.startsWith('seq;'));
    expect(dados).toHaveLength(p.length);
    expect(dados.some((l) => l.endsWith(';nodata'))).toBe(true);
    expect(csv).toContain('declividade média');
  });
});
