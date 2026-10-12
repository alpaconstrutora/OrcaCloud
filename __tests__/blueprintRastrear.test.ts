import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, uidDeTeste } from '../utils/blueprintKernel';
import { pixelParaModelo, type Underlay } from '../utils/blueprintUnderlay';
import {
  comandosDoRastreio,
  endireitar,
  fatorParaLado,
  hospedarAberturas,
  limiarDeOtsu,
  rastrear,
  recorteDaRegiao,
  refinarNoRaster,
  tracadoDaResposta,
  type Raster,
} from '../utils/blueprintRastrear';

/**
 * Um "escaneado" sintético de 600 × 400 px a 25 mm/px: sala de 10 × 5 m (eixos x 100/500, y 100/300) com
 * paredes CHEIAS de 8 px (200 mm) e uma parede interna em x = 300 desenhada só pelo CONTORNO (duas linhas
 * de 1 px a 8 px uma da outra). O papel é 235 (amarelado), o traço 30.
 */
function escaneado(): Raster {
  const largura = 600;
  const altura = 400;
  const cinza = new Uint8Array(largura * altura).fill(235);
  const pinta = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cinza[y * largura + x] = 30;
  };
  pinta(96, 96, 503, 103); // topo (y 96..103 → eixo 99,5)
  pinta(96, 296, 503, 303); // base
  pinta(96, 96, 103, 303); // esquerda
  pinta(496, 96, 503, 303); // direita
  pinta(296, 104, 296, 295); // interna, face 1
  pinta(303, 104, 303, 295); // interna, face 2
  return { largura, altura, cinza };
}

const U: Underlay = { origemXMm: 0, origemYMm: 0, mmPorPixel: 25, rotacaoMrad: 0 };
const paraModelo = (x: number, y: number) => pixelParaModelo(U, { px: x, py: y });

/** O que a IA "viu": as paredes com alguns pixels de erro, uma parede que não existe e uma inclinada. */
const RESPOSTA = {
  paredes: [
    { x1: 104, y1: 103, x2: 497, y2: 104 }, // topo, 4 px abaixo e um pouco torta
    { x1: 98, y1: 297, x2: 505, y2: 296 }, // base
    { x1: 102, y1: 105, x2: 101, y2: 298 }, // esquerda
    { x1: 497, y1: 99, x2: 498, y2: 301 }, // direita
    { x1: 305, y1: 110, x2: 305, y2: 290 }, // interna (contorno), 5 px fora do eixo
    { x1: 320, y1: 200, x2: 480, y2: 200 }, // ALUCINADA: não há traço em y = 200
    { x1: 120, y1: 150, x2: 200, y2: 250 }, // inclinada
  ],
  aberturas: [
    { tipo: 'porta', x1: 150, y1: 300, x2: 186, y2: 300 }, // 36 px = 900 mm na base
    { tipo: 'janela', x1: 380, y1: 99, x2: 440, y2: 99 }, // 60 px = 1500 mm no topo
    { tipo: 'janela', x1: 200, y1: 200, x2: 260, y2: 200 }, // no meio da sala: sem parede
  ],
  ambientes: [
    { nome: 'Sala de estar', x: 200, y: 200 },
    { nome: 'Cozinha', x: 400, y: 200 },
  ],
  observacao: 'teste',
};

describe('tracadoDaResposta — sanear o que a IA devolveu', () => {
  it('recusa número inválido, ponto fora da imagem, tipo desconhecido e nome vazio; limita à borda', () => {
    const { tracado, recusados } = tracadoDaResposta(
      {
        paredes: [{ x1: 0, y1: 0, x2: 50, y2: 0 }, { x1: 'a', y1: 0, x2: 1, y2: 1 }, { x1: 0, y1: 0, x2: 900, y2: 0 }, { x1: -5, y1: 10, x2: 50, y2: 10 }],
        aberturas: [{ tipo: 'alçapão', x1: 0, y1: 0, x2: 10, y2: 0 }, { tipo: 'porta', x1: 0, y1: 0, x2: 10, y2: 0 }],
        ambientes: [{ nome: '  ', x: 1, y: 1 }, { nome: 'Quarto   1', x: 1, y: 1 }],
      },
      600,
      400,
    );
    expect(tracado.paredes).toHaveLength(2);
    expect(tracado.paredes[1].x1).toBe(0); // -5 está na folga de 2 % e é limitado à borda
    expect(tracado.aberturas).toHaveLength(1);
    expect(tracado.ambientes).toEqual([{ nome: 'Quarto 1', x: 1, y: 1 }]);
    expect(recusados).toBe(4);
  });

  it('resposta que não é objeto vira traçado vazio, sem lançar', () => {
    expect(tracadoDaResposta(null, 10, 10).tracado.paredes).toEqual([]);
    expect(tracadoDaResposta('x', 10, 10).recusados).toBe(0);
  });
});

describe('recorte e escala', () => {
  it('a região em mm vira o retângulo de pixels do fundo, limitado à imagem; pequeno demais = null', () => {
    // y do modelo é para CIMA: a região y −10000..−2500 é a faixa de pixels 100..400.
    expect(recorteDaRegiao(U, { x0: 2500, y0: -10000, x1: 12500, y1: -2500 }, 600, 400)).toEqual({ sx: 100, sy: 100, sw: 400, sh: 300 });
    expect(recorteDaRegiao(U, { x0: -50000, y0: -50000, x1: 50000, y1: 50000 }, 600, 400)).toEqual({ sx: 0, sy: 0, sw: 600, sh: 400 });
    expect(recorteDaRegiao(U, { x0: 0, y0: -100, x1: 100, y1: 0 }, 600, 400)).toBeNull();
    expect(fatorParaLado({ sx: 0, sy: 0, sw: 3136, sh: 1000 }, 1568)).toBe(0.5);
    expect(fatorParaLado({ sx: 0, sy: 0, sw: 800, sh: 600 }, 1568)).toBe(1);
  });

  it('Otsu separa papel amarelado de traço', () => {
    const t = limiarDeOtsu(escaneado());
    expect(t).toBeGreaterThanOrEqual(30);
    expect(t).toBeLessThan(235);
  });
});

describe('refinarNoRaster — a parede proposta é conferida no fundo', () => {
  const r = escaneado();
  const limiar = limiarDeOtsu(r);

  it('parede cheia: puxa o eixo para o meio da mancha e MEDE a espessura', () => {
    const { trecho, confirmado } = refinarNoRaster(endireitar({ x1: 104, y1: 103, x2: 497, y2: 104 }, 6), r, limiar, 25);
    expect(confirmado).toBe(true);
    expect(trecho.orientacao).toBe('H');
    expect(trecho.c).toBe(99.5);
    expect(trecho.esp).toBe(8);
  });

  it('parede pelo contorno: o PAR de linhas finas é a parede', () => {
    const { trecho, confirmado } = refinarNoRaster(endireitar({ x1: 305, y1: 110, x2: 305, y2: 290 }, 6), r, limiar, 25);
    expect(confirmado).toBe(true);
    expect(trecho.c).toBe(299.5);
    expect(trecho.esp).toBe(8);
  });

  it('sem traço sob a linha = não confirmada; inclinada nunca é confirmada', () => {
    expect(refinarNoRaster(endireitar({ x1: 320, y1: 200, x2: 480, y2: 200 }, 6), r, limiar, 25).confirmado).toBe(false);
    expect(refinarNoRaster(endireitar({ x1: 120, y1: 150, x2: 200, y2: 250 }, 6), r, limiar, 25).confirmado).toBe(false);
  });
});

describe('rastrear — o processo inteiro', () => {
  const resultado = () =>
    rastrear({ tracado: tracadoDaResposta(RESPOSTA, 600, 400).tracado, raster: escaneado(), iaParaAnalise: 1, mmPorPx: 25, paraModelo });

  it('aceita as 5 paredes reais, alinhadas ao fundo, com 20 cm medidos; descarta a alucinada e a inclinada, com o motivo', () => {
    const r = resultado();
    expect(r.propostas).toBe(7);
    expect(r.paredes).toHaveLength(5);
    for (const p of r.paredes) expect(p.espessuraMm).toBe(200);
    // Eixos: x 100/300/500 → 2487,5/7487,5/12487,5 mm (meio-pixel) ; y 100/300 → −2487,5/−7487,5.
    const xs = new Set(r.paredes.flatMap((p) => [p.a.x, p.b.x]));
    for (const x of xs) expect([2488, 7488, 12488].some((k) => Math.abs(k - x) <= 1)).toBe(true);
    const ys = new Set(r.paredes.flatMap((p) => [p.a.y, p.b.y]));
    for (const y of ys) expect([-2488, -7488].some((k) => Math.abs(k - y) <= 1)).toBe(true);
    const motivos = Object.fromEntries(r.descartes.map((d) => [d.motivo.split(' (')[0], d.n]));
    expect(motivos['sem traço de parede no fundo sob ela']).toBe(1);
    expect(motivos['inclinada']).toBe(1);
  });

  it('as pontas encostam no EIXO da parede vizinha (cantos e o T da interna)', () => {
    const r = resultado();
    const topo = r.paredes.find((p) => p.a.y === p.b.y && Math.abs(p.a.y + 2488) <= 1)!;
    expect(Math.min(topo.a.x, topo.b.x)).toBeCloseTo(2488, -1);
    expect(Math.max(topo.a.x, topo.b.x)).toBeCloseTo(12488, -1);
    const interna = r.paredes.find((p) => p.a.x === p.b.x && Math.abs(p.a.x - 7488) <= 1)!;
    expect(Math.max(interna.a.y, interna.b.y)).toBeCloseTo(-2488, -1);
    expect(Math.min(interna.a.y, interna.b.y)).toBeCloseTo(-7488, -1);
  });

  it('a IA em outra escala (imagem enviada pela metade) dá o mesmo resultado', () => {
    const metade = {
      ...RESPOSTA,
      paredes: RESPOSTA.paredes.map((p) => ({ x1: p.x1 / 2, y1: p.y1 / 2, x2: p.x2 / 2, y2: p.y2 / 2 })),
      aberturas: RESPOSTA.aberturas.map((p) => ({ ...p, x1: p.x1 / 2, y1: p.y1 / 2, x2: p.x2 / 2, y2: p.y2 / 2 })),
      ambientes: RESPOSTA.ambientes.map((p) => ({ ...p, x: p.x / 2, y: p.y / 2 })),
    };
    const r = rastrear({ tracado: tracadoDaResposta(metade, 300, 200).tracado, raster: escaneado(), iaParaAnalise: 2, mmPorPx: 25, paraModelo });
    expect(r.paredes).toEqual(resultado().paredes);
  });

  it('sem o fundo nada é aceito — a IA sozinha não vira parede', () => {
    const r = rastrear({ tracado: tracadoDaResposta(RESPOSTA, 600, 400).tracado, raster: null, iaParaAnalise: 1, mmPorPx: 25, paraModelo });
    expect(r.paredes).toEqual([]);
    expect(r.descartes.find((d) => d.motivo.startsWith('sem o fundo'))?.n).toBe(6);
  });
});

describe('comandosDoRastreio — um lote: paredes, aberturas por uid, nomes', () => {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = base.levels[0].id;

  it('aplica num lote só; a porta e a janela entram nas paredes certas, a janela solta é descartada; os nomes classificam', () => {
    const r = rastrear({ tracado: tracadoDaResposta(RESPOSTA, 600, 400).tracado, raster: escaneado(), iaParaAnalise: 1, mmPorPx: 25, paraModelo });
    const uids = r.paredes.map((_, k) => uidDeTeste(900 + k));
    const { comandos, descartes } = comandosDoRastreio(r, base, levelId, { alturaMm: 2800, uids });
    expect(comandos.map((c) => c.type)).toEqual(['AddWalls', 'AddOpenings', 'PlaceSpaceLabels']);
    expect(descartes).toEqual([{ motivo: 'abertura sem parede sob ela', n: 1 }]);

    const m = applyBatch(base, comandos).model;
    expect(m.walls).toHaveLength(5);
    const porta = m.openings.find((o) => o.kind === 'door')!;
    const janela = m.openings.find((o) => o.kind === 'window')!;
    expect(porta.widthMm).toBe(900);
    expect(porta.heightMm).toBe(2100);
    expect(janela.widthMm).toBe(1500);
    expect(janela.sillMm).toBe(1000);
    // A porta fica na BASE (y ≈ −7488), a 150 px → 3750 mm do canto em 2488 → offset ≈ 1262.
    const base0 = m.walls.find((w) => w.id === porta.wallId)!;
    expect(Math.abs(base0.a.y + 7488)).toBeLessThanOrEqual(1);
    const inicio = Math.min(base0.a.x, base0.b.x);
    const x0 = base0.a.x === inicio ? inicio + porta.offsetMm : base0.a.x - porta.offsetMm - porta.widthMm;
    expect(Math.abs(x0 - 3750)).toBeLessThanOrEqual(15);
    expect(m.spaces.filter((s) => s.levelId === levelId).length).toBe(2);
    const sala = m.labels.find((l) => l.name === 'Sala de estar')!;
    expect(sala.tipoDeAmbiente).toBeTruthy();
  });

  it('as aberturas são hospedadas DEPOIS das correções (a ponta pode mudar)', () => {
    const r = rastrear({ tracado: tracadoDaResposta(RESPOSTA, 600, 400).tracado, raster: escaneado(), iaParaAnalise: 1, mmPorPx: 25, paraModelo });
    let vistas = 0;
    const { comandos } = comandosDoRastreio(r, base, levelId, {
      alturaMm: 2800,
      correcoes: (sim) => {
        vistas = sim.walls.length;
        return [];
      },
    });
    expect(vistas).toBe(5);
    expect(comandos[0].type).toBe('AddWalls');
  });

  it('abertura sobre outra na mesma parede é descartada, não derruba o lote', () => {
    const w = { uid: 'u1', a: { x: 0, y: 0 }, b: { x: 5000, y: 0 }, espessuraMm: 150 } as never;
    const { comandos, descartes } = hospedarAberturas(
      [
        { tipo: 'porta', a: { x: 1000, y: 0 }, b: { x: 1900, y: 0 } } as never,
        { tipo: 'janela', a: { x: 1500, y: 0 }, b: { x: 2500, y: 0 } } as never,
        { tipo: 'janela', a: { x: 3000, y: 0 }, b: { x: 5600, y: 0 } } as never,
      ],
      [w],
    );
    expect(comandos).toHaveLength(2);
    expect(comandos[1].offsetMm + comandos[1].widthMm).toBeLessThanOrEqual(5000);
    expect(descartes).toEqual([{ motivo: 'abertura sobre outra na mesma parede', n: 1 }]);
  });
});
