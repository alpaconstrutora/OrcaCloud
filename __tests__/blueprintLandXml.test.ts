/**
 * C3 — a via do loteamento como eixo, a conferência "via sem greide" e o
 * LandXML de saída.
 *
 * O caso de aceite do plano: um loteamento com 3 vias exporta LandXML que
 * volta com a MESMA TIN e os MESMOS lotes — lido pelo leitor completo E pelo
 * importador de pontos que já existia (a superfície e o contorno da gleba);
 * e cada via tem a sua nota de serviço.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, type BlueprintModel } from '../utils/blueprintKernel';
import { landXmlDaTopografia, lerLandXmlCompleto } from '../utils/geo/landxml';
import { importarPontos } from '../utils/blueprintTopografiaImportacao';
import {
  conferirGreidesDasVias,
  estaquear,
  greideDoTerreno,
  notaDeServico,
  resolverViasDoLoteamento,
  secaoDaViaDoLoteamento,
  secoesTransversais,
  SECAO_TIPO_PADRAO,
  type ViaDoLoteamento,
} from '../utils/blueprintVias';
import { amostradorDaGrade, type GradeDeElevacao } from '../utils/blueprintTopografia';
import { rotuloDoLote } from '../utils/blueprintLoteamento';

/** Terreno: plano inclinado 2 % para o norte, grade de 5 m sobre 100 × 60 m. */
function grade(): GradeDeElevacao {
  const colunas = 21;
  const linhas = 13;
  const cotasM: (number | null)[] = [];
  for (let l = 0; l < linhas; l++) for (let c = 0; c < colunas; c++) cotasM.push(Math.round((800 + l * 5 * 0.02) * 1000) / 1000);
  cotasM[0] = null; // um canto sem cota: a face que sobra continua lá
  return { origem: { x: 0, y: 0 }, espacamentoMm: 5000, colunas, linhas, cotasM };
}

function loteamento(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
  const lv = m.levels[0].id;
  m = applyBatch(m, [
    { type: 'AddVia', levelId: lv, nome: 'Rua A', eixo: [{ x: 0, y: 10_000 }, { x: 100_000, y: 10_000 }], larguraMm: 12_000, calcadaMm: 2500 },
    { type: 'AddVia', levelId: lv, nome: 'Rua B', eixo: [{ x: 0, y: 50_000 }, { x: 100_000, y: 50_000 }], larguraMm: 10_000, calcadaMm: 2000 },
    { type: 'AddVia', levelId: lv, nome: 'Rua C', eixo: [{ x: 50_000, y: 10_000 }, { x: 50_000, y: 50_000 }], larguraMm: 10_000, calcadaMm: 2000 },
    { type: 'AddQuadra', levelId: lv, nome: 'A', pontos: [{ x: 5000, y: 16_000 }, { x: 45_000, y: 16_000 }, { x: 45_000, y: 45_000 }, { x: 5000, y: 45_000 }] },
  ]).model;
  const q = m.quadras[0].id;
  m = applyBatch(m, [
    { type: 'AddLote', levelId: lv, quadraId: q, numero: '1', pontos: [{ x: 5000, y: 16_000 }, { x: 25_000, y: 16_000 }, { x: 25_000, y: 45_000 }, { x: 5000, y: 45_000 }] },
    { type: 'AddLote', levelId: lv, quadraId: q, numero: '2', pontos: [{ x: 25_000, y: 16_000 }, { x: 45_000, y: 16_000 }, { x: 45_000, y: 45_000 }, { x: 25_000, y: 45_000 }] },
  ]).model;
  return m;
}

const doDesenho = (m: BlueprintModel): ViaDoLoteamento[] => m.vias.map((v) => ({ uid: v.uid, nome: v.nome, eixo: v.eixo, larguraMm: v.larguraMm, calcadaMm: v.calcadaMm }));
const GLEBA = [
  { x: 0, y: 0 },
  { x: 100_000, y: 0 },
  { x: 100_000, y: 60_000 },
  { x: 0, y: 60_000 },
];

describe('via do loteamento como eixo', () => {
  it('seção: pista = caixa − 2 calçadas', () => {
    expect(secaoDaViaDoLoteamento({ uid: 'u', nome: 'x', eixo: [], larguraMm: 12_000, calcadaMm: 2500 })).toEqual({ ...SECAO_TIPO_PADRAO, pistaM: 7, calcadaM: 2.5 });
  });

  it('ligada: eixo, nome e seção vêm do DESENHO (ao vivo); taludes do projeto; sem a via no desenho, órfã', () => {
    const m = loteamento();
    const k = doDesenho(m);
    const projeto = [
      { viaUid: k[0].uid, nome: 'antigo', eixo: [{ x: 0, y: 0 }, { x: 1, y: 1 }], secaoTipo: { ...SECAO_TIPO_PADRAO, taludeCorteH: 3 } },
      { viaUid: 'sumiu', nome: 'Rua X', eixo: [{ x: 0, y: 0 }, { x: 1000, y: 0 }], secaoTipo: SECAO_TIPO_PADRAO },
      { viaUid: null, nome: 'Própria', eixo: [{ x: 0, y: 0 }, { x: 1000, y: 0 }], secaoTipo: SECAO_TIPO_PADRAO },
    ];
    const r = resolverViasDoLoteamento(projeto, k);
    expect(r[0]).toMatchObject({ doLoteamento: true, orfa: false, via: { nome: 'Rua A', eixo: k[0].eixo, secaoTipo: { pistaM: 7, calcadaM: 2.5, taludeCorteH: 3 } } });
    expect(r[1]).toMatchObject({ doLoteamento: false, orfa: true, via: { nome: 'Rua X' } });
    expect(r[2]).toMatchObject({ doLoteamento: false, orfa: false });
  });

  it('conferência: via sem projeto e via com o greide de partida são ditas; com PIVs, nada', () => {
    const k = doDesenho(loteamento());
    const avisos = conferirGreidesDasVias(k, [
      { viaUid: k[1].uid, greide: null },
      { viaUid: k[2].uid, greide: { pontos: [{ distM: 0, cotaM: 800 }, { distM: 40, cotaM: 801 }] } },
    ]);
    expect(avisos.map((a) => [a.rotulo, a.regra, a.gravidade])).toEqual([
      ['Rua A', 'via_sem_greide', 'ATENCAO'],
      ['Rua B', 'via_sem_greide', 'ATENCAO'],
    ]);
    expect(avisos[0].texto).toMatch(/não tem projeto geométrico/);
    expect(avisos[1].texto).toMatch(/greide de partida/);
  });

  it('nota de serviço POR VIA: cada uma das 3 com as suas estacas', () => {
    const k = doDesenho(loteamento());
    const g = grade();
    const cota = amostradorDaGrade(g);
    const notas = k.map((v) => {
      const e = estaquear(v.eixo, 20);
      return notaDeServico(secoesTransversais(e, cota, secaoDaViaDoLoteamento(v), greideDoTerreno(e, cota)!, { alcanceM: 4 }));
    });
    expect(notas.map((n) => n.length)).toEqual([6, 6, 3]);
    // Rua C sobe 40 m a 2 %: o greide de partida acompanha o terreno → diferença ~0 no eixo
    expect(Math.max(...notas[2].map((l) => Math.abs(l.diferencaM ?? 0)))).toBeLessThan(0.001);
  });
});

describe('LandXML de saída — ida e volta', () => {
  const m = loteamento();
  const k = doDesenho(m);
  const g = grade();
  const texto = landXmlDaTopografia({
    nomeDoProjeto: 'Loteamento Alvorada',
    superficie: { nome: 'Terreno v1', grade: g },
    vias: [
      { nome: 'Rua A', eixo: k[0].eixo, greide: { pontos: [{ distM: 0, cotaM: 800.2 }, { distM: 50, cotaM: 800.9, curvaM: 30 }, { distM: 100, cotaM: 800.5 }] } },
      { nome: 'Rua B', eixo: k[1].eixo, greide: null },
      { nome: 'Rua C', eixo: k[2].eixo, greide: { pontos: [{ distM: 0, cotaM: 800.2 }, { distM: 40, cotaM: 801 }] } },
    ],
    gleba: { nome: 'Gleba', anel: GLEBA },
    lotes: m.lotes.map((l) => ({ nome: rotuloDoLote(m, l), anel: l.pontos })),
    paraSaida: (p) => ({ este: p.x / 1000, norte: p.y / 1000 }),
    sistema: null,
    quando: new Date('2026-09-26T12:00:00Z'),
  });
  const lido = lerLandXmlCompleto(texto);

  it('a MESMA TIN: os nós com cota e os triângulos da grade', () => {
    const vivos = g.cotasM.filter((z) => z !== null).length;
    expect(lido.superficie!.pontos).toHaveLength(vivos);
    // 20 × 12 células = 240; a do canto sem cota vira 1 triângulo: 2 × 239 + 1
    expect(lido.superficie!.faces).toHaveLength(2 * 239 + 1);
    const p = lido.superficie!.pontos.find((q) => q.este === 50 && q.norte === 30)!;
    expect(p.cota).toBeCloseTo(800.6, 6); // 30 m ao norte a 2 %
  });

  it('os MESMOS lotes (e a gleba primeiro), com a área', () => {
    expect(lido.parcelas.map((x) => x.nome)).toEqual(['Gleba', 'Quadra A · Lote 1', 'Quadra A · Lote 2']);
    lido.parcelas.slice(1).forEach((x, i) => {
      expect(x.anel.map((v) => ({ x: Math.round(v.este * 1000), y: Math.round(v.norte * 1000) }))).toEqual(m.lotes[i].pontos);
      expect(x.area).toBeCloseTo(20 * 29, 6);
    });
  });

  it('os eixos e os perfis: PVI e curva vertical pelo comprimento; via sem greide sai sem perfil', () => {
    expect(lido.alinhamentos.map((a) => a.nome)).toEqual(['Rua A', 'Rua B', 'Rua C']);
    expect(lido.alinhamentos[0].eixo).toEqual([{ norte: 10, este: 0 }, { norte: 10, este: 100 }]);
    expect(lido.alinhamentos[0].pvis).toEqual([
      { sta: 0, cota: 800.2, curvaM: null },
      { sta: 50, cota: 800.9, curvaM: 30 },
      { sta: 100, cota: 800.5, curvaM: null },
    ]);
    expect(lido.alinhamentos[1].pvis).toEqual([]);
  });

  it('e o importador de pontos que já existia lê a superfície (TIN) e o contorno da GLEBA', () => {
    const r = importarPontos(texto, 'LANDXML', { anel: null, georreferencia: null }, { ancoragem: 'DIRETO', unidade: 'M' });
    expect(r.pontos.filter((p) => !p.soContorno)).toHaveLength(g.cotasM.filter((z) => z !== null).length);
    expect(r.tinImportada?.faces.length).toBe((2 * 239 + 1) * 3);
    expect(r.contorno?.pontos).toEqual(GLEBA);
  });

  it('texto escapado e sistema de coordenadas quando há', () => {
    const t = landXmlDaTopografia({ nomeDoProjeto: 'A & B <x>', superficie: null, vias: [], gleba: null, lotes: [], paraSaida: (p) => ({ este: p.x, norte: p.y }), sistema: { epsg: 31983, nome: 'SIRGAS 2000 / UTM 23S' } });
    expect(t).toContain('<Project name="A &amp; B &lt;x&gt;"/>');
    expect(lerLandXmlCompleto(t).sistema).toEqual({ epsg: 31983, nome: 'SIRGAS 2000 / UTM 23S' });
  });
});
