/**
 * Os vãos do IFC virando aberturas do kernel.
 *
 * ─── POR QUE ESTE É O TRECHO MAIS PERIGOSO DA IMPORTAÇÃO ────────────────────
 *
 * `offsetMm` e `sillMm` saem de projetar os cantos do sólido no eixo da parede.
 * Inverter o sentido do eixo espelha a janela na fachada; errar a origem da
 * altura põe o peitoril no lugar errado. Nos dois casos o desenho fica
 * PLAUSÍVEL, e o erro só aparece na obra.
 *
 * O que torna estes casos fortes é que os números têm significado no mundo:
 * porta tem peitoril ZERO e janela tem peitoril de peitoril. Uma projeção
 * espelhada ou com origem errada não produz isso por acaso.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { VaoTraduzido, ParedeTraduzida } from '../utils/ifcParaKernel';

const PASTA = process.env.IFC_AMOSTRAS ?? 'C:/D/ORÇACLOUD/bim-spike/samples';
const CASA = join(PASTA, 'AC20-FZK-Haus.ifc');
const PREDIO = join(PASTA, 'DigitalHub.ifc');
const TEM = existsSync(CASA) && existsSync(PREDIO);

const vaos: Record<string, VaoTraduzido[]> = {};
const paredes: Record<string, ParedeTraduzida[]> = {};
const motivos: Record<string, string[]> = {};

describe.skipIf(!TEM)('ifc → kernel · vãos', () => {
  beforeAll(async () => {
    const { obterApi, usarCaminhoDoWasm } = await import('../services/ifcViewerService');
    const { lerPecasParametricas } = await import('../services/ifcParametricoService');
    const { traduzirParedes, traduzirVaos } = await import('../utils/ifcParaKernel');
    const { encostarNasFaces } = await import('../utils/ifcEncostarParedes');
    usarCaminhoDoWasm('');
    const api = await obterApi();
    for (const [chave, caminho] of [
      ['casa', CASA],
      ['predio', PREDIO],
    ] as const) {
      const id = api.OpenModel(new Uint8Array(readFileSync(caminho)));
      const leitura = await lerPecasParametricas(id);
      const p = encostarNasFaces(traduzirParedes(leitura.paredes, leitura.fatorParaMm).paredes)
        .paredes;
      const t = traduzirVaos(leitura.vaos, p, leitura.fatorParaMm);
      paredes[chave] = p;
      vaos[chave] = t.vaos;
      motivos[chave] = [...leitura.recusas, ...t.recusas]
        .filter((r) => r.classe === 'IFCOPENINGELEMENT')
        .map((r) => r.motivo.replace(/-?\d+/g, 'N'));
      api.CloseModel(id);
    }
  }, 300_000);

  it('a casa tem as 5 PORTAS e as 11 JANELAS que o arquivo declara', () => {
    // O arquivo tem exatamente 5 `IfcDoor` e 11 `IfcWindow`. Se o vão perdesse
    // a esquadria pelo caminho, viraria `passage` — e vão livre não entra em
    // área de esquadria no orçamento.
    const conta = (k: string) => vaos.casa.filter((v) => v.kind === k).length;
    expect(conta('door')).toBe(5);
    expect(conta('window')).toBe(11);
    expect(conta('passage')).toBe(0);
  });

  it('TODA PORTA tem peitoril ZERO — a prova de que a origem da altura está certa', () => {
    // ⚠️ Este é o caso mais valioso do arquivo. Porta nasce no piso; se a cota
    // do vão fosse lida contra a origem do arquivo, contra o pavimento errado
    // ou com o eixo vertical trocado, este número não seria zero em NENHUMA
    // das cinco — e menos ainda em todas.
    for (const v of vaos.casa.filter((x) => x.kind === 'door')) {
      expect(v.sillMm, v.nome).toBe(0);
    }
  });

  it('TODA JANELA tem peitoril de peitoril — entre 80 cm e 95 cm', () => {
    const alturas = vaos.casa.filter((v) => v.kind === 'window').map((v) => v.sillMm);
    expect(Math.min(...alturas)).toBe(800);
    expect(Math.max(...alturas)).toBe(950);
  });

  it('as larguras são de porta e janela de verdade', () => {
    const l = vaos.casa.map((v) => v.widthMm).sort((a, b) => a - b);
    expect(l[0]).toBe(885);
    expect(l[l.length - 1]).toBe(2010);
  });

  it('TODO vão cabe na parede que o hospeda', () => {
    // O kernel recusa `OPENING_OUT_OF_BOUNDS` por conta própria; se um vão
    // passasse daqui sem caber, a importação inteira falharia no `applyBatch`,
    // e "ou tudo, ou nada" viraria "nada".
    for (const chave of ['casa', 'predio'] as const) {
      const porId = new Map(paredes[chave].map((p) => [p.expressID, p]));
      for (const v of vaos[chave]) {
        const p = porId.get(v.paredeExpressID)!;
        const comp = Math.round(Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y));
        expect(v.offsetMm, `${chave} · ${v.nome}`).toBeGreaterThanOrEqual(0);
        expect(v.offsetMm + v.widthMm, `${chave} · ${v.nome}`).toBeLessThanOrEqual(comp);
      }
    }
  });

  it('todo vão leva a identidade do arquivo', () => {
    for (const chave of ['casa', 'predio'] as const) {
      expect(vaos[chave].every((v) => v.uid !== null)).toBe(true);
    }
  });

  it('o que NÃO entra é nomeado, e as contagens estão fixadas', () => {
    // Recusa contada é recusa que alguém pode ir buscar. As três do prédio são
    // de naturezas diferentes, e afrouxar qualquer uma esconderia um defeito.
    const contar = (chave: string, trecho: string) =>
      motivos[chave].filter((m) => m.includes(trecho)).length;

    // Furo em laje: o kernel só tem abertura em parede.
    expect(contar('casa', 'não é parede')).toBe(1);
    expect(contar('predio', 'não é parede')).toBe(12);
    // `IfcAdvancedBrep`: tirar largura e peitoril de malha seria estimar.
    expect(contar('casa', 'é uma malha')).toBe(0);
    expect(contar('predio', 'é uma malha')).toBe(102);
    // Vão de um trecho de parede que o arquivo dividiu de outro jeito.
    expect(contar('predio', 'cai fora da parede')).toBe(8);

    expect(vaos.casa).toHaveLength(16);
    expect(vaos.predio).toHaveLength(126);
  });
});
