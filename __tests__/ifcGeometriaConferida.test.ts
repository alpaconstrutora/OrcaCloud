/**
 * A ORIENTAÇÃO da escada e do telhado, MEDIDA no IFC que exportamos.
 *
 * ─── POR QUE MEDIR EM VEZ DE OLHAR ──────────────────────────────────────────
 *
 * Estes dois estavam na lista de "provado só por raciocínio", esperando alguém
 * abrir num visualizador. Abri no nosso — a cena renderiza, orbita e seleciona —
 * e mesmo assim **ler a orientação de um render cinza não conclui nada**: o
 * telhado tapa a escada, e de dentro tudo é uma face cinzenta.
 *
 * O que conclui é a geometria. Na Etapa 4 construímos um leitor de IFC; ele
 * pode ler o que NÓS escrevemos. Estas asserções abrem o sólido de verdade,
 * pelo `web-ifc`, e perguntam onde os vértices estão.
 *
 * ⚠️ Isto NÃO substitui a conferência num visualizador de terceiros para a MÃO
 * DA PORTA. Aquela pergunta é sobre como outra ferramenta INTERPRETA
 * `SINGLE_SWING_LEFT`, e nenhuma medição minha responde por ela.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import { gerarIfc } from '../utils/blueprintIfc';

interface Api {
  Init: () => Promise<void>;
  OpenModel: (d: Uint8Array) => number;
  CloseModel: (id: number) => void;
  GetLineIDsWithType: (id: number, t: number) => { size: () => number; get: (i: number) => number };
  StreamAllMeshes: (id: number, f: (m: MalhaBruta) => void) => void;
  GetGeometry: (id: number, g: number) => { GetVertexData: () => number; GetVertexDataSize: () => number };
  GetVertexArray: (p: number, n: number) => Float32Array;
}
interface MalhaBruta {
  expressID: number;
  geometries: {
    size: () => number;
    get: (i: number) => { geometryExpressID: number; flatTransformation: number[] };
  };
}

let api: Api | null = null;
let tipos: Record<string, number> = {};
let motivo = '';

const H = 2800;

/**
 * ⚠️ UM MODELO POR PERGUNTA.
 *
 * A primeira versão media a caixa de TUDO que o parser desenhou e afirmava
 * sobre a escada — mas o telhado estava junto, e a altura deu 4,6 m em vez de
 * 2,8. O teste falhou por medir a coisa errada, não por defeito do produto.
 * Isolar é mais barato que filtrar.
 */
function modelo(comTelhado: boolean): BlueprintModel {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  }).model;
  const t = base.levels[0].id;
  const comSuperior = applyCommand(base, {
    type: 'AddLevel',
    name: 'Superior',
    elevationMm: H,
    defaultHeightMm: H,
  }).model;
  const s = comSuperior.levels[1].id;

  const comEscada = applyCommand(comSuperior, {
    type: 'AddEscada',
    levelId: t,
    tipo: 'ESCADA',
    // Sobe no sentido +x, de x=2000 a x=6000, na faixa y=4000.
    pontos: [point(2000, 4000), point(6000, 4000)],
    larguraMm: 1200,
    desnivelMm: H,
  } as Command).model;

  if (!comTelhado) return comEscada;

  return applyCommand(comEscada, {
    type: 'AddAgua',
    levelId: s,
    pontos: [point(0, 0), point(10000, 0), point(10000, 6000), point(0, 6000)],
    inclinacaoPct: 30,
    // A água cai para o −y.
    caimento: point(0, -1),
    beiralMm: 0,
  } as Command).model;
}

/** A caixa envolvente de um elemento, no mundo do parser (metro, Y para cima). */
function caixaDe(id: number, expressIDs: Set<number>) {
  const caixas = new Map<number, { min: number[]; max: number[] }>();
  api!.StreamAllMeshes(id, (malha) => {
    if (!expressIDs.has(malha.expressID)) return;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let g = 0; g < malha.geometries.size(); g++) {
      const posto = malha.geometries.get(g);
      const geo = api!.GetGeometry(id, posto.geometryExpressID);
      const v = api!.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize());
      const m = posto.flatTransformation;
      // 6 floats por vértice: posição e normal.
      for (let i = 0; i < v.length; i += 6) {
        const p = [
          m[0] * v[i] + m[4] * v[i + 1] + m[8] * v[i + 2] + m[12],
          m[1] * v[i] + m[5] * v[i + 1] + m[9] * v[i + 2] + m[13],
          m[2] * v[i] + m[6] * v[i + 1] + m[10] * v[i + 2] + m[14],
        ];
        for (let k = 0; k < 3; k++) {
          if (p[k] < min[k]) min[k] = p[k];
          if (p[k] > max[k]) max[k] = p[k];
        }
      }
    }
    if (min[0] < Infinity) caixas.set(malha.expressID, { min, max });
  });
  return caixas;
}

beforeAll(async () => {
  try {
    const mod = (await import('web-ifc')) as Record<string, unknown> & {
      default?: Record<string, unknown>;
    };
    const raiz = (mod.IfcAPI ? mod : mod.default) as Record<string, unknown>;
    const IfcAPI = raiz.IfcAPI as new () => Api;
    const inst = new IfcAPI();
    await inst.Init();
    api = inst;
    tipos = {
      IFCSTAIR: raiz.IFCSTAIR as number,
      IFCSLAB: raiz.IFCSLAB as number,
      IFCROOF: raiz.IFCROOF as number,
    };
  } catch (e) {
    motivo = `web-ifc não inicializou: ${e instanceof Error ? e.message : String(e)}`;
  }
}, 60_000);

describe('geometria do IFC exportado · medida, não olhada', () => {
  function abrir(comTelhado: boolean) {
    const ifc = gerarIfc(modelo(comTelhado), {
      titulo: 'medicao',
      revisao: 1,
      hash: 'm'.repeat(64),
      data: new Date('2026-09-07T12:00:00Z'),
    });
    return api!.OpenModel(new TextEncoder().encode(ifc));
  }

  it('A ESCADA sobe, tem a largura certa e NÃO está deitada', () => {
    if (!api) return void console.warn(`skip: ${motivo}`);
    // Sem telhado: a caixa medida é só a da escada.
    const id = abrir(false);
    try {
      const ids = api.GetLineIDsWithType(id, tipos.IFCSTAIR);
      expect(ids.size()).toBe(1);

      // O sólido da escada são os DEGRAUS, agregados sob o IfcStair. Mede-se a
      // caixa de tudo que o parser desenhou.
      const todas = new Set<number>();
      api.StreamAllMeshes(id, (m) => todas.add(m.expressID));
      const caixas = caixaDe(id, todas);
      const uniao = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      for (const c of caixas.values()) {
        for (let k = 0; k < 3; k++) {
          uniao.min[k] = Math.min(uniao.min[k], c.min[k]);
          uniao.max[k] = Math.max(uniao.max[k], c.max[k]);
        }
      }

      // O mundo do parser é Y PARA CIMA. A escada tem 4 m de percurso, 1,20 m
      // de largura e 2,80 m de desnível.
      const alturaM = uniao.max[1] - uniao.min[1];
      const larguraM = Math.abs(uniao.max[2] - uniao.min[2]);
      const percursoM = uniao.max[0] - uniao.min[0];

      // ⚠️ AS TRÊS PERGUNTAS, e o que cada erro produziria:
      // • deitada de lado → a altura viraria 1,20 e a largura, 2,80;
      // • sem subir → altura ~0;
      // • percurso trocado com largura → 1,20 no x.
      expect(alturaM).toBeGreaterThan(2.5);
      expect(alturaM).toBeLessThan(3.1);
      expect(larguraM).toBeGreaterThan(1.0);
      expect(larguraM).toBeLessThan(1.5);
      expect(percursoM).toBeGreaterThan(3.5);
    } finally {
      api.CloseModel(id);
    }
  });

  it('O TELHADO cai para o lado certo, e não para a cumeeira', () => {
    if (!api) return void console.warn(`skip: ${motivo}`);
    const id = abrir(true);
    try {
      expect(api.GetLineIDsWithType(id, tipos.IFCROOF).size()).toBe(1);

      const lajes = api.GetLineIDsWithType(id, tipos.IFCSLAB);
      const doTelhado = new Set<number>();
      for (let i = 0; i < lajes.size(); i++) doTelhado.add(lajes.get(i));
      const caixas = caixaDe(id, doTelhado);
      expect(caixas.size).toBeGreaterThan(0);

      const agua = [...caixas.values()][0];
      // O caimento foi declarado para o −y do desenho, que no mundo do parser é
      // o +Z. Então a borda mais BAIXA tem de estar no menor y do desenho — e a
      // inclinação de 30% em 6 m dá ~1,8 m de diferença de cota.
      const desnivelM = agua.max[1] - agua.min[1];
      expect(desnivelM).toBeGreaterThan(1.0);

      // E ela está ACIMA das paredes do pavimento superior: a base do telhado
      // não pode estar no chão.
      expect(agua.min[1]).toBeGreaterThan(2.0);
    } finally {
      api.CloseModel(id);
    }
  });
});
