/**
 * F4 do plano `2026-10-11-planta-recursos-video-synaps.md` — CONTA-GOTAS.
 *
 * O comando novo `SetWallHeight` e a regra pura `comandosParaIgualar`.
 */
import { describe, expect, it } from 'vitest';
import {
  KernelError,
  applyBatch,
  applyCommand,
  assinaturaDasCamadas,
  emptyModel,
  point,
  type BlueprintModel,
  type CamadaParede,
  type Command,
} from '../utils/blueprintKernel';
import { comandosParaIgualar } from '../utils/blueprintIgualar';

const H = 2800;
const CAMADAS: CamadaParede[] = [
  { espessuraMm: 25, itemCode: '', descricao: 'Reboco', funcao: 'REVESTIMENTO' },
  { espessuraMm: 140, itemCode: '', descricao: 'Bloco', funcao: 'VEDACAO' },
  { espessuraMm: 25, itemCode: '', descricao: 'Reboco', funcao: 'REVESTIMENTO' },
];

/** Retângulo 6000 × 4000 traçado pela FACE (DIREITA) — espessura muda o eixo de lugar. */
function sala(): { m: BlueprintModel; ids: string[] } {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: H }).model;
  const levelId = base.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: H, alinhamento: 'DIREITA',
  });
  const m = applyBatch(base, [w(0, 0, 6000, 0), w(6000, 0, 6000, 4000), w(6000, 4000, 0, 4000), w(0, 4000, 0, 0)]).model;
  return { m, ids: m.walls.map((x) => x.id) };
}

const comJanela = (m: BlueprintModel, wallId: string, sill = 1000, altura = 1200) =>
  applyCommand(m, { type: 'AddOpening', wallId, kind: 'window', offsetMm: 1500, widthMm: 1200, heightMm: altura, sillMm: sill }).model;

describe('SetWallHeight (F4)', () => {
  it('troca a altura de uma parede já traçada', () => {
    const { m, ids } = sala();
    const r = applyCommand(m, { type: 'SetWallHeight', wallId: ids[0], heightMm: 3000 }).model;
    expect(r.walls.find((w) => w.id === ids[0])!.heightMm).toBe(3000);
    expect(r.walls.find((w) => w.id === ids[1])!.heightMm).toBe(H);
  });

  it('recusa zero, negativo e milímetro fracionado', () => {
    const { m, ids } = sala();
    for (const heightMm of [0, -100, 2750.5]) {
      expect(() => applyCommand(m, { type: 'SetWallHeight', wallId: ids[0], heightMm })).toThrow(KernelError);
    }
  });

  it('recusa baixar a parede abaixo do topo da janela dela; no topo exato aceita', () => {
    const { m, ids } = sala();
    const j = comJanela(m, ids[0]); // topo = 1000 + 1200 = 2200
    expect(() => applyCommand(j, { type: 'SetWallHeight', wallId: ids[0], heightMm: 2100 })).toThrow(/abertura até 2200 mm/);
    expect(applyCommand(j, { type: 'SetWallHeight', wallId: ids[0], heightMm: 2200 }).model.walls.find((w) => w.id === ids[0])!.heightMm).toBe(2200);
  });
});

describe('conta-gotas: paredes (F4)', () => {
  it('as três paredes copiam as camadas e a altura da referência; o ambiente segue fechado', () => {
    const { m: m0, ids } = sala();
    let m = applyCommand(m0, { type: 'SetWallLayers', wallId: ids[0], camadas: CAMADAS }).model;
    m = applyCommand(m, { type: 'SetWallHeight', wallId: ids[0], heightMm: 3000 }).model;
    const r = comandosParaIgualar(m, ids[0], ids.slice(1));
    expect(r.familia).toBe('parede');
    expect(r.aplicados).toEqual(ids.slice(1));
    expect(r.ignorados).toEqual([]);
    const depois = applyBatch(m, r.comandos).model;
    for (const id of ids) {
      const w = depois.walls.find((x) => x.id === id)!;
      expect(assinaturaDasCamadas(w.camadas)).toBe(assinaturaDasCamadas(CAMADAS));
      expect(w.thicknessMm).toBe(190);
      expect(w.heightMm).toBe(3000);
    }
    // Traçadas pela face: o eixo andou (TranslateEntities), e com `manterJuncoes` o anel fecha.
    expect(r.comandos.some((c) => c.type === 'TranslateEntities')).toBe(true);
    expect(depois.spaces).toHaveLength(1);
  });

  it('referência homogênea tira as camadas do destino e copia a espessura', () => {
    const { m: m0, ids } = sala();
    const m = applyCommand(m0, { type: 'SetWallLayers', wallId: ids[1], camadas: CAMADAS }).model;
    const r = comandosParaIgualar(m, ids[0], [ids[1]], { parede: ['composicao'], abertura: [] });
    const w = applyBatch(m, r.comandos).model.walls.find((x) => x.id === ids[1])!;
    expect(w.camadas).toBeUndefined();
    expect(w.thicknessMm).toBe(150);
  });

  it('só o que foi marcado: altura sem composição não toca nas camadas', () => {
    const { m: m0, ids } = sala();
    let m = applyCommand(m0, { type: 'SetWallLayers', wallId: ids[0], camadas: CAMADAS }).model;
    m = applyCommand(m, { type: 'SetWallHeight', wallId: ids[0], heightMm: 3000 }).model;
    const r = comandosParaIgualar(m, ids[0], [ids[1]], { parede: ['altura'], abertura: [] });
    expect(r.comandos).toEqual([{ type: 'SetWallHeight', wallId: ids[1], heightMm: 3000 }]);
  });

  it('o que o kernel recusa fica de fora COM o motivo, e os outros destinos seguem', () => {
    const { m: m0, ids } = sala();
    let m = comJanela(m0, ids[2]); // janela até 2200 na parede 2
    m = applyCommand(m, { type: 'SetWallHeight', wallId: ids[0], heightMm: 2100 }).model;
    const r = comandosParaIgualar(m, ids[0], ids.slice(1), { parede: ['altura'], abertura: [] });
    expect(r.aplicados).toEqual([ids[1], ids[3]]);
    expect(r.ignorados).toHaveLength(1);
    expect(r.ignorados[0].id).toBe(ids[2]);
    expect(r.ignorados[0].motivo).toMatch(/abertura até 2200 mm/);
    // O lote que sobra passa no kernel inteiro.
    expect(() => applyBatch(m, r.comandos)).not.toThrow();
  });

  it('destino de outro tipo e destino já igual ficam de fora, ditos', () => {
    const { m: m0, ids } = sala();
    const m = comJanela(m0, ids[1]);
    const janela = m.openings[0].id;
    const r = comandosParaIgualar(m, ids[0], [ids[1], janela]);
    expect(r.ignorados).toEqual([
      { id: ids[1], motivo: 'já está igual à referência' },
      { id: janela, motivo: 'não é parede, como a referência' },
    ]);
    expect(r.comandos).toEqual([]);
  });
});

describe('conta-gotas: aberturas (F4)', () => {
  it('a porta vira janela do tamanho da referência; a que não cabe na parede fica de fora', () => {
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: H }).model;
    const levelId = base.levels[0].id;
    const m1 = applyBatch(base, [
      { type: 'AddWall', levelId, a: point(0, 0), b: point(6000, 0), thicknessMm: 150, heightMm: H },
      { type: 'AddWall', levelId, a: point(0, 3000), b: point(1000, 3000), thicknessMm: 150, heightMm: H },
    ]).model;
    const [larga, curta] = m1.walls.map((w) => w.id);
    const m = applyBatch(m1, [
      { type: 'AddOpening', wallId: larga, kind: 'window', offsetMm: 500, widthMm: 1500, heightMm: 1200, sillMm: 1000 },
      { type: 'AddOpening', wallId: larga, kind: 'door', offsetMm: 3500, widthMm: 800, heightMm: 2100, sillMm: 0 },
      { type: 'AddOpening', wallId: curta, kind: 'door', offsetMm: 100, widthMm: 700, heightMm: 2100, sillMm: 0 },
    ]).model;
    const [ref, portaLarga, portaCurta] = m.openings.map((o) => o.id);
    const r = comandosParaIgualar(m, ref, [portaLarga, portaCurta], { parede: [], abertura: ['tipo', 'tamanho'] });
    expect(r.familia).toBe('abertura');
    expect(r.aplicados).toEqual([portaLarga]);
    expect(r.ignorados.map((x) => x.id)).toEqual([portaCurta]); // 1500 não cabe em 1000
    const o = applyBatch(m, r.comandos).model.openings.find((x) => x.id === portaLarga)!;
    expect([o.kind, o.widthMm, o.heightMm, o.sillMm]).toEqual(['window', 1500, 1200, 1000]);
  });
});
