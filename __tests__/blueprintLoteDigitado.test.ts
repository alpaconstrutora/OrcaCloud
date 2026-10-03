/**
 * O LOTE DIGITADO (03/10/2026) — o contorno do lote pelas medidas, sem desenhar.
 *
 * O que se trava: papéis do retângulo na convenção da matrícula (direita de
 * quem está na rua); o percurso HORÁRIO dos lados e ângulos; o azimute girado
 * pelo norte do estudo (a ida pelo Roteiro e a volta pela restituição dão o
 * MESMO lote); o fechamento que nunca é calado; e a lista de comandos que o
 * editor aplica de uma vez, com os ids certos.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, signedArea, type BlueprintModel, type Point } from '../utils/blueprintKernel';
import { azimuteDaDirecao } from '../utils/blueprintGrafoEspacial';
import {
  anguloTexto,
  aplicarHeranca,
  herancaPorVertices,
  loteExistente,
  metrosTexto,
  rotacaoDoNorte,
  comandosDoLote,
  direcaoDoAzimute,
  fecharLote,
  lerAnguloDigitado,
  lerAzimuteOuRumo,
  lerMedidaEmMetros,
  lotePorAzimutes,
  lotePorCoordenadas,
  lotePorLadosEAngulos,
  loteRetangular,
  toleranciaDeFechamentoMm,
} from '../utils/blueprintLoteDigitado';
import { memorialConvencional, restituirMemorial, roteiroPerimetrico } from '../utils/blueprintRoteiroPerimetrico';
import { medirTerreno, papeisSugeridos } from '../utils/blueprintTerreno';
import { geoParaProjetado, crsPorCodigo } from '../utils/geo';
import { localParaGeo } from '../utils/blueprintTopografia';

function base(): BlueprintModel {
  return applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
}

const PAPEIS_RET = ['FRENTE', 'LATERAL_DIREITA', 'FUNDOS', 'LATERAL_ESQUERDA'] as const;
const perto = (a: Point, b: Point, tol: number) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;

describe('leitura do que se digita', () => {
  it('medida em metros, com vírgula ou ponto, vira mm', () => {
    expect(lerMedidaEmMetros('12,50')).toBe(12500);
    expect(lerMedidaEmMetros('12.5 m')).toBe(12500);
    expect(lerMedidaEmMetros('1.234,567')).toBe(1234567);
    expect(lerMedidaEmMetros('')).toBeNull();
    expect(lerMedidaEmMetros('-3')).toBeNull();
    expect(lerMedidaEmMetros('doze')).toBeNull();
  });

  it('ângulo em GMS, com espaços ou decimal', () => {
    expect(lerAnguloDigitado(`45°30'00"`)).toBeCloseTo(45.5, 9);
    expect(lerAnguloDigitado('45 30 36')).toBeCloseTo(45.51, 9);
    expect(lerAnguloDigitado('90')).toBe(90);
    expect(lerAnguloDigitado('87,25')).toBeCloseTo(87.25, 9);
    expect(lerAnguloDigitado('12 m')).toBeNull();
  });

  it('azimute ou rumo — os quatro quadrantes, nas duas grafias', () => {
    expect(lerAzimuteOuRumo('135°30\'').azimute).toBeCloseTo(135.5, 9);
    expect(lerAzimuteOuRumo('45°30\' NE').azimute).toBeCloseTo(45.5, 9);
    expect(lerAzimuteOuRumo('45°30\' SE').azimute).toBeCloseTo(134.5, 9);
    expect(lerAzimuteOuRumo('45° SO').azimute).toBeCloseTo(225, 9);
    expect(lerAzimuteOuRumo('45° NO').azimute).toBeCloseTo(315, 9);
    expect(lerAzimuteOuRumo('S 30° E').azimute).toBeCloseTo(150, 9);
    expect(lerAzimuteOuRumo('N 30 W').azimute).toBeCloseTo(330, 9);
    expect(lerAzimuteOuRumo('95° NE').erro).toMatch(/rumo vai de 0° a 90°/);
    expect(lerAzimuteOuRumo('400').erro).toMatch(/azimute vai de 0° a 360°/);
  });
});

describe('direção do azimute', () => {
  it('é o inverso exato de azimuteDaDirecao, com o norte girado', () => {
    for (const rot of [0, 30, -47.5, 180]) {
      for (const az of [0, 45, 90, 135.2, 200, 359]) {
        expect(azimuteDaDirecao(direcaoDoAzimute(az, rot), rot)).toBeCloseTo(az % 360, 1);
      }
    }
  });
});

describe('frente × fundo', () => {
  it('12 × 30: 360 m², papéis certos e iguais aos que o sistema sugeriria', () => {
    const f = fecharLote(loteRetangular({ frenteMm: 12000, profundidadeMm: 30000, confrontantes: { FRENTE: 'Rua das Acácias' } }));
    expect(f.problema).toBeNull();
    expect(f.areaMm2).toBe(360e6);
    expect(f.lados.map((l) => l.papel)).toEqual(['FRENTE', 'LATERAL_DIREITA', 'FUNDOS', 'LATERAL_ESQUERDA']);
    expect(f.lados.map((l) => l.medidaMm)).toEqual([12000, 30000, 12000, 30000]);
    expect(f.lados[0].confrontante).toBe('Rua das Acácias');
    // A convenção da matrícula: o `papeisSugeridos` (direita de quem está na
    // rua) tem de concordar com os papéis que o retângulo já traz.
    const m = base();
    const cmds = comandosDoLote(m, m.levels[0].id, { ...f, lados: f.lados.map((l) => ({ ...l, papel: null })) });
    const semPapel = applyBatch(m, cmds).model;
    const terreno = medirTerreno(semPapel.boundaries)!;
    const frente = semPapel.boundaries.find((b) => b.a.x === 0 && b.a.y === 0)!;
    const sugeridos = papeisSugeridos(terreno, frente.id)!;
    expect(semPapel.boundaries.map((b) => sugeridos.get(b.id))).toEqual(['FRENTE', 'LATERAL_DIREITA', 'FUNDOS', 'LATERAL_ESQUERDA']);
  });

  it('com a frente voltada para o leste (90°), a frente fica na face leste', () => {
    const f = fecharLote(loteRetangular({ frenteMm: 10000, profundidadeMm: 25000, frenteVoltadaPara: 90 }));
    expect(f.problema).toBeNull();
    // A frente vai de V0 a V1; a normal externa dela aponta para o leste (+X).
    const [a, b] = [f.anel[0], f.anel[1]];
    const centro = f.anel.reduce((s, p) => ({ x: s.x + p.x / 4, y: s.y + p.y / 4 }), { x: 0, y: 0 });
    const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    expect(meio.x - centro.x).toBeGreaterThan(12000);
    expect(Math.abs(meio.y - centro.y)).toBeLessThan(1);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(10000, 0);
  });

  it('sem medidas diz o que falta', () => {
    expect(fecharLote(loteRetangular({ frenteMm: 0, profundidadeMm: 30000 })).problema).toMatch(/frente e a profundidade/);
  });
});

describe('lados e ângulos (percurso horário)', () => {
  it('o quadrado fecha, sem erro angular', () => {
    const lote = lotePorLadosEAngulos([10000, 10000, 10000, 10000].map((d) => ({ distanciaMm: d, anguloInternoGraus: 90 })));
    expect(lote.erroDeFechamentoMm).toBeLessThan(0.01);
    expect(lote.erroAngularGraus).toBe(0);
    const f = fecharLote(lote);
    expect(f.problema).toBeNull();
    expect(f.compensacao).toBe('NENHUMA');
    expect(f.areaMm2).toBe(100e6);
    // Horário: área com sinal negativa (Y para cima), interior à direita.
    expect(signedArea(f.anel)).toBeLessThan(0);
  });

  it('um trapézio irregular fecha e o ângulo do 1º vértice só confere', () => {
    // Trapézio retângulo: base 20, altura 10, topo 12 → lado inclinado √(8²+10²).
    const incl = Math.hypot(8000, 10000);
    const angAgudo = (Math.atan2(10000, 8000) * 180) / Math.PI; // ~51,34°
    const lados = [
      { distanciaMm: 20000, anguloInternoGraus: 90 }, // V0: canto de baixo à esquerda
      { distanciaMm: incl, anguloInternoGraus: angAgudo },
      { distanciaMm: 12000, anguloInternoGraus: 180 - angAgudo },
      { distanciaMm: 10000, anguloInternoGraus: 90 },
    ];
    // O percurso horário a partir de +X sai para baixo: o 1º lado é a base.
    const lote = lotePorLadosEAngulos(lados);
    expect(lote.erroDeFechamentoMm).toBeLessThan(0.5);
    expect(lote.erroAngularGraus).toBeCloseTo(0, 6);
    const f = fecharLote(lote);
    expect(f.problema).toBeNull();
    expect(f.areaMm2 / 1e6).toBeCloseTo(160, 1);
  });

  it('ângulo trocado não fecha e o erro angular é dito', () => {
    const lote = lotePorLadosEAngulos([
      { distanciaMm: 10000, anguloInternoGraus: 90 },
      { distanciaMm: 10000, anguloInternoGraus: 92 },
      { distanciaMm: 10000, anguloInternoGraus: 90 },
      { distanciaMm: 10000, anguloInternoGraus: 90 },
    ]);
    expect(lote.erroAngularGraus).toBeCloseTo(2, 6);
    expect(lote.erroDeFechamentoMm).toBeGreaterThan(300);
    expect(fecharLote(lote).problema).toMatch(/Não fecha: sobram/);
  });

  it('falta de medida ou de ângulo é dita pelo número do lado', () => {
    expect(lotePorLadosEAngulos([{ distanciaMm: 10000, anguloInternoGraus: null }, { distanciaMm: 0, anguloInternoGraus: 90 }, { distanciaMm: 10000, anguloInternoGraus: 90 }]).problema).toMatch(/Lado 2: informe a medida/);
    expect(lotePorLadosEAngulos([{ distanciaMm: 10000, anguloInternoGraus: null }, { distanciaMm: 10000, anguloInternoGraus: null }, { distanciaMm: 10000, anguloInternoGraus: 90 }]).problema).toMatch(/Lado 2: informe o ângulo/);
  });
});

describe('azimutes e rumos', () => {
  const quadrado = [0, 90, 180, 270].map((azimute) => ({ azimute, distanciaMm: 20000 }));

  it('com o norte do estudo girado 30°, o 1º lado sai girado 30° no desenho', () => {
    const lote = lotePorAzimutes(quadrado, { rotacaoNorteDeg: 30 });
    expect(lote.erroDeFechamentoMm).toBeLessThan(0.01);
    const d = { x: lote.caminho[1].x - lote.caminho[0].x, y: lote.caminho[1].y - lote.caminho[0].y };
    expect(azimuteDaDirecao(d, 30)).toBeCloseTo(0, 1);
    expect(d.x).toBeCloseTo(20000 * Math.sin(Math.PI / 6), 3);
  });

  it('fechamento: abaixo da tolerância distribui sozinho e diz', () => {
    const lote = lotePorAzimutes([...quadrado.slice(0, 3), { azimute: 270, distanciaMm: 20005 }]);
    expect(lote.erroDeFechamentoMm).toBeCloseTo(5, 3);
    expect(toleranciaDeFechamentoMm(lote.perimetroMm)).toBeCloseTo(16, 0);
    const f = fecharLote(lote);
    expect(f.problema).toBeNull();
    expect(f.compensacao).toBe('DISTRIBUIDA');
    expect(f.descricao).toMatch(/distribuído/);
  });

  it('acima da tolerância exige escolher: distribuir ou divisa de ajuste', () => {
    const lote = lotePorAzimutes([...quadrado.slice(0, 3), { azimute: 270, distanciaMm: 19500 }]);
    expect(lote.erroDeFechamentoMm).toBeCloseTo(500, 3);
    expect(fecharLote(lote).problema).toMatch(/Não fecha/);

    const dist = fecharLote(lote, 'DISTRIBUIR');
    expect(dist.problema).toBeNull();
    expect(dist.anel).toHaveLength(4);
    expect(dist.anel[0]).toEqual({ x: 0, y: 0 }); // o 1º vértice não anda
    expect(dist.compensacao).toBe('DISTRIBUIDA');

    const ajuste = fecharLote(lote, 'DIVISA_DE_AJUSTE');
    expect(ajuste.problema).toBeNull();
    expect(ajuste.anel).toHaveLength(5);
    expect(ajuste.lados[4]).toMatchObject({ ajuste: true, medidaMm: null });
    expect(ajuste.descricao).toMatch(/divisa de ajuste de 0,50 m/);
    // A divisa de ajuste tem o tamanho do erro.
    const [p, q] = [ajuste.anel[4], ajuste.anel[0]];
    expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeCloseTo(500, 0);
  });

  it('contorno que se cruza é recusado', () => {
    const laco = lotePorAzimutes([
      { azimute: 90, distanciaMm: 10000 },
      { azimute: 225, distanciaMm: Math.hypot(10000, 10000) },
      { azimute: 90, distanciaMm: 10000 },
      { azimute: 315, distanciaMm: Math.hypot(10000, 10000) },
    ]);
    expect(fecharLote(laco).problema).toMatch(/se cruza/);
  });
});

describe('coordenadas', () => {
  it('locais em metros, com nome e vírgula decimal: vão para a origem pelo 1º vértice', () => {
    const texto = ['P1; 1000,00; 1000,00', 'P2 1012,00 1000,00', 'P3\t1012,00\t1030,00', '1000 1030', 'linha sem número'].join('\n');
    const lote = lotePorCoordenadas(texto, { georreferencia: null }, { ordem: 'EN' });
    expect(lote.naoLidas).toEqual(['linha sem número']);
    expect(lote.unidadeLida).toBe('M');
    const f = fecharLote(lote);
    expect(f.problema).toBeNull();
    expect(f.anel).toEqual([{ x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 30000 }, { x: 0, y: 30000 }]);
    expect(f.vertices).toEqual(['P1', 'P2', 'P3', null]);
    expect(f.areaMm2).toBe(360e6);
  });

  it('N antes de E troca os eixos; o 1º vértice repetido no fim é tirado', () => {
    const lote = lotePorCoordenadas('0 0\n0 12\n30 12\n30 0\n0 0', { georreferencia: null }, { ordem: 'NE' });
    const f = fecharLote(lote);
    expect(f.anel).toEqual([{ x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 30000 }, { x: 0, y: 30000 }]);
  });

  it('UTM com a georreferência do estudo cai no lugar certo (o vértice do próprio desenho)', () => {
    const geo = { latitude: -19.9167, longitude: -43.9345 };
    const crs = crsPorCodigo('EPSG:31983')!;
    const alvo = [{ x: 5000, y: 5000 }, { x: 17000, y: 5000 }, { x: 17000, y: 35000 }, { x: 5000, y: 35000 }];
    const utm = alvo.map((p) => geoParaProjetado(localParaGeo(p, geo), crs).valor);
    const texto = utm.map((u, i) => `M${i + 1} ${u.este.toFixed(3)} ${u.norte.toFixed(3)}`).join('\n');
    const lote = lotePorCoordenadas(texto, { georreferencia: geo }, { ordem: 'EN' });
    expect(lote.unidadeLida).toBe('UTM');
    const f = fecharLote(lote);
    expect(f.problema).toBeNull();
    f.anel.forEach((p, i) => expect(perto(p, alvo[i], 30)).toBe(true));
    expect(f.vertices).toEqual(['M1', 'M2', 'M3', 'M4']);
  });

  it('UTM sem georreferência diz o que falta', () => {
    const lote = lotePorCoordenadas('611000 7796000\n611012 7796000\n611012 7796030', { georreferencia: null }, { ordem: 'EN' });
    expect(lote.problema).toMatch(/georreferência/);
  });
});

describe('comandos para o kernel', () => {
  it('papéis, medida da escritura, confrontante e nomes — numa lista só, que reaplicada dá o mesmo modelo', () => {
    const m = base();
    const lote = lotePorAzimutes(
      [
        { azimute: 0, distanciaMm: 30000, confrontante: 'Lote 11', verticeNome: 'P1' },
        { azimute: 90, distanciaMm: 12000, confrontante: 'Lote 20', verticeNome: 'P2' },
        { azimute: 180, distanciaMm: 30000, confrontante: 'Lote 13', verticeNome: 'P3' },
        { azimute: 270, distanciaMm: 12000, confrontante: 'Rua das Flores', verticeNome: 'P4' },
      ],
    );
    const f = fecharLote(lote);
    const cmds = comandosDoLote(m, m.levels[0].id, f, { medidasDaEscritura: true });
    expect(cmds.filter((c) => c.type === 'AddBoundary')).toHaveLength(4);
    expect(cmds.filter((c) => c.type === 'SetBoundaryEscritura')).toHaveLength(4);
    expect(cmds.filter((c) => c.type === 'SetVerticeDoTerreno')).toHaveLength(4);
    const r1 = applyBatch(m, cmds).model;
    const r2 = applyBatch(m, cmds).model;
    // Os uids são aleatórios; ids, geometria e escritura não.
    const resumo = (x: BlueprintModel) => ({ b: x.boundaries.map(({ uid: _u, ...b }) => b), v: (x.verticesDoTerreno ?? []).map((v) => [v.nome, v.ponto]) });
    expect(resumo(r1)).toEqual(resumo(r2));
    const terreno = r1.boundaries.filter((b) => b.kind === 'TERRENO');
    expect(terreno.map((b) => b.medidaEscrituraMm)).toEqual([30000, 12000, 30000, 12000]);
    expect(terreno.map((b) => b.confrontante)).toEqual(['Lote 11', 'Lote 20', 'Lote 13', 'Rua das Flores']);
    expect((r1.verticesDoTerreno ?? []).map((v) => v.nome)).toEqual(['P1', 'P2', 'P3', 'P4']);
    expect(medirTerreno(terreno)!.fechado).toBe(true);
  });

  it('sem "as medidas são da escritura", grava só o confrontante', () => {
    const m = base();
    const f = fecharLote(loteRetangular({ frenteMm: 12000, profundidadeMm: 30000, confrontantes: { FRENTE: 'Rua A' } }));
    const r = applyBatch(m, comandosDoLote(m, m.levels[0].id, f, { medidasDaEscritura: false })).model;
    expect(r.boundaries.map((b) => b.medidaEscrituraMm ?? null)).toEqual([null, null, null, null]);
    expect(r.boundaries[0].confrontante).toBe('Rua A');
  });

  it('com lote existente recusa sem "substituir"; com ele, troca divisas e nomes', () => {
    const m0 = base();
    const levelId = m0.levels[0].id;
    const velho = fecharLote(lotePorAzimutes([0, 90, 180, 270].map((azimute, i) => ({ azimute, distanciaMm: 10000, verticeNome: `V${i + 1}` }))));
    const m = applyBatch(m0, comandosDoLote(m0, levelId, velho)).model;
    const novo = fecharLote(loteRetangular({ frenteMm: 12000, profundidadeMm: 30000 }));
    expect(() => comandosDoLote(m, levelId, novo)).toThrow(/Substituir o lote atual/);
    const r = applyBatch(m, comandosDoLote(m, levelId, novo, { substituir: true })).model;
    const terreno = r.boundaries.filter((b) => b.kind === 'TERRENO');
    expect(terreno).toHaveLength(4);
    expect(medirTerreno(terreno)!.areaMm2).toBe(360e6);
    expect(r.verticesDoTerreno ?? []).toHaveLength(0);
  });

  it('a divisa de ajuste entra sem medida de escritura', () => {
    const m = base();
    const lote = lotePorAzimutes([0, 90, 180, 270].map((azimute, i) => ({ azimute, distanciaMm: i === 3 ? 9000 : 10000 })));
    const f = fecharLote(lote, 'DIVISA_DE_AJUSTE');
    const r = applyBatch(m, comandosDoLote(m, m.levels[0].id, f, { medidasDaEscritura: true })).model;
    expect(r.boundaries).toHaveLength(5);
    expect(r.boundaries.map((b) => b.medidaEscrituraMm ?? null)).toEqual([10000, 10000, 10000, 9000, null]);
    expect(medirTerreno(r.boundaries)!.fechado).toBe(true);
  });
});

describe('a volta do memorial', () => {
  it('⚠️ o memorial do Roteiro de um estudo com o norte girado 30° restitui o MESMO lote', () => {
    const m0 = base();
    const levelId = m0.levels[0].id;
    // Um lote irregular, desenhado no desenho girado.
    const anel = [{ x: 0, y: 0 }, { x: 14000, y: 2000 }, { x: 16000, y: 31000 }, { x: -1000, y: 28000 }];
    const comLote = applyBatch(m0, [
      { type: 'SetGeorreferencia', georreferencia: { latitude: -19.9167, longitude: -43.9345, rotacaoNorteDeg: 30, projetada: { lesteM: 611_000, norteM: 7_796_000, crs: 'EPSG:31983' } } },
      ...anel.map((a, i) => ({ type: 'AddBoundary' as const, levelId, a, b: anel[(i + 1) % 4], kind: 'TERRENO' as const })),
      { type: 'NomearVerticesDoTerreno', pontos: anel },
    ]).model;
    const roteiro = roteiroPerimetrico(comLote);
    expect(roteiro.georreferenciado).toBe(true);
    const texto = memorialConvencional(roteiro, { nome: 'Lote' });
    const lido = restituirMemorial(texto);
    expect(lido.naoLidos).toHaveLength(0);
    expect(lido.verticeInicial).toBe(roteiro.vertices[0].nome);
    expect(lido.trechos.map((t) => t.ateVertice)).toEqual(roteiro.lados.map((l) => l.para));
    const lote = lotePorAzimutes(
      lido.trechos.map((t) => ({ azimute: t.azimute, distanciaMm: t.distanciaMm })),
      { rotacaoNorteDeg: 30 },
    );
    expect(lote.erroDeFechamentoMm).toBeLessThan(20);
    const f = fecharLote(lote);
    expect(f.problema).toBeNull();
    // Mesmo lote: cada vértice restituído, levado ao 1º do roteiro, cai sobre o do desenho.
    const o = roteiro.vertices[0].ponto;
    f.anel.forEach((p, i) => expect(perto({ x: p.x + o.x, y: p.y + o.y }, roteiro.vertices[i].ponto, 20)).toBe(true));
  });

  it('confrontante e vértices saem do texto', () => {
    const r = restituirMemorial(
      'Inicia-se a descrição no vértice M-01; daí segue com azimute 90°00\'00" e distância de 12,00 m até o vértice M-02, confrontando com a Rua das Acácias; daí segue com azimute 180°00\'00" e distância de 30,00 m até o vértice M-03, confrontando com Lote 11, vértice inicial da descrição, fechando o perímetro.',
    );
    expect(r.verticeInicial).toBe('M-01');
    expect(r.trechos.map((t) => t.confrontante)).toEqual(['a Rua das Acácias', 'Lote 11']);
    expect(r.trechos.map((t) => t.ateVertice)).toEqual(['M-02', 'M-03']);
  });
});

/**
 * EDITAR o lote que já existe (03/10/2026) — *"se o lote já estiver sido
 * criado, e ao clicar em digitar, carregar os valores do lote e permita editar
 * (alterar)"*.
 *
 * A ida e a volta pela tela (o texto que a aba mostra, lido de novo) têm de dar
 * o MESMO lote, no mesmo lugar, com tudo o que ele carregava; e mudar uma
 * medida muda só a geometria.
 */
describe('editar o lote existente', () => {
  /** Lote irregular, girado, fora da origem, com escritura, confrontante, papel, SIGEF e vértices com dados. */
  function comLote(rotacaoNorteDeg = 30): BlueprintModel {
    const m0 = base();
    const levelId = m0.levels[0].id;
    const anel = [{ x: 3000, y: 4000 }, { x: 4500, y: 33000 }, { x: 19000, y: 32000 }, { x: 16000, y: 5000 }];
    const comDivisas = applyBatch(m0, [
      { type: 'SetGeorreferencia', georreferencia: { latitude: -19.9167, longitude: -43.9345, rotacaoNorteDeg } },
      ...anel.map((a, i) => ({ type: 'AddBoundary' as const, levelId, a, b: anel[(i + 1) % 4], kind: 'TERRENO' as const })),
    ]).model;
    const ids = comDivisas.boundaries.map((b) => b.id);
    return applyBatch(comDivisas, [
      ...ids.map((id, i) => ({ type: 'SetBoundaryEscritura' as const, boundaryId: id, medidaMm: 29000 + i, confrontante: `Confrontante ${i + 1}` })),
      { type: 'SetBoundaryPapel' as const, boundaryId: ids[3], papel: 'FRENTE' },
      { type: 'SetBoundarySigef' as const, boundaryId: ids[1], tipoDeLimite: 'LA1', confrontanteMatricula: '12.345' },
      ...anel.map((p, i) => ({ type: 'SetVerticeDoTerreno' as const, ponto: p, nome: `M-0${i + 1}`, tipo: 'M' as const, sigmaMm: 50 + i, altitudeM: 800 + i })),
    ]).model;
  }

  /** O que importa comparar, sem depender de ids nem da ordem gravada. */
  function resumo(m: BlueprintModel) {
    const chave = (p: Point) => `${p.x},${p.y}`;
    const lados = m.boundaries
      .filter((b) => b.kind === 'TERRENO')
      .map((b) => `${chave(b.a)}>${chave(b.b)}|${b.papel ?? '-'}|${b.medidaEscrituraMm ?? '-'}|${b.confrontante ?? '-'}|${b.tipoDeLimite ?? '-'}|${b.confrontanteMatricula ?? '-'}`)
      .sort();
    const vertices = (m.verticesDoTerreno ?? []).map((v) => `${chave(v.ponto)}|${v.nome}|${v.tipo}|${v.sigmaMm}|${v.altitudeM}`).sort();
    return { lados, vertices };
  }

  /** As pontas como conjunto não orientado (o lote recriado pode correr no outro sentido). */
  function lado(b: { a: Point; b: Point }) {
    const [p, q] = [`${b.a.x},${b.a.y}`, `${b.b.x},${b.b.y}`].sort();
    return `${p}~${q}`;
  }

  it('loteExistente lê o lote no sentido do roteiro, com tudo o que cada lado e vértice carregam', () => {
    const m = comLote();
    const e = loteExistente(m)!;
    expect(e).not.toBeNull();
    expect(e.anel).toHaveLength(4);
    expect(e.lados.filter((l) => l.papel === 'FRENTE')).toHaveLength(1);
    expect(e.lados.some((l) => l.sigef?.tipoDeLimite === 'LA1' && l.sigef.confrontanteMatricula === '12.345')).toBe(true);
    expect(e.vertices.every((v) => v && /^M-0\d$/.test(v.nome) && v.tipo === 'M')).toBe(true);
    // Ângulos internos de um quadrilátero somam 360°.
    expect(e.angulosInternos.reduce((s, a) => s + a, 0)).toBeCloseTo(360, 6);
    expect(e.retangulo).toBeNull();
    expect(loteExistente(base())).toBeNull();
  });

  /** Recria o lote pelos azimutes como a tela faria (textos de volta) e aplica. */
  function pelosAzimutes(m: BlueprintModel, mudar?: (i: number, distanciaMm: number) => number) {
    const e = loteExistente(m)!;
    const rot = rotacaoDoNorte(m);
    const trechos = e.anel.map((_, i) => ({
      azimute: lerAzimuteOuRumo(anguloTexto(e.azimutes[i])).azimute!,
      distanciaMm: lerMedidaEmMetros(metrosTexto(mudar ? mudar(i, e.distanciasMm[i]) : e.distanciasMm[i]))!,
      confrontante: e.lados[i].confrontante,
      verticeNome: e.vertices[i]?.nome ?? null,
    }));
    const f = aplicarHeranca(fecharLote(lotePorAzimutes(trechos, { rotacaoNorteDeg: rot, origem: e.anel[0] }), 'DISTRIBUIR'), e.lados, e.vertices);
    return applyBatch(m, comandosDoLote(m, m.levels[0].id, f, { substituir: true, medidasDaEscritura: false })).model;
  }

  it('⚠️ pelos azimutes, sem mudar nada: o MESMO lote, no mesmo lugar, com escritura, papel, SIGEF e vértices', () => {
    const m = comLote();
    const r = pelosAzimutes(m);
    expect(resumo(r).vertices).toEqual(resumo(m).vertices);
    const orig = m.boundaries.map(lado).sort();
    expect(r.boundaries.filter((b) => b.kind === 'TERRENO').map(lado).sort()).toEqual(orig);
    // Cada lado recriado leva o que o lado de mesma geometria tinha.
    const porLado = (x: BlueprintModel) => new Map(x.boundaries.map((b) => [lado(b), b]));
    const [antes, depois] = [porLado(m), porLado(r)];
    for (const [k, b] of antes) {
      const d = depois.get(k)!;
      expect([d.papel ?? null, d.medidaEscrituraMm, d.confrontante, d.tipoDeLimite ?? null, d.confrontanteMatricula ?? null]).toEqual([
        b.papel ?? null,
        b.medidaEscrituraMm,
        b.confrontante,
        b.tipoDeLimite ?? null,
        b.confrontanteMatricula ?? null,
      ]);
    }
  });

  it('pelos lados e ângulos, sem mudar nada: o mesmo lote', () => {
    const m = comLote(-12);
    const e = loteExistente(m)!;
    const lados = e.anel.map((_, i) => ({
      distanciaMm: lerMedidaEmMetros(metrosTexto(e.distanciasMm[i]))!,
      anguloInternoGraus: lerAnguloDigitado(anguloTexto(e.angulosInternos[i])),
      confrontante: e.lados[i].confrontante,
      verticeNome: e.vertices[i]?.nome ?? null,
    }));
    const lote = lotePorLadosEAngulos(lados, { azimuteDoPrimeiro: lerAzimuteOuRumo(anguloTexto(e.azimutes[0])).azimute, rotacaoNorteDeg: rotacaoDoNorte(m), origem: e.anel[0] });
    expect(Math.abs(lote.erroAngularGraus!)).toBeLessThan(1e-4);
    const f = aplicarHeranca(fecharLote(lote, 'DISTRIBUIR'), e.lados, e.vertices);
    const r = applyBatch(m, comandosDoLote(m, m.levels[0].id, f, { substituir: true })).model;
    expect(r.boundaries.filter((b) => b.kind === 'TERRENO').map(lado).sort()).toEqual(m.boundaries.map(lado).sort());
    expect(resumo(r).vertices).toEqual(resumo(m).vertices);
  });

  it('mudar UMA distância muda a geometria e mantém a escritura e os nomes', () => {
    const m = comLote();
    const r = pelosAzimutes(m, (i, d) => (i === 1 ? d + 1500 : d));
    const t = r.boundaries.filter((b) => b.kind === 'TERRENO');
    expect(t).toHaveLength(4);
    expect(medirTerreno(t)!.fechado).toBe(true);
    expect(t.map(lado).sort()).not.toEqual(m.boundaries.map(lado).sort());
    expect(t.map((b) => b.medidaEscrituraMm).sort()).toEqual([29000, 29001, 29002, 29003]);
    expect((r.verticesDoTerreno ?? []).map((v) => v.nome).sort()).toEqual(['M-01', 'M-02', 'M-03', 'M-04']);
  });

  it('com "as medidas digitadas são as da escritura", a escritura passa a ser a digitada', () => {
    const m = comLote();
    const e = loteExistente(m)!;
    const trechos = e.anel.map((_, i) => ({ azimute: e.azimutes[i], distanciaMm: Math.round(e.distanciasMm[i]), verticeNome: e.vertices[i]?.nome ?? null }));
    const f = aplicarHeranca(fecharLote(lotePorAzimutes(trechos, { rotacaoNorteDeg: 30, origem: e.anel[0] }), 'DISTRIBUIR'), e.lados, e.vertices);
    const r = applyBatch(m, comandosDoLote(m, m.levels[0].id, f, { substituir: true, medidasDaEscritura: true })).model;
    expect(r.boundaries.map((b) => b.medidaEscrituraMm).sort()).toEqual(e.distanciasMm.map((d) => Math.round(d)).sort());
  });

  it('retângulo com os quatro papéis: abre em Frente × fundo e volta igual; aumentar a frente cresce para a DIREITA', () => {
    const m0 = base();
    const levelId = m0.levels[0].id;
    const comRot = applyBatch(m0, [{ type: 'SetGeorreferencia', georreferencia: { latitude: -19.9, longitude: -43.9, rotacaoNorteDeg: 25 } }]).model;
    const novo = fecharLote(loteRetangular({ frenteMm: 12000, profundidadeMm: 30000, frenteVoltadaPara: 200, rotacaoNorteDeg: 25, origem: { x: 7000, y: -3000 }, confrontantes: { FRENTE: 'Rua A' } }));
    const m = applyBatch(comRot, comandosDoLote(comRot, levelId, novo, { medidasDaEscritura: true })).model;
    const e = loteExistente(m)!;
    expect(e.retangulo).not.toBeNull();
    const ret = e.retangulo!;
    expect(ret.frenteMm).toBeCloseTo(12000, 0);
    expect(ret.profundidadeMm).toBeCloseTo(30000, 0);
    expect(ret.frenteVoltadaPara).toBeCloseTo(200, 3);
    expect(perto(ret.origem, { x: 7000, y: -3000 }, 2)).toBe(true);
    expect(ret.lados.FRENTE.confrontante).toBe('Rua A');
    const refazer = (frenteMm: number) =>
      aplicarHeranca(
        fecharLote(loteRetangular({ frenteMm, profundidadeMm: ret.profundidadeMm, frenteVoltadaPara: lerAzimuteOuRumo(anguloTexto(ret.frenteVoltadaPara)).azimute, rotacaoNorteDeg: 25, origem: ret.origem, confrontantes: { FRENTE: ret.lados.FRENTE.confrontante } })),
        PAPEIS_RET.map((p) => ret.lados[p]),
        ret.vertices,
        { herdarNomes: true },
      );
    const igual = applyBatch(m, comandosDoLote(m, levelId, refazer(12000), { substituir: true })).model;
    expect(igual.boundaries.map(lado).sort()).toEqual(m.boundaries.map(lado).sort());
    const maior = applyBatch(m, comandosDoLote(m, levelId, refazer(15000), { substituir: true })).model;
    const frente = maior.boundaries.find((b) => b.papel === 'FRENTE')!;
    // A ponta esquerda fica; a frente cresce 3 m.
    expect([frente.a, frente.b].some((p) => perto(p, { x: 7000, y: -3000 }, 2))).toBe(true);
    // (Coordenada é mm inteiro: num lado girado, o comprimento erra por menos de 1 mm.)
    expect(Math.abs(Math.hypot(frente.b.x - frente.a.x, frente.b.y - frente.a.y) - 15000)).toBeLessThan(1);
    expect(frente.confrontante).toBe('Rua A');
  });

  it('coordenadas: casa os vértices pelo NOME (ou pela posição), e o lado só herda com as duas pontas casadas', () => {
    const m = comLote();
    const e = loteExistente(m)!;
    const nomes = e.vertices.map((v) => v!.nome);
    const h1 = herancaPorVertices(nomes, e);
    expect(h1.lados.every((l, i) => l === e.lados[i])).toBe(true);
    // Um vértice novo no meio: o lado que entra e o que sai dele são novos.
    const h2 = herancaPorVertices([nomes[0], 'NOVO', nomes[1], nomes[2], nomes[3]], e);
    expect(h2.lados.map((l) => l === null)).toEqual([true, true, false, false, false]);
    expect(h2.vertices[1]).toBeNull();
    // Sem nomes: pela posição, se a contagem é a mesma.
    expect(herancaPorVertices([null, null, null, null], e).lados[2]).toBe(e.lados[2]);
    expect(herancaPorVertices([null, null, null], e).lados.every((l) => l === null)).toBe(true);
  });
});
