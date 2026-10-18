/**
 * F8 do plano `2026-10-11-planta-recursos-video-synaps.md` — ESQUADRIA CONFIGURÁVEL
 * (kernel 0.98.0, quant-1.29.0): folhas com mecanismo e largura, bandeira, o símbolo
 * de planta (canvas/PDF/DXF), as peças do 3D, o quadro de esquadrias e as regras do
 * painel.
 */
import { describe, expect, it } from 'vitest';
import {
  KERNEL_VERSION,
  KernelError,
  POLITICA_PADRAO,
  applyBatch,
  applyCommand,
  assinaturaDaEsquadria,
  canonicalPayload,
  cloneModel,
  computeQuantities,
  descricaoDaConfiguracao,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  type BlueprintModel,
  type Command,
  type ConfiguracaoDaEsquadria,
} from '../utils/blueprintKernel';
import {
  acrescentarFolha,
  bandeiraPadrao,
  mudarLarguraDaFolha,
  pecas3dDasFolhas,
  removerFolha,
  simboloDasFolhas,
  trechosDasFolhas,
} from '../utils/blueprintFolhas';
import { ehEspacoDeEspelhar } from '../utils/blueprintAtalhos';
import { comandosParaIgualar } from '../utils/blueprintIgualar';
import { gerarDxf } from '../utils/blueprintDxf';
import { DesenhistaDeProva, desenharAberturas } from '../utils/blueprintExport';
import { projetarElevacao } from '../utils/blueprintElevation';
import { simboloDaElevacao } from '../utils/blueprintFolhas';

const TRES_FOLHAS: ConfiguracaoDaEsquadria = {
  folhas: [
    { mecanismo: 'FIXA', larguraPct: 30 },
    { mecanismo: 'ABRIR', larguraPct: 30 },
    { mecanismo: 'CORRER', larguraPct: 40 },
  ],
  bandeira: { alturaMm: 400, mecanismo: 'BASCULANTE' },
};

/** Uma parede de 6 m e, nela, as aberturas pedidas (offsets de 1,5 m em 1,5 m). */
function planta(aberturas: { kind?: 'door' | 'window' | 'sliding' | 'passage'; configuracao?: ConfiguracaoDaEsquadria; widthMm?: number; heightMm?: number }[]): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  m = applyCommand(m, { type: 'AddWall', levelId: m.levels[0].id, a: point(0, 0), b: point(6000, 0), thicknessMm: 150, heightMm: 2800 }).model;
  const wallId = m.walls[0].id;
  aberturas.forEach((a, i) => {
    const kind = a.kind ?? 'window';
    m = applyCommand(m, {
      type: 'AddOpening',
      wallId,
      kind,
      offsetMm: 200 + i * 1500,
      widthMm: a.widthMm ?? 1200,
      heightMm: a.heightMm ?? (kind === 'window' ? 1200 : 2100),
      sillMm: kind === 'window' ? 1000 : 0,
      ...(a.configuracao ? { configuracao: a.configuracao } : {}),
    }).model;
  });
  return m;
}
const naoAplica = (m: BlueprintModel, c: Command) => () => applyCommand(m, c);

describe('esquadria configurável — o kernel 0.98.0 (F8)', () => {
  it('grava folhas e bandeira, e elas sobrevivem à ida e volta do canônico', () => {
    const m = planta([{ configuracao: TRES_FOLHAS }]);
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(m))).openings[0];
    expect(volta.configuracao).toEqual(TRES_FOLHAS);
  });

  it('abertura SEM configuração sai no canônico sem a chave — desenho antigo só muda pela versão', () => {
    const m = planta([{}, { kind: 'door' }]);
    expect(canonicalPayload(m)).not.toContain('configuracao');
    expect(m.openings.some((o) => 'configuracao' in o)).toBe(false);
  });

  it('SetOpeningConfiguracao grava e, com null, remove a chave', () => {
    let m = planta([{}]);
    const id = m.openings[0].id;
    m = applyCommand(m, { type: 'SetOpeningConfiguracao', openingId: id, configuracao: TRES_FOLHAS }).model;
    expect(m.openings[0].configuracao).toEqual(TRES_FOLHAS);
    m = applyCommand(m, { type: 'SetOpeningConfiguracao', openingId: id, configuracao: null }).model;
    expect('configuracao' in m.openings[0]).toBe(false);
  });

  it('recusa: soma ≠ 100, folha estreita, mecanismo de bandeira, bandeira sem folha embaixo, correr e vão livre', () => {
    const m = planta([{}, { kind: 'sliding' }, { kind: 'passage' }]);
    const [jan, correr, vao] = m.openings.map((o) => o.id);
    const ruins: ConfiguracaoDaEsquadria[] = [
      { folhas: [{ mecanismo: 'FIXA', larguraPct: 50 }, { mecanismo: 'FIXA', larguraPct: 40 }] },
      { folhas: [{ mecanismo: 'FIXA', larguraPct: 97 }, { mecanismo: 'FIXA', larguraPct: 3 }] },
      { folhas: [{ mecanismo: 'FIXA', larguraPct: 100 }], bandeira: { alturaMm: 300, mecanismo: 'CORRER' as 'FIXA' } },
      { folhas: [{ mecanismo: 'FIXA', larguraPct: 100 }], bandeira: { alturaMm: 1000, mecanismo: 'FIXA' } },
      { folhas: Array.from({ length: 7 }, () => ({ mecanismo: 'FIXA' as const, larguraPct: 10 })).map((f, i) => (i === 6 ? { ...f, larguraPct: 40 } : f)) },
    ];
    for (const c of ruins) expect(naoAplica(m, { type: 'SetOpeningConfiguracao', openingId: jan, configuracao: c }), JSON.stringify(c)).toThrow(KernelError);
    for (const id of [correr, vao]) expect(naoAplica(m, { type: 'SetOpeningConfiguracao', openingId: id, configuracao: TRES_FOLHAS })).toThrow(KernelError);
  });

  it('virar correr ou vão livre DESCARTA as folhas; virar porta as mantém', () => {
    const m = planta([{ configuracao: { folhas: [{ mecanismo: 'ABRIR', larguraPct: 100 }] } }]);
    const id = m.openings[0].id;
    expect('configuracao' in applyCommand(m, { type: 'SetOpeningKind', openingId: id, kind: 'sliding' }).model.openings[0]).toBe(false);
    expect(applyCommand(m, { type: 'SetOpeningKind', openingId: id, kind: 'door' }).model.openings[0].configuracao?.folhas[0].mecanismo).toBe('ABRIR');
  });

  it('baixar o vão até a bandeira não caber é recusado, dizendo a faixa', () => {
    const m = planta([{ configuracao: TRES_FOLHAS }]);
    expect(naoAplica(m, { type: 'SetOpeningSize', openingId: m.openings[0].id, heightMm: 600 })).toThrow(/Bandeira de 400 mm: cabe de 100 a 300 mm/);
  });

  it('cloneModel copia as folhas a fundo (o desfazer não é reescrito)', () => {
    const m = planta([{ configuracao: TRES_FOLHAS }]);
    const c = cloneModel(m);
    c.openings[0].configuracao!.folhas[0].larguraPct = 99;
    c.openings[0].configuracao!.bandeira!.alturaMm = 1;
    expect(m.openings[0].configuracao).toEqual(TRES_FOLHAS);
  });
});

describe('esquadria configurável — a assinatura e o quadro (quant-1.29.0)', () => {
  it('sem configuração a assinatura é a de antes, byte a byte (id de linha de orçamento)', () => {
    const o = planta([{ kind: 'door', widthMm: 800 }]).openings[0];
    expect(assinaturaDaEsquadria(o)).toBe('door|800|2100||');
    expect(assinaturaDaEsquadria({ ...o, configuracao: TRES_FOLHAS })).toBe('door|800|2100|||cfg:FIXA30+ABRIR30+CORRER40/B400BASCULANTE');
  });

  it('duas janelas de mesma medida e folhas diferentes = DUAS linhas; folhas iguais = uma linha com 2', () => {
    const correr: ConfiguracaoDaEsquadria = { folhas: [{ mecanismo: 'CORRER', larguraPct: 50 }, { mecanismo: 'CORRER', larguraPct: 50 }] };
    const m = planta([{ configuracao: correr }, { configuracao: TRES_FOLHAS }, { configuracao: correr }]);
    const quadro = computeQuantities(m, POLITICA_PADRAO, KERNEL_VERSION).totais.porEsquadria;
    expect(quadro).toHaveLength(2);
    const porCfg = Object.fromEntries(quadro.map((l) => [l.configuracao, l.quantidade]));
    expect(porCfg).toEqual({ '2 folhas: de correr · de correr': 2, '3 folhas: fixa · de abrir · de correr + bandeira basculante': 1 });
    expect(POLITICA_PADRAO.version).toBe('quant-1.29.0');
  });

  it('a descrição é vazia sem configuração', () => {
    expect(descricaoDaConfiguracao(undefined)).toBe('');
  });
});

describe('esquadria configurável — o símbolo de planta (canvas, PDF e DXF)', () => {
  const W = { a: point(0, 0), b: point(6000, 0), thicknessMm: 150 };
  const porta = (configuracao: ConfiguracaoDaEsquadria | undefined, hingeAtStart = true, swingReversed = false) =>
    ({ kind: 'door' as const, offsetMm: 1000, widthMm: 1600, heightMm: 2100, sillMm: 0, hingeAtStart, swingReversed, configuracao });
  const DUAS_DE_ABRIR: ConfiguracaoDaEsquadria = { folhas: [{ mecanismo: 'ABRIR', larguraPct: 50 }, { mecanismo: 'ABRIR', larguraPct: 50 }] };

  it('sem configuração, nada (cada saída segue com o desenho de sempre)', () => {
    expect(simboloDasFolhas(porta(undefined), W)).toEqual([]);
  });

  it('porta dupla: as duas folhas giram nas pontas de FORA, cada uma com o raio da sua largura', () => {
    const segs = simboloDasFolhas(porta(DUAS_DE_ABRIR), W);
    // As folhas abertas: perpendiculares à parede (x constante), com 800 mm.
    const folhas = segs.filter((s) => Math.abs(s.a.x - s.b.x) < 1e-6 && Math.abs(Math.abs(s.b.y - s.a.y) - 800) < 1e-6);
    expect(folhas.map((s) => s.a.x).sort((p, q) => p - q)).toEqual([1000, 2600]);
    expect(segs.some((s) => s.tracejado)).toBe(false);
  });

  it('swingReversed abre para o outro lado; hingeAtStart espelha a ordem das folhas', () => {
    const cfg: ConfiguracaoDaEsquadria = { folhas: [{ mecanismo: 'ABRIR', larguraPct: 25 }, { mecanismo: 'FIXA', larguraPct: 75 }] };
    const ys = (segs: ReturnType<typeof simboloDasFolhas>) => segs.flatMap((s) => [s.a.y, s.b.y]);
    expect(Math.max(...ys(simboloDasFolhas(porta(cfg), W)))).toBeGreaterThan(300);
    expect(Math.min(...ys(simboloDasFolhas(porta(cfg, true, true), W)))).toBeLessThan(-300);
    const folhaAberta = (segs: ReturnType<typeof simboloDasFolhas>) => segs.find((s) => Math.abs(s.a.x - s.b.x) < 1e-6 && Math.abs(Math.abs(s.b.y - s.a.y) - 400) < 1e-6)!;
    expect(folhaAberta(simboloDasFolhas(porta(cfg, true), W)).a.x).toBe(1000);
    expect(folhaAberta(simboloDasFolhas(porta(cfg, false), W)).a.x).toBe(2600);
  });

  it('de correr: folhas em trilhos alternados, passando da divisão; projeção tracejada no maxim-ar', () => {
    const cfg: ConfiguracaoDaEsquadria = { folhas: [{ mecanismo: 'CORRER', larguraPct: 50 }, { mecanismo: 'CORRER', larguraPct: 50 }] };
    const segs = simboloDasFolhas({ ...porta(cfg), kind: 'window' }, W).filter((s) => Math.abs(s.a.y - s.b.y) < 1e-6 && Math.abs(s.a.y) > 1);
    expect(new Set(segs.map((s) => Math.sign(s.a.y)))).toEqual(new Set([1, -1]));
    expect(segs.reduce((t, s) => t + Math.abs(s.b.x - s.a.x), 0)).toBeGreaterThan(1600);
    const maxim = simboloDasFolhas({ ...porta({ folhas: [{ mecanismo: 'MAXIM_AR', larguraPct: 100 }] }), kind: 'window' }, W);
    expect(maxim.filter((s) => s.tracejado)).toHaveLength(3);
  });

  it('o DXF ganha o símbolo SÓ na abertura configurada; o PDF desenha a mesma geometria', () => {
    const sem = planta([{}]);
    const com = applyCommand(sem, { type: 'SetOpeningConfiguracao', openingId: sem.openings[0].id, configuracao: TRES_FOLHAS }).model;
    const linhas = (m: BlueprintModel) => (gerarDxf(m, { titulo: 't', revisao: 1, hash: 'h' }).match(/\nPLANTA-ABERTURAS\n/g) ?? []).length;
    expect(linhas(sem)).toBe(1 + 2); // a camada na tabela + as duas bordas, como sempre
    expect(linhas(com) - linhas(sem)).toBe(simboloDasFolhas(com.openings[0], com.walls[0]).length);
    const traços = (m: BlueprintModel) => {
      const d = new DesenhistaDeProva();
      desenharAberturas(d, m, (x) => x / 50, (y) => -y / 50, 50);
      return d.chamadas.filter((c) => c.tipo === 'linha').length;
    };
    expect(traços(com)).toBeGreaterThan(traços(sem));
  });
});

describe('esquadria configurável — as peças do 3D', () => {
  it('janela de 3 folhas + bandeira: 4 do caixilho, 2 montantes, travessa + vidro da bandeira, 3 panos', () => {
    const m = planta([{ configuracao: TRES_FOLHAS }]);
    const pecas = pecas3dDasFolhas(m.openings[0], m.walls[0]);
    expect(pecas).toHaveLength(4 + 2 + 2 + 3);
    expect(pecas.filter((p) => p.material === 'VIDRO')).toHaveLength(4);
    // Tudo dentro do vão: de 1000 a 2200 mm de altura (peitoril 1000 + 1200).
    for (const p of pecas) {
      expect(p.centroAlturaMm - p.alturaMm / 2).toBeGreaterThanOrEqual(1000 - 1e-6);
      expect(p.centroAlturaMm + p.alturaMm / 2).toBeLessThanOrEqual(2200 + 1e-6);
    }
  });

  it('porta: sem peitoril de caixilho; folha opaca, e a FIXA lateral é vidro', () => {
    const m = planta([{ kind: 'door', configuracao: { folhas: [{ mecanismo: 'ABRIR', larguraPct: 70 }, { mecanismo: 'FIXA', larguraPct: 30 }] } }]);
    const pecas = pecas3dDasFolhas(m.openings[0], m.walls[0]);
    expect(pecas.filter((p) => p.material === 'CAIXILHO')).toHaveLength(3 + 1);
    expect(pecas.map((p) => p.material).filter((x) => x !== 'CAIXILHO').sort()).toEqual(['FOLHA', 'VIDRO']);
  });

  it('a largura das folhas segue as frações', () => {
    expect(trechosDasFolhas(TRES_FOLHAS.folhas, 1000).map((t) => [t.de, t.ate])).toEqual([[0, 300], [300, 600], [600, 1000]]);
  });
});

describe('esquadria configurável — as regras do painel', () => {
  const dois = [{ mecanismo: 'FIXA' as const, larguraPct: 50 }, { mecanismo: 'CORRER' as const, larguraPct: 50 }];

  it('mudar uma largura: a vizinha cede a diferença; fora da faixa, o motivo', () => {
    expect(mudarLarguraDaFolha(dois, 0, 70)).toEqual([{ mecanismo: 'FIXA', larguraPct: 70 }, { mecanismo: 'CORRER', larguraPct: 30 }]);
    expect(mudarLarguraDaFolha(dois, 1, 20)).toEqual([{ mecanismo: 'FIXA', larguraPct: 80 }, { mecanismo: 'CORRER', larguraPct: 20 }]);
    expect(mudarLarguraDaFolha(dois, 0, 98)).toMatch(/Cabe de 5 a 95 %/);
    expect(typeof mudarLarguraDaFolha([{ mecanismo: 'FIXA', larguraPct: 100 }], 0, 50)).toBe('string');
  });

  it('acrescentar redivide por igual (até 6); remover dá a largura à vizinha', () => {
    expect(acrescentarFolha(dois)).toEqual([{ mecanismo: 'FIXA', larguraPct: 33 }, { mecanismo: 'CORRER', larguraPct: 33 }, { mecanismo: 'CORRER', larguraPct: 34 }]);
    let f = dois as { mecanismo: 'FIXA' | 'CORRER'; larguraPct: number }[] | null;
    for (let i = 0; i < 4; i++) f = acrescentarFolha(f!);
    expect(f).toHaveLength(6);
    expect(acrescentarFolha(f!)).toBeNull();
    expect(removerFolha(dois, 1)).toEqual([{ mecanismo: 'FIXA', larguraPct: 100 }]);
    expect(removerFolha([{ mecanismo: 'FIXA', larguraPct: 100 }], 0)).toBeNull();
  });

  it('bandeira padrão: 400 mm, ou o que couber; vão baixo não tem', () => {
    expect(bandeiraPadrao(2100)).toEqual({ alturaMm: 400, mecanismo: 'BASCULANTE' });
    expect(bandeiraPadrao(600)).toEqual({ alturaMm: 300, mecanismo: 'BASCULANTE' });
    expect(bandeiraPadrao(350)).toBeNull();
  });

  it('Espaço espelha a abertura — mas não em campo de texto nem com o foco num botão', () => {
    expect(ehEspacoDeEspelhar({ key: ' ' }, { tagName: 'CANVAS' })).toBe(true);
    expect(ehEspacoDeEspelhar({ key: ' ' }, { tagName: 'INPUT' })).toBe(false);
    expect(ehEspacoDeEspelhar({ key: ' ' }, { tagName: 'BUTTON' })).toBe(false);
    expect(ehEspacoDeEspelhar({ key: ' ', ctrlKey: true }, null)).toBe(false);
    expect(ehEspacoDeEspelhar({ key: ' ', repeat: true }, null)).toBe(false);
  });

  it('Igualar (F4) leva as folhas junto da esquadria, num lote que o kernel aceita', () => {
    const m = planta([{ configuracao: TRES_FOLHAS }, {}, {}]);
    const [ref, a, b] = m.openings.map((o) => o.id);
    const r = comandosParaIgualar(m, ref, [a, b]);
    const depois = applyBatch(m, r.comandos).model;
    expect(depois.openings.map((o) => o.configuracao)).toEqual([TRES_FOLHAS, TRES_FOLHAS, TRES_FOLHAS]);
  });
});

describe('esquadria configurável — elevação e corte (pendência 2)', () => {
  const fachada = (m: BlueprintModel) => projetarElevacao(m, { direcao: 'FRENTE' }).aberturas;

  it('a projeção leva as folhas no plano da fachada; sem configuração, nenhuma chave nova', () => {
    const sem = fachada(planta([{}]));
    expect(sem).toHaveLength(1);
    expect('folhas' in sem[0] || 'bandeira' in sem[0]).toBe(false);
    const [a] = fachada(planta([{ configuracao: TRES_FOLHAS }]));
    expect(a.folhas).toHaveLength(3);
    expect(a.folhas!.reduce((s, f) => s + (f.uMax - f.uMin), 0)).toBeCloseTo(a.uMax - a.uMin, 6);
    expect(a.bandeira).toEqual({ v: a.vMax - 400, mecanismo: 'BASCULANTE' });
  });

  it('o símbolo: 2 montantes, o V da de abrir, a seta da de correr, a travessa e o X da basculante', () => {
    const [a] = fachada(planta([{ configuracao: TRES_FOLHAS }]));
    const s = simboloDaElevacao(a);
    const horizontais = s.filter((x) => !x.tracejado && x.a.v === x.b.v);
    const verticais = s.filter((x) => !x.tracejado && x.a.u === x.b.u);
    expect(verticais).toHaveLength(2); // montantes
    expect(horizontais.some((x) => x.a.v === a.bandeira!.v && Math.abs(x.b.u - x.a.u) === a.uMax - a.uMin)).toBe(true); // travessa
    expect(s.filter((x) => x.tracejado)).toHaveLength(2 + 2); // V da de abrir + X da basculante
    expect(simboloDaElevacao({ ...a, folhas: undefined })).toEqual([]);
  });

  it('o V da de abrir aponta para a dobradiça — e girar (hingeAtStart) o leva para o outro lado', () => {
    const cfg: ConfiguracaoDaEsquadria = { folhas: [{ mecanismo: 'ABRIR', larguraPct: 100 }] };
    const m = planta([{ configuracao: cfg }]);
    const vertice = (mm: BlueprintModel) => {
      const [a] = fachada(mm);
      return simboloDaElevacao(a).filter((x) => x.tracejado)[0].b.u;
    };
    const girada = applyCommand(m, { type: 'FlipOpening', openingId: m.openings[0].id, axis: 'hinge' }).model;
    expect(vertice(m)).not.toBe(vertice(girada));
  });

  it('o DXF da elevação ganha as linhas das folhas na camada das aberturas', () => {
    const contar = (m: BlueprintModel) =>
      (gerarDxf(m, { titulo: 't', revisao: 1, hash: 'h', elevacoes: [projetarElevacao(m, { direcao: 'FRENTE' })] }).match(/\nELEVACAO-ABERTURAS\n/g) ?? []).length;
    const sem = planta([{}]);
    const com = applyCommand(sem, { type: 'SetOpeningConfiguracao', openingId: sem.openings[0].id, configuracao: TRES_FOLHAS }).model;
    expect(contar(com) - contar(sem)).toBe(simboloDaElevacao(fachada(com)[0]).length);
  });
});

describe('esquadria configurável — a travessa da bandeira no 3D (pendência 3)', () => {
  it('é peça PRÓPRIA (TRAVESSA), no vão inteiro, mais alta que o montante e saliente das faces do caixilho', () => {
    const m = planta([{ configuracao: TRES_FOLHAS }]);
    const pecas = pecas3dDasFolhas(m.openings[0], m.walls[0]);
    const travessas = pecas.filter((p) => p.material === 'TRAVESSA');
    expect(travessas).toHaveLength(1);
    const caixilho = pecas.find((p) => p.material === 'CAIXILHO')!;
    expect(travessas[0].comprimentoMm).toBe(1200);
    expect(travessas[0].espessuraMm).toBeGreaterThan(caixilho.espessuraMm);
    expect(travessas[0].alturaMm).toBeGreaterThan(40);
    expect(pecas3dDasFolhas(planta([{ configuracao: { folhas: TRES_FOLHAS.folhas } }]).openings[0], m.walls[0]).some((p) => p.material === 'TRAVESSA')).toBe(false);
  });
});
