/**
 * A5 — CAR e REURB.
 *
 * Os casos de aceite do plano:
 *  - uma gleba com APP e Reserva Legal exporta 3 SHP (AREA_IMOVEL, APP,
 *    RESERVA_LEGAL) com atributos, em SIRGAS 2000 geográfico;
 *  - um núcleo REURB de 20 lotes gera 20 memoriais, 20 pranchas (+ a geral) e a
 *    listagem de ocupantes.
 * E o que não pode regredir: os temas ambientais NÃO contam como área pública
 * do loteamento nem entram no memorial dele.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, ehAreaDoLoteamento, type BlueprintModel } from '../utils/blueprintKernel';
import { apoioAReservaLegal, camadasDoCar, carDoImovel, csvDeCoordenadasDoCar, kmlDoCar, quadroDoCar } from '../utils/blueprintCar';
import { listagemDeOcupantes, memoriaisReurb, pendenciasDaReurb, type DadosDaReurb, type OcupanteDoLote } from '../utils/blueprintReurb';
import { lerZipDeShapefiles, zipDeShapefiles } from '../utils/geo/shapefile';
import { crsDoWkt } from '../utils/geo/raster';
import { conferirLoteamento, REGRAS_PADRAO_DO_LOTEAMENTO } from '../utils/blueprintLoteamento';
import { documentoDoLoteamento } from '../utils/blueprintMemorialLote';
import { montarPdfDoLoteamento } from '../services/blueprintLoteamentoDocsService';

/** Gleba de 1000 × 800 m (80 ha) georreferenciada em Minas, com APP de 1000 × 30 m e RL de 400 × 400 m. */
function gleba(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
  const lv = m.levels[0].id;
  const c = [
    { x: 0, y: 0 },
    { x: 1_000_000, y: 0 },
    { x: 1_000_000, y: 800_000 },
    { x: 0, y: 800_000 },
  ];
  m = applyBatch(m, c.map((a, i) => ({ type: 'AddBoundary' as const, levelId: lv, a, b: c[(i + 1) % 4], kind: 'TERRENO' as const }))).model;
  m = applyCommand(m, { type: 'SetGeorreferencia', georreferencia: { latitude: -19.9, longitude: -43.95, elevacaoM: 0 } } as never).model;
  return applyBatch(m, [
    { type: 'AddAreaPublica', levelId: lv, tipo: 'APP', nome: 'APP do Córrego do Meio', pontos: [{ x: 0, y: 0 }, { x: 1_000_000, y: 0 }, { x: 1_000_000, y: 30_000 }, { x: 0, y: 30_000 }] },
    { type: 'AddAreaPublica', levelId: lv, tipo: 'RESERVA_LEGAL', pontos: [{ x: 500_000, y: 300_000 }, { x: 900_000, y: 300_000 }, { x: 900_000, y: 700_000 }, { x: 500_000, y: 700_000 }] },
  ]).model;
}

describe('CAR', () => {
  it('os polígonos no SGL: imóvel 80 ha, APP 3 ha, RL 16 ha; o quadro com o percentual sobre o imóvel', () => {
    const car = carDoImovel(gleba());
    expect(car.avisos).toEqual([]);
    const q = quadroDoCar(car);
    expect(q.map((l) => l.tema)).toEqual(['AREA_IMOVEL', 'APP', 'RESERVA_LEGAL']);
    expect(Math.abs(q[0].areaHa - 80) / 80).toBeLessThan(0.002);
    expect(q[1].areaHa).toBeCloseTo(3, 1);
    expect(q[2].percentual!).toBeCloseTo(20, 1);
  });

  it('⭐ aceite: exporta 3 SHP com atributos, em SIRGAS 2000 geográfico', async () => {
    const camadas = camadasDoCar(carDoImovel(gleba()));
    const lidas = await lerZipDeShapefiles(await zipDeShapefiles(camadas));
    expect(lidas.map((c) => c.nome).sort()).toEqual(['APP', 'AREA_IMOVEL', 'RESERVA_LEGAL']);
    for (const c of lidas) {
      expect(c.tipo).toBe('POLIGONO');
      expect(crsDoWkt(c.prj)?.codigo).toBe('EPSG:4674');
      const v = c.feicoes[0].partes[0][0];
      expect(v.x).toBeGreaterThan(-44.1);
      expect(v.x).toBeLessThan(-43.9); // longitude
      expect(v.y).toBeGreaterThan(-20);
      expect(v.y).toBeLessThan(-19.8); // latitude
    }
    const app = lidas.find((c) => c.nome === 'APP')!.feicoes[0].atributos;
    expect(app).toMatchObject({ TEMA: 'APP', NOME: 'APP do Córrego do Meio' });
    expect(app.AREA_HA as number).toBeCloseTo(3, 1);
    expect(app.PERIM_M as number).toBeCloseTo(2060, -1);
  });

  it('KML por tema e CSV de coordenadas', () => {
    const car = carDoImovel(gleba());
    const kml = kmlDoCar(car, 'Fazenda');
    expect(kml).toContain('<Folder><name>Área do imóvel</name>');
    expect(kml).toContain('<Folder><name>APP — preservação permanente</name>');
    expect(kml).toContain('<Folder><name>Reserva Legal</name>');
    const csv = csvDeCoordenadasDoCar(car).split('\n');
    expect(csv[0]).toBe('tema;nome;vertice;longitude;latitude');
    expect(csv).toHaveLength(1 + 4 * 3);
  });

  it('Reserva Legal: 20 % nas demais regiões dá 16 ha exigidos e o saldo zero; 80 % na floresta amazônica acusa falta', () => {
    const car = carDoImovel(gleba());
    const demais = apoioAReservaLegal(car, 'DEMAIS_REGIOES');
    expect(demais.exigidaHa).toBeCloseTo(16, 1);
    expect(Math.abs(demais.saldoHa)).toBeLessThan(0.05);
    const floresta = apoioAReservaLegal(car, 'AMAZONIA_FLORESTA');
    expect(floresta.exigidaPct).toBe(80);
    expect(floresta.saldoHa).toBeLessThan(-40);
    expect(floresta.notas.join(' ')).toMatch(/art\. 15/);
  });

  it('tema com vértice fora do imóvel e imóvel sem georreferência: ditos; sem georreferência, o arquivo não sai', () => {
    let m = gleba();
    const lv = m.levels[0].id;
    m = applyCommand(m, { type: 'AddAreaPublica', levelId: lv, tipo: 'VEGETACAO_NATIVA', pontos: [{ x: -50_000, y: 700_000 }, { x: 100_000, y: 700_000 }, { x: 100_000, y: 790_000 }] }).model;
    expect(carDoImovel(m).avisos.join(' ')).toMatch(/vértice FORA do imóvel/);
    const semGeo = carDoImovel(applyCommand(m, { type: 'SetGeorreferencia', georreferencia: null } as never).model);
    expect(semGeo.avisos.join(' ')).toMatch(/Sem georreferência/);
    expect(() => camadasDoCar(semGeo)).toThrow(/latitude\/longitude/);
  });

  it('⚠️ os temas do CAR NÃO contam como área pública do loteamento nem entram no memorial dele', () => {
    const m = gleba();
    expect(ehAreaDoLoteamento('APP')).toBe(false);
    expect(ehAreaDoLoteamento('VERDE')).toBe(true);
    const aviso = conferirLoteamento(m, { ...REGRAS_PADRAO_DO_LOTEAMENTO, areasPublicasMinPct: 10 }, 80e10).find((a) => a.regra === 'areas_publicas')!;
    expect(aviso.texto).toMatch(/^Áreas públicas 0(,00)?%/);
    expect(documentoDoLoteamento(m, 80e10, { nome: 'X' })).not.toMatch(/Reserva Legal|APP/);
  });
});

// ── REURB ────────────────────────────────────────────────────────────────────

function nucleo(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
  const lv = m.levels[0].id;
  m = applyBatch(m, [
    { type: 'AddVia', levelId: lv, nome: 'Rua 1', eixo: [{ x: 0, y: -6000 }, { x: 100_000, y: -6000 }], larguraMm: 12_000, calcadaMm: 2000 },
    { type: 'AddQuadra', levelId: lv, nome: 'A', pontos: [{ x: 0, y: 0 }, { x: 100_000, y: 0 }, { x: 100_000, y: 50_000 }, { x: 0, y: 50_000 }] },
  ]).model;
  const q = m.quadras[0].id;
  const lotes = [];
  for (let i = 0; i < 20; i++) {
    const x0 = (i % 10) * 10_000;
    const y0 = i < 10 ? 0 : 25_000;
    lotes.push({ type: 'AddLote' as const, levelId: lv, quadraId: q, numero: String(i + 1), pontos: [{ x: x0, y: y0 }, { x: x0 + 10_000, y: y0 }, { x: x0 + 10_000, y: y0 + 25_000 }, { x: x0, y: y0 + 25_000 }], testadaIndex: 0 });
  }
  return applyBatch(m, lotes).model;
}

const DADOS: DadosDaReurb = { nome: 'Núcleo Vila Esperança', modalidade: 'REURB-S', municipio: 'Belo Horizonte', uf: 'MG', matricula: '12.345', cartorio: '2º Ofício', responsavelTecnico: 'Eng. Maria Souza', registroDoConselho: 'CREA-MG 123456' };

describe('REURB', () => {
  const m = nucleo();
  const ocupantes: Record<string, OcupanteDoLote[]> = {};
  m.lotes.forEach((l, i) => {
    if (i < 18) ocupantes[l.uid] = [{ nome: `Morador ${i + 1}`, documento: i === 5 ? null : `000.000.000-${String(i).padStart(2, '0')}`, papel: i % 2 ? 'MORADOR' : 'PROPRIETARIO' }];
  });
  ocupantes[m.lotes[0].uid].push({ nome: 'Cônjuge 1', documento: '111.111.111-11', papel: 'MORADOR' });

  it('⭐ aceite: 20 memoriais REURB, com o núcleo, a modalidade, o lote e os ocupantes', () => {
    const ms = memoriaisReurb(m, ocupantes, DADOS);
    expect(ms).toHaveLength(20);
    expect(ms[0].texto).toMatch(/^REGULARIZAÇÃO FUNDIÁRIA URBANA — Lei nº 13\.465\/2017/);
    expect(ms[0].texto).toMatch(/REURB-S — interesse social · Núcleo Vila Esperança · Belo Horizonte - MG/);
    expect(ms[0].texto).toMatch(/ÁREA 250,00 m²/);
    expect(ms[0].texto).toMatch(/OCUPANTE\(S\): Morador 1, inscrito\(a\) sob o nº 000\.000\.000-00, proprietário\(a\); Cônjuge 1/);
    expect(ms[19].texto).toMatch(/OCUPANTE\(S\): não cadastrado/);
  });

  it('⭐ aceite: a listagem de ocupantes — uma linha por ocupante, lote sem ocupante com "—"', () => {
    const l = listagemDeOcupantes(m, ocupantes);
    expect(l[0]).toEqual(['Quadra', 'Lote', 'Área (m²)', 'Testada (m)', 'Ocupante', 'CPF/CNPJ', 'Vínculo']);
    expect(l).toHaveLength(1 + 19 + 2); // 18 lotes com 1 (um deles com 2) + 2 sem ninguém
    expect(l[1]).toEqual(['A', '1', 250, 10, 'Morador 1', '000.000.000-00', 'proprietário(a)']);
    expect(l.filter((r) => r[4] === '—')).toHaveLength(2);
  });

  it('⭐ aceite: as 20 pranchas individuais + a planta geral saem pelo PDF do loteamento', () => {
    const [pdf] = montarPdfDoLoteamento(m, { dados: DADOS, areaDaGlebaMm2: 100_000 * 50_000, umaFolhaPorLote: true });
    expect(pdf.nome).toMatch(/\.pdf$/);
    // O jsPDF escreve "/Type /Page" uma vez por página (e "/Type /Pages" uma vez).
    return pdf.blob.text().then((t) => {
      const paginas = (t.match(/\/Type \/Page\b(?!s)/g) ?? []).length;
      expect(paginas).toBeGreaterThanOrEqual(21);
    });
  });

  it('pendências: lote sem ocupante, ocupante sem documento', () => {
    const p = pendenciasDaReurb(m, ocupantes, DADOS).map((x) => `${x.rotulo}: ${x.texto}`).join('\n');
    expect(p).toMatch(/Quadra A · Lote 19: Lote sem ocupante/);
    expect(p).toMatch(/Ocupante "Morador 6" sem CPF\/CNPJ/);
  });
});
