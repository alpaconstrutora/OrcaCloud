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
import type { TipoDePontoEletrico } from './blueprintKernel';

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
 * As MEDIDAS de uma peça de instalação, em mm.
 *
 * `largura` e `profundidade` são a pegada em PLANTA; `altura` é a vertical.
 */
export interface MedidasDaPeca {
  larguraMm: number;
  alturaMm: number;
  profundidadeMm: number;
}

/**
 * O quadro que ninguém mediu.
 *
 * ⚠️ São EXATAMENTE as medidas que o IFC já emitia embutidas — 400 × 300 × 200 —,
 * e não um número novo: assim o arquivo de todo desenho anterior a 09/09/2026
 * continua idêntico byte a byte, e as goldens do IFC passam sem recaptura. Um
 * padrão "melhor" aqui teria mudado o acervo inteiro sem que ninguém pedisse.
 *
 * Um QDC residencial de 12 a 16 disjuntores fica nessa ordem de grandeza.
 */
export const MEDIDAS_PADRAO_QUADRO: MedidasDaPeca = {
  larguraMm: 400,
  alturaMm: 300,
  profundidadeMm: 200,
};

/**
 * O terminal que ninguém mediu — o cubo de 100 mm que o IFC já usava.
 *
 * ⚠️ Ele é MARCA DE LUGAR, e continua sendo: o desenho sabe onde a tomada está e
 * não sabe como ela é. Quem declarar a medida passa a ter a medida; quem não
 * declarar continua com um símbolo que não afirma tamanho nenhum.
 */
export const MEDIDAS_PADRAO_TERMINAL: MedidasDaPeca = {
  larguraMm: 100,
  alturaMm: 100,
  profundidadeMm: 100,
};

/** As medidas declaradas, ou o padrão da família para cada uma que faltar. */
export function medidasDaPeca(
  peca: { larguraMm?: number | null; alturaMm?: number | null; profundidadeMm?: number | null },
  padrao: MedidasDaPeca,
): MedidasDaPeca {
  return {
    larguraMm: peca.larguraMm ?? padrao.larguraMm,
    alturaMm: peca.alturaMm ?? padrao.alturaMm,
    profundidadeMm: peca.profundidadeMm ?? padrao.profundidadeMm,
  };
}

/** As medidas do QUADRO, com o padrão preenchendo o que não foi declarado. */
export const medidasDoQuadro = (q: Parameters<typeof medidasDaPeca>[0]): MedidasDaPeca =>
  medidasDaPeca(q, MEDIDAS_PADRAO_QUADRO);

/** As medidas do TERMINAL, idem. */
export const medidasDoTerminal = (t: Parameters<typeof medidasDaPeca>[0]): MedidasDaPeca =>
  medidasDaPeca(t, MEDIDAS_PADRAO_TERMINAL);

/**
 * A CAIXA em 3D de uma peça: tamanho em metros e centro no espaço do viewer.
 *
 * ⚠️ A COTA É O CENTRO da peça, não a base.
 *
 * Não é a convenção que eu teria escolhido — "QDC a 1.600" costuma dizer onde a
 * caixa começa —, e é a que o sistema JÁ USA: o `emitirQuadro` do IFC nasce em
 * `cota − altura/2` e extruda a altura inteira, e o `pontoDoTerminal3D` põe o
 * ponto exatamente na cota. Trocar agora moveria meia altura toda peça de todo
 * desenho publicado, calado, e faria o 3D discordar do arquivo entregue.
 *
 * A hora de rever isso é com alguém que especifica quadro, não no meio de uma
 * correção de desenho.
 */
export function caixaDaPeca(
  at: { x: number; y: number },
  cotaMm: number,
  elevacaoDoNivelMm: number,
  medidas: MedidasDaPeca,
): { tamanho: [number, number, number]; centro: [number, number, number] } {
  return {
    tamanho: [
      medidas.larguraMm * ESCALA_3D,
      medidas.alturaMm * ESCALA_3D,
      medidas.profundidadeMm * ESCALA_3D,
    ],
    centro: [at.x * ESCALA_3D, (elevacaoDoNivelMm + cotaMm) * ESCALA_3D, at.y * ESCALA_3D],
  };
}

/** O giro declarado da peça, em graus. Ausente = 0. */
export const giroDaPeca = (p: { rotacaoGraus?: number | null }): number => p.rotacaoGraus ?? 0;

/**
 * Os quatro CANTOS da pegada em planta, em coordenadas do MODELO.
 *
 * ⚠️ Em coordenadas do modelo, e não da tela: quem desenha passa cada canto pelo
 * mesmo `paraTela` do resto da planta. Girar em pixels daria um resultado que
 * concorda com a parede ao lado por acaso, e deixa de concordar no dia em que a
 * convenção do Y mudar — que já mudou uma vez aqui.
 *
 * Ordem: começa no canto (−larg/2, −prof/2) e segue no sentido anti-horário.
 */
export function cantosDaPeca(
  at: Ponto2D,
  medidas: MedidasDaPeca,
  graus: number,
): [Ponto2D, Ponto2D, Ponto2D, Ponto2D] {
  const a = (graus * Math.PI) / 180;
  const cos = Math.cos(a);
  const sen = Math.sin(a);
  const hx = medidas.larguraMm / 2;
  const hy = medidas.profundidadeMm / 2;
  const girar = (x: number, y: number): Ponto2D => ({
    x: at.x + x * cos - y * sen,
    y: at.y + x * sen + y * cos,
  });
  return [girar(-hx, -hy), girar(hx, -hy), girar(hx, hy), girar(-hx, hy)];
}

/**
 * O ponto está DENTRO da pegada girada, com folga?
 *
 * Leva o ponto para o referencial da peça (gira por −θ) em vez de girar o
 * retângulo: é a mesma conta que o desenho faz, ao contrário, e uma comparação
 * de eixos alinhados no fim — sem teste de polígono e sem caso especial para
 * θ = 0.
 */
export function dentroDaPeca(
  at: Ponto2D,
  medidas: MedidasDaPeca,
  graus: number,
  ponto: Ponto2D,
  folga: number,
): boolean {
  const a = (-graus * Math.PI) / 180;
  const dx = ponto.x - at.x;
  const dy = ponto.y - at.y;
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  return (
    Math.abs(lx) <= medidas.larguraMm / 2 + folga &&
    Math.abs(ly) <= medidas.profundidadeMm / 2 + folga
  );
}

/**
 * O giro da peça como rotação em torno do eixo Y do three.js, em radianos.
 *
 * ⚠️ O SINAL É INVERTIDO, e não por descuido. No viewer, o Y da planta vira o
 * **Z** do mundo 3D (a convenção `(x, cota, y)`), e girar em torno de Y leva
 * `(1,0,0)` para `(cos a, 0, −sen a)`. Para que o lado da LARGURA aponte na
 * mesma direção que aponta em planta — `(cos θ, sen θ)` —, é preciso `a = −θ`.
 *
 * Um sinal trocado aqui produz um quadro girado para o lado errado: plausível
 * demais para alguém notar sem uma peça claramente assimétrica na tela. Daí ele
 * viver num módulo puro, com teste, e não numa linha do viewer sob `@ts-nocheck`.
 */
export const rotacaoY3D = (graus: number): number => (-graus * Math.PI) / 180;

/**
 * O ponto em planta é desenhado como CÍRCULO ou como retângulo?
 *
 * Círculo é o símbolo de ponto, e é o que se espera de uma tomada. Mas quem
 * declarou largura e profundidade DIFERENTES declarou uma peça retangular:
 * desenhá-la redonda esconderia a medida que a pessoa acabou de informar, e
 * esconderia o giro dela junto — um círculo girado é o mesmo círculo.
 */
export const terminalEhRedondo = (t: MedidasOpcionais): boolean =>
  medidasDoTerminal(t).larguraMm === medidasDoTerminal(t).profundidadeMm;

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

/**
 * Como o TRECHO se chama em cada disciplina, para quem lê a tela.
 *
 * ⚠️ "Trecho" é o nome do KERNEL — uma família só para as quatro disciplinas,
 * porque a geometria é a mesma. Para quem desenha, o da elétrica é ELETRODUTO,
 * e é assim que a norma e o eletricista o chamam (pedido de 10/09/2026:
 * "trecho elétrico, vamos chamar de eletroduto"). O tipo interno não muda: um
 * rename no kernel mexeria em payload, hash e acervo por causa de um rótulo.
 */
/**
 * A UNIDADE em que a potência do ponto aparece na tela: VA, e não W.
 *
 * A NBR 5410 dimensiona por potência APARENTE — 9.5.2.2.2 fala em "600 VA por
 * ponto de tomada", 9.5.2.1.2 em "100 VA" por ponto de luz —, e é nessa
 * unidade que o projetista pensa e que a prancha escreve. O campo do modelo
 * continua `potenciaW` porque o NOME está no canônico; só o rótulo muda.
 */
export const UNIDADE_DE_POTENCIA = 'VA';

export const NOME_DO_TRECHO: Record<DisciplinaDeRede, string> = {
  ELETRICA: 'Eletroduto',
  AGUA_FRIA: 'Tubulação de água fria',
  AGUA_QUENTE: 'Tubulação de água quente',
  ESGOTO: 'Tubulação de esgoto',
};

export const ROTULO_DA_DISCIPLINA: Record<DisciplinaDeRede, string> = {
  ELETRICA: 'Elétrica',
  AGUA_FRIA: 'Água fria',
  AGUA_QUENTE: 'Água quente',
  ESGOTO: 'Esgoto',
};

/** O comprimento REAL do trecho, em mm — em três dimensões. Ver `Trecho`. */
export function comprimentoDoTrecho(t: Trecho): number {
  const planta = Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y);
  const desnivel = Math.abs(t.cotaBMm - t.cotaAMm);
  // ⚠️ O ELETRODUTO mede o "L" (planta + prumada) — ver `segmentosDoEletroduto`;
  // a soma não depende de qual ponta hospeda a horizontal. As OUTRAS
  // disciplinas medem a diagonal, porque o esgoto com caimento corre inclinado
  // de verdade, e a tubulação vai por onde foi desenhada.
  return t.disciplina === 'ELETRICA' ? planta + desnivel : Math.hypot(planta, desnivel);
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

/** O que qualquer peça de instalação pode declarar de medida. */
type MedidasOpcionais = {
  larguraMm?: number | null;
  alturaMm?: number | null;
  profundidadeMm?: number | null;
  rotacaoGraus?: number | null;
};

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
export function quadroSob<T extends { at: Ponto2D } & MedidasOpcionais>(
  quadros: readonly T[],
  mundo: Ponto2D,
  folga: number,
): T | null {
  for (let i = quadros.length - 1; i >= 0; i--) {
    const q = quadros[i];
    // Dentro da PEGADA desenhada — girada como ela é desenhada —, mais a folga
    // de clique. Só a folga bastava enquanto o quadro era um símbolo de 9 px;
    // com a caixa em escala, um quadro de 400 mm só seria pego perto do CENTRO.
    // E sem o giro, um quadro a 45° seria pego onde ele não está desenhado.
    if (dentroDaPeca(q.at, medidasDoQuadro(q), giroDaPeca(q), mundo, folga)) {
      return q;
    }
  }
  return null;
}

/** O TERMINAL sob o cursor — redondo, então pelo RAIO mais a folga. */
export function terminalSob<T extends { at: Ponto2D } & MedidasOpcionais>(
  terminais: readonly T[],
  mundo: Ponto2D,
  folga: number,
): T | null {
  for (let i = terminais.length - 1; i >= 0; i--) {
    const t = terminais[i];
    const m = medidasDoTerminal(t);
    // Pega como está DESENHADO: círculo pelo raio, retângulo pela pegada girada.
    // Duas formas na tela e uma só no acerto fariam metade dos cliques falhar
    // exatamente nos pontos que alguém se deu ao trabalho de medir.
    const acerta = terminalEhRedondo(t)
      ? Math.hypot(t.at.x - mundo.x, t.at.y - mundo.y) <= m.larguraMm / 2 + folga
      : dentroDaPeca(t.at, m, giroDaPeca(t), mundo, folga);
    if (acerta) return t;
  }
  return null;
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

// ─── A TAXONOMIA DO PONTO ELÉTRICO ──────────────────────────────────────────
//
// Informada pelo usuário em 09/09/2026, e é a que o projeto elétrico usa:
// iluminação, tomadas e especiais/dados. Ela vale em quatro lugares — o menu de
// inserir, o grupo do inventário, o painel da peça e a contagem por família.

/** Como cada tipo se chama na tela. */
export const ROTULO_DO_PONTO_ELETRICO: Record<TipoDePontoEletrico, string> = {
  ILUMINACAO_TETO: 'Luz de teto',
  ILUMINACAO_PAREDE: 'Arandela',
  ILUMINACAO_PISO: 'Luz de piso/jardim',
  TUG: 'TUG — tomada de uso geral',
  TUE: 'TUE — tomada de uso específico',
  DADOS_TELEFONE: 'Telefone',
  DADOS_TV: 'Antena de TV',
  DADOS_REDE: 'Rede (internet)',
  DADOS_USB: 'USB',
  LIGACAO_DIRETA: 'Ligação direta (chuveiro, aquecedor)',
};

/** O texto curto, para caber ao lado do ponto e na lista. */
export const SIGLA_DO_PONTO_ELETRICO: Record<TipoDePontoEletrico, string> = {
  ILUMINACAO_TETO: 'Luz teto',
  ILUMINACAO_PAREDE: 'Arandela',
  ILUMINACAO_PISO: 'Luz piso',
  TUG: 'TUG',
  TUE: 'TUE',
  DADOS_TELEFONE: 'Telefone',
  DADOS_TV: 'TV',
  DADOS_REDE: 'Rede',
  DADOS_USB: 'USB',
  LIGACAO_DIRETA: 'LD',
};

/**
 * Os TRÊS grupos da taxonomia.
 *
 * ⚠️ São os grupos do usuário, não uma invenção minha: iluminação, tomadas e
 * especiais/dados é como um projeto elétrico se organiza, e é por eles que se
 * conta ("quantos pontos de luz tem a casa?"). Agrupar por outra coisa —
 * disciplina, cota, circuito — daria listas que ninguém pede.
 */
export const GRUPO_DO_PONTO_ELETRICO: Record<TipoDePontoEletrico, string> = {
  ILUMINACAO_TETO: 'Elétrica — iluminação',
  ILUMINACAO_PAREDE: 'Elétrica — iluminação',
  ILUMINACAO_PISO: 'Elétrica — iluminação',
  TUG: 'Elétrica — tomadas',
  TUE: 'Elétrica — tomadas',
  DADOS_TELEFONE: 'Elétrica — especiais e dados',
  DADOS_TV: 'Elétrica — especiais e dados',
  DADOS_REDE: 'Elétrica — especiais e dados',
  DADOS_USB: 'Elétrica — especiais e dados',
  // Ponto de força, sem tomada (9.5.2.3). Mora com as tomadas porque é o
  // grupo que o projetista procura ao ligar um chuveiro — não um quarto grupo.
  LIGACAO_DIRETA: 'Elétrica — tomadas',
};

/**
 * A cota usual de cada tipo, em mm do piso.
 *
 * ⚠️ É PONTO DE PARTIDA da ferramenta, não norma: quem desenha muda no painel,
 * e o desenho grava o que ficou. Uma luz de teto no pé-direito e uma TUG a
 * 300 mm são o que se digitaria de qualquer forma — poupar isso é diferente de
 * decidir por alguém.
 */
export const COTA_USUAL_DO_PONTO_ELETRICO: Record<TipoDePontoEletrico, number> = {
  ILUMINACAO_TETO: 2800,
  ILUMINACAO_PAREDE: 2100,
  ILUMINACAO_PISO: 0,
  TUG: 300,
  TUE: 1200,
  DADOS_TELEFONE: 300,
  DADOS_TV: 300,
  DADOS_REDE: 300,
  DADOS_USB: 300,
  // Chuveiro: a caixa fica acima da altura da ducha.
  LIGACAO_DIRETA: 2200,
};

/**
 * O trecho está EMBUTIDO NO PISO?
 *
 * ─── A CONVENÇÃO, INFORMADA PELO USUÁRIO (NBR 5410, 09/09/2026) ────────────
 *
 *   · linha CONTÍNUA  → embutido na parede ou no teto
 *   · linha PONTILHADA → embutido no piso
 *
 * ⚠️ É DERIVADA da cota, e não um campo novo — e isso é decisão, não economia.
 * A cota é exatamente o que responde a pergunta: um eletroduto no contrapiso
 * está em zero ou abaixo, um na parede sobe, um no teto está no pé-direito.
 * Um campo à parte poderia CONTRADIZER a cota ("no piso", a 2.500 mm), e o
 * desenho passaria a ter duas verdades sobre a mesma peça — com o traço dizendo
 * uma e o modelo 3D mostrando a outra.
 *
 * ⚠️ AS DUAS PONTAS, e não a média: a prumada que sai do contrapiso e sobe pela
 * parede NÃO é um trecho de piso. Um trecho que deixa o piso deixou de ser dele,
 * e desenhá-lo pontilhado diria que ele corre onde ele não corre.
 */
export function embutidoNoPiso(t: { cotaAMm: number; cotaBMm: number }): boolean {
  return t.cotaAMm <= 0 && t.cotaBMm <= 0;
}

/** Uma peça elétrica que a ponta de um trecho pode agarrar. */
export interface AncoraDeRede {
  ponto: Point;
  /** A cota da peça agarrada. `null` = nenhuma; quem chama usa o padrão dele. */
  cotaMm: number | null;
  /** Id da peça agarrada, ou `null`. */
  id: string | null;
}

/**
 * A ponta do trecho agarra a PEÇA sob o clique — terminal ou quadro.
 *
 * ─── O PEDIDO (09/09/2026) ─────────────────────────────────────────────────
 *
 * *"implementar trecho automático ou clicar em um componente elétrico e outro"*
 *
 * ─── ⚠️ O QUE FALTAVA, E POR QUE ATRAPALHAVA ───────────────────────────────
 *
 * `encaixarNoTerminal` só enxergava TERMINAIS, e só num raio fixo de 150 mm da
 * âncora. Duas consequências no gesto que se faz o tempo todo:
 *
 *   · o QUADRO — de onde toda a instalação sai — não agarrava nada. Ligar o QDC
 *     à primeira tomada era mirar um ponto no vazio e torcer;
 *   · num zoom afastado, 150 mm é menos de um pixel: clicar EM CIMA da peça
 *     não a agarrava, e o trecho nascia ao lado dela.
 *
 * Agora a peça agarra pela PEGADA — o desenho que está na tela, medidas e giro
 * incluídos — mais a folga. Clicar no componente é clicar no componente.
 *
 * ⚠️ E a COTA vem junto, como já vinha do terminal: encaixar em planta e deixar
 * a cota para trás põe o cano passando dois metros acima da tomada, com o
 * desenho parecendo ligado.
 */
export function encaixarEmPecaEletrica(
  p: Point,
  model: BlueprintModel,
  levelId: string,
  toleranciaMm: number,
): AncoraDeRede {
  let melhor: { at: Point; cotaMm: number; id: string } | null = null;
  let menor = Infinity;

  const considerar = (
    peca: { id: string; at: Point; cotaMm: number } & MedidasOpcionais,
    padrao: MedidasDaPeca,
    redondo: boolean,
  ) => {
    const m = medidasDaPeca(peca, padrao);
    const d = Math.hypot(peca.at.x - p.x, peca.at.y - p.y);
    const dentro = redondo
      ? d <= m.larguraMm / 2 + toleranciaMm
      : dentroDaPeca(peca.at, m, giroDaPeca(peca), p, toleranciaMm);
    if (dentro && d < menor) {
      menor = d;
      melhor = { at: peca.at, cotaMm: peca.cotaMm, id: peca.id };
    }
  };

  for (const t of model.terminais ?? []) {
    if (t.levelId !== levelId) continue;
    considerar(t, MEDIDAS_PADRAO_TERMINAL, terminalEhRedondo(t));
  }
  // ⚠️ O QUADRO por último, e a distância decide: com uma tomada dentro da
  // pegada do quadro — que acontece, porque ele é grande —, ganha a que está
  // mais perto do clique, e não a família que eu varri primeiro.
  for (const q of model.quadros ?? []) {
    if (q.levelId !== levelId) continue;
    considerar(q, MEDIDAS_PADRAO_QUADRO, false);
  }

  if (!melhor) return { ponto: p, cotaMm: null, id: null };
  const achado = melhor as { at: Point; cotaMm: number; id: string };
  return { ponto: { x: achado.at.x, y: achado.at.y }, cotaMm: achado.cotaMm, id: achado.id };
}

// ─── A SIMBOLOGIA DA TOMADA (NBR 5444) ──────────────────────────────────────
//
// Informada pelo usuário em 10/09/2026, com o print da norma:
//
//   △  contorno vazio ..... tomada BAIXA na parede (≈ 300 mm do piso acabado)
//   ◭  metade cheia ....... tomada MÉDIA (≈ 1.300 mm)
//   ▲  cheio .............. tomada ALTA (≈ 2.000 mm)
//   ⊡  triângulo no quadrado  tomada NO PISO
//
// Em cima, a potência; embaixo, o circuito entre traços (-1-). A haste liga o
// símbolo à parede, e o triângulo aponta para DENTRO do ambiente.

export type AlturaDaTomada = 'PISO' | 'BAIXA' | 'MEDIA' | 'ALTA';

/**
 * A classe de altura de uma tomada, pela COTA.
 *
 * ⚠️ DERIVADA da cota, e não escolhida à parte — a mesma decisão do traço
 * contínuo/pontilhado do trecho. A norma dá três alturas nominais (300, 1.300,
 * 2.000) e o desenho guarda a cota real; os cortes ficam nos MEIOS entre as
 * nominais, para uma tomada a 1.100 ser lida como média e não como baixa. Uma
 * classe declarada à parte poderia dizer "alta" numa cota de 300, e o símbolo
 * mentiria sobre o que o 3D mostra.
 *
 * Piso é cota ≤ 0: é a mesma fronteira de `embutidoNoPiso`, e uma tomada de
 * piso está no contrapiso, não acima dele.
 */
export function alturaDaTomada(cotaMm: number): AlturaDaTomada {
  if (cotaMm <= 0) return 'PISO';
  if (cotaMm < 800) return 'BAIXA';
  if (cotaMm < 1650) return 'MEDIA';
  return 'ALTA';
}

/**
 * Para onde o triângulo APONTA, em graus do modelo (anti-horário, 0 = +X).
 *
 * ─── A REGRA, NA ORDEM ─────────────────────────────────────────────────────
 *
 *   1. giro DECLARADO na peça — quem escolheu, escolheu;
 *   2. senão, a NORMAL da parede mais próxima, para o lado em que a tomada
 *      está: é o que faz o símbolo apontar para dentro do ambiente sem que
 *      ninguém gire nada, porque a tomada encaixada na FACE já está do lado
 *      certo;
 *   3. senão, +X.
 *
 * ⚠️ A tomada exatamente NO EIXO da parede é ambígua — não há "lado" — e cai no
 * caso 3 em vez de escolher um lado ao acaso. Ela é rara: o encaixe agarra a
 * face quando o cursor está perto dela, e a face é onde a tomada fica.
 */
export function orientacaoDaTomada(
  t: { at: Point; rotacaoGraus?: number | null },
  paredes: readonly { a: Point; b: Point; thicknessMm: number }[],
): number {
  if (t.rotacaoGraus != null) return t.rotacaoGraus;

  let melhor: { normal: number; d: number } | null = null;
  for (const w of paredes) {
    const dx = w.b.x - w.a.x;
    const dy = w.b.y - w.a.y;
    const comp2 = dx * dx + dy * dy;
    if (comp2 === 0) continue;
    let s = ((t.at.x - w.a.x) * dx + (t.at.y - w.a.y) * dy) / comp2;
    s = Math.max(0, Math.min(1, s));
    const px = w.a.x + s * dx;
    const py = w.a.y + s * dy;
    const d = Math.hypot(t.at.x - px, t.at.y - py);
    // Perto da parede: até meia espessura mais uma folga de 100 mm.
    if (d > w.thicknessMm / 2 + 100) continue;
    // De que lado do eixo a tomada está? O sinal do produto vetorial diz.
    const lado = dx * (t.at.y - w.a.y) - dy * (t.at.x - w.a.x);
    if (Math.abs(lado) < 1e-6) continue; // no eixo: ambíguo, não decide
    const normal = Math.atan2(dy, dx) + (lado > 0 ? Math.PI / 2 : -Math.PI / 2);
    if (!melhor || d < melhor.d) melhor = { normal, d };
  }
  if (!melhor) return 0;
  return (((melhor.normal * 180) / Math.PI) % 360 + 360) % 360;
}

/**
 * Os três vértices do triângulo, em coordenadas do MODELO.
 *
 * A BASE fica do lado da parede (atrás do centro) e o ÁPICE aponta na direção
 * dada. `tamanhoMm` é a altura do triângulo; a base tem a mesma medida.
 */
export function trianguloDaTomada(
  centro: Point,
  graus: number,
  tamanhoMm: number,
): [Point, Point, Point] {
  const a = (graus * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const nx = -uy;
  const ny = ux;
  const h = tamanhoMm;
  const meia = tamanhoMm / 2;
  const base = { x: centro.x - ux * (h / 2), y: centro.y - uy * (h / 2) };
  return [
    { x: base.x + nx * meia, y: base.y + ny * meia },
    { x: base.x - nx * meia, y: base.y - ny * meia },
    { x: centro.x + ux * (h / 2), y: centro.y + uy * (h / 2) },
  ];
}

// ─── O CAMINHO REAL DO ELETRODUTO ───────────────────────────────────────────

/** Um pedaço RETO do caminho: horizontal (mesma cota) ou vertical (mesmo ponto). */
export interface SegmentoDoTrecho {
  a: Point;
  b: Point;
  cotaAMm: number;
  cotaBMm: number;
}

/**
 * O caminho que o eletroduto faz de verdade — seguindo a parede, o teto ou o
 * piso —, em um ou dois segmentos RETOS.
 *
 * ─── O PEDIDO (10/09/2026) ─────────────────────────────────────────────────
 *
 * *"na planta 3D o eletroduto deve ser representado seguindo a parede, teto ou
 * piso"*
 *
 * ─── ⚠️ O QUE ESTAVA ERRADO ─────────────────────────────────────────────────
 *
 * Um trecho de (a, 300) a (b, 2800) saía como uma DIAGONAL no espaço: um tubo
 * atravessando o cômodo em linha reta da tomada à luminária, no ar. Eletroduto
 * embutido não faz isso — ele sobe pela parede e corre pelo teto, ou corre pelo
 * piso e sobe pela parede. Sempre em "L": um trecho horizontal numa laje ou ao
 * longo da parede, e um vertical dentro da parede.
 *
 * ─── A REGRA: A HORIZONTAL FICA NA PONTA MAIS PERTO DE UMA LAJE ────────────
 *
 * Das duas pontas, a que está mais perto do piso (cota 0) ou do teto (cota =
 * pé-direito) é onde o eletroduto corre na horizontal — porque é ali que ele
 * está embutido na laje. A vertical acontece na OUTRA ponta, dentro da parede.
 *
 *   tomada (300) → luminária (2.800): sobe na tomada, corre no teto até a luz;
 *   quadro (1.600) → tomada (300): corre… na tomada? Não — 300 está mais perto
 *   do piso que 1.600 do teto, então corre a 300 e sobe até o quadro.
 *
 * ⚠️ A regra é DERIVADA, e pode não ser o caminho que o eletricista escolheu.
 * Ela é a melhor leitura do que o desenho sabe — duas cotas e dois pontos — e
 * é honesta sobre isso: o modelo não guarda o caminho, guarda as pontas. Quem
 * precisar do caminho exato desenha dois trechos.
 *
 * A prumada (a = b) e o trecho horizontal (cotas iguais) já são retos e voltam
 * inteiros.
 */
export function segmentosDoEletroduto(
  t: { a: Point; b: Point; cotaAMm: number; cotaBMm: number; disciplina: DisciplinaDeRede },
  peDireitoMm: number,
): SegmentoDoTrecho[] {
  const reto: SegmentoDoTrecho[] = [{ a: t.a, b: t.b, cotaAMm: t.cotaAMm, cotaBMm: t.cotaBMm }];
  // ⚠️ SÓ O ELETRODUTO anda em "L". O esgoto com caimento é uma DIAGONAL de
  // verdade — o cano corre inclinado, é assim que ele escoa —, e a água
  // pressurizada pode correr como o projetista a desenhou. Aplicar o "L" a
  // todas as disciplinas foi o meu primeiro erro aqui, e os testes do caimento
  // de 2 % em 10 m o pegaram: o comprimento inclinado virava planta + desnível.
  if (t.disciplina !== 'ELETRICA') return reto;
  const prumada = t.a.x === t.b.x && t.a.y === t.b.y;
  const horizontal = t.cotaAMm === t.cotaBMm;
  if (prumada || horizontal) return reto;

  const distanciaALaje = (cota: number) => Math.min(Math.abs(cota), Math.abs(peDireitoMm - cota));
  const horizontalEmA = distanciaALaje(t.cotaAMm) <= distanciaALaje(t.cotaBMm);

  return horizontalEmA
    ? [
        // Corre na cota de A até o ponto B, e sobe/desce em B.
        { a: t.a, b: t.b, cotaAMm: t.cotaAMm, cotaBMm: t.cotaAMm },
        { a: t.b, b: t.b, cotaAMm: t.cotaAMm, cotaBMm: t.cotaBMm },
      ]
    : [
        // Sobe/desce em A, e corre na cota de B até o ponto B.
        { a: t.a, b: t.a, cotaAMm: t.cotaAMm, cotaBMm: t.cotaBMm },
        { a: t.a, b: t.b, cotaAMm: t.cotaBMm, cotaBMm: t.cotaBMm },
      ];
}

/**
 * O comprimento REAL do eletroduto — a soma dos segmentos do caminho.
 *
 * ⚠️ Substitui a diagonal em `comprimentoDoTrecho` para o que se COMPRA: o
 * tubo que sobe 2,5 m e corre 4 m mede 6,5 m, não 4,7. A diagonal subestimava
 * exatamente nos trechos em que a diferença é maior.
 */
export function comprimentoDoEletroduto(
  t: { a: Point; b: Point; cotaAMm: number; cotaBMm: number; disciplina: DisciplinaDeRede },
  peDireitoMm: number,
): number {
  return segmentosDoEletroduto(t, peDireitoMm).reduce(
    (s, seg) => s + Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y, seg.cotaBMm - seg.cotaAMm),
    0,
  );
}

/**
 * O eletroduto SOBE ou DESCE, na convenção da NBR 5410?
 *
 *   sobe .... círculo na base e seta saindo para cima (45°)
 *   desce ... seta chegando ao círculo
 *
 * Só faz sentido na prumada e no "L" — no horizontal não há o que subir.
 */
export function sentidoDoEletroduto(t: { cotaAMm: number; cotaBMm: number }): 'SOBE' | 'DESCE' | null {
  if (t.cotaBMm > t.cotaAMm) return 'SOBE';
  if (t.cotaBMm < t.cotaAMm) return 'DESCE';
  return null;
}
