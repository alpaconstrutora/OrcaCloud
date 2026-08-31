/**
 * Copiar e colar no editor de plantas — a parte que DECIDE, sem React.
 *
 * Pedido do usuário em 2026-08-29: "funcionalidade de copiar e colar objetos
 * (paredes, portas, janelas...)". Plano em
 * `docs/planos/2026-08-29-planta-copiar-colar-e-orto-terreno.md`.
 *
 * POR QUE ESTE ARQUIVO EXISTE, e não duas funções dentro do componente: o que
 * decide o que entra na cópia, onde fica a âncora e em que offset a porta cai é
 * REGRA, não interação — e regra escondida num `function` de 4.000 linhas de
 * componente só se testa arrastando o mouse num navegador de verdade. Aqui ela
 * é uma função pura: entra modelo + seleção + destino, sai um `Command` do
 * kernel. O componente fica com o que só ele pode fazer — saber onde está o
 * cursor e mostrar o recado.
 *
 * O QUE A ÁREA DE TRANSFERÊNCIA GUARDA são **ids**, não geometria. O comando
 * `DuplicateEntities` lê os originais do modelo, e é ele quem sabe que a porta
 * acompanha a parede que a hospeda. Guardar uma cópia da geometria criaria uma
 * segunda verdade sobre o que foi copiado, que envelheceria a cada edição feita
 * entre o Ctrl+C e o Ctrl+V. O preço é que o original pode sumir nesse
 * meio-tempo — e por isso `comandoDeColagem` filtra sobreviventes e AVISA, em
 * vez de deixar o kernel estourar um id que o usuário nunca viu.
 */
import type { BlueprintModel, Command, ObjectId, Point } from './blueprintKernel';

/** O que o Ctrl+C guardou. */
export interface AreaDeTransferencia {
  wallIds: ObjectId[];
  /**
   * Só as aberturas AVULSAS — as que estão numa parede de `wallIds` acompanham
   * a parede dentro de `DuplicateEntities`. Repetidas aqui, colariam duas
   * portas no mesmo vão e o kernel recusaria o gesto inteiro por sobreposição.
   */
  openingIds: ObjectId[];
  boundaryIds: ObjectId[];
  /** Estruturas copiadas. Andam pelo `delta`, como paredes e limites. */
  structuralIds: ObjectId[];
  /**
   * Canto (x mínimo, y mínimo) do que foi copiado.
   *
   * ÂNCORA NO CANTO, NÃO NO CENTRO. O delta da colagem é a diferença entre o
   * cursor (já encaixado na grade) e a âncora. Com o canto — que está na grade,
   * porque a geometria original está — o delta é múltiplo do passo e a cópia cai
   * na grade. Com o centro, uma soma ímpar dividida por dois deslocaria tudo
   * meio milímetro para fora dela, calado, e o desenho deixaria de encaixar no
   * que já existe.
   */
  ancora: Point;
}

/** Onde colar, medido pelo canvas: o ponto do cursor e o que existe embaixo. */
export interface DestinoDeColagem {
  /** Ponto do cursor, já encaixado na grade. */
  ponto: Point;
  /**
   * A parede sob o cursor, se houver. `distanciaNoEixoMm` é medida a partir da
   * ponta `a`, sem grampo — o grampo depende da largura da abertura, que só
   * quem colou conhece.
   */
  parede: { id: ObjectId; comprimentoMm: number; distanciaNoEixoMm: number } | null;
}

export type ResultadoDeCopia =
  | { ok: true; area: AreaDeTransferencia }
  | { ok: false; aviso: string };

export type ResultadoDeColagem =
  | { ok: true; comando: Command; aviso: string | null }
  | { ok: false; aviso: string };

/**
 * Monta a área de transferência a partir da seleção.
 *
 * `selectedIds` é heterogêneo (parede, abertura, limite e também MEDIÇÃO, que é
 * de outra camada e de outra gravação) — por isso cada família é reconhecida
 * consultando o modelo, e não por prefixo de id.
 */
export function copiarSelecao(model: BlueprintModel, selectedIds: string[]): ResultadoDeCopia {
  const wallIds = selectedIds.filter((id) => model.walls.some((w) => w.id === id));
  const copiadas = new Set(wallIds);
  const openingIds = selectedIds.filter((id) => {
    const o = model.openings.find((x) => x.id === id);
    return o ? !copiadas.has(o.wallId) : false;
  });
  const boundaryIds = selectedIds.filter((id) => model.boundaries.some((b) => b.id === id));
  const structuralIds = selectedIds.filter((id) => model.structures.some((s) => s.id === id));

  if (
    wallIds.length === 0 &&
    openingIds.length === 0 &&
    boundaryIds.length === 0 &&
    structuralIds.length === 0
  ) {
    // Seleção vazia, ou só medição: medição não entra no histórico do kernel.
    return { ok: false, aviso: 'Nada que se possa copiar está selecionado.' };
  }

  let minX = Infinity;
  let minY = Infinity;
  const marcar = (p: Point) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
  };
  for (const w of model.walls) {
    if (copiadas.has(w.id)) {
      marcar(w.a);
      marcar(w.b);
    }
  }
  const limites = new Set(boundaryIds);
  for (const b of model.boundaries) {
    if (limites.has(b.id)) {
      marcar(b.a);
      marcar(b.b);
    }
  }
  // A estrutura entra na âncora pelos VÉRTICES, e não pela seção: o canto do
  // que foi copiado tem de ser um ponto que existe na grade, e a seção de um
  // pilar é meia largura para cada lado do centro — meia largura ímpar poria a
  // âncora fora da grade e a colagem inteira andaria meio milímetro.
  const estruturas = new Set(structuralIds);
  for (const s of model.structures) {
    if (estruturas.has(s.id)) s.pontos.forEach(marcar);
  }

  // Só aberturas avulsas: elas não têm posição no plano — o destino delas é um
  // offset na parede apontada — então a âncora nunca é consultada.
  const ancora: Point = minX === Infinity ? { x: 0, y: 0 } : { x: minX, y: minY };
  return { ok: true, area: { wallIds, openingIds, boundaryIds, structuralIds, ancora } };
}

/**
 * Monta o comando de colagem para o destino apontado.
 *
 * Paredes e limites andam pelo `delta`; abertura avulsa NÃO — o lugar dela é um
 * offset ao longo do eixo da parede apontada, e um deslocamento no plano não diz
 * nada sobre isso. Por isso o destino traz as duas informações.
 */
export function comandoDeColagem(
  model: BlueprintModel,
  area: AreaDeTransferencia,
  destino: DestinoDeColagem,
  levelId: ObjectId,
): ResultadoDeColagem {
  const wallIds = area.wallIds.filter((id) => model.walls.some((w) => w.id === id));
  const boundaryIds = area.boundaryIds.filter((id) => model.boundaries.some((b) => b.id === id));
  // `?? []` porque uma área de transferência montada antes das estruturas
  // existirem não tem o campo — ela vive no estado da tela e sobrevive a um
  // recarregamento de código em desenvolvimento.
  const structuralIds = (area.structuralIds ?? []).filter((id) =>
    model.structures.some((s) => s.id === id),
  );
  const avulsas = area.openingIds
    .map((id) => model.openings.find((o) => o.id === id))
    .filter((o): o is NonNullable<typeof o> => Boolean(o));

  if (
    wallIds.length === 0 &&
    boundaryIds.length === 0 &&
    structuralIds.length === 0 &&
    avulsas.length === 0
  ) {
    return { ok: false, aviso: 'O que estava copiado não existe mais no desenho.' };
  }

  const delta: Point = {
    x: destino.ponto.x - area.ancora.x,
    y: destino.ponto.y - area.ancora.y,
  };

  let aviso: string | null = null;
  const openings: { openingId: ObjectId; wallId: ObjectId; offsetMm: number }[] = [];

  if (avulsas.length > 0) {
    const parede = destino.parede;
    if (!parede) {
      // Colar tudo o que dá e DIZER o que ficou de fora. Recusar o gesto inteiro
      // por causa da porta faria perder também as paredes copiadas junto com ela.
      aviso =
        avulsas.length === 1
          ? 'Aponte o cursor sobre uma parede para colar a abertura.'
          : 'Aponte o cursor sobre uma parede para colar as aberturas.';
      if (wallIds.length === 0 && boundaryIds.length === 0 && structuralIds.length === 0) {
        return { ok: false, aviso };
      }
    } else {
      // A abertura MAIS À ESQUERDA fica centrada no cursor; as demais mantêm a
      // distância que tinham dela. Empilhar todas no mesmo offset as poria uma
      // sobre a outra, e o kernel recusaria o lote inteiro por sobreposição.
      const primeira = avulsas.reduce((a, b) => (a.offsetMm <= b.offsetMm ? a : b));
      const centro = Math.round(parede.distanciaNoEixoMm - primeira.widthMm / 2);
      for (const o of avulsas) {
        const bruto = centro + (o.offsetMm - primeira.offsetMm);
        openings.push({
          openingId: o.id,
          wallId: parede.id,
          // Grampeado na parede: recusar depois do gesto seria pior do que não
          // deixar errar. É a mesma disciplina do `offsetNaParede` do canvas.
          offsetMm: Math.round(Math.max(0, Math.min(parede.comprimentoMm - o.widthMm, bruto))),
        });
      }
    }
  }

  return {
    ok: true,
    comando: {
      type: 'DuplicateEntities',
      levelId,
      wallIds,
      boundaryIds,
      structuralIds,
      openings,
      delta,
    },
    aviso,
  };
}
