/**
 * Unidades e política numérica do kernel geométrico (Spike A, braço TypeScript).
 *
 * Regra única do PRD §9.2: comprimento persiste em MILÍMETROS INTEIROS. Ponto
 * flutuante só existe dentro de um cálculo intermediário e nunca sobrevive a ele —
 * toda saída volta a inteiro por `roundToMm`.
 *
 * Por que inteiros: o critério do Spike A é igualdade bit a bit do payload canônico
 * entre navegador e servidor. Com float, duas somas na mesma ordem lógica mas em
 * ordem de avaliação diferente já divergem no último bit, e o hash muda sem que a
 * geometria tenha mudado. Com inteiro, a igualdade é estrutural.
 *
 * Faixa segura: uma edificação cabe em ±100.000 mm (100 m). Produtos vetoriais em
 * `geom.ts` chegam a ~1e10, muito abaixo de Number.MAX_SAFE_INTEGER (~9e15), então
 * os predicados de orientação são EXATOS — não aproximados.
 */

/**
 * Identifica a implementação e a política numérica. Entra no hash do snapshot.
 *
 * 0.2.0 — o payload canônico passou a referenciar nível e parede por ÍNDICE em vez
 * de `levelId`/`wallId`. A geometria não mudou; a serialização sim, e por isso todo
 * hash anterior é incompatível por construção. Snapshot gravado com 0.1.0 continua
 * legível pelo `kernel_version` que carrega — é para isso que ele existe.
 *
 * 0.4.0 (14/08/2026) — `Opening` ganhou `hingeAtStart`/`swingReversed` (girar e
 * espelhar o símbolo de porta). Payload gravado sob 0.3.0 não tem os dois campos;
 * `modelFromCanonicalPayload` os lê com `?? true`/`?? false`, o mesmo padrão de
 * `labels` na entrada 0.3.0 — snapshot antigo continua legível, só não recalcula
 * hash igual ao de hoje.
 *
 * 0.5.0 (21/08/2026) — `Boundary` ganhou `kind` (TERRENO/DIVISA) e `papel`
 * (frente/fundos/laterais), para a ferramenta de terreno. Os atributos viajam no
 * PAYLOAD, e não numa tabela ao lado, porque `modelFromCanonicalPayload`
 * reconstrói os limites com ids `bnd_` NOVOS — id de limite não sobrevive a
 * publicar+recarregar, então referência externa por id se perderia no primeiro
 * publish. Payload sob 0.4.0 não tem os campos; lidos como `'DIVISA'`/`null`,
 * que é o que aquele desenho significava.
 *
 * 0.6.0 (21/08/2026) — a ESCRITURA entrou no modelo: `Boundary` ganhou
 * `medidaEscrituraMm` e `confrontante`, e o modelo ganhou `areaEscrituraMm2`. É a
 * mesma razão da entrada 0.5.0 levada ao dado da matrícula — e vale também para o
 * RASCUNHO, não só para o snapshot: `blueprint_branches.draft_payload` guarda este
 * mesmo payload canônico, então o que não está aqui se perde já no autosave, sem
 * publicação nenhuma. Payload sob 0.5.0 não tem os campos; lidos como `null`, que
 * é "ninguém informou" — e não se compara desenho com escritura que ninguém deu.
 *
 * 0.7.0 (23/08/2026) — a PORTA DE CORRER: `Opening` ganhou o tipo `sliding` e o
 * campo `embutida` (folha no bolso da parede ou sobre a face). A entrada estava
 * FALTANDO nesta lista — a constante subiu e o histórico não, e quem viesse
 * depois leria "0.6.0" como a última mudança. Registrada aqui em 30/08/2026, ao
 * subir para 0.8.0. `embutida` é emitida só em abertura de correr, então nenhum
 * desenho sem porta de correr mudou de forma.
 *
 * 0.8.0 (30/08/2026) — `Wall` ganhou `alinhamento` (`EIXO`/`DIREITA`/`ESQUERDA`):
 * de que lado do eixo estava o traço que o usuário clicou. O campo não move nada
 * e não muda a topologia — `a`/`b` continuam sendo o eixo, e a conexão continua
 * pelo eixo. Ele existe porque o lado era estado só da FERRAMENTA de desenho,
 * aplicado uma vez no clique e esquecido: mudar a espessura depois crescia a
 * parede para os dois lados e a face apontada andava meia espessura. Emitido
 * SÓ quando difere de `'EIXO'` — pela razão da entrada 0.6.0 levada à parede:
 * a chave entraria em toda parede do acervo, mudando a forma canônica de
 * desenhos que não têm nada a ver com traçado pela face. Ausente = `'EIXO'`,
 * que é exatamente o que aquelas paredes sempre significaram.
 *
 * 0.9.0 (30/08/2026) — a ESTRUTURA entrou no modelo: `structures`, uma família com
 * seis tipos (pilar, viga, laje, estaca, bloco de coroamento, viga de fundação) e
 * três formas geométricas. É a primeira família nova desde `Boundary`, e entra no
 * payload pela razão da entrada 0.5.0 — `modelFromCanonicalPayload` reatribui ids
 * `str_` novos, então referência externa por id se perderia no primeiro publish.
 *
 * A chave `structures` é emitida SÓ quando há alguma estrutura, e não como `[]`:
 * é o mesmo cuidado de `areaEscrituraMm2` (0.6.0) e `alinhamento` (0.8.0) levado a
 * uma família inteira. Emitir o array vazio acrescentaria a chave a todo desenho
 * do acervo — nenhum deles tem um pilar, e nenhum deles deveria mudar de forma
 * canônica por causa disso. Ausente e `[]` são a mesma coisa na volta.
 *
 * ⚠️ As estruturas NÃO entram no arranjo planar: `Space` continua saindo só de
 * paredes e limites. Um pilar no meio da sala não parte o ambiente. Isso não é
 * detalhe de render — é o que garante que acrescentar estrutura a uma planta não
 * mexe em área de piso, rodapé nem revestimento.
 *
 * 0.10.0 (01/09/2026) — `cedeSobreposicao` entrou em `Wall` e em `Structural`: a
 * decisão de quem abre mão do volume que dois componentes dividem. Pedido do
 * usuário depois de ver, no 3D, um pilar atravessando uma parede — e o que
 * estava errado não era a imagem (pilar embutido é normal na obra), era o
 * quantitativo pagando o mesmo metro cúbico duas vezes.
 *
 * Guarda a DECISÃO, nunca o volume: o número é recalculado a cada leitura
 * (`sobreposicao.ts`), senão mover o pilar deixaria para trás um desconto
 * obsoleto — que não some da tela, vira número plausível.
 *
 * A chave é emitida SÓ quando `true`, nos dois lados, pela razão das entradas
 * 0.6.0 e 0.8.0: emitir `false` acrescentaria a chave a toda parede e a toda
 * peça do acervo, mudando a forma canônica de desenhos que nunca tiveram um
 * pilar embutido. Ausente e `false` são a mesma coisa na volta.
 *
 * 0.11.0 (01/09/2026) — a PAREDE VIROU MULTICAMADA: `Wall` ganhou `camadas`,
 * uma lista de faixas com espessura, função construtiva e código de catálogo.
 * Uma parede real não é homogênea — bloco 140 com reboco 25 de cada lado são
 * três materiais, três preços e três serviços —, e sem isso o quantitativo só
 * sabia dizer "2,4 m³ de alvenaria", que não compra bloco nem argamassa.
 *
 * ⚠️ `thicknessMm` CONTINUA sendo a única espessura que a geometria lê. As
 * camadas são uma decomposição dela, e a soma é invariante
 * (`LAYERS_THICKNESS_MISMATCH`). Foi a decisão mais importante da entrada: se
 * as duas pudessem divergir, a parede seria desenhada com uma medida e orçada
 * com outra, e nada na tela diria qual das duas está errada. Para o usuário a
 * soma é que manda — `SetWallLayers` recalcula a espessura, e `SetThickness`
 * numa parede com camadas é recusado em vez de redistribuir os milímetros em
 * silêncio.
 *
 * ⚠️ O material é um CÓDIGO OPACO (`itemCode`), nunca um item resolvido.
 * Resolver exigiria consultar o catálogo no banco, e o payload deixaria de ser
 * função só do desenho: o mesmo traço geraria hashes diferentes conforme o
 * catálogo do dia. `descricao` viaja junto como cache de rótulo, e por isso
 * fica FORA da assinatura que compara composições — o catálogo pode mudar a
 * grafia sem que a parede tenha mudado.
 *
 * A chave `camadas` é emitida SÓ quando existe, pela razão das entradas 0.6.0,
 * 0.8.0, 0.9.0 e 0.10.0: emitir sempre acrescentaria a chave a toda parede do
 * acervo, mudando a forma canônica de desenhos homogêneos que não têm nada a
 * ver com composição. Ausente = homogênea, que é o que todos eles significavam.
 * Lista VAZIA, ao contrário de `structures: []`, é ERRO e não sinônimo de
 * ausente: aqui as duas escritas conviveriam no mesmo campo e o round-trip
 * pararia de fechar byte a byte.
 *
 * Entrou junto um desempate novo na ORDEM CANÔNICA das paredes, por assinatura
 * de camadas. Sem ele, duas paredes de mesma geometria e mesma espessura total
 * com composições diferentes ficavam em ordem indefinida, e o hash mudava sem a
 * geometria ter mudado.
 */
export const KERNEL_VERSION = 'blueprint-kernel-ts-0.11.0';

/**
 * Tolerância de junção/snap em milímetros.
 *
 * Dois vértices a até esta distância são considerados o mesmo ponto no arranjo
 * planar. Não é preferência de UI: muda o resultado topológico, portanto acompanha
 * a versão do kernel e entra no hash.
 */
export const DEFAULT_TOLERANCE_MM = 5;

/** Maior coordenada aceita, em mm. Além disso os predicados exatos perdem garantia. */
export const MAX_COORD_MM = 1_000_000;

export class KernelError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'KernelError';
  }
}

/**
 * Arredonda para milímetro inteiro com desempate LONGE DE ZERO.
 *
 * `Math.round` desempata para +Infinito (`Math.round(-0.5) === -0`), o que é
 * assimétrico entre um ponto e seu espelho. Meio-longe-de-zero é simétrico e é a
 * convenção que o braço Rust precisa reproduzir para o payload bater — `f64::round`
 * do Rust já é meio-longe-de-zero, então esta escolha alinha as duas linguagens
 * sem nenhuma tabela de conversão.
 */
export function roundToMm(value: number): number {
  if (!Number.isFinite(value)) {
    throw new KernelError('NON_FINITE', `Coordenada não finita: ${value}`);
  }
  // `+ 0` normaliza -0 para 0: -0 e 0 são iguais em ===, mas JSON.stringify os
  // escreve diferente ("0" × "-0") e isso vazaria para o payload canônico.
  return (value < 0 ? -Math.round(-value) : Math.round(value)) + 0;
}

export function isIntegerMm(value: number): boolean {
  return Number.isInteger(value) && Math.abs(value) <= MAX_COORD_MM;
}

export function assertIntegerMm(value: number, field: string): number {
  if (!isIntegerMm(value)) {
    throw new KernelError(
      'NOT_INTEGER_MM',
      `${field} deve ser milímetro inteiro dentro de ±${MAX_COORD_MM}; recebido ${value}`,
    );
  }
  return value + 0;
}

/**
 * Converte da unidade de exibição para o interior do kernel.
 * Só deve ser chamado na borda da aplicação (PRD §9.2).
 */
export function metersToMm(meters: number): number {
  return roundToMm(meters * 1000);
}

export function mmToMeters(mm: number): number {
  return mm / 1000;
}
