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
import { volumesDasPecasDeClimatizacao } from '../utils/blueprintRede';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyBatch, conflitosDoModelo, contornoDaEscada, contornoDaVaga, emptyModel, pegadaEmPlanta, point, polygonArea, recorteComum, sha256, snapshotHash, type BlueprintModel, type Command, type Point } from '../utils/blueprintKernel';
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
  return { garagem: plano.resumo.garagem, model: plano.resultado, unidadesPorAndar: plano.resumo.unidadesPorAndar, plantas: plano.resumo.plantas?.unidades ?? 0, agua: plano.resumo.agua, esgoto: plano.resumo.esgoto, pluvial: plano.resumo.pluvial, incendio: plano.resumo.incendio, pavimentos: plano.resumo.pavimentos, compatibilizacao: plano.resumo.compatibilizacao };
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

/** PA10b: os encontros água fria × esgoto no prédio inteiro. */
function aguaXEsgoto(m: BlueprintModel): number {
  const d = new Map((m.trechos ?? []).map((t) => [t.id, t.disciplina]));
  return conflitosDoModelo(m).filter((c) => c.classe === 'REDE' && [d.get(c.trechoId), d.get(c.outroId)].sort().join('×') === 'AGUA_FRIA×ESGOTO').length;
}

/** PA11: os trechos de eletroduto que atravessam a caixa de uma peça de climatização (evaporadora, exaustor). */
function eletrodutoNoEquipamento(m: BlueprintModel): number {
  const d = new Map((m.trechos ?? []).map((t) => [t.id, t.disciplina]));
  return conflitosDoModelo(m, { pecas: volumesDasPecasDeClimatizacao(m) }).filter((c) => c.classe === 'EQUIPAMENTO' && d.get(c.trechoId) === 'ELETRICA').length;
}

/** PA13: os encontros do eletroduto com a climatização (linha frigorígena, duto de ar) e com o esgoto, no prédio inteiro. */
function eletrodutoX(m: BlueprintModel, outras: readonly string[]): number {
  const d = new Map((m.trechos ?? []).map((t) => [t.id, t.disciplina as string]));
  return conflitosDoModelo(m).filter((c) => {
    if (c.classe !== 'REDE') return false;
    const par = [d.get(c.trechoId), d.get(c.outroId)];
    return par.includes('ELETRICA') && par.some((x) => x !== undefined && outras.includes(x));
  }).length;
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
    // PA10b: a compatibilização (conflitos por tipo, encostos, prumadas na laje, furos da lista) e os encontros água fria ×
    // esgoto — a água no forro rebaixado das áreas molhadas, abaixo dos ramais do andar de cima (eram 252 no R8).
    compatibilizacao: { conflitos: p.compatibilizacao.conflitos, encostos: p.compatibilizacao.encostos, passagens: p.compatibilizacao.passagens, furos: p.compatibilizacao.furos.lista.length },
    aguaXEsgoto: aguaXEsgoto(m),
    // PA11: o eletroduto contorna a caixa da evaporadora e do exaustor (eram R4 9, R8 56, R12 242, RL 112).
    eletrodutoNoEquipamento: eletrodutoNoEquipamento(m),
    // PA13 ("eletroduto junto da laje"): o eletroduto na faixa da elétrica do forro, acima da linha frigorígena e do duto
    // de ar (os três corriam a 2,35 m, sob a viga). Eletroduto × linha e duto, antes (PA12): R8 336, R12 1.111, RL 833. O
    // que sobra são as descidas do eletroduto cruzando a linha/duto junto da parede. E o eletroduto × esgoto passa a
    // contar as descidas das louças de cima pela laje (o quadro da unidade logo abaixo de uma delas é inevitável).
    eletrodutoXClimatizacao: eletrodutoX(m, ['FRIGORIGENA', 'MECANICA']),
    eletrodutoXEsgoto: eletrodutoX(m, ['ESGOTO']),
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
        // PA10b: o rebaixo da água nas áreas molhadas não parte a rede — todo ponto segue ligado à origem (o "jogo" de 1 mm e o
        // corte rente à ponta partiam: 55 pontos sem pressão no R12).
        expect(agora.agua?.naoAvaliados).toBe(0);
        // PA10b: a água abaixo dos ramais do andar de cima nas áreas molhadas (estavam: R4 62, R8 252, R12 911, RL 1.195); PA12
        // ("água abaixo do ramal"): também nos cômodos secos por onde passa o ramal, e contornando o tubo de queda do banheiro
        // (R4 4, R8 18, R12 141, RL 244 → zero). O 1 do R12 é da garagem: as duas redes do próprio subsolo, fora do tipo.
        expect(agora.aguaXEsgoto).toBe(({ R4: 0, R8: 0, R12: 1, RL: 0 } as Record<string, number>)[nome]);
        // PA11, "pronto quando": nenhum eletroduto atravessa a caixa de uma evaporadora ou de um exaustor.
        expect(agora.eletrodutoNoEquipamento).toBe(0);
        // PA7a, "pronto quando": o diâmetro do tubo de queda pela Tabela 6 da NBR 8160 — UHC do grupo × os andares, a
        // UHC de um andar, e nunca abaixo de 100 com bacia. No R12 (11 andares com unidades), todos DN 100.
        const n = agora.andaresComUnidade;
        for (const t of agora.esgoto!.tubos) expect(t.dnMm).toBe(Math.max(dnDoTuboDeQueda(t.uhcPorAndar * n, t.uhcPorAndar, n), t.comBacia ? 100 : 0));
        // PA9a, "pronto quando": A-2 com rota de fuga em todos os andares. PA10c: nos quatro prédios — o tipo contava a
        // escada que chega e a que sobe como duas saídas, o corredor DENTRO do apartamento era medido (A-2 conta da porta da
        // unidade), um resíduo de geometria de 0,0002 m² era "ambiente sem rota" no RL; e, por decisão do usuário, a
        // detecção nas áreas comuns do tipo quando a circulação passa de 25 m com uma escada (R12, RL) e a 2ª porta para o
        // exterior no térreo comprido (RL). PA8b: a garagem com a escada de emergência — o subsolo inclusive.
        expect(agora.incendio!.divisao).toBe('A-2');
        expect(agora.incendio!.andares.filter((a) => a.semRota > 0 || a.naoAtendem > 0)).toEqual([]);
        expect(Boolean(agora.incendio!.equipamentos?.DETECTOR_FUMACA)).toBe(nome === 'R12' || nome === 'RL');
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
