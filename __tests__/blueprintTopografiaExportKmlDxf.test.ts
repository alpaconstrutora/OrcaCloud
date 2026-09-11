/**
 * KML e DXF da topografia (fase 2, 10/09/2026).
 *
 * O KML tem de carregar lat/long de verdade (calculadas pela georreferência),
 * a cota como altitude e o aviso; o DXF tem de declarar as camadas `TOPO-*` e
 * cair no mesmo mm da planta — e as mesmas camadas têm de entrar no DXF da
 * prancha quando a topografia é passada.
 */

import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type Point } from '../utils/blueprintKernel';
import { fonteDeElevacao } from '../utils/blueprintElevacaoProvedores';
import {
  AVISO_LEVANTAMENTO,
  estatisticasDoTerreno,
  gerarCurvas,
  nosDaGrade,
  planejarGrade,
} from '../utils/blueprintTopografia';
import { kmlDasCurvas, type ProvenienciaDaVersao } from '../utils/blueprintTopografiaExport';
import { CAMADAS, gerarDxf, gerarDxfDaTopografia } from '../utils/blueprintDxf';

const QUADRADO: Point[] = [
  { x: 0, y: 0 },
  { x: 20000, y: 0 },
  { x: 20000, y: 20000 },
  { x: 0, y: 20000 },
];

function cenario() {
  const base = planejarGrade(QUADRADO, 1000);
  const grade = { ...base, cotasM: nosDaGrade(base).map((n) => 100 + n.x / 2000) };
  const curvas = gerarCurvas(grade, QUADRADO, 1);
  const prov: ProvenienciaDaVersao & { georreferencia: NonNullable<ProvenienciaDaVersao['georreferencia']> } = {
    nomeDoEstudo: 'Gleba <Sul>',
    versao: 3,
    fonte: fonteDeElevacao('PONTOS_COTADOS'),
    classe: 'LEVANTAMENTO_IMPORTADO',
    equidistanciaM: 1,
    geradoEm: '2026-09-10T12:00:00Z',
    hashResultado: 'abc123',
    estatisticas: estatisticasDoTerreno(grade, QUADRADO, curvas),
    georreferencia: { latitude: -22.6, longitude: -46.1, rotacaoNorteDeg: 0 },
  };
  return { grade, curvas, prov };
}

describe('kmlDasCurvas', () => {
  it('uma LineString por curva, em lat/long, com a cota como altitude', () => {
    const { curvas, prov } = cenario();
    const kml = kmlDasCurvas(curvas, QUADRADO, prov, [{ x: 0, y: 0, cotaM: 100 }]);
    expect((kml.match(/<LineString>/g) ?? []).length).toBe(curvas.length);
    expect(kml).toContain('<altitudeMode>absolute</altitudeMode>');
    // O canto (0,0) é a própria origem: lon,lat,cota.
    expect(kml).toContain('-46.10000000,-22.60000000,100.00');
    // A curva de 105 m fica em x = 10 m → longitude um pouco a leste da origem.
    const m = kml.match(/<name>105,00 m<\/name>[\s\S]*?<coordinates>([^<]+)</);
    expect(m).toBeTruthy();
    const [lon, , alt] = m![1].trim().split(' ')[0].split(',').map(Number);
    expect(lon).toBeGreaterThan(-46.1);
    expect(lon).toBeLessThan(-46.09);
    expect(alt).toBe(105);
    expect(kml).toContain('Gleba &lt;Sul&gt;');
    expect(kml).toContain(AVISO_LEVANTAMENTO.slice(0, 30));
    expect(kml).toContain('<name>Lote</name>');
    expect(kml).toContain('<name>Pontos cotados</name>');
  });
});

describe('DXF da topografia', () => {
  it('arquivo próprio declara as camadas TOPO-* e escreve as curvas em mm', () => {
    const { curvas, prov } = cenario();
    const dxf = gerarDxfDaTopografia(
      { curvas, pontosCotados: [{ x: 1000, y: 2000, cotaM: 100.5 }] },
      QUADRADO,
      { titulo: 'Gleba', versao: 3, aviso: 'preliminar' },
    );
    for (const c of [CAMADAS.TOPO_CURVA, CAMADAS.TOPO_MESTRA, CAMADAS.TOPO_PONTO, CAMADAS.TOPO_TEXTO]) {
      expect(dxf).toContain(`\n${c}\n`);
    }
    expect((dxf.match(/POLYLINE/g) ?? []).length).toBe(curvas.length + 1); // + o lote
    expect(dxf).toContain('$INSUNITS');
    expect(dxf).toContain('preliminar');
    void prov;
  });

  it('o DXF da prancha ganha as mesmas camadas quando recebe a topografia', () => {
    const { curvas } = cenario();
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 });
    const levelId = base.model.levels[0].id;
    const model = applyBatch(base.model, [
      { type: 'AddWall', levelId, a: point(0, 0), b: point(5000, 0), thicknessMm: 150, heightMm: 2800 },
    ]).model;
    const sem = gerarDxf(model, { titulo: 't', revisao: 1, hash: 'h' });
    const com = gerarDxf(model, { titulo: 't', revisao: 1, hash: 'h', topografia: { curvas, pontosCotados: [] } });
    expect(sem).not.toContain(`\n${CAMADAS.TOPO_MESTRA}\n  10`);
    expect(com.split('TOPO-CURVA').length).toBeGreaterThan(sem.split('TOPO-CURVA').length);
    expect(com.length).toBeGreaterThan(sem.length);
  });
});
