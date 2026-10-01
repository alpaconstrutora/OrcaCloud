/**
 * A LEI DOS MOTORES DE PROPOSTA (plano `2026-10-01-incendio-backlog-pos-roadmap.md`, item A1).
 *
 * Para cada botão de proposta automática de incêndio:
 *  1. propor → aplicar → analisar ⇒ ZERO falta (ou, no que não tem solução,
 *     a falta dita — mas nunca uma proposta que a análise reprova);
 *  2. propor DE NOVO sobre o resultado ⇒ lote VAZIO;
 *  3. nenhuma peça do mesmo tipo no MESMO ponto.
 *
 * Por que existe: a iluminação (E7.3) punha a luminária exatamente no raio; o
 * arredondamento ao mm (`AddTerminal`) a jogava 0,27 mm FORA, a análise seguia
 * acusando, e cada clique empilhava outra no mesmo lugar. Nenhum teste rodava a
 * proposta duas vezes. Os cenários são os que pegam essa classe de defeito:
 * retângulo, ambiente em L, ambiente sem porta e centro em meio milímetro.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_EXTINTORES_PADRAO as HE, analisarExtintores, proporExtintores } from '../utils/blueprintExtintores';
import { analisarAlarme, proporAlarme } from '../utils/blueprintDeteccaoAlarme';
import { analisarIluminacao, proporIluminacao } from '../utils/blueprintIluminacaoEmergencia';
import { analisarSinalizacao, proporSinalizacao } from '../utils/blueprintSinalizacao';
import { coberturaDosHidrantes, proporHidrantes } from '../utils/blueprintCoberturaIncendio';
import { percursoDeFuga } from '../utils/blueprintRotaDeFuga';
import { HIPOTESES_INCENDIO_PADRAO as H } from '../utils/blueprintIncendioClassificacao';
import { comandosDaDistribuicao, distribuirSprinklers } from '../utils/blueprintDistribuicaoSprinklers';
import { criterioDeSprinklers } from '../utils/blueprintSprinklersIncendio';
import { marcasDoLancamentoDeIncendio } from '../utils/blueprintConferenciaIncendio';

// ─── Cenários ────────────────────────────────────────────────────────────────

const parede = (l: string, ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: l, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 }) as Command;
const porta = (wallId: string, offsetMm: number, widthMm = 900): Command => ({ type: 'AddOpening', wallId, kind: 'door', offsetMm, widthMm, heightMm: 2100, sillMm: 0 }) as Command;
function nomear(m: BlueprintModel, nome: (s: BlueprintModel['spaces'][number]) => string): BlueprintModel {
  return applyBatch(m, m.spaces.map((s) => ({ type: 'NameSpace', spaceId: s.id, name: nome(s) }) as Command)).model;
}

/** Corredor (y 0–2 m) e N salas de `largura` × 6 m em cima, porta de cada sala para o corredor; a 1ª é "Cozinha", a última tem a porta da rua. `largura` ímpar põe o centro em meio mm. */
function corredorESalas(n = 4, largura = 6000): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  const L = n * largura;
  const cmds: Command[] = [parede(l, 0, 0, L, 0), parede(l, L, 0, L, 8000), parede(l, L, 8000, 0, 8000), parede(l, 0, 8000, 0, 0)];
  for (let k = 0; k < n; k++) cmds.push(parede(l, k * largura, 2000, (k + 1) * largura, 2000));
  for (let k = 1; k < n; k++) cmds.push(parede(l, k * largura, 2000, k * largura, 8000));
  m = applyBatch(m, cmds).model;
  m = applyBatch(m, m.walls.filter((w) => w.a.y === 2000 && w.b.y === 2000).map((w) => porta(w.id, Math.round(largura / 2) - 450))).model;
  const fundo = m.walls.find((w) => w.a.x === 0 && w.b.x === 0)!;
  m = applyCommand(m, porta(fundo.id, 6500)).model; // a porta da rua, no corredor (y 0–2 m → offset ao longo de 8000→0)
  return nomear(m, (s) => (s.ring.every((p) => p.y <= 2000) ? 'Corredor' : Math.min(...s.ring.map((p) => p.x)) < largura / 2 ? 'Cozinha' : `Sala ${Math.round(Math.min(...s.ring.map((p) => p.x)) / largura) + 1}`));
}

/** Um salão em L (14 × 14 m, braço de 4 m) com a porta da rua. */
function salaoEmL(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  m = applyBatch(m, [parede(l, 0, 0, 14000, 0), parede(l, 14000, 0, 14000, 4000), parede(l, 14000, 4000, 4000, 4000), parede(l, 4000, 4000, 4000, 14000), parede(l, 4000, 14000, 0, 14000), parede(l, 0, 14000, 0, 0)]).model;
  m = applyCommand(m, porta(m.walls[0].id, 6000)).model;
  return nomear(m, () => 'Salão');
}

/** Um L ESTREITO (30 × 30 m, braço de 3 m): células da malha com o centro fora do ambiente. */
function lEstreito(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  m = applyBatch(m, [parede(l, 0, 0, 30000, 0), parede(l, 30000, 0, 30000, 3000), parede(l, 30000, 3000, 3000, 3000), parede(l, 3000, 3000, 3000, 30000), parede(l, 3000, 30000, 0, 30000), parede(l, 0, 30000, 0, 0)]).model;
  m = applyCommand(m, porta(m.walls[0].id, 1000)).model;
  return nomear(m, () => 'Galeria');
}

/** Um salão de 70 × 6 m com UMA porta, numa ponta: o fundo fica a mais de 30 m de qualquer posição junto à porta. */
function salaoLongo(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  m = applyBatch(m, [parede(l, 0, 0, 70000, 0), parede(l, 70000, 0, 70000, 6000), parede(l, 70000, 6000, 0, 6000), parede(l, 0, 6000, 0, 0)]).model;
  m = applyCommand(m, porta(m.walls.find((w) => w.a.x === 0 && w.b.x === 0)!.id, 2500)).model;
  return nomear(m, () => 'Galpão');
}

/** O corredor com salas, e um depósito FECHADO (sem porta) no fim — inalcançável. */
function comDepositoSemPorta(): BlueprintModel {
  let m = corredorESalas(3);
  const l = m.levels[0].id;
  m = applyBatch(m, [parede(l, 18000, 0, 22000, 0), parede(l, 22000, 0, 22000, 8000), parede(l, 22000, 8000, 18000, 8000)]).model;
  return nomear(m, (s) => s.name || 'Depósito');
}

const CENARIOS: [string, () => BlueprintModel][] = [
  ['retângulo (corredor e salas)', () => corredorESalas()],
  ['centro em meio milímetro (salas de 6,001 m)', () => corredorESalas(4, 6001)],
  ['ambiente em L', () => salaoEmL()],
  ['L estreito (braço de 3 m)', () => lEstreito()],
];

/** Onde parte do ambiente NÃO tem solução: a 2ª proposta tem de sair vazia mesmo assim. */
const SEM_SOLUCAO: [string, () => BlueprintModel][] = [
  ['ambiente sem porta', () => comDepositoSemPorta()],
  ['salão de 70 m com uma porta só', () => salaoLongo()],
];

// ─── A lei ───────────────────────────────────────────────────────────────────

/** Peças de incêndio do mesmo tipo no mesmo ponto (ao mm). */
function duplicadas(m: BlueprintModel): string[] {
  const vistos = new Map<string, number>();
  for (const t of m.terminais ?? []) {
    if (t.disciplina !== 'INCENDIO') continue;
    const k = `${t.levelId}|${t.tipoHidraulico}|${Math.round(t.at.x)}|${Math.round(t.at.y)}`;
    vistos.set(k, (vistos.get(k) ?? 0) + 1);
  }
  return [...vistos].filter(([, n]) => n > 1).map(([k, n]) => `${k} ×${n}`);
}

interface Motor {
  nome: string;
  propor: (m: BlueprintModel) => Command[];
  faltas: (m: BlueprintModel) => string[];
}

const percurso = (m: BlueprintModel) => percursoDeFuga(m, 'A', m.levels[0].id, null);
const MOTORES: Motor[] = [
  {
    nome: 'extintores (risco médio)',
    propor: (m) => proporExtintores(m, analisarExtintores(m, 'MEDIA', HE), HE).comandos,
    faltas: (m) => {
      const a = analisarExtintores(m, 'MEDIA', HE);
      return [...a.ambientes.filter((x) => !x.atende).map((x) => `ambiente ${x.rotulo}`), ...a.extintores.filter((x) => x.capacidadeAtende === false).map((x) => `capacidade de ${x.terminalId}`), ...a.pavimentosSemExtintor.map((x) => `pavimento ${x.nome}`)];
    },
  },
  {
    nome: 'detecção e alarme',
    propor: (m) => proporAlarme(m, analisarAlarme(m, true, true)),
    faltas: (m) => {
      const a = analisarAlarme(m, true, true);
      return [...a.ambientes.filter((x) => !x.atende).map((x) => `detecção ${x.rotulo}`), ...a.longeDoAcionador.map((x) => `acionador ${x.rotulo}`), ...a.pavimentosSemAvisador.map((x) => `avisador ${x.nome}`), ...(a.semCentral ? ['central'] : []), ...a.foraDoLaco.map((x) => `laço ${x}`)];
    },
  },
  {
    nome: 'iluminação de emergência',
    propor: (m) => proporIluminacao(m, percurso(m), analisarIluminacao(m, percurso(m), m.levels[0].id, H.iluminacao)),
    faltas: (m) => {
      const a = analisarIluminacao(m, percurso(m), m.levels[0].id, H.iluminacao);
      return [...a.pontosObrigatorios.filter((x) => !x.coberto).map((x) => `obrigatório ${x.at.x},${x.at.y}`), ...a.trechosSemLuz.map((x) => `sem luz ${x.at.x},${x.at.y}`)];
    },
  },
  {
    nome: 'sinalização da rota',
    propor: (m) => proporSinalizacao(m, analisarSinalizacao(m, percurso(m), m.levels[0].id)),
    faltas: (m) => {
      const a = analisarSinalizacao(m, percurso(m), m.levels[0].id);
      return [...a.equipamentosSemPlaca.map((x) => `placa de ${x}`), ...a.pontosDaRota.filter((x) => !x.coberto).map((x) => `rota ${x.at.x},${x.at.y}`)];
    },
  },
  {
    nome: 'hidrantes pela cobertura',
    propor: (m) => proporHidrantes(m, H.hidraulica).comandos,
    faltas: (m) => coberturaDosHidrantes(m, H.hidraulica).descobertos.map((x) => `hidrante ${x.nome}`),
  },
];

describe('A1 · a lei dos motores de proposta', () => {
  for (const motor of MOTORES) {
    for (const [cenario, criar] of CENARIOS) {
      it(`${motor.nome} · ${cenario}: a proposta zera a própria análise, a 2ª sai vazia, nada empilhado`, () => {
        const m0 = criar();
        const m1 = applyBatch(m0, motor.propor(m0)).model;
        expect(motor.faltas(m1)).toEqual([]);
        expect(motor.propor(m1)).toEqual([]);
        expect(duplicadas(m1)).toEqual([]);
      });
    }
    for (const [cenario, criar] of SEM_SOLUCAO) {
      it(`${motor.nome} · ${cenario}: o que não tem solução NÃO vira lote repetido`, () => {
        const m0 = criar();
        const m1 = applyBatch(m0, motor.propor(m0)).model;
        expect(motor.propor(m1)).toEqual([]);
        expect(duplicadas(m1)).toEqual([]);
      });
    }
  }

  it('A4 · sprinklers: o ambiente que já tem sprinkler não recebe outra malha — dois "Lançar" não empilham, e o motivo é dito', () => {
    const criterio = criterioDeSprinklers({ ...H.sprinklers, risco: 'LEVE' }, null);
    let m = salaoEmL();
    const sala = m.spaces[0].id;
    const p1 = distribuirSprinklers(m, sala, criterio, H.sprinklers);
    expect(p1.alternativas.length).toBeGreaterThan(0);
    m = applyBatch(m, comandosDaDistribuicao(p1, p1.alternativas[0])).model;
    const p2 = distribuirSprinklers(m, sala, criterio, H.sprinklers);
    expect(p2.alternativas).toEqual([]);
    expect(p2.motivo).toMatch(/já tem \d+ sprinkler\(s\) — apague-os para redistribuir/);
    expect(duplicadas(m)).toEqual([]);
  });

  it('A6 · duas luminárias no mesmo ponto dão a marca "duplicada" (na segunda); uma só, não', () => {
    let m = corredorESalas(1);
    const l = m.levels[0].id;
    const lum = (x: number): Command => ({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo: 'LE', tipoHidraulico: 'LUMINARIA_EMERGENCIA', at: point(x, 1000), cotaMm: 2200 }) as Command;
    m = applyBatch(m, [lum(2000), lum(4000)]).model;
    expect(marcasDoLancamentoDeIncendio(m).filter((x) => x.tipo === 'INCENDIO_DUPLICADA')).toEqual([]);
    m = applyCommand(m, lum(2000)).model;
    const dup = marcasDoLancamentoDeIncendio(m).filter((x) => x.tipo === 'INCENDIO_DUPLICADA');
    expect(dup).toHaveLength(1);
    expect(dup[0].alvoId).toBe(m.terminais![2].id);
    expect(dup[0].texto).toMatch(/duplicad/);
  });

  it('extintor SEM agente: proposta e análise com a MESMA regra (vale para a classe A) — a cozinha ao lado dele é coberta', () => {
    // Só o corredor e a cozinha, com o extintor sem agente DENTRO da cozinha: ele cobre a classe A
    // de tudo, e nenhum outro extintor seria lançado "de tabela" para outra sala.
    const m0 = corredorESalas(1);
    const l = m0.levels[0].id;
    const comSemAgente = applyCommand(m0, { type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo: 'Extintor', tipoHidraulico: 'EXTINTOR', at: point(3000, 5000), cotaMm: 1600 } as Command).model;
    const m1 = applyBatch(comSemAgente, proporExtintores(comSemAgente, analisarExtintores(comSemAgente, 'MEDIA', HE), HE).comandos).model;
    expect(analisarExtintores(m1, 'MEDIA', HE).ambientes.filter((x) => !x.atende).map((x) => x.rotulo)).toEqual([]);
  });
});
