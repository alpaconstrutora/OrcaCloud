/**
 * O MARCO DOS PRÉDIOS DE REFERÊNCIA (PA0 do plano docs/planos/2026-11-12-predio-automatico.md, 12/11/2026). O prédio
 * automático cresce fase a fase sobre o que a massa já faz; este marco grava, por prédio, o hash do que é gerado e as
 * contagens, para cada fase dizer EXATAMENTE o que mudou (toda regravação é justificada no PR — `GRAVAR_MARCO_PREDIO=1`).
 *
 * Na PA0 o prédio é o que existe hoje: a massa (bloco + produto) → o pavimento tipo (M6a, com núcleo e cópias vivas) → a
 * planta interna das unidades (M6b). Os subsolos de R8 e R12 entram com a garagem (PA8).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyBatch, emptyModel, point, sha256, snapshotHash, type Command, type Point } from '../utils/blueprintKernel';
import { divisasDoLote, medirTerreno, RECUOS_ZERO } from '../utils/blueprintTerreno';
import { medirMassa, ZONA_DA_MASSA_VAZIA } from '../utils/blueprintMassa';
import { distribuirProduto, produtoSemente } from '../utils/blueprintProduto';
import { direcaoDaRua, ordinalDoTipo } from '../utils/blueprintPavimentoTipoDaMassa';
import { dividirPavimentoDoBloco, montarPavimentoTipoDoBloco } from '../utils/blueprintPavimentoOrtogonal';
import { plantasDasUnidades } from '../utils/blueprintPlantaDaUnidade';

const FIXTURE = new URL('./fixtures/predioAutomaticoMarco.json', import.meta.url);
const GRAVAR = process.env.GRAVAR_MARCO_PREDIO === '1';
const MEDIO = produtoSemente('RESIDENCIAL_MEDIO');

interface Caso {
  /** Lote (largura × profundidade, mm), rua ao sul. */
  lote: [number, number];
  bloco: Point[];
  pavimentos: number;
}
/** Os prédios de referência do plano (as unidades por andar saem do produto médio na fatia do bloco). */
const CASOS: Record<string, Caso> = {
  R4: { lote: [30000, 40000], bloco: [point(5000, 15000), point(25000, 15000), point(25000, 27000), point(5000, 27000)], pavimentos: 4 },
  R8: { lote: [40000, 60000], bloco: [point(5000, 20000), point(35000, 20000), point(35000, 36000), point(5000, 36000)], pavimentos: 8 },
  R12: { lote: [50000, 60000], bloco: [point(5000, 20000), point(45000, 20000), point(45000, 38000), point(5000, 38000)], pavimentos: 12 },
  RL: { lote: [60000, 60000], bloco: [point(5000, 5000), point(45000, 5000), point(45000, 21000), point(21000, 21000), point(21000, 50000), point(5000, 50000)], pavimentos: 8 },
};

/** O prédio de hoje: massa → pavimento tipo → planta das unidades. */
function predio(c: Caso) {
  const [w, d] = c.lote;
  let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
  const t = m.levels[0].id;
  const div = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA'): Command => ({ type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel });
  m = applyBatch(m, [
    div(0, 0, w, 0, 'FRENTE'), div(w, 0, w, d, 'LATERAL_DIREITA'), div(w, d, 0, d, 'FUNDOS'), div(0, d, 0, 0, 'LATERAL_ESQUERDA'),
    { type: 'AddBloco', levelId: t, nome: 'Torre', pontos: c.bloco, pavimentos: c.pavimentos },
  ]).model;
  const massa = medirMassa(m, { terreno: medirTerreno(divisasDoLote(m.boundaries)), limites: m.boundaries, recuosBase: RECUOS_ZERO, zona: ZONA_DA_MASSA_VAZIA });
  const pb = distribuirProduto(m, massa, MEDIO).blocos[0];
  const b = m.blocos![0];
  const ord = ordinalDoTipo(m, b);
  const piso = pb.pisos.find((p) => p.ordinal === ord)!;
  const r = dividirPavimentoDoBloco({ bloco: b, produto: MEDIO, porTipologia: piso.porTipologia, nucleoM2: pb.nucleo.m2, elevadores: pb.nucleo.elevadores, ordinalDoTipo: ord, rotacaoNorteDeg: null, direcaoDaRua: direcaoDaRua(m) });
  if (!r.ok) throw new Error(r.motivo);
  const mont = montarPavimentoTipoDoBloco(m, b, r.divisao);
  const pl = plantasDasUnidades(mont.model, b, MEDIO);
  return { model: pl.model, unidadesPorAndar: r.divisao.unidades.length, plantas: pl.unidades.length };
}

/** O que o marco guarda de um prédio. */
function marcoDoPredio(c: Caso) {
  const p = predio(c);
  const m = p.model;
  return {
    modelo: snapshotHash(m),
    unidades: sha256((m.unidades ?? []).map((u) => u.numero).sort().join(',')),
    pavimentos: m.levels.length,
    copias: m.levels.filter((l) => l.tipoDeId).length,
    unidadesPorAndar: p.unidadesPorAndar,
    plantas: p.plantas,
    paredes: m.walls.length,
    nucleos: (m.nucleos ?? []).length,
  };
}

describe('marco dos prédios de referência (prédio automático)', () => {
  const gravado: Record<string, ReturnType<typeof marcoDoPredio>> = existsSync(FIXTURE) ? JSON.parse(readFileSync(FIXTURE, 'utf8')) : {};
  for (const [nome, caso] of Object.entries(CASOS)) {
    it(
      nome,
      () => {
        const agora = marcoDoPredio(caso);
        if (GRAVAR) {
          const atual = existsSync(FIXTURE) ? JSON.parse(readFileSync(FIXTURE, 'utf8')) : {};
          writeFileSync(FIXTURE, JSON.stringify({ ...atual, [nome]: agora }, null, 2) + '\n');
          return;
        }
        expect(gravado[nome], `sem marco gravado para ${nome} — grave com GRAVAR_MARCO_PREDIO=1`).toBeDefined();
        expect(agora).toEqual(gravado[nome]);
      },
      300_000,
    );
  }
});
