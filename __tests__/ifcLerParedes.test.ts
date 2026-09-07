/**
 * O leitor de PAREDES, contra arquivos IFC de verdade.
 *
 * ─── POR QUE ESTE TESTE PRECISA DE ARQUIVO ──────────────────────────────────
 *
 * A composição de `IfcLocalPlacement` está provada em `ifcPlacement.test.ts`,
 * que é puro. O que ele não alcança é se os arquivos do mundo real trazem o que
 * o leitor espera — eixo de dois pontos, composição em camadas, corpo
 * extrudado. Foi medindo isso que apareceu o defeito da matriz do corpo.
 *
 * Roda contra os dois samples públicos que vivem em `bim-spike/samples/`, fora
 * do repositório do app. Sem eles, PULA declarando o motivo — nunca passa por
 * omissão.
 *
 * Para apontar para outra pasta: `IFC_AMOSTRAS=/caminho npx vitest run`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { LeituraParametrica } from '../services/ifcParametricoService';

const PASTA = process.env.IFC_AMOSTRAS ?? 'C:/D/ORÇACLOUD/bim-spike/samples';
const CASA = join(PASTA, 'AC20-FZK-Haus.ifc');
const PREDIO = join(PASTA, 'DigitalHub.ifc');
const TEM = existsSync(CASA) && existsSync(PREDIO);

const lido: Record<string, LeituraParametrica> = {};

/**
 * A faixa que o CORPO de cada parede ocupa perpendicular ao eixo, em unidade
 * do arquivo. É o árbitro do caso do centro: o cálculo sai dos campos
 * declarados (`OffsetFromReferenceLine`, `DirectionSense`), e isto sai da
 * geometria desenhada — duas fontes independentes.
 */
const corpo: Record<string, Map<number, { lo: number; hi: number }>> = {};

interface MalhaBruta {
  expressID: number;
  geometries: {
    size: () => number;
    get: (i: number) => { geometryExpressID: number; flatTransformation: number[] };
  };
}

describe.skipIf(!TEM)('leitor de paredes · arquivos reais', () => {
  beforeAll(async () => {
    const { obterApi, usarCaminhoDoWasm } = await import('../services/ifcViewerService');
    const { lerPecasParametricas } = await import('../services/ifcParametricoService');
    usarCaminhoDoWasm('');
    const api = await obterApi();
    for (const [chave, caminho] of [
      ['casa', CASA],
      ['predio', PREDIO],
    ] as const) {
      const id = api.OpenModel(new Uint8Array(readFileSync(caminho)));
      lido[chave] = await lerPecasParametricas(id);

      const porId = new Map(lido[chave].paredes.map((p) => [p.expressID, p]));
      const faixas = new Map<number, { lo: number; hi: number }>();
      const bruto = api as unknown as Record<string, (...a: unknown[]) => unknown>;
      (bruto.StreamAllMeshes as (m: number, f: (x: MalhaBruta) => void) => void)(id, (malha) => {
        const p = porId.get(malha.expressID);
        if (!p) return;
        const [a, b] = p.eixo;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const comp = Math.hypot(dx, dy);
        let lo = Infinity;
        let hi = -Infinity;
        for (let g = 0; g < malha.geometries.size(); g++) {
          const posto = malha.geometries.get(g);
          const geo = bruto.GetGeometry(id, posto.geometryExpressID) as {
            GetVertexData: () => number;
            GetVertexDataSize: () => number;
          };
          const v = bruto.GetVertexArray(
            geo.GetVertexData(),
            geo.GetVertexDataSize(),
          ) as Float32Array;
          const t = posto.flatTransformation;
          // 6 floats por vértice: posição e normal.
          for (let i = 0; i < v.length; i += 6) {
            const X = t[0] * v[i] + t[4] * v[i + 1] + t[8] * v[i + 2] + t[12];
            const Y = t[1] * v[i] + t[5] * v[i + 1] + t[9] * v[i + 2] + t[13];
            const d = ((X - a.x) * -dy + (Y - a.y) * dx) / comp;
            if (d < lo) lo = d;
            if (d > hi) hi = d;
          }
        }
        if (lo < Infinity) faixas.set(malha.expressID, { lo, hi });
      });
      corpo[chave] = faixas;

      api.CloseModel(id);
    }
  }, 120_000);

  it('lê TODAS as paredes dos dois arquivos', () => {
    expect(lido.casa.paredes).toHaveLength(13);
    expect(lido.predio.paredes).toHaveLength(178);
  });

  it('NENHUM eixo colapsa — era o defeito da matriz do corpo', () => {
    // Com a matriz de `StreamAllMeshes`, 70 paredes do DigitalHub saíam com
    // comprimento zero e as demais encolhidas. Uma parede de comprimento zero
    // nem chega ao kernel; uma encolhida entra e ninguém vê.
    for (const chave of ['casa', 'predio'] as const) {
      for (const p of lido[chave].paredes) {
        const c = Math.hypot(p.eixo[1].x - p.eixo[0].x, p.eixo[1].y - p.eixo[0].y);
        expect(c, `${chave} · ${p.nome}`).toBeGreaterThan(0.05);
      }
    }
  });

  it('a casa tem as medidas que o arquivo declara', () => {
    const comp = lido.casa.paredes
      .map((p) => Math.hypot(p.eixo[1].x - p.eixo[0].x, p.eixo[1].y - p.eixo[0].y))
      .sort((a, b) => a - b);
    expect(comp[0]).toBeCloseTo(3.8, 2);
    expect(comp[comp.length - 1]).toBeCloseTo(12, 2);
  });

  it('toda parede lida traz composição com espessura positiva', () => {
    // Sem camadas a espessura sairia de estimativa, e o leitor recusa em vez
    // disso. Se alguma passasse com espessura zero, a parede entraria como uma
    // linha sem corpo.
    for (const chave of ['casa', 'predio'] as const) {
      for (const p of lido[chave].paredes) {
        expect(p.camadas.length, `${chave} · ${p.nome}`).toBeGreaterThan(0);
        expect(p.espessuraTotal, `${chave} · ${p.nome}`).toBeGreaterThan(0);
        expect(p.espessuraTotal).toBeCloseTo(
          p.camadas.reduce((s, c) => s + c.espessura, 0),
          9,
        );
      }
    }
  });

  it('o GlobalId de toda parede vira uid e VOLTA igual', async () => {
    const { ifcGuidDeUid, uidDeIfcGuid } = await import('../utils/blueprintIfc');
    for (const chave of ['casa', 'predio'] as const) {
      for (const p of lido[chave].paredes) {
        const uid = uidDeIfcGuid(p.globalId);
        expect(uid, p.globalId).not.toBeNull();
        expect(ifcGuidDeUid(uid!)).toBe(p.globalId);
      }
    }
  });

  it('as paredes RECORTADAS são declaradas, não descartadas', () => {
    // Corpo que não é extrusão simples = parede cortada pelo telhado. Eixo e
    // camadas ela tem; só a altura terá de vir do pé-direito do pavimento.
    // São 13 das 191 — 4 na casa e 9 no prédio.
    expect(lido.casa.paredes.filter((p) => p.alturaExtrusao === null)).toHaveLength(4);
    expect(lido.predio.paredes.filter((p) => p.alturaExtrusao === null)).toHaveLength(9);
  });

  it('parede BAIXA é parede, e não resíduo a descartar', () => {
    // ⚠️ Um teste meu exigia altura > 0,5 m, e falhou: existem paredes de 0,50 m
    // (peitoril) e de 0,20 m (arremate). O arquivo estava certo, e o limite é
    // que era palpite. Só o zero é recusado — e ele vira `null`, não altura.
    const alturas = [...lido.casa.paredes, ...lido.predio.paredes]
      .map((p) => p.alturaExtrusao)
      .filter((a): a is number => a !== null);
    expect(Math.min(...alturas)).toBeCloseTo(0.2, 6);
    expect(Math.max(...alturas)).toBeCloseTo(8.15, 6);
    for (const a of alturas) expect(a).toBeGreaterThan(0);
  });

  it('O CENTRO CALCULADO BATE COM O CORPO DESENHADO', () => {
    // ⚠️ Este é o caso mais importante do arquivo, e o árbitro não é outro
    // cálculo meu: é a GEOMETRIA que o arquivo desenha.
    //
    // Os dois arquivos discordam de propósito. No DigitalHub o offset é −t/2 e
    // o eixo é a linha de centro; no FZK-Haus o offset é 0 e o eixo é uma FACE,
    // com o material para um lado ou para o outro conforme o `DirectionSense`.
    // Uma fórmula que só acertasse um dos dois passaria despercebida — e
    // deslocaria cada parede meia espessura, todas para o mesmo lado: o desenho
    // fecha, com os ambientes errados.
    //
    // Só entram as paredes cujo corpo é uma caixa da espessura declarada (as
    // recortadas e as em L têm o corpo espalhado, e a faixa não as descreve).
    let batem = 0;
    const divergem: string[] = [];
    for (const chave of ['casa', 'predio'] as const) {
      for (const p of lido[chave].paredes) {
        const f = corpo[chave].get(p.expressID);
        if (!f) continue;
        const largura = f.hi - f.lo;
        if (Math.abs(largura - p.espessuraTotal) > p.espessuraTotal * 0.02) continue;
        if (Math.abs((f.lo + f.hi) / 2 - p.deslocamentoDoCentro) < 0.002) batem++;
        else divergem.push(`${chave}·${p.nome}`);
      }
    }

    // Se a leitura do corpo quebrar, o laço acima não conferiria NADA e o teste
    // passaria em silêncio — que é o defeito que este projeto mais teve.
    expect(batem).toBe(108);

    // ⚠️ DIVERGÊNCIA CONHECIDA, e declarada em vez de escondida: dois tocos de
    // 40 cm do DigitalHub têm o corpo ~18 m PARA O LADO do eixo que eles
    // próprios declaram. Ao longo do eixo batem (0…0,40); só na perpendicular
    // não. Não achei explicação, e um limite frouxo aqui esconderia o dia em
    // que o número virar 20. São 2 em 110 conferidas.
    expect(divergem).toEqual(['predio·Basiswand:STB 200:2750353', 'predio·Basiswand:STB 200:2750510']);
  });

  it('os dois arquivos usam convenções DIFERENTES — é o que dá força ao caso acima', () => {
    // Prédio: eixo no centro. Casa: eixo na face, para os dois lados.
    expect(lido.predio.paredes.every((p) => Math.abs(p.deslocamentoDoCentro) < 1e-9)).toBe(true);
    expect(lido.casa.paredes.some((p) => p.deslocamentoDoCentro > 0)).toBe(true);
    expect(lido.casa.paredes.some((p) => p.deslocamentoDoCentro < 0)).toBe(true);
  });

  it('nenhuma parede dos dois arquivos é recusada', () => {
    for (const chave of ['casa', 'predio'] as const) {
      const recusas = lido[chave].recusas.filter((r) => r.classe.startsWith('IFCWALL'));
      expect(recusas.map((r) => `${r.nome}: ${r.motivo}`)).toEqual([]);
    }
  });
});
