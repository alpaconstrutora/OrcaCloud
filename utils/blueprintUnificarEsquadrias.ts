// utils/blueprintUnificarEsquadrias.ts
//
// UNIFICAR TIPOS DE ESQUADRIA PRÓXIMOS (P2.50, 24/09/2026).
//
// ─── DE ONDE VEM A FRAGMENTAÇÃO ─────────────────────────────────────────────
//
// Medido na planta real depois da P2.49: **90 esquadrias em 41 tipos**. Não é
// projeto com 41 caixilhos diferentes — é o DXF: a mesma porta desenhada em
// momentos diferentes sai 800, 802 e 815 mm, e cada milímetro vira um tipo
// próprio no quadro (a medida entra na assinatura). O quadro incha, o orçamento
// pede 41 cotações e a compra vira 41 itens de um caixilho só.
//
// ⚠️ ISTO MUDA A GEOMETRIA, e é a única fase do módulo que faz isso em lote.
// Unificar 802 → 800 mm reescreve a abertura no desenho. Por isso: prévia
// obrigatória antes de aplicar, tolerância explícita (o usuário escolhe quantos
// centímetros aceita ceder) e **nada é proposto sem caber** — ver abaixo.
//
// ─── O QUE NÃO CABE FICA FORA DA PROPOSTA ───────────────────────────────────
//
// `SetOpeningSize` recusa quando `offset + largura` passa do comprimento da
// parede, ou quando `peitoril + altura` passa do pé-direito. Um lote com uma
// dessas dentro seria recusado INTEIRO pelo kernel, e o usuário veria só uma
// mensagem sobre uma abertura que ele não sabe qual é. Então a conta de "cabe?"
// é feita aqui, peça a peça, ANTES: o que não cabe sai do lote e é contado à
// parte, para a tela poder dizer quantas ficaram de fora e por quê.
//
// ─── O ALVO É O MAIS NUMEROSO ───────────────────────────────────────────────
//
// Entre 800 mm (12 peças) e 802 mm (2 peças), o padrão de fato é 800: é o que o
// projeto quis. Empate resolve pela medida REDONDA (múltiplo de 50 mm), que é a
// que existe no catálogo do fabricante; persistindo o empate, a maior — ceder
// para cima nunca deixa a porta menor do que foi desenhada.

import { assinaturaDaEsquadria, wallLength, type BlueprintModel, type Command, type Esquadria, type ObjectId, type Opening } from './blueprintKernel';

/** Quanto se aceita ceder, em milímetro. 20 mm = 2 cm, o pedido do usuário. */
export const TOLERANCIA_PADRAO_MM = 20;

export interface AberturaDoGrupo {
  openingId: ObjectId;
  /** Maior largura que cabe nesta parede, deste offset em diante. */
  maxLarguraMm: number;
  /** Maior altura que cabe, com o peitoril desta abertura. */
  maxAlturaMm: number;
}

export interface GrupoDeEsquadria {
  assinatura: string;
  kind: Exclude<Opening['kind'], 'passage'>;
  larguraMm: number;
  alturaMm: number;
  esquadria: Esquadria | null;
  aberturas: AberturaDoGrupo[];
}

export interface Unificacao {
  /** O tipo que fica — o mais numeroso do agrupamento. */
  alvo: GrupoDeEsquadria;
  /** Os tipos que passam a ser o alvo. */
  absorvidos: GrupoDeEsquadria[];
  /** Quantas peças mudam de medida. */
  pecas: number;
  /** As que NÃO cabem com a medida do alvo e ficam como estão. */
  naoCabem: { openingId: ObjectId; motivo: string }[];
}

/** Medida "de catálogo": múltiplo de 5 cm. Desempata o alvo. */
function ehRedonda(mm: number): boolean {
  return mm % 50 === 0;
}

/** Os grupos do pavimento, por assinatura — o mesmo critério do quadro. */
export function gruposDoNivel(model: BlueprintModel, levelId: ObjectId): GrupoDeEsquadria[] {
  const paredes = new Map(model.walls.filter((w) => w.levelId === levelId).map((w) => [w.id, w]));
  const porAssinatura = new Map<string, GrupoDeEsquadria>();
  for (const o of model.openings) {
    if (o.kind === 'passage') continue;
    const w = paredes.get(o.wallId);
    if (!w) continue;
    const assinatura = assinaturaDaEsquadria(o);
    const abertura: AberturaDoGrupo = {
      openingId: o.id,
      maxLarguraMm: wallLength(w) - o.offsetMm,
      maxAlturaMm: w.heightMm - o.sillMm,
    };
    const atual = porAssinatura.get(assinatura);
    if (atual) atual.aberturas.push(abertura);
    else
      porAssinatura.set(assinatura, {
        assinatura,
        kind: o.kind,
        larguraMm: o.widthMm,
        alturaMm: o.heightMm,
        esquadria: o.esquadria ?? null,
        aberturas: [abertura],
      });
  }
  return [...porAssinatura.values()];
}

/**
 * Quais tipos podem virar um só, dentro da tolerância.
 *
 * Agrupa por `kind` e junta o que está a ≤ `toleranciaMm` em LARGURA **e** em
 * ALTURA. Não é transitivo de propósito: com tolerância de 2 cm, 800 e 802
 * juntam, 802 e 804 juntam, mas 800 e 804 não — e uma cadeia transitiva
 * arrastaria 800 até 840 em vinte passos de 2 mm, que é o oposto do que a
 * tolerância promete. Cada peça absorvida está a no máximo `toleranciaMm` do
 * ALVO, sempre.
 */
export function unificacoesPropostas(
  model: BlueprintModel,
  levelId: ObjectId,
  toleranciaMm = TOLERANCIA_PADRAO_MM,
): Unificacao[] {
  if (toleranciaMm <= 0) return [];
  const pendentes = gruposDoNivel(model, levelId);
  const saida: Unificacao[] = [];

  // Semente sempre pelo mais numeroso: o padrão de fato do projeto.
  const porTamanho = [...pendentes].sort(
    (a, b) =>
      b.aberturas.length - a.aberturas.length ||
      Number(ehRedonda(b.larguraMm)) - Number(ehRedonda(a.larguraMm)) ||
      b.larguraMm - a.larguraMm,
  );
  const usados = new Set<string>();

  for (const alvo of porTamanho) {
    if (usados.has(alvo.assinatura)) continue;
    const absorvidos = porTamanho.filter(
      (g) =>
        !usados.has(g.assinatura) &&
        g.assinatura !== alvo.assinatura &&
        g.kind === alvo.kind &&
        Math.abs(g.larguraMm - alvo.larguraMm) <= toleranciaMm &&
        Math.abs(g.alturaMm - alvo.alturaMm) <= toleranciaMm,
    );
    if (absorvidos.length === 0) continue;

    usados.add(alvo.assinatura);
    const naoCabem: Unificacao['naoCabem'] = [];
    const cabem: GrupoDeEsquadria[] = [];
    for (const g of absorvidos) {
      usados.add(g.assinatura);
      const dentro = g.aberturas.filter((a) => {
        if (alvo.larguraMm > a.maxLarguraMm) {
          naoCabem.push({
            openingId: a.openingId,
            motivo: `largura ${alvo.larguraMm} mm não cabe: sobram ${a.maxLarguraMm} mm de parede`,
          });
          return false;
        }
        if (alvo.alturaMm > a.maxAlturaMm) {
          naoCabem.push({
            openingId: a.openingId,
            motivo: `altura ${alvo.alturaMm} mm não cabe: sobram ${a.maxAlturaMm} mm até o teto`,
          });
          return false;
        }
        return true;
      });
      if (dentro.length > 0) cabem.push({ ...g, aberturas: dentro });
    }
    if (cabem.length === 0) continue;
    saida.push({
      alvo,
      absorvidos: cabem,
      pecas: cabem.reduce((s, g) => s + g.aberturas.length, 0),
      naoCabem,
    });
  }
  return saida;
}

/**
 * O lote: medida do alvo em cada peça absorvida, e o tipo do alvo junto.
 *
 * ⚠️ A ESQUADRIA VAI JUNTO quando o alvo tem uma. Trocar só a medida deixaria
 * duas peças 80×210 com nomes diferentes — a fragmentação de volta, agora
 * invisível, porque as medidas passariam a bater e só o nome separaria.
 */
export function comandosDaUnificacao(unificacoes: readonly Unificacao[]): Command[] {
  const cmds: Command[] = [];
  for (const u of unificacoes) {
    for (const g of u.absorvidos) {
      for (const a of g.aberturas) {
        cmds.push({
          type: 'SetOpeningSize',
          openingId: a.openingId,
          widthMm: u.alvo.larguraMm,
          heightMm: u.alvo.alturaMm,
        });
        if (u.alvo.esquadria) {
          cmds.push({ type: 'SetOpeningEsquadria', openingId: a.openingId, esquadria: { ...u.alvo.esquadria } });
        }
      }
    }
  }
  return cmds;
}
