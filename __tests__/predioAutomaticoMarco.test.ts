/**
 * O MARCO DOS PRÉDIOS DE REFERÊNCIA (PA0 do plano docs/planos/2026-11-12-predio-automatico.md, 12/11/2026). O prédio
 * automático cresce fase a fase sobre o que a massa já faz; este marco grava, por prédio, o hash do que é gerado e as
 * contagens, para cada fase dizer EXATAMENTE o que mudou (toda regravação é justificada no PR — `GRAVAR_MARCO_PREDIO=1`).
 *
 * Na PA0 o prédio é o que existe hoje: a massa (bloco + produto) → o pavimento tipo (M6a, com núcleo e cópias vivas) → a
 * planta interna das unidades (M6b). Os subsolos de R8 e R12 entram com a garagem (PA8).
 *
 * PA8c (15/11/2026): a drenagem da garagem — ralos, canaletas, caixa separadora, poço com 2 bombas e o recalque.
 *
 * PA8b (15/11/2026): a garagem ganha as escadas de emergência (a rota do subsolo fecha) e a elétrica (QDG, luzes, exaustores).
 *
 * PA8a (15/11/2026): o R8 ganha 1 subsolo e o R12, 2 — o bloco de garagem no retângulo do lote, como o gerador de massa
 * faz (`SUBSOLO_1`/`SUBSOLO_2`) — e o marco grava a garagem e confere o "pronto": nenhum pilar sobre vaga ou rampa.
 *
 * PA2 (13/11/2026): o prédio sai do ORQUESTRADOR (`planejarPredioDoPedido`), que encadeia os mesmos motores e marca o tipo
 * com `copiaInstalacoes` — o hash do modelo muda só por essa marca; contagens iguais.
 */
import { dnDoTuboDeQueda } from '../utils/blueprintNbr8160';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyBatch, contornoDaEscada, contornoDaVaga, emptyModel, pegadaEmPlanta, point, polygonArea, recorteComum, sha256, snapshotHash, type BlueprintModel, type Command, type Point } from '../utils/blueprintKernel';
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
  /** PA8a: subsolos de garagem (o bloco no retângulo do lote, pé-direito de 3 m). */
  subsolos?: number;
}
/** Os prédios de referência do plano (as unidades por andar saem do produto médio na fatia do bloco). */
const CASOS: Record<string, Caso> = {
  R4: { lote: [30000, 40000], bloco: [point(5000, 15000), point(25000, 15000), point(25000, 27000), point(5000, 27000)], pavimentos: 4 },
  R8: { lote: [40000, 60000], bloco: [point(5000, 20000), point(35000, 20000), point(35000, 36000), point(5000, 36000)], pavimentos: 8, subsolos: 1 },
  R12: { lote: [50000, 60000], bloco: [point(5000, 20000), point(45000, 20000), point(45000, 38000), point(5000, 38000)], pavimentos: 12, subsolos: 2 },
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
    ...(c.subsolos ? [{ type: 'AddBloco', levelId: t, nome: 'Subsolo', pontos: [point(0, 0), point(w, 0), point(w, d), point(0, d)], pavimentos: c.subsolos, cotaBaseMm: -3000 * c.subsolos, peDireitoMm: 3000, uso: 'GARAGEM' } as Command] : []),
  ]).model;
  const massa = medirMassa(m, { terreno: medirTerreno(divisasDoLote(m.boundaries)), limites: m.boundaries, recuosBase: RECUOS_ZERO, zona: ZONA_DA_MASSA_VAZIA });
  const doBloco = distribuirProduto(m, massa, MEDIO).blocos.find((x) => x.blocoId === m.blocos![0].id)!;
  const plano = planejarPredioDoPedido({ original: m, entrada: { blocoId: m.blocos![0].id, produto: MEDIO, doBloco, rotacaoNorteDeg: null, climatizacao: CLIMATIZACAO }, hip: {} });
  return { garagem: plano.resumo.garagem, model: plano.resultado, unidadesPorAndar: plano.resumo.unidadesPorAndar, plantas: plano.resumo.plantas?.unidades ?? 0, agua: plano.resumo.agua, esgoto: plano.resumo.esgoto, pluvial: plano.resumo.pluvial, incendio: plano.resumo.incendio, pavimentos: plano.resumo.pavimentos };
}

/** PA8a, "pronto quando": os pilares dos subsolos que pisam numa vaga, numa rampa ou na rampa que chega de baixo. */
function pilaresSobreVagaOuRampa(m: BlueprintModel): number {
  const subsolos = m.levels.filter((l) => l.elevationMm < 0).sort((a, b) => b.elevationMm - a.elevationMm);
  const rampas = (levelId: string) => m.stairs.filter((e) => e.tipo === 'RAMPA' && (e.levelId === levelId || e.ateLevelId === levelId)).map((e) => contornoDaEscada(e));
  let n = 0;
  for (const l of subsolos) {
    const ocupado = [...(m.vagas ?? []).filter((v) => v.levelId === l.id).map((v) => contornoDaVaga(v)), ...rampas(l.id)];
    n += m.structures.filter((s) => s.levelId === l.id && s.kind === 'PILAR').filter((s) => ocupado.some((o) => Math.abs(polygonArea(recorteComum(pegadaEmPlanta(s), o))) > 1)).length;
  }
  return n;
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
    // PA7a: o esgoto — trechos de todos os pavimentos e o resumo (tubos de queda, DN, ventilação, coletor).
    trechosDeEsgoto: (m.trechos ?? []).filter((t) => t.disciplina === 'ESGOTO').length,
    esgoto: p.esgoto,
    andaresComUnidade: p.pavimentos,
    // PA7b: o pluvial da cobertura.
    trechosPluviais: (m.trechos ?? []).filter((t) => t.disciplina === 'PLUVIAL').length,
    pluvial: p.pluvial,
    // PA9a: a classificação de incêndio e a rota de fuga de cada andar.
    incendio: p.incendio,
    // PA8a: a garagem no subsolo (as vagas de cada um, as rampas, a malha) e os pilares sobre vaga ou rampa.
    garagem: p.garagem,
    pilaresSobreVagaOuRampa: pilaresSobreVagaOuRampa(m),
    vagas: (m.vagas ?? []).length,
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
        // PA7a, "pronto quando": o diâmetro do tubo de queda pela Tabela 6 da NBR 8160 — UHC do grupo × os andares, a
        // UHC de um andar, e nunca abaixo de 100 com bacia. No R12 (11 andares com unidades), todos DN 100.
        const n = agora.andaresComUnidade;
        for (const t of agora.esgoto!.tubos) expect(t.dnMm).toBe(Math.max(dnDoTuboDeQueda(t.uhcPorAndar * n, t.uhcPorAndar, n), t.comBacia ? 100 : 0));
        // PA9a, "pronto quando": o R8 classificado A-2 com rota de fuga em todos os andares. Nos outros a rota fica GRAVADA
        // como está (térreo comprido no R12 e no RL, e o caminhamento até a boca da escada nos andares de cima — a rota põe a
        // boca do lance multiandares na outra ponta dele): o marco acusa qualquer mudança.
        // PA8b: com a escada de emergência da garagem, a rota limpa em todos os andares do R8 — o subsolo inclusive.
        if (nome === 'R8') {
          expect(agora.incendio!.divisao).toBe('A-2');
          expect(agora.incendio!.andares.filter((a) => a.semRota > 0 || a.naoAtendem > 0)).toEqual([]);
        }
        // PA8a, "pronto quando": no R8 (e no R12) nenhum pilar sobre vaga ou rampa; os subsolos de R8 (1) e R12 (2).
        if (caso.subsolos) {
          expect(agora.garagem?.subsolos.length).toBe(caso.subsolos);
          expect(agora.garagem?.rampas).toBe(caso.subsolos);
          expect(agora.pilaresSobreVagaOuRampa).toBe(0);
          expect(agora.garagem!.vagas).toBeGreaterThanOrEqual(agora.unidadesPorAndar * agora.andaresComUnidade);
          // PA8b: a garagem com escada(s) de emergência e a rota dentro do caminhamento em todo subsolo; exaustores e luzes.
          expect(agora.garagem!.escadasDeEmergencia).toBeGreaterThan(0);
          expect(agora.incendio!.andares.filter((a) => /subsolo/.test(a.nome) && (a.semRota > 0 || a.naoAtendem > 0))).toEqual([]);
          expect(agora.garagem!.exaustores).toBeGreaterThan(0);
          expect(agora.garagem!.luzes).toBeGreaterThan(0);
          // PA8c: a drenagem — o fundo do poço abaixo da rede, 2 bombas e o recalque até a caixa de inspeção.
          expect(agora.garagem!.drenagem).toMatchObject({ bombas: 2, recalque: true });
          expect(agora.garagem!.drenagem!.ralos).toBeGreaterThan(0);
        } else expect(agora.garagem).toBeNull();
        if (nome === 'R12') {
          expect(n).toBe(11);
          expect(agora.esgoto!.tubos.map((t) => t.dnMm)).toEqual(agora.esgoto!.tubos.map(() => 100));
        }
      },
      1_200_000,
    );
  }
});
