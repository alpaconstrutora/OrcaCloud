/**
 * A VERIFICAÇÃO DA REDE NO DESENHO (28/09/2026, Etapa 0.1 do roadmap
 * hidrossanitário — `docs/planos/2026-09-28-hidrossanitario-roadmap.md`).
 *
 * Três problemas que o sistema já sabia calcular e ninguém via:
 *
 *   1. PONTA ABERTA — tubo que termina sem ligar em nada (sem outro tubo, sem
 *      ponto, sem peça). `conexoesDerivadas` sempre as calculou e nenhuma tela
 *      as mostrava. A saída da VENTILAÇÃO é aberta de propósito e fica de fora;
 *   2. DN FORA DO NECESSÁRIO no esgoto — `verificarDnDoEsgoto`;
 *   3. LOUÇA SEM PONTO — a peça desenhada que ainda não tem o ponto de água ou
 *      de esgoto dela (`pontosDaLouca`).
 *
 * Tudo derivado do modelo, nada gravado. O pavimento da marca é o do TRECHO (a
 * chave do nó põe o que está sob o piso do andar no teto do de baixo, mas o
 * tubo é desenhado e lido no andar dele) — mesma regra de `simbolosDasConexoes2D`.
 */
import { verificarVentilacao } from './blueprintVentilacao';
import { ROTULO_DA_LIMPEZA, ROTULO_DO_EXTRAVASOR } from './blueprintPecasDaCaixa';
import { DECLIVIDADE_MINIMA_DA_CALHA_PCT, verificarCalhas } from './blueprintCalhas';
import { DECLIVIDADE_MINIMA_DO_HORIZONTAL_PCT, DN_MINIMO_DO_VERTICAL_MM, verificarCondutores } from './blueprintCondutoresPluviais';
import { HIPOTESES_PLUVIAIS_PADRAO, misturasPluvialEsgoto, type HipotesesPluviais } from './blueprintPluvial';
import type { BlueprintModel, DisciplinaDeRede, ObjectId } from './blueprintKernel';
import { conexoesDerivadas, conflitosDoModelo } from './blueprintKernel';
import { esgotoTrechoATrecho, trechosDeEsgotoSemDestino, verificarDnDoEsgoto } from './blueprintEsgotoAutomatico';
import { pontosDaLouca } from './blueprintPontosHidraulicos';
import { ROTULO_DA_DISCIPLINA } from './blueprintRede';
import type { PressoesDaRede } from './blueprintPressaoDaRede';
import { marcasDoLancamentoDeIncendio } from './blueprintConferenciaIncendio';
import { drenosTrechoATrecho } from './blueprintLinhaFrigorigena';

export type TipoDeMarca =
  | 'PONTA_ABERTA'
  | 'DN_MENOR'
  | 'DN_MAIOR'
  | 'LOUCA_SEM_PONTO'
  | 'PRESSAO_BAIXA'
  | 'PRESSAO_ALTA'
  // E5.2 — o fluxo do esgoto em QUALQUER trecho (o desenhado à mão também).
  | 'CONTRAFLUXO'
  | 'DECLIVIDADE_BAIXA'
  | 'DN_DIMINUI'
  | 'SEM_DESTINO'
  // E5.4 — ventilação.
  | 'SEM_VENTILACAO'
  | 'VENTILACAO_BAIXA'
  | 'DN_VENTILACAO'
  // E5.5 — a estrutura: tubo DENTRO de pilar (erro) e tubo que cruza viga (aviso: furo a aprovar).
  | 'ATRAVESSA_PILAR'
  | 'CRUZA_VIGA'
  // E6.2 — calhas: a que não leva a vazão da água e a que tem menos de 0,5 %.
  | 'CALHA_INSUFICIENTE'
  | 'CALHA_DECLIVIDADE'
  // E6.3 — condutores: o que não leva a vazão acumulada e o horizontal com menos de 0,5 %.
  | 'CONDUTOR_INSUFICIENTE'
  | 'CONDUTOR_DECLIVIDADE'
  // E6.4 — a pluvial encostando no esgoto (e vice-versa): redes independentes.
  | 'PLUVIAL_NO_ESGOTO'
  // Incêndio E0.4 — trecho que fecha um anel: o cálculo em árvore o deixa sem vazão.
  | 'ANEL_NAO_CALCULADO'
  // Incêndio E2.4 — o diagnóstico do lançamento (sempre) e o do cálculo (com a tarefa aberta).
  | 'INCENDIO_FORA_DA_REDE'
  /** A6 (plano pós-roadmap): peça de incêndio repetida no mesmo ponto. */
  | 'INCENDIO_DUPLICADA'
  | 'INCENDIO_SEM_BOMBA'
  | 'INCENDIO_DN_PECA'
  | 'INCENDIO_VELOCIDADE'
  | 'INCENDIO_PRESSAO_ALTA'
  | 'INCENDIO_NAO_ATENDE'
  // E3.3 — ambiente fora do alcance dos hidrantes (mangueira + jato pelo percurso).
  | 'INCENDIO_SEM_COBERTURA';

export interface MarcaDeVerificacao {
  chave: string;
  tipo: TipoDeMarca;
  levelId: ObjectId;
  at: { x: number; y: number };
  /** O que o desenho escreve junto da marca. */
  texto: string;
  /** ERRO = a rede está incompleta ou errada; AVISO = funciona, mas não é o recomendado. */
  severidade: 'ERRO' | 'AVISO';
  /** O elemento a selecionar ao clicar na linha da gaveta. */
  alvoId: ObjectId;
  disciplina?: DisciplinaDeRede;
}

/**
 * Todas as marcas do modelo (ou só as do pavimento), em ordem estável. As
 * PRESSÕES (E1.3) chegam calculadas por quem tem as hipóteses do usuário — a
 * marca não pode discordar da tabela da gaveta.
 */
export function marcasDeVerificacao(
  model: BlueprintModel,
  levelId: ObjectId | null = null,
  pressoes: readonly PressoesDaRede[] = [],
  /** E6.2: as premissas pluviais — a intensidade diz a vazão que a calha tem de levar. */
  pluvial: HipotesesPluviais = HIPOTESES_PLUVIAIS_PADRAO,
): MarcaDeVerificacao[] {
  const trechoPorId = new Map((model.trechos ?? []).map((t) => [t.id, t]));
  const marcas: MarcaDeVerificacao[] = [];

  for (const p of conexoesDerivadas(model).pontasAbertas) {
    const t = trechoPorId.get(p.trechoId);
    if (!t) continue;
    // E4.2: extravasor e limpeza da caixa d'água descarregam LIVRES — as duas pontas são de propósito.
    if (t.rotulo === ROTULO_DO_EXTRAVASOR || t.rotulo === ROTULO_DA_LIMPEZA) continue;
    // A saída da ventilação (a ponta de CIMA do trecho "Ventilação") é aberta de propósito.
    if (t.rotulo === 'Ventilação') {
      const pontaDeCima = t.cotaAMm >= t.cotaBMm ? t.a : t.b;
      if (pontaDeCima.x === p.no.x && pontaDeCima.y === p.no.y) continue;
    }
    // E6.2: a ponta ALTA da calha é a cabeceira — fechada de fábrica, não é tubo solto.
    if (t.secaoCalha) {
      const cabeceira = t.cotaAMm >= t.cotaBMm ? t.a : t.b;
      if (cabeceira.x === p.no.x && cabeceira.y === p.no.y) continue;
    }
    marcas.push({
      chave: `ponta|${t.id}|${p.no.x},${p.no.y}|${p.cotaMm}`,
      tipo: 'PONTA_ABERTA',
      levelId: t.levelId,
      at: { ...p.no },
      texto: 'ponta aberta',
      severidade: 'ERRO',
      alvoId: t.id,
      disciplina: t.disciplina,
    });
  }

  // E5.2: fluxo — contrafluxo, declividade abaixo da mínima, DN que diminui a jusante.
  const trechoPorIdE = new Map((model.trechos ?? []).map((t) => [t.id, t]));
  const aoLongo = (id: string, f: number) => {
    const t = trechoPorIdE.get(id)!;
    return { x: Math.round(t.a.x + (t.b.x - t.a.x) * f), y: Math.round(t.a.y + (t.b.y - t.a.y) * f) };
  };
  const um1 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  for (const c of esgotoTrechoATrecho(model)) {
    if (c.contrafluxo) {
      marcas.push({ chave: `fluxo|${c.trechoId}`, tipo: 'CONTRAFLUXO', levelId: c.levelId, at: aoLongo(c.trechoId, 0.3), texto: 'contrafluxo — sobe até a caixa', severidade: 'ERRO', alvoId: c.trechoId, disciplina: 'ESGOTO' });
    } else if (c.declividadePct != null && c.declividadePct + 1e-9 < c.declividadeMinimaPct) {
      marcas.push({ chave: `decl|${c.trechoId}`, tipo: 'DECLIVIDADE_BAIXA', levelId: c.levelId, at: aoLongo(c.trechoId, 0.3), texto: `i ${um1(c.declividadePct)} % < ${um1(c.declividadeMinimaPct)} %`, severidade: 'ERRO', alvoId: c.trechoId, disciplina: 'ESGOTO' });
    }
    if (c.dnMontanteMaxMm != null && c.dnAtualMm < c.dnMontanteMaxMm) {
      marcas.push({ chave: `diminui|${c.trechoId}`, tipo: 'DN_DIMINUI', levelId: c.levelId, at: aoLongo(c.trechoId, 0.7), texto: `DN ${c.dnAtualMm} depois de ${c.dnMontanteMaxMm}`, severidade: 'ERRO', alvoId: c.trechoId, disciplina: 'ESGOTO' });
    }
  }
  // Climatização E5.4 (05/10/2026): o dreno de condensado por gravidade abaixo da declividade mínima
  // (a rede com bomba de dreno é recalque e não entra).
  for (const d of drenosTrechoATrecho(model)) {
    if (d.declividadePct != null && d.declividadePct + 1e-9 < d.declividadeMinimaPct) {
      marcas.push({ chave: `decl|${d.trechoId}`, tipo: 'DECLIVIDADE_BAIXA', levelId: d.levelId, at: aoLongo(d.trechoId, 0.3), texto: `i ${um1(d.declividadePct)} % < ${um1(d.declividadeMinimaPct)} %`, severidade: 'ERRO', alvoId: d.trechoId, disciplina: 'DRENO_AC' });
    }
  }
  // E5.4: o desconector sem ventilação ao alcance, e a coluna baixa ou fina.
  const vent = verificarVentilacao(model);
  const m2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  for (const d of vent.desconectores.filter((x) => !x.ventilado)) {
    marcas.push({
      chave: `vent|${d.terminalId}`, tipo: 'SEM_VENTILACAO', levelId: d.levelId, at: d.at,
      texto: d.distanciaM == null ? `${d.sigla} sem ventilação` : `${d.sigla} a ${m2(d.distanciaM)} m da ventilação (máx. ${m2(d.maximaM)})`,
      severidade: 'ERRO', alvoId: d.terminalId, disciplina: 'ESGOTO',
    });
  }
  for (const c of vent.colunas) {
    const t = trechoPorIdE.get(c.trechoIds[0])!;
    if (!c.acimaDaCobertura) marcas.push({ chave: `ventbaixa|${c.x},${c.y}`, tipo: 'VENTILACAO_BAIXA', levelId: t.levelId, at: { x: c.x, y: c.y }, texto: 'ventilação abaixo da cobertura + 30 cm', severidade: 'ERRO', alvoId: t.id, disciplina: 'ESGOTO' });
    if (c.dnAtualMm < c.dnNecessarioMm) marcas.push({ chave: `ventdn|${c.x},${c.y}`, tipo: 'DN_VENTILACAO', levelId: t.levelId, at: { x: c.x + 1, y: c.y }, texto: `ventilação DN ${c.dnAtualMm} < ${c.dnNecessarioMm}`, severidade: 'ERRO', alvoId: t.id, disciplina: 'ESGOTO' });
  }
  for (const id of trechosDeEsgotoSemDestino(model)) {
    const t = trechoPorIdE.get(id)!;
    marcas.push({ chave: `destino|${id}`, tipo: 'SEM_DESTINO', levelId: t.levelId, at: aoLongo(id, 0.5), texto: 'não chega à caixa de inspeção', severidade: 'ERRO', alvoId: id, disciplina: 'ESGOTO' });
  }

  // E5.5: tubo hidrossanitário contra a estrutura (o raspão — eixo por fora — não conta).
  // Incêndio E2.4: a tubulação de incêndio contra viga e pilar também (o "tubulação × viga" do AltoQi).
  // Climatização E5.1 (05/10/2026): a linha frigorígena e o dreno também — "nenhum trecho atravessa pilar".
  // E10.2 (climatização): o DUTO também — o "duto × viga" só aparecia no relatório de conflitos, não no desenho.
  const hidraulicos = (model.trechos ?? []).filter((t) => t.disciplina === 'AGUA_FRIA' || t.disciplina === 'AGUA_QUENTE' || t.disciplina === 'ESGOTO' || t.disciplina === 'INCENDIO' || t.disciplina === 'FRIGORIGENA' || t.disciplina === 'DRENO_AC' || t.disciplina === 'MECANICA');
  const estruturaPorId = new Map((model.structures ?? []).map((x) => [x.id, x]));
  if (hidraulicos.length > 0 && estruturaPorId.size > 0) {
    for (const c of conflitosDoModelo({ ...model, trechos: hidraulicos })) {
      if (c.classe !== 'ESTRUTURA' || c.comprimentoDentroMm <= 0) continue;
      const e = estruturaPorId.get(c.outroId)!;
      const t = trechoPorIdE.get(c.trechoId)!;
      const cm = Math.max(1, Math.round(c.comprimentoDentroMm / 10));
      if (e.kind === 'PILAR') {
        marcas.push({ chave: `pilar|${t.id}|${e.id}`, tipo: 'ATRAVESSA_PILAR', levelId: t.levelId, at: aoLongo(t.id, 0.5), texto: `atravessa pilar (${cm} cm)`, severidade: 'ERRO', alvoId: t.id, disciplina: t.disciplina });
      } else if (e.kind === 'VIGA') {
        marcas.push({ chave: `viga|${t.id}|${e.id}`, tipo: 'CRUZA_VIGA', levelId: t.levelId, at: aoLongo(t.id, 0.5), texto: 'cruza viga — furo a aprovar', severidade: 'AVISO', alvoId: t.id, disciplina: t.disciplina });
      }
    }
  }

  // E6.2: as calhas — capacidade por Manning contra a vazão da água, e a declividade mínima.
  if ((model.trechos ?? []).some((t) => t.secaoCalha)) {
    const um0 = (v: number) => Math.round(v).toLocaleString('pt-BR');
    for (const c of verificarCalhas(model, pluvial)) {
      if (!c.declividadeOk) {
        marcas.push({ chave: `calhai|${c.trechoId}`, tipo: 'CALHA_DECLIVIDADE', levelId: c.levelId, at: aoLongo(c.trechoId, 0.3), texto: `calha a ${um1(c.declividadePct)} % < ${um1(DECLIVIDADE_MINIMA_DA_CALHA_PCT)} %`, severidade: 'ERRO', alvoId: c.trechoId, disciplina: 'PLUVIAL' });
      } else if (!c.atende) {
        marcas.push({ chave: `calhaq|${c.trechoId}`, tipo: 'CALHA_INSUFICIENTE', levelId: c.levelId, at: aoLongo(c.trechoId, 0.5), texto: `calha leva ${um0(c.capacidadeLMin)} < ${um0(c.vazaoLMin!)} L/min`, severidade: 'ERRO', alvoId: c.trechoId, disciplina: 'PLUVIAL' });
      }
    }
  }

  // E6.3: os condutores — a vazão acumulada por gravidade contra a capacidade, e a declividade.
  if ((model.trechos ?? []).some((t) => t.disciplina === 'PLUVIAL' && !t.secaoCalha)) {
    const um0 = (v: number) => Math.round(v).toLocaleString('pt-BR');
    for (const c of verificarCondutores(model, pluvial)) {
      if (!c.declividadeOk) {
        marcas.push({ chave: `condi|${c.trechoId}`, tipo: 'CONDUTOR_DECLIVIDADE', levelId: c.levelId, at: aoLongo(c.trechoId, 0.3), texto: `i ${um1(c.declividadePct!)} % < ${um1(DECLIVIDADE_MINIMA_DO_HORIZONTAL_PCT)} %`, severidade: 'ERRO', alvoId: c.trechoId, disciplina: 'PLUVIAL' });
      } else if (!c.atende) {
        const texto = c.vertical && c.dnMm < DN_MINIMO_DO_VERTICAL_MM ? `condutor vertical DN ${c.dnMm} < ${DN_MINIMO_DO_VERTICAL_MM}` : `condutor leva ${um0(c.capacidadeLMin)} < ${um0(c.vazaoLMin)} L/min`;
        marcas.push({ chave: `condq|${c.trechoId}`, tipo: 'CONDUTOR_INSUFICIENTE', levelId: c.levelId, at: aoLongo(c.trechoId, 0.5), texto, severidade: 'ERRO', alvoId: c.trechoId, disciplina: 'PLUVIAL' });
      }
    }
  }

  // Incêndio E2.4: o diagnóstico do lançamento — peça fora da rede, rede sem bomba, peça maior que o tubo.
  marcas.push(...marcasDoLancamentoDeIncendio(model));

  // E6.4: redes independentes — a pluvial não entra no esgoto, nem o esgoto na pluvial.
  for (const x of misturasPluvialEsgoto(model)) {
    const t = trechoPorIdE.get(x.trechoId)!;
    marcas.push({ chave: `mistura|${x.trechoId}|${x.at.x},${x.at.y}`, tipo: 'PLUVIAL_NO_ESGOTO', levelId: x.levelId, at: x.at, texto: t.disciplina === 'PLUVIAL' ? 'pluvial ligada ao esgoto' : 'esgoto ligado à pluvial', severidade: 'ERRO', alvoId: x.trechoId, disciplina: t.disciplina });
  }

  for (const v of verificarDnDoEsgoto(model)) {
    const menor = v.tipo === 'MENOR';
    marcas.push({
      chave: `dn|${v.trechoId}`,
      tipo: menor ? 'DN_MENOR' : 'DN_MAIOR',
      levelId: v.levelId,
      at: v.meio,
      texto: `DN ${v.dnAtualMm} ${menor ? '<' : '>'} ${v.dnNecessarioMm} (${v.uhc} UHC)`,
      severidade: menor ? 'ERRO' : 'AVISO',
      alvoId: v.trechoId,
      disciplina: 'ESGOTO',
    });
  }

  for (const c of model.componentes ?? []) {
    const faltam = pontosDaLouca(model, c);
    if (faltam.length === 0) continue;
    const redes = [...new Set(faltam.map((f) => ROTULO_DA_DISCIPLINA[f.disciplina].toLowerCase()))].join(', ');
    marcas.push({
      chave: `louca|${c.id}`,
      tipo: 'LOUCA_SEM_PONTO',
      levelId: c.levelId,
      at: { ...c.at },
      texto: `sem ponto (${redes})`,
      severidade: 'AVISO',
      alvoId: c.id,
    });
  }

  const um = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  for (const r of pressoes) {
    for (const p of r.pontos) {
      if (p.estado === 'INSUFICIENTE') {
        marcas.push({ chave: `pressao|${p.terminalId}`, tipo: 'PRESSAO_BAIXA', levelId: p.levelId, at: { ...p.at }, texto: `${um(p.disponivelKpa!)} < ${um(p.minimaKpa)} kPa`, severidade: 'ERRO', alvoId: p.terminalId, disciplina: r.disciplina });
      } else if (p.estado === 'EXCESSIVA') {
        marcas.push({ chave: `pressao|${p.terminalId}`, tipo: 'PRESSAO_ALTA', levelId: p.levelId, at: { ...p.at }, texto: `estática ${um(p.estaticaKpa!)} kPa`, severidade: 'AVISO', alvoId: p.terminalId, disciplina: r.disciplina });
      }
    }
    for (const id of r.trechosDoAnel ?? []) {
      const t = trechoPorId.get(id);
      if (!t) continue;
      marcas.push({ chave: `anel|${id}`, tipo: 'ANEL_NAO_CALCULADO', levelId: t.levelId, at: { x: (t.a.x + t.b.x) / 2, y: (t.a.y + t.b.y) / 2 }, texto: 'anel — fora do cálculo', severidade: 'AVISO', alvoId: id, disciplina: r.disciplina });
    }
  }

  return marcas.filter((m) => !levelId || m.levelId === levelId).sort((a, b) => a.chave.localeCompare(b.chave));
}

/** O resumo para a gaveta de uma disciplina: quantas pontas abertas e quais DN fora. */
export function resumoDaVerificacao(marcas: readonly MarcaDeVerificacao[], disciplinas: readonly DisciplinaDeRede[]): {
  pontasAbertas: number;
  dnFora: MarcaDeVerificacao[];
  /** E5.2/E5.4/E5.5/E6.2: contrafluxo, declividade baixa, DN que diminui, sem destino, a ventilação, a estrutura e as calhas. */
  fluxo: MarcaDeVerificacao[];
} {
  const daRede = marcas.filter((m) => m.disciplina && disciplinas.includes(m.disciplina));
  return {
    pontasAbertas: daRede.filter((m) => m.tipo === 'PONTA_ABERTA').length,
    dnFora: daRede.filter((m) => m.tipo === 'DN_MENOR' || m.tipo === 'DN_MAIOR'),
    fluxo: daRede.filter((m) => ['CONTRAFLUXO', 'DECLIVIDADE_BAIXA', 'DN_DIMINUI', 'SEM_DESTINO', 'SEM_VENTILACAO', 'VENTILACAO_BAIXA', 'DN_VENTILACAO', 'ATRAVESSA_PILAR', 'CRUZA_VIGA', 'CALHA_INSUFICIENTE', 'CALHA_DECLIVIDADE', 'CONDUTOR_INSUFICIENTE', 'CONDUTOR_DECLIVIDADE', 'PLUVIAL_NO_ESGOTO', 'ANEL_NAO_CALCULADO', 'INCENDIO_FORA_DA_REDE', 'INCENDIO_DUPLICADA', 'INCENDIO_SEM_BOMBA', 'INCENDIO_DN_PECA', 'INCENDIO_VELOCIDADE', 'INCENDIO_PRESSAO_ALTA', 'INCENDIO_NAO_ATENDE', 'INCENDIO_SEM_COBERTURA'].includes(m.tipo)),
  };
}
