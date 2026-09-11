/**
 * Fase 8: Kirpich, dente na base e estabilidade global do muro; drenagem e
 * muros no DXF, no KML e no 3D; fonte SRTM 30 m atrás de Edge Function.
 */
import { describe, expect, it, vi } from 'vitest';
import { hidraulicaDaColuna } from '../hooks/useBlueprintTerraplenagem';
import { CAMADAS, gerarDxfDaTopografia } from '../utils/blueprintDxf';
import { amostrarRemoto, fonteDeElevacao, FONTES, FonteIndisponivel } from '../utils/blueprintElevacaoProvedores';
import type { Point } from '../utils/blueprintKernel';
import { nosDaGrade, planejarGrade, type GradeDeElevacao } from '../utils/blueprintTopografia';
import { linhasDeDrenagem3d, murosDeArrimo3d } from '../utils/blueprintTopografia3dExtras';
import {
  analisarDrenagem,
  cotaDeProjeto,
  PARAMETROS_PADRAO,
  type LinhaDeDrenagem,
  type MuroDeArrimo,
} from '../utils/blueprintTopografiaAnalises';
import {
  dimensionarDrenagem,
  dimensionarMuro,
  estabilidadeGlobal,
  ESTRUTURA_PADRAO,
  HIDRAULICA_PADRAO,
  tempoDeConcentracaoKirpich,
} from '../utils/blueprintTopografiaDimensionamento';
import { kmlDasCurvas, type ProvenienciaDaVersao } from '../utils/blueprintTopografiaExport';

const LOTE: Point[] = [
  { x: 0, y: 0 },
  { x: 40000, y: 0 },
  { x: 40000, y: 40000 },
  { x: 0, y: 40000 },
];

function gradeDe(fn: (x: number, y: number) => number | null, esp = 1000): GradeDeElevacao {
  const grade = planejarGrade(LOTE, esp);
  return { ...grade, cotasM: nosDaGrade(grade).map((n) => fn(n.x, n.y)) };
}

function muroDe(alturaCorte: number, comprimento = 10): MuroDeArrimo {
  return {
    aresta: 1,
    a: { x: 0, y: 0 },
    b: { x: 0, y: comprimento * 1000 },
    normal: { x: 1, y: 0 },
    comprimentoM: comprimento,
    alturaMaxCorteM: alturaCorte,
    alturaMaxAterroM: 0,
    alturaMediaM: alturaCorte / 2,
    areaDeFaceM2: (alturaCorte * comprimento) / 2,
    lado: 'CORTE',
  };
}

describe('Kirpich', () => {
  it('t = 0,0195·L^0,77·S^−0,385, com piso de 5 min; a linha curta cai no piso', () => {
    expect(tempoDeConcentracaoKirpich(1000, 0.01)).toBeCloseTo(0.0195 * Math.pow(1000, 0.77) * Math.pow(0.01, -0.385), 6);
    expect(tempoDeConcentracaoKirpich(30, 0.005)).toBe(5);
  });

  it('no dimensionamento, KIRPICH usa t por linha e INFORMADO usa o das hipóteses', () => {
    const g = gradeDe(() => 100, 500);
    const cota = cotaDeProjeto(g, null, null, PARAMETROS_PADRAO);
    const linha: LinhaDeDrenagem = { id: 'a', nome: 'A', tipo: 'CANALETA', pontos: [{ x: 5000, y: 20000 }, { x: 35000, y: 20000 }] };
    const analise = analisarDrenagem(linha, cota, 0.5);
    const k = dimensionarDrenagem(linha, analise, 1000, HIDRAULICA_PADRAO);
    expect(k.tempoDeConcentracaoMin).toBe(5);
    expect(k.intensidadeMmH).toBeGreaterThan(160); // t = 5 min chove mais forte que t = 10
    const inf = dimensionarDrenagem(linha, analise, 1000, { ...HIDRAULICA_PADRAO, tempoDeConcentracao: 'INFORMADO' });
    expect(inf.tempoDeConcentracaoMin).toBe(10);
    expect(inf.intensidadeMmH).toBeCloseTo(147, 0);
    expect(hidraulicaDaColuna({ tempoDeConcentracao: 'INFORMADO' }).tempoDeConcentracao).toBe('INFORMADO');
    expect(hidraulicaDaColuna({}).tempoDeConcentracao).toBe('KIRPICH');
  });
});

describe('dente e estabilidade global', () => {
  it('muro baixo com sobrecarga alta: o dente fecha o deslizamento sem engrossar a base até 1,2·H', () => {
    // Fase 7 viu este caso em produção: 1,33 m visto com q = 20 dava "Não fecha".
    const d = dimensionarMuro(muroDe(1.33), { ...ESTRUTURA_PADRAO, sobrecargaKNm2: 20 });
    expect(d.denteM).toBeGreaterThan(0);
    expect(d.fsDeslizamento).toBeGreaterThanOrEqual(1.5);
    expect(d.baseM).toBeLessThan(1.2 * d.alturaM - 1e-9);
    expect(d.avisos.some((a) => /Dente de/.test(a))).toBe(true);
    // Sem necessidade (solo bom, sem sobrecarga) não há dente: a base fecha antes de 0,8·H.
    const semDente = dimensionarMuro(muroDe(1.33), { ...ESTRUTURA_PADRAO, anguloDeAtritoGraus: 35, sobrecargaKNm2: 0 });
    expect(semDente.denteM).toBe(0);
    expect(semDente.baseM).toBeLessThan(0.8 * semDente.alturaM);
    // O dente entra no concreto: a mesma seção, com dente, tem mais volume.
    expect(d.areaDaSecaoM2).toBeGreaterThan(0.3 * d.alturaM + ((d.baseM - 0.3) * d.alturaM) / 2);
  });

  it('estabilidade global: FS cai com φ menor, sobe com coesão, e um muro comum em areia de 30° fica acima de 1,5', () => {
    const phi30 = (30 * Math.PI) / 180;
    const base = estabilidadeGlobal(3, 2.45, 0.5, 18, 22, phi30, 0, 10);
    expect(Number.isFinite(base)).toBe(true);
    expect(base).toBeGreaterThan(1.5);
    const phi20 = estabilidadeGlobal(3, 2.45, 0.5, 18, 22, (20 * Math.PI) / 180, 0, 10);
    expect(phi20).toBeLessThan(base);
    const coesivo = estabilidadeGlobal(3, 2.45, 0.5, 18, 22, phi30, 20, 10);
    expect(coesivo).toBeGreaterThan(base);
    const d = dimensionarMuro(muroDe(2.5), ESTRUTURA_PADRAO);
    expect(Number.isFinite(d.fsGlobal)).toBe(true);
    expect(d.fsGlobal).toBeGreaterThan(1.5);
    expect(d.atende).toBe(true);
  });

  it('solo muito fraco (φ 12°) reprova na estabilidade global e avisa', () => {
    const d = dimensionarMuro(muroDe(4), { ...ESTRUTURA_PADRAO, anguloDeAtritoGraus: 12, tensaoAdmissivelKPa: 400 });
    expect(d.fsGlobal).toBeLessThan(1.5);
    expect(d.atende).toBe(false);
    expect(d.avisos.some((a) => /Estabilidade global/.test(a))).toBe(true);
  });
});

describe('drenagem e muros nos exports', () => {
  const extras = {
    drenagem: [{ nome: 'Pé de corte · lado 1', tipo: 'CANALETA', pontos: [{ x: 1000, y: 1000 }, { x: 9000, y: 1000 }] }],
    muros: [{ a: { x: 10000, y: 0 }, b: { x: 10000, y: 10000 }, normal: { x: 1, y: 0 } }],
  };

  it('DXF ganha as camadas TOPO-DRENAGEM e TOPO-MURO com as entidades', () => {
    const dxf = gerarDxfDaTopografia({ curvas: [], pontosCotados: [], ...extras }, LOTE, { titulo: 't', versao: 1, aviso: 'a' });
    expect(dxf).toContain(CAMADAS.TOPO_DRENAGEM);
    expect(dxf).toContain(CAMADAS.TOPO_MURO);
    expect(dxf.split('TOPO-DRENAGEM').length).toBeGreaterThan(3); // camada + polilinha + seta
    expect(dxf.split('TOPO-MURO').length).toBeGreaterThan(3); // camada + linha + dentes
    expect(dxf).toContain('lado 1');
    const sem = gerarDxfDaTopografia({ curvas: [], pontosCotados: [] }, LOTE, { titulo: 't', versao: 1, aviso: 'a' });
    expect(sem.split('TOPO-MURO').length).toBe(2); // só a tabela de camadas
  });

  it('KML ganha as pastas Drenagem e Muros de arrimo, grudadas no chão', () => {
    const prov: ProvenienciaDaVersao & { georreferencia: { latitude: number; longitude: number; elevacaoM: number | null; rotacaoNorteDeg: number } } = {
      nomeDoEstudo: 'E', versao: 1, fonte: fonteDeElevacao('PONTOS_COTADOS'), classe: 'LEVANTAMENTO_IMPORTADO',
      equidistanciaM: 0.5, geradoEm: '2026-09-11', hashResultado: 'h',
      estatisticas: { cotaMinM: 100, cotaMaxM: 101, cotaMediaM: 100.5, amplitudeM: 1, amostrasValidas: 1, amostrasAusentes: 0, amostrasNoLote: 1, areaM2: 1, espacamentoM: 1, curvas: 0, comprimentoDasCurvasM: 0 },
      georreferencia: { latitude: -23.5, longitude: -46.6, elevacaoM: null, rotacaoNorteDeg: 0 },
    };
    const kml = kmlDasCurvas([], LOTE, prov as never, [], extras);
    expect(kml).toContain('<name>Drenagem</name>');
    expect(kml).toContain('<name>Muros de arrimo</name>');
    expect(kml).toContain('Pé de corte · lado 1');
    expect(kml).toContain('clampToGround');
    expect(kmlDasCurvas([], LOTE, prov as never, [])).not.toContain('<name>Drenagem</name>');
  });
});

describe('drenagem e muros no 3D', () => {
  it('a linha vira vértices x, y, z sobre a superfície de projeto, 5 cm acima; o muro vira uma tira do topo ao pé', () => {
    const g = gradeDe((x) => 100 + x / 10000); // sobe para leste
    const cota = cotaDeProjeto(g, null, null, PARAMETROS_PADRAO);
    const linhas = linhasDeDrenagem3d(
      [{ id: 'a', nome: 'A', tipo: 'CANALETA', pontos: [{ x: 10000, y: 20000 }, { x: 20000, y: 20000 }] }],
      { a: true },
      cota,
      100,
      5000,
    );
    expect(linhas).toHaveLength(1);
    const p = linhas[0].posicoes;
    expect(p.length).toBe(9); // 3 vértices
    expect(p[0]).toBeCloseTo(10, 6); // X = x / 1000
    expect(p[1]).toBeCloseTo(1.05, 6); // Y = cota − zero + 0,05
    expect(p[2]).toBeCloseTo(20, 6); // Z = y / 1000
    expect(p[7]).toBeCloseTo(2.05, 6);

    const muros = murosDeArrimo3d([{ ...muroDe(2), a: { x: 30000, y: 10000 }, b: { x: 30000, y: 30000 } }], 101, cota, 100, 10000);
    expect(muros).toHaveLength(1);
    const m = muros[0];
    expect(m.posicoes.length).toBe(3 * 2 * 3); // 3 estações × (topo, pé)
    expect(m.indices.length).toBe(12); // 2 trechos × 2 triângulos
    // Terreno a 103 no lado leste: topo = 103, pé = 101 − 0,5.
    expect(m.posicoes[1]).toBeCloseTo(3, 6);
    expect(m.posicoes[4]).toBeCloseTo(0.5, 6);
  });
});

describe('fonte SRTM 30 m atrás de function', () => {
  it('está no registro com resolução 30 m e exige georreferência', () => {
    const f = fonteDeElevacao('OPENTOPODATA_SRTM30');
    expect(f.tipo).toBe('API_FUNCTION');
    expect(f.funcao).toBe('topografia-elevacao');
    expect(f.resolucaoNominalM).toBe(30);
    expect(f.exigeGeorreferencia).toBe(true);
    expect(FONTES.map((x) => x.codigo)).toContain('OPENTOPODATA_SRTM30');
  });

  it('amostra em lotes de 100 pela function, com respiro entre lotes, e nunca preenche com zero', async () => {
    const f = fonteDeElevacao('OPENTOPODATA_SRTM30');
    const coords = Array.from({ length: 150 }, (_, i) => ({ lat: -23 + i / 1000, lon: -46 }));
    const chamadas: unknown[] = [];
    const invocar = vi.fn(async (_nome: string, corpo: unknown) => {
      chamadas.push(corpo);
      const n = (corpo as { coordenadas: unknown[] }).coordenadas.length;
      return { data: { elevation: Array.from({ length: n }, (_, i) => (i === 3 ? null : 700 + i)) }, error: null };
    });
    const esperas: number[] = [];
    const cotas = await amostrarRemoto(f, coords, fetch, invocar, async (ms) => {
      esperas.push(ms);
    });
    expect(invocar).toHaveBeenCalledTimes(2);
    expect(invocar.mock.calls[0][0]).toBe('topografia-elevacao');
    expect((chamadas[0] as { coordenadas: unknown[] }).coordenadas).toHaveLength(100);
    expect(cotas).toHaveLength(150);
    expect(cotas[3]).toBeNull();
    expect(cotas[0]).toBe(700);
    expect(esperas).toEqual([1100]);
    // Erro da function vira FonteIndisponivel, não zero.
    await expect(amostrarRemoto(f, coords.slice(0, 2), fetch, async () => ({ data: null, error: { message: 'HTTP 502' } }))).rejects.toBeInstanceOf(FonteIndisponivel);
    await expect(amostrarRemoto(f, coords.slice(0, 2), fetch, async () => ({ data: { error: 'OpenTopoData: limite' }, error: null }))).rejects.toThrow(/limite/);
    await expect(amostrarRemoto(f, coords.slice(0, 2))).rejects.toThrow(/precisa de uma function/);
  });
});
