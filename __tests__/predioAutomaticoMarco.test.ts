/**
 * O MARCO DOS PRÉDIOS DE REFERÊNCIA (PA0 do plano docs/planos/2026-11-12-predio-automatico.md, 12/11/2026). O prédio
 * automático cresce fase a fase sobre o que a massa já faz; este marco grava, por prédio, o hash do que é gerado e as
 * contagens, para cada fase dizer EXATAMENTE o que mudou (toda regravação é justificada no PR — `GRAVAR_MARCO_PREDIO=1`).
 *
 * Na PA0 o prédio é o que existe hoje: a massa (bloco + produto) → o pavimento tipo (M6a, com núcleo e cópias vivas) → a
 * planta interna das unidades (M6b). Os subsolos de R8 e R12 entram com a garagem (PA8).
 *
 * PA2 (13/11/2026): o prédio sai do ORQUESTRADOR (`planejarPredioDoPedido`), que encadeia os mesmos motores e marca o tipo
 * com `copiaInstalacoes` — o hash do modelo muda só por essa marca; contagens iguais.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyBatch, emptyModel, point, sha256, snapshotHash, type Command, type Point } from '../utils/blueprintKernel';
import { planejarPredioDoPedido } from '../utils/blueprintPredioAutomatico';
import { modelosDoCatalogo } from '../utils/blueprintSelecaoClimatizacao';
import { SEMENTES_DE_TIPOS } from '../utils/blueprintCatalogoDeTipos';
import { HIPOTESES_CLIMATIZACAO_PADRAO } from '../utils/blueprintClimatizacao';
import { MATERIAIS_SEMENTE } from '../utils/blueprintMateriais';
import { divisasDoLote, medirTerreno, RECUOS_ZERO } from '../utils/blueprintTerreno';
import { medirMassa, ZONA_DA_MASSA_VAZIA } from '../utils/blueprintMassa';
import { distribuirProduto, produtoSemente } from '../utils/blueprintProduto';

const FIXTURE = new URL('./fixtures/predioAutomaticoMarco.json', import.meta.url);
const GRAVAR = process.env.GRAVAR_MARCO_PREDIO === '1';
const MEDIO = produtoSemente('RESIDENCIAL_MEDIO');
/** PA5b: o catálogo semente e o clima do marco da casa — a climatização das unidades entra no marco. */
const CLIMATIZACAO = {
  hip: { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: null, tbsExternaC: 34, tbuExternaC: 25, altitudeM: 0 } },
  modelos: modelosDoCatalogo(SEMENTES_DE_TIPOS.map((s, i) => ({ id: `t${i}`, nome: s.nome, familia: s.propriedades.familia, active: true, propriedades: s.propriedades }))),
  carga: { materiais: MATERIAIS_SEMENTE.map((m, i) => ({ ...m, id: `m${i}`, organizationId: 'o', active: true, createdAt: '', updatedAt: '' })), cidadeDoContexto: null },
};

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

/** O prédio pelo orquestrador: massa → pavimento tipo → planta das unidades. */
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
  const doBloco = distribuirProduto(m, massa, MEDIO).blocos[0];
  const plano = planejarPredioDoPedido({ original: m, entrada: { blocoId: m.blocos![0].id, produto: MEDIO, doBloco, rotacaoNorteDeg: null, climatizacao: CLIMATIZACAO }, hip: {} });
  return { model: plano.resultado, unidadesPorAndar: plano.resumo.unidadesPorAndar, plantas: plano.resumo.plantas?.unidades ?? 0, agua: plano.resumo.agua };
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
    // PA4: pilares, vigas, lajes e fundação de todos os pavimentos.
    estruturas: m.structures.length,
    // PA5: quadros e pontos (elétricos, hidráulicos) de todos os pavimentos.
    quadros: (m.quadros ?? []).length,
    terminais: (m.terminais ?? []).length,
    // PA6: a água fria — trechos de todos os pavimentos e o resumo (hidrômetros, coluna, recalque, reserva, pressão).
    trechosDeAgua: (m.trechos ?? []).filter((t) => t.disciplina === 'AGUA_FRIA').length,
    agua: p.agua,
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
        // PA6, "pronto quando": o R12 pede VRP (a estática passa de 400 kPa embaixo); em nenhum prédio fica ponto sem pressão.
        expect(agora.agua?.vrp).toBe(nome === 'R12');
        expect(agora.agua?.insuficientes).toBe(0);
        expect(agora.agua?.excessivas).toBe(0);
      },
      600_000,
    );
  }
});
