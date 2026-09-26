/**
 * ROTEIRO PERIMÉTRICO (A1) — a tabela do memorial, derivada do desenho.
 *
 * O que se trava: o SENTIDO (sempre horário, com as divisas acompanhando a
 * inversão — senão o confrontante do lado 2 aparece no lado 4); o fechamento
 * em 360°; o azimute VERDADEIRO quando há georreferência; e a restituição do
 * próprio memorial devolvendo o polígono com erro de fechamento zero.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, type BlueprintModel } from '../utils/blueprintKernel';
import { roteiroPerimetrico, memorialConvencional, restituirMemorial, verticeNoPonto } from '../utils/blueprintRoteiroPerimetrico';
import { azimute as azimuteEntre } from '../utils/geo';

function base(): BlueprintModel {
  return applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
}

/** Lote 12 × 30 m fechado por quatro divisas, no sentido pedido. */
function lote(sentido: 'horario' | 'antihorario' = 'horario'): BlueprintModel {
  const m = base();
  const levelId = m.levels[0].id;
  const pts = [
    { x: 0, y: 0 },
    { x: 0, y: 30000 },
    { x: 12000, y: 30000 },
    { x: 12000, y: 0 },
  ];
  const anel = sentido === 'horario' ? pts : [pts[0], pts[3], pts[2], pts[1]];
  // O confrontante é do LADO FÍSICO (pelo meio da aresta), não do índice da
  // lista: no anti-horário a ordem das divisas muda, e rotular por índice
  // poria "Lote 11" noutro lado — o teste compararia lados diferentes.
  const confrontanteDe = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    if (mx === 0) return 'Rua das Flores'; // oeste
    if (mx === 12000) return 'Lote 20 (fundos)'; // leste
    if (my === 30000) return 'Lote 11'; // norte
    return 'Lote 13'; // sul
  };
  // ⚠️ A divisa do LOTE é `kind: 'TERRENO'` — `DIVISA` é a partição interna
  // de ambientes, e `divisasDoLote` filtra por TERRENO. O confrontante não
  // entra no AddBoundary: é de `SetBoundaryEscritura`, como no quadro de divisas.
  const comDivisas = applyBatch(
    m,
    anel.map((p, i) => ({
      type: 'AddBoundary' as const,
      levelId,
      a: p,
      b: anel[(i + 1) % anel.length],
      kind: 'TERRENO' as const,
    })),
  ).model;
  return applyBatch(
    comDivisas,
    comDivisas.boundaries.map((b) => ({
      type: 'SetBoundaryEscritura' as const,
      boundaryId: b.id,
      medidaMm: null,
      confrontante: confrontanteDe(b.a, b.b),
    })),
  ).model;
}

describe('roteiro sem georreferência', () => {
  it('corre no sentido horário e fecha em 360°', () => {
    const r = roteiroPerimetrico(lote('horario'));
    expect(r.vertices).toHaveLength(4);
    expect(r.lados).toHaveLength(4);
    expect(r.fechaEmGraus).toBeCloseTo(360, 6);
    expect(r.georreferenciado).toBe(false);
    expect(r.avisos.some((a) => /azimutes são de DESENHO/i.test(a))).toBe(true);
  });

  it('⚠️ o lote desenhado ANTI-horário é invertido, e os confrontantes acompanham', () => {
    const h = roteiroPerimetrico(lote('horario'));
    const a = roteiroPerimetrico(lote('antihorario'));
    // Mesmo perímetro, mesma área.
    expect(a.perimetroMm).toBe(h.perimetroMm);
    expect(a.areaMm2).toBe(h.areaMm2);
    // Cada lado do roteiro anti-horário existe no horário com o MESMO par
    // (distância, confrontante): a inversão não descasou nada.
    const chave = (l: { distanciaMm: number; confrontante: string | null }) => `${l.distanciaMm}|${l.confrontante}`;
    expect(a.lados.map(chave).sort()).toEqual(h.lados.map(chave).sort());
    // E os azimutes do anti-horário são todos de um polígono horário (fecha em +360).
    expect(a.fechaEmGraus).toBeCloseTo(360, 6);
  });

  it('sem nome, os vértices saem provisórios e o aviso conta quantos', () => {
    const r = roteiroPerimetrico(lote());
    expect(r.vertices.every((v) => v.provisorio)).toBe(true);
    expect(r.vertices.map((v) => v.nome)).toEqual(['V1', 'V2', 'V3', 'V4']);
    expect(r.avisos.some((a) => /4 vértice\(s\) sem nome/.test(a))).toBe(true);
  });

  it('o vértice nomeado com menor número é o de partida', () => {
    const m = lote();
    const nomeado = applyBatch(m, [
      { type: 'SetVerticeDoTerreno', ponto: { x: 12000, y: 30000 }, nome: 'P1' },
      { type: 'SetVerticeDoTerreno', ponto: { x: 0, y: 0 }, nome: 'P3' },
    ]).model;
    const r = roteiroPerimetrico(nomeado);
    expect(r.vertices[0].nome).toBe('P1');
    expect(r.vertices[0].ponto).toEqual({ x: 12000, y: 30000 });
    expect(verticeNoPonto(nomeado, { x: 2, y: 1 })?.nome).toBe('P3');
  });

  it('sem lote fechado, devolve vazio com o que fazer', () => {
    const r = roteiroPerimetrico(base());
    expect(r.lados).toHaveLength(0);
    expect(r.avisos[0]).toMatch(/Feche o contorno/);
  });
});

describe('roteiro georreferenciado', () => {
  function georreferenciado(): BlueprintModel {
    const m = lote();
    return {
      ...m,
      georreferencia: { latitude: -19.9167, longitude: -43.9345, projetada: { lesteM: 611_000, norteM: 7_796_000, crs: 'EPSG:31983' } },
    } as BlueprintModel;
  }

  it('traz E/N, lat/long e o azimute VERDADEIRO por lado', () => {
    const r = roteiroPerimetrico(georreferenciado());
    expect(r.georreferenciado).toBe(true);
    expect(r.crs).toBe('EPSG:31983');
    expect(r.convergenciaGraus).not.toBeNull();
    for (const v of r.vertices) {
      expect(v.este).not.toBeNull();
      expect(v.latitudeTexto).toMatch(/S$/);
    }
    // ⚠️ A física, que o meu primeiro teste tinha ao contrário (e passava por
    // ruído numérico): o Y do desenho É o norte verdadeiro (rotação 0), então o
    // azimute VERDADEIRO coincide com o de DESENHO até o segundo de arco. Quem
    // difere pela convergência é o de QUADRÍCULA (o medido entre os E/N).
    for (let i = 0; i < r.lados.length; i += 1) {
      const l = r.lados[i];
      expect(l.azimuteVerdadeiro).not.toBeNull();
      const dVerdDes = ((l.azimuteVerdadeiro! - l.azimuteDeDesenho + 540) % 360) - 180;
      expect(Math.abs(dVerdDes)).toBeLessThan(0.001); // < 3,6"
      const de = r.vertices[i];
      const para = r.vertices[(i + 1) % r.vertices.length];
      const azQuad = azimuteEntre({ x: de.este!, y: de.norte! }, { x: para.este!, y: para.norte! });
      const dQuadVerd = ((l.azimuteVerdadeiro! - azQuad + 540) % 360) - 180;
      expect(dQuadVerd).toBeCloseTo(r.convergenciaGraus!, 3);
      expect(l.distanciaNoTerrenoMm).not.toBeNull();
    }
    expect(r.avisos.some((a) => /Sem georreferência/.test(a))).toBe(false);
  });

  it('⚠️ o desenho JÁ é o terreno; o que encolhe é a distância na QUADRÍCULA', () => {
    // O modelo é em mm LOCAIS (plano do terreno). Projetar em UTM multiplica
    // por k < 1 perto do MC; desprojetar (distanciaNoElipsoide) devolve o
    // terreno. Então a distância "no terreno" tem de ser a do desenho, e a
    // distância entre os E/N (a de quadrícula) tem de ser MENOR.
    const r = roteiroPerimetrico(georreferenciado());
    for (let i = 0; i < r.lados.length; i += 1) {
      const l = r.lados[i];
      expect(Math.abs(l.distanciaNoTerrenoMm! - l.distanciaMm)).toBeLessThanOrEqual(1);
      const de = r.vertices[i];
      const para = r.vertices[(i + 1) % r.vertices.length];
      const quadriculaMm = Math.hypot(para.este! - de.este!, para.norte! - de.norte!) * 1000;
      expect(quadriculaMm).toBeLessThan(l.distanciaMm);
      // e a razão é o fator de escala do UTM em BH: ~0,99975.
      expect(quadriculaMm / l.distanciaMm).toBeGreaterThan(0.9996);
      expect(quadriculaMm / l.distanciaMm).toBeLessThan(1);
    }
  });
});

describe('memorial convencional e restituição', () => {
  it('o memorial nomeia os vértices, os azimutes e fecha no vértice inicial', () => {
    const m = applyCommand(lote(), {
      type: 'NomearVerticesDoTerreno',
      pontos: [{ x: 0, y: 0 }, { x: 0, y: 30000 }, { x: 12000, y: 30000 }, { x: 12000, y: 0 }],
    }).model;
    const texto = memorialConvencional(roteiroPerimetrico(m), { nome: 'Gleba Alvorada', matricula: '12.345' });
    expect(texto).toContain('GLEBA ALVORADA');
    expect(texto).toContain('360,00 m²');
    expect(texto).toContain('Inicia-se a descrição no vértice P1');
    expect(texto).toMatch(/até o vértice P2, confrontando com/);
    expect(texto).toContain('vértice inicial da descrição, fechando o perímetro');
    expect(texto).toContain('Matrícula nº 12.345');
  });

  it('⚠️ restituir o PRÓPRIO memorial devolve o polígono com erro de fechamento zero', () => {
    const m = applyCommand(lote(), {
      type: 'NomearVerticesDoTerreno',
      pontos: [{ x: 0, y: 0 }, { x: 0, y: 30000 }, { x: 12000, y: 30000 }, { x: 12000, y: 0 }],
    }).model;
    const roteiro = roteiroPerimetrico(m);
    const texto = memorialConvencional(roteiro, { nome: 'Gleba' });
    const r = restituirMemorial(texto);
    expect(r.naoLidos).toHaveLength(0);
    expect(r.trechos).toHaveLength(4);
    expect(r.anel).toHaveLength(4);
    // 12 × 30 m: os lados saem com 30.000 e 12.000 mm, e o anel fecha.
    expect(r.trechos.map((t) => t.distanciaMm).sort()).toEqual([12000, 12000, 30000, 30000]);
    expect(r.erroDeFechamentoMm).toBeLessThanOrEqual(2); // arredondamento de GMS a 0"
  });

  it('lê rumo com quadrante, azimute decimal, e DIZ o que não leu', () => {
    const texto = [
      'segue com rumo 90°00\'00" NE e distância de 10,00 m até P2;',
      'daí segue com azimute 180° e distância de 10,00 m até P3;',
      'daí segue com az. 270,0° e distância de 10 m até P4;',
      'daí segue por uma cerca velha até o vértice inicial;',
    ].join('\n');
    const r = restituirMemorial(texto);
    expect(r.trechos.map((t) => Math.round(t.azimute))).toEqual([90, 180, 270]);
    expect(r.naoLidos).toHaveLength(0); // a última frase não tem azimute nem distância: não é trecho, é prosa
    // Sem o quarto lado, não fecha — e o erro é DITO, não escondido.
    expect(r.erroDeFechamentoMm).toBe(10000);
  });
});
