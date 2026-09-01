import { cantosDaParede, extensaoDeCanto, type Point, type Wall } from './blueprintKernel';

/**
 * CONEXÃO AUTOMÁTICA — o ponto que anda gruda no ponto que está parado.
 *
 * ─── O PEDIDO ───────────────────────────────────────────────────────────────
 *
 * Usuário, 31/08/2026: *"vamos implementar snap. quando um circulo se aproximar
 * de outro, Fazer conexão automatica"*. Os "círculos" são os pontos de conexão
 * que a peça de concreto desenha quando está selecionada
 * (`pontosDeConexaoEstrutural`): as pontas do eixo e os cantos do corpo.
 *
 * ─── POR QUE ISSO NÃO É O ÍMÃ QUE JÁ EXISTIA ────────────────────────────────
 *
 * O `capturar` do canvas encaixa o CURSOR: ele responde "que ponto eu estou
 * apontando?". Serve para desenhar, onde o que nasce nasce debaixo do ponteiro.
 *
 * Arrastando uma peça pronta, a pergunta é outra — "que ponto DELA está perto
 * de que ponto de outra?" —, e o cursor não tem nada a ver com a resposta:
 * quem agarra uma viga pelo meio para encostá-la num pilar está com o ponteiro
 * a um metro de qualquer canto. Encaixar o cursor ali não aproximaria as duas
 * peças de nada. Por isso a conta é entre CONJUNTOS de pontos, e o que sai dela
 * é uma correção do DESLOCAMENTO.
 *
 * ─── POR QUE SÓ SERVE PARA TRANSLAÇÃO ───────────────────────────────────────
 *
 * A correção é um vetor somado ao delta do arraste, e isso só faz dois pontos
 * coincidirem porque a peça inteira anda RÍGIDA: os cantos guardam a mesma
 * relação com o eixo antes e depois. Arrastar UM vértice é outro problema —
 * mover a ponta de uma viga gira a seção, e os cantos daquele lado se deslocam
 * de um jeito que não é a translação do vértice. Encostar um canto num ponto
 * ali seria resolver equação não linear, e um "quase coincidente" não serve
 * para nada: o valor inteiro da conexão é a coincidência EXATA.
 */

/**
 * Os pontos de conexão de uma PAREDE — as duas pontas do eixo e os quatro
 * cantos do corpo.
 *
 * ─── POR QUE A PAREDE ENTROU (01/09/2026) ───────────────────────────────────
 *
 * A primeira versão da conexão automática só olhava concreto com concreto. O
 * usuário testou encostando pilar nas paredes de um estudo real e relatou que
 * *"funcionou apenas no canto inferior direito"*. O rascunho do estudo explicou
 * o "apenas": dos sete elementos, os dois pares que estavam a **0,0 mm** um do
 * outro eram peça com peça (laje↔pilar e viga↔pilar); todos os encostos em
 * PAREDE estavam a 43–75 mm — perto o bastante para parecerem grudados na tela,
 * longe o bastante para não estarem. A parede não tinha ponto de conexão
 * nenhum, então não havia o que grudar.
 *
 * Gruda no MESMO canto que o desenho mostra: `cantosDaParede` com a extensão de
 * mitra (`extensaoDeCanto`), a mesma dupla que o `capturar` e o traçado já
 * usam. Um canto calculado sem a mitra ficaria dentro do concreto na junção, e
 * o ímã puxaria para um ponto que não está na tela.
 */
export function pontosDeConexaoDaParede(
  paredes: Wall[],
  w: Wall,
): { eixo: Point[]; cantos: Point[] } {
  return {
    eixo: [{ ...w.a }, { ...w.b }],
    cantos: cantosDaParede(
      w.a,
      w.b,
      w.thicknessMm,
      extensaoDeCanto(paredes, w, 'a'),
      extensaoDeCanto(paredes, w, 'b'),
    ),
  };
}

export interface ConexaoEncaixada {
  /** Onde os dois pontos se encontram, já no destino. */
  em: Point;
  /** O ponto parado que atraiu — o mesmo `em`, pela definição de coincidir. */
  alvo: Point;
  /** Quanto somar ao deslocamento para eles coincidirem. */
  correcao: Point;
  /** A que distância os dois estavam ANTES da correção, em mm. */
  distanciaMm: number;
}

/**
 * O melhor encontro entre os pontos que andam e os que ficam.
 *
 * `null` = nenhum par dentro da tolerância; o deslocamento segue como estava.
 *
 * ─── O MAIS PRÓXIMO GANHA, E SÓ ELE ─────────────────────────────────────────
 *
 * Um par só. Duas correções não se somam — a segunda desfaria a primeira —, e
 * escolher "o par que alinha mais pontos de uma vez" premiaria a peça grande:
 * uma laje encostaria por quatro cantos ao mesmo tempo e ganharia de um pilar
 * que estava a 2 mm do lugar certo. A distância é o critério porque é o que o
 * usuário está enxergando na tela.
 *
 * ─── A TOLERÂNCIA VEM EM MILÍMETRO, MAS NASCE EM PIXEL ──────────────────────
 *
 * Quem chama converte: `SNAP_PX / escala`. É o mesmo raio do ímã do cursor, e é
 * em pixel porque "perto" é o que o olho vê — a 1:200 dois pontos a 20 cm são o
 * mesmo ponto na tela, e a 1:20 não são.
 */
export function encaixarConexao(
  pontosQueAndam: Point[],
  delta: Point,
  pontosParados: Point[],
  toleranciaMm: number,
): ConexaoEncaixada | null {
  if (pontosQueAndam.length === 0 || pontosParados.length === 0) return null;

  // ─── CAIXA PRIMEIRO, DISTÂNCIA DEPOIS ──────────────────────────────────────
  //
  // Com a parede na conta, `pontosParados` deixou de ser uma dúzia de pontos e
  // passou a ser seis por parede do pavimento — numa planta grande, milhares. E
  // isto roda a CADA movimento do ponteiro, dentro do arraste, que é o gesto em
  // que engasgo se nota mais. Uma caixa em volta do conjunto que anda, folgada
  // pela tolerância, descarta quase tudo com duas comparações por ponto, e o
  // par que ganharia jamais está fora dela: quem está a mais de `tolerancia` de
  // TODO o conjunto está a mais de `tolerancia` de cada ponto dele.
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pontosQueAndam) {
    const x = p.x + delta.x;
    const y = p.y + delta.y;
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  x0 -= toleranciaMm;
  y0 -= toleranciaMm;
  x1 += toleranciaMm;
  y1 += toleranciaMm;

  const candidatos = pontosParados.filter(
    (q) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1,
  );
  if (candidatos.length === 0) return null;

  let melhor: ConexaoEncaixada | null = null;

  for (const p of pontosQueAndam) {
    const x = p.x + delta.x;
    const y = p.y + delta.y;
    for (const q of candidatos) {
      // ─── A CONEXÃO QUE JÁ EXISTIA NÃO CONTA ────────────────────────────────
      //
      // Se os dois pontos JÁ estavam no mesmo lugar antes do arraste, "conectar"
      // é puxar a peça de volta para onde ela estava. E isso não é teoria: uma
      // parede de um contorno fechado divide as duas pontas e os cantos mitrados
      // com as vizinhas, então metade dos pontos dela nasce coincidente. Sem
      // este corte, empurrar uma parede um passo da grade (100 mm, dentro dos
      // ~240 mm de tolerância) seria desfeito na hora, e o arraste pareceria
      // travado — só voltaria a andar depois de passar da tolerância, num salto.
      //
      // O preço é não poder re-encaixar no ponto de origem arrastando de volta.
      // É barato: para voltar existe o desfazer, e o gesto de arrastar de volta
      // ao ponto exato não é o que ninguém faz.
      if (p.x === q.x && p.y === q.y) continue;

      const dx = q.x - x;
      const dy = q.y - y;
      const d = Math.hypot(dx, dy);
      if (d > toleranciaMm) continue;
      if (melhor && d >= melhor.distanciaMm) continue;
      melhor = {
        em: { x: q.x, y: q.y },
        alvo: { x: q.x, y: q.y },
        // Arredondado: o kernel só aceita coordenada em milímetro INTEIRO, e um
        // delta fracionário deixaria a coincidência a 0,4 mm de distância —
        // invisível na tela e o bastante para o ponto não ser o mesmo ponto.
        correcao: { x: Math.round(dx), y: Math.round(dy) },
        distanciaMm: d,
      };
    }
  }

  return melhor;
}
