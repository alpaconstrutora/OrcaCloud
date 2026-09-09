/**
 * As instalações na TELA — tudo o que dá para decidir sem DOM.
 *
 * ─── POR QUE ESTE ARQUIVO EXISTE ────────────────────────────────────────────
 *
 * `Blueprint3DViewer.tsx` está sob `@ts-nocheck` (o `@react-three/fiber` não
 * tipa bem em JSX), e um erro de sinal ali não é acusado por nada: o cano
 * aparece, só que atravessado. Por isso a geometria do trecho no 3D — centro,
 * eixo, comprimento — sai daqui, onde o compilador olha e o teste alcança. Foi
 * a mesma decisão que o telhado e a escada tomaram.
 *
 * ⚠️ A CONVENÇÃO DO 3D, medida em `Blueprint3DViewer.tsx:280`, é
 * `(x, cota, y)`: X e Z são a planta, Y é a altura, e a escala é `0,001`
 * (milímetro → metro). O canvas 2D espelha o Y; o 3D **não**. Trocar os dois
 * põe a instalação inteira no lugar errado sem erro nenhum.
 */
import type { BlueprintModel, DisciplinaDeRede, Point, Terminal, Trecho } from './blueprintKernel';

/** Milímetro → metro, a mesma constante que o visualizador 3D usa. */
export const ESCALA_3D = 0.001;

/**
 * A cota em que cada disciplina COMEÇA a ser desenhada, em mm do piso.
 *
 * ⚠️ São pontos de partida do gesto, e NÃO afirmação de norma. Quem desenha
 * ajusta no painel; o valor existe para o primeiro clique não pedir um número
 * antes de deixar desenhar. Errar aqui é irritante, não é grave — o que seria
 * grave é o campo nascer vazio e o trecho ir para o banco com cota zero sem
 * ninguém decidir.
 *
 * O esgoto nasce NEGATIVO porque é onde ele corre: embutido no contrapiso,
 * abaixo do piso acabado.
 */
export const COTA_PADRAO_MM: Record<DisciplinaDeRede, number> = {
  ELETRICA: 2500,
  AGUA_FRIA: 2200,
  AGUA_QUENTE: 2200,
  ESGOTO: -150,
};

/**
 * A bitola com que cada disciplina começa, em mm.
 *
 * Mesma natureza da cota: valor usual de partida, não norma. Eletroduto de
 * 25 mm é o 3/4"; esgoto de 100 mm é a coluna.
 */
export const BITOLA_PADRAO_MM: Record<DisciplinaDeRede, number> = {
  ELETRICA: 25,
  AGUA_FRIA: 25,
  AGUA_QUENTE: 22,
  ESGOTO: 100,
};

/**
 * A cota em que cada TERMINAL nasce, em mm do piso.
 *
 * ⚠️ É outra tabela, e não a mesma da rede, porque terminal e trecho ficam em
 * alturas diferentes por natureza: a tomada está a 300 mm do piso e o eletroduto
 * que a alimenta corre no forro, a 2.500. Uma tabela só faria a tomada nascer no
 * teto — e o desenho fecharia igual.
 *
 * Também são pontos de partida, não norma.
 */
export const COTA_TERMINAL_PADRAO_MM: Record<DisciplinaDeRede, number> = {
  ELETRICA: 300,
  AGUA_FRIA: 1100,
  AGUA_QUENTE: 1100,
  ESGOTO: 0,
};

/** Quanto uma ponta de trecho pode estar longe do terminal e ainda encaixar. */
export const TOLERANCIA_ENCAIXE_MM = 150;

/**
 * A cor de cada disciplina, na tela e no 3D.
 *
 * ⚠️ Cor é o ÚNICO jeito de distinguir as disciplinas num emaranhado de canos,
 * e por isso ela não pode ser decorativa: as quatro precisam se separar em
 * escala de cinza também, para quem imprime e para quem não distingue vermelho
 * de verde. Vermelho (quente) e azul (fria) são o par convencional da
 * hidráulica brasileira; o esgoto fica escuro, e o elétrico amarelo.
 */
export const COR_DA_DISCIPLINA: Record<DisciplinaDeRede, string> = {
  ELETRICA: '#eab308',
  AGUA_FRIA: '#2563eb',
  AGUA_QUENTE: '#dc2626',
  ESGOTO: '#4b5563',
};

export const ROTULO_DA_DISCIPLINA: Record<DisciplinaDeRede, string> = {
  ELETRICA: 'Elétrica',
  AGUA_FRIA: 'Água fria',
  AGUA_QUENTE: 'Água quente',
  ESGOTO: 'Esgoto',
};

/** O comprimento REAL do trecho, em mm — em três dimensões. Ver `Trecho`. */
export function comprimentoDoTrecho(t: Trecho): number {
  return Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y, t.cotaBMm - t.cotaAMm);
}

/** É uma PRUMADA? As duas pontas no mesmo lugar em planta, cotas diferentes. */
export function ehPrumada(t: Trecho): boolean {
  return t.a.x === t.b.x && t.a.y === t.b.y;
}

/**
 * O cilindro que representa o trecho no 3D, já na convenção do visualizador.
 *
 * `eixo` é UNITÁRIO e sai do centro na direção `a → b`. O visualizador monta a
 * rotação com `setFromUnitVectors(Vector3(0,1,0), eixo)`, porque o
 * `CylinderGeometry` do three nasce alinhado ao Y — o que faz a PRUMADA ser o
 * caso trivial (eixo `(0,1,0)`, rotação identidade) em vez do caso difícil.
 *
 * ⚠️ `elevacaoDoNivelMm` entra somado à cota: a cota do trecho é medida do PISO
 * DO PAVIMENTO, e o 3D desenha os pavimentos empilhados. Esquecer a soma põe
 * toda a instalação do andar de cima no térreo — e o desenho continua
 * plausível, que é o pior tipo de erro.
 */
export function cilindroDoTrecho(
  t: Trecho,
  elevacaoDoNivelMm: number,
): {
  centro: [number, number, number];
  eixo: [number, number, number];
  comprimentoM: number;
  raioM: number;
} {
  const zA = elevacaoDoNivelMm + t.cotaAMm;
  const zB = elevacaoDoNivelMm + t.cotaBMm;
  const dx = t.b.x - t.a.x;
  const dy = t.b.y - t.a.y;
  const dz = zB - zA;
  const comprimento = Math.hypot(dx, dy, dz);

  // Comprimento zero é recusado pelos invariantes do kernel; aqui o guarda
  // existe para o visualizador nunca dividir por zero se alguém montar um
  // modelo à mão em teste.
  const n = comprimento || 1;

  return {
    centro: [
      ((t.a.x + t.b.x) / 2) * ESCALA_3D,
      ((zA + zB) / 2) * ESCALA_3D,
      ((t.a.y + t.b.y) / 2) * ESCALA_3D,
    ],
    // Na convenção do 3D: X e Z são a planta, Y é a altura.
    eixo: [dx / n, dz / n, dy / n],
    comprimentoM: comprimento * ESCALA_3D,
    raioM: (t.bitolaMm / 2) * ESCALA_3D,
  };
}

/** Onde o terminal fica no 3D, na convenção do visualizador. */
export function pontoDoTerminal3D(
  t: Terminal,
  elevacaoDoNivelMm: number,
): [number, number, number] {
  return [
    t.at.x * ESCALA_3D,
    (elevacaoDoNivelMm + t.cotaMm) * ESCALA_3D,
    t.at.y * ESCALA_3D,
  ];
}

/**
 * Encaixa o ponto no TERMINAL mais próximo do mesmo pavimento.
 *
 * ─── POR QUE O ENCAIXE É NO TERMINAL, E NÃO SÓ NA GRADE ─────────────────────
 *
 * Um trecho que "quase" chega na tomada é indistinguível na tela de um que
 * chega — e a diferença aparece só quando alguém for medir, ou quando o clash
 * disser que os dois não se tocam. O canvas já encaixa em grade e em canto de
 * parede (`capturarTracado`); o que faltava era o terminal, que é justamente
 * onde a rede TERMINA.
 *
 * Devolve o ponto original quando nada está perto: encaixar em algo distante
 * seria mover o traço para onde o usuário não clicou.
 */
export function encaixarNoTerminal(
  p: Point,
  model: BlueprintModel,
  levelId: string,
  toleranciaMm: number,
): { ponto: Point; terminal: Terminal | null } {
  let melhor: Terminal | null = null;
  let menor = Infinity;
  for (const t of model.terminais ?? []) {
    if (t.levelId !== levelId) continue;
    const d = Math.hypot(t.at.x - p.x, t.at.y - p.y);
    if (d <= toleranciaMm && d < menor) {
      menor = d;
      melhor = t;
    }
  }
  return melhor ? { ponto: { x: melhor.at.x, y: melhor.at.y }, terminal: melhor } : { ponto: p, terminal: null };
}

/**
 * A cota que a ponta do trecho deve assumir ao encaixar num terminal.
 *
 * ⚠️ Encaixar em planta e NÃO trazer a cota junto produziria o pior resultado
 * possível: o cano passa exatamente por cima da tomada, dois metros acima dela,
 * e o desenho parece ligado. É o mesmo erro que o encaixe existe para impedir,
 * mudado de eixo.
 */
export function cotaAoEncaixar(terminal: Terminal | null, padrao: number): number {
  return terminal ? terminal.cotaMm : padrao;
}

/** Os trechos e terminais de um pavimento — o que a tela desenha por vez. */
export function redeDoNivel(
  model: BlueprintModel,
  levelId: string,
): { trechos: Trecho[]; terminais: Terminal[] } {
  return {
    trechos: (model.trechos ?? []).filter((t) => t.levelId === levelId),
    terminais: (model.terminais ?? []).filter((t) => t.levelId === levelId),
  };
}

// ─── ACERTO DO CURSOR ───────────────────────────────────────────────────────
//
// ⚠️ Estas três funções nasceram de um defeito achado no USO, em 09/09/2026:
// "os componentes elétrica e hidráulica, parece que não consigo selecioná-los e
// não consigo movê-los". Trecho, terminal e quadro eram desenhados, tinham
// painel de propriedades, entravam no `TranslateEntities` e no `Delete` — e
// NÃO estavam na cadeia de acerto do clique. Tudo o que vem depois da seleção
// funcionava, e a seleção nunca acontecia.
//
// Vivem aqui, e não dentro do canvas, porque são geometria pura: no canvas elas
// só seriam testáveis renderizando um `<canvas>` com contexto 2D, que o jsdom
// não tem.

/** Distância de um ponto ao segmento `a`–`b`. Segmento degenerado = ponto. */
function distanciaAoSegmento(a: Ponto2D, b: Ponto2D, p: Ponto2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const comp2 = dx * dx + dy * dy;
  if (comp2 === 0) return Math.hypot(a.x - p.x, a.y - p.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / comp2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
}

interface Ponto2D {
  x: number;
  y: number;
}

/**
 * O QUADRO sob o cursor, ou nulo.
 *
 * ⚠️ `alcance` vem em unidades do MODELO, mas quem chama o calcula a partir de
 * PIXELS (`HIT_PX / escala`). O quadro é um símbolo de lado fixo na tela —
 * desenhá-lo em escala real faria uma caixa de 40 cm sumir na planta inteira,
 * que é justamente onde se procura por ele. Um alcance fixo em milímetros
 * pegaria metros de área com o zoom afastado e menos que o próprio símbolo com
 * o zoom perto: em nenhum dos dois o clique casaria com o que se vê.
 *
 * Percorre de trás para frente: o desenhado POR CIMA vence, que é o que a ordem
 * de desenho promete ao olho.
 */
export function quadroSob<T extends { at: Ponto2D }>(
  quadros: readonly T[],
  mundo: Ponto2D,
  alcance: number,
): T | null {
  for (let i = quadros.length - 1; i >= 0; i--) {
    const q = quadros[i];
    if (Math.hypot(q.at.x - mundo.x, q.at.y - mundo.y) <= alcance) return q;
  }
  return null;
}

/** O TERMINAL sob o cursor — mesma regra do quadro. */
export function terminalSob<T extends { at: Ponto2D }>(
  terminais: readonly T[],
  mundo: Ponto2D,
  alcance: number,
): T | null {
  return quadroSob(terminais, mundo, alcance);
}

/**
 * O TRECHO sob o cursor.
 *
 * ⚠️ A PRUMADA é o caso que quebra a implementação ingênua: as duas pontas estão
 * no MESMO ponto em planta, e ela é desenhada como um círculo, não como uma
 * linha. `distanciaAoSegmento` trata o segmento degenerado como ponto — sem
 * isso, o trecho mais comum de uma instalação seria o único inclicável.
 */
export function trechoSob<T extends { a: Ponto2D; b: Ponto2D }>(
  trechos: readonly T[],
  mundo: Ponto2D,
  alcance: number,
): T | null {
  for (let i = trechos.length - 1; i >= 0; i--) {
    const t = trechos[i];
    if (distanciaAoSegmento(t.a, t.b, mundo) <= alcance) return t;
  }
  return null;
}
