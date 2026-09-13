/**
 * LANÇAMENTO AUTOMÁTICO DE ELETRODUTOS (13/09/2026).
 *
 * Pedido: *"implementar lançamento automático de eletroduto"*. O mesmo molde
 * da distribuição de tomadas: o sistema PROPÕE um caminho, marcado como
 * `sugerido`; mover ou aceitar confirma; Ctrl+Z desfaz o lote inteiro. Somar é
 * registro, decidir é projeto — e por isso toda hipótese aqui é nomeada.
 *
 * ─── O MODELO DE REDE QUE SE PROPÕE ─────────────────────────────────────────
 *
 * É o arranjo mais comum da instalação residencial embutida, e o único que se
 * pode afirmar sem saber onde estão vigas e lajes:
 *
 *   1. cada ponto sobe (ou desce) por uma PRUMADA na própria posição, da cota
 *      do ponto até a cota da rede — o teto do pavimento (`defaultHeightMm`);
 *      o ponto de luz de teto já está lá e não ganha prumada;
 *   2. o quadro também ganha a sua prumada até o teto, se ainda não tem;
 *   3. no teto, os pontos do circuito se ligam numa ÁRVORE a partir do quadro,
 *      pelo menor comprimento (Prim): cada ponto pendente se liga ao nó já
 *      alcançado mais próximo, em linha reta.
 *
 * O que já existe é respeitado: ponta de eletroduto DO MESMO CIRCUITO que
 * chega ao teto é nó já alcançado, e ponto que já tem eletroduto na sua
 * posição está ligado — rodar de novo não duplica nada (idempotente).
 *
 * ─── O QUE FICA DECLARADO, E NÃO DECIDIDO ───────────────────────────────────
 *
 * Bitola (25 mm por padrão), cota da rede (o pé-direito), condutores por
 * ligação (FN e FF: fase, neutro/fase e terra = 3; FFF: três fases e terra =
 * 4). O projetista muda no trecho, no painel, como sempre. E a árvore de menor
 * comprimento não é "o melhor projeto": é uma proposta explicável, que a
 * queda de tensão do pré-dimensionamento lê em seguida (`comprimentoDoCircuito`
 * passa a ter origem ELETRODUTOS em vez de ESTIMADO).
 *
 * Ponto SEM circuito não entra: eletroduto carrega circuito, e atribuir um
 * seria decidir por quem projeta. Ele é listado como pendência.
 */
import type { BlueprintModel, Circuito, Command, LigacaoDoCircuito, Terminal, Trecho } from './blueprintKernel';

export interface HipotesesDeEletroduto {
  /** Diâmetro nominal do eletroduto lançado, em mm. */
  bitolaMm: number;
  /** Quantos condutores o trecho de cada ligação carrega. */
  condutoresPorLigacao: Record<LigacaoDoCircuito, number>;
}

export const HIPOTESES_ELETRODUTO_PADRAO: HipotesesDeEletroduto = {
  bitolaMm: 25,
  condutoresPorLigacao: { FN: 3, FF: 3, FFF: 4 },
};

/** Bitolas comerciais de eletroduto oferecidas na hipótese. */
export const BITOLAS_DE_ELETRODUTO_MM = [20, 25, 32, 40] as const;

export interface PlanoDeEletrodutos {
  circuitoId: string;
  /** Pontos do circuito neste pavimento. */
  pontos: number;
  /** Quantos já têm eletroduto chegando na sua posição. */
  ligados: number;
  /** Quantos o plano liga. */
  aLigar: number;
  /** Os comandos que criam os trechos sugeridos — vazio quando não há o que ligar. */
  comandos: Command[];
  /** Metros de eletroduto que o plano acrescenta (prumadas + teto). */
  metrosPrevistos: number;
  /** Por que não há plano, quando não há: sem quadro, sem ponto, tudo ligado. */
  motivo: string | null;
}

const chave = (x: number, y: number) => `${x},${y}`;

/** Os pontos elétricos do pavimento que ainda não pertencem a circuito nenhum. */
export function pontosSemCircuito(model: BlueprintModel, levelId: string): Terminal[] {
  return (model.terminais ?? []).filter(
    (t) => t.levelId === levelId && t.disciplina === 'ELETRICA' && t.circuitoId == null,
  );
}

/**
 * O plano de UM circuito num pavimento. Puro: não grava nada — devolve os
 * comandos para quem chama aplicar num lote só.
 */
export function planejarEletrodutos(
  model: BlueprintModel,
  circuito: Circuito,
  levelId: string,
  hip: HipotesesDeEletroduto = HIPOTESES_ELETRODUTO_PADRAO,
): PlanoDeEletrodutos {
  const vazio = (motivo: string | null, pontos = 0, ligados = 0): PlanoDeEletrodutos => ({
    circuitoId: circuito.id,
    pontos,
    ligados,
    aLigar: 0,
    comandos: [],
    metrosPrevistos: 0,
    motivo,
  });
  const nivel = model.levels.find((l) => l.id === levelId);
  if (!nivel) return vazio('pavimento não encontrado');
  const quadro = (model.quadros ?? []).find((q) => q.id === circuito.quadroId);
  if (!quadro) return vazio('o circuito não tem quadro');
  if (quadro.levelId !== levelId) return vazio('o quadro está em outro pavimento');

  const teto = nivel.defaultHeightMm;
  const pontos = (model.terminais ?? []).filter(
    (t) => t.levelId === levelId && t.disciplina === 'ELETRICA' && t.circuitoId === circuito.id,
  );
  if (pontos.length === 0) return vazio('nenhum ponto neste circuito');

  const trechosDoCircuito = (model.trechos ?? []).filter(
    (t) => t.levelId === levelId && t.disciplina === 'ELETRICA' && t.circuitoId === circuito.id,
  );
  // Onde já chega eletroduto deste circuito, em planta (qualquer cota) e no teto.
  const pontasEmPlanta = new Set<string>();
  const nosNoTeto = new Map<string, { x: number; y: number }>();
  const registrar = (x: number, y: number, cota: number) => {
    pontasEmPlanta.add(chave(x, y));
    if (cota === teto) nosNoTeto.set(chave(x, y), { x, y });
  };
  for (const t of trechosDoCircuito) {
    registrar(t.a.x, t.a.y, t.cotaAMm);
    registrar(t.b.x, t.b.y, t.cotaBMm);
  }

  const ligados = pontos.filter((p) => pontasEmPlanta.has(chave(p.at.x, p.at.y)));
  const pendentes = pontos.filter((p) => !pontasEmPlanta.has(chave(p.at.x, p.at.y)));
  if (pendentes.length === 0) return vazio('todos os pontos já têm eletroduto', pontos.length, ligados.length);

  const ligacao: LigacaoDoCircuito = circuito.ligacao ?? 'FN';
  const condutores = hip.condutoresPorLigacao[ligacao];
  const comandos: Command[] = [];
  let mm = 0;
  const prumada = (x: number, y: number, de: number, ate: number) => {
    if (de === ate) return;
    comandos.push({
      type: 'AddTrecho',
      levelId,
      disciplina: 'ELETRICA',
      a: { x, y },
      b: { x, y },
      cotaAMm: de,
      cotaBMm: ate,
      bitolaMm: hip.bitolaMm,
      circuitoId: circuito.id,
      condutores,
      sugerido: true,
    });
    mm += Math.abs(ate - de);
  };
  const horizontal = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    if (a.x === b.x && a.y === b.y) return;
    comandos.push({
      type: 'AddTrecho',
      levelId,
      disciplina: 'ELETRICA',
      a: { x: a.x, y: a.y },
      b: { x: b.x, y: b.y },
      cotaAMm: teto,
      cotaBMm: teto,
      bitolaMm: hip.bitolaMm,
      circuitoId: circuito.id,
      condutores,
      sugerido: true,
    });
    mm += Math.hypot(b.x - a.x, b.y - a.y);
  };

  // 2. O quadro sobe ao teto, se ainda não há nó dele lá.
  const noDoQuadro = chave(quadro.at.x, quadro.at.y);
  if (!nosNoTeto.has(noDoQuadro)) {
    prumada(quadro.at.x, quadro.at.y, quadro.cotaMm, teto);
    nosNoTeto.set(noDoQuadro, { x: quadro.at.x, y: quadro.at.y });
  }

  // 1. Cada ponto pendente sobe (ou desce) ao teto na própria posição.
  const pendentesNoTeto = new Map<string, { x: number; y: number }>();
  for (const p of pendentes) {
    prumada(p.at.x, p.at.y, p.cotaMm, teto);
    const k = chave(p.at.x, p.at.y);
    // Ponto exatamente sob um nó já alcançado (o quadro, uma ponta existente):
    // a prumada basta.
    if (!nosNoTeto.has(k)) pendentesNoTeto.set(k, { x: p.at.x, y: p.at.y });
  }

  // 3. Prim a partir do que já está alcançado, com desempate determinístico
  //    (distância, depois x, depois y) — o mesmo desenho dá sempre o mesmo plano.
  const alcancados = [...nosNoTeto.values()];
  const restantes = [...pendentesNoTeto.values()].sort((p, q) => p.x - q.x || p.y - q.y);
  while (restantes.length > 0) {
    let melhor: { i: number; de: { x: number; y: number }; d: number } | null = null;
    for (let i = 0; i < restantes.length; i++) {
      for (const de of alcancados) {
        const d = Math.hypot(restantes[i].x - de.x, restantes[i].y - de.y);
        if (!melhor || d < melhor.d) melhor = { i, de, d };
      }
    }
    if (!melhor) break;
    const [para] = restantes.splice(melhor.i, 1);
    horizontal(melhor.de, para);
    alcancados.push(para);
  }

  return {
    circuitoId: circuito.id,
    pontos: pontos.length,
    ligados: ligados.length,
    aLigar: pendentes.length,
    comandos,
    metrosPrevistos: Math.round(mm / 100) / 10,
    motivo: null,
  };
}

/** Os planos de todos os circuitos do pavimento, na ordem do modelo. */
export function planejarEletrodutosDoNivel(
  model: BlueprintModel,
  levelId: string,
  hip: HipotesesDeEletroduto = HIPOTESES_ELETRODUTO_PADRAO,
): PlanoDeEletrodutos[] {
  return (model.circuitos ?? []).map((c) => planejarEletrodutos(model, c, levelId, hip));
}

/** Os trechos sugeridos ainda não confirmados no pavimento. */
export function eletrodutosSugeridos(model: BlueprintModel, levelId: string | null): Trecho[] {
  return (model.trechos ?? []).filter((t) => t.sugerido && (!levelId || t.levelId === levelId));
}
