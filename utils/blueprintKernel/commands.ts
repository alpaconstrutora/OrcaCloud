/**
 * Comandos, diff e histórico (PRD §12.3).
 *
 * ADR-01: o renderer não é o modelo. Todo gesto vira comando; todo comando é
 * validado pelo kernel e produz um diff. Nada muda o modelo por atribuição direta.
 *
 * IDEMPOTÊNCIA: repetir o mesmo `commandId` não duplica efeito. É o que permite ao
 * cliente reenviar um lote depois de uma queda de rede sem criar parede fantasma.
 */

import { KernelError, assertIntegerMm, roundToMm } from './units';
import { faixaDaEstruturaNaParede } from './sobreposicao';
import {
  type BlueprintModel,
  type CamadaParede,
  type ObjectId,
  type Opening,
  type Wall,
  assertModelInvariants,
  assinaturaDasCamadas,
  clonarCamadas,
  cloneModel,
  somaDasCamadas,
  type BoundaryKind,
  type BoundaryPapel,
  type StructuralKind,
  FORMA_ESTRUTURAL,
  findAgua,
  findBoundary,
  findLevel,
  findStructural,
  findWall,
  ladoOposto,
  nextId,
  nomeDoTipoEstrutural,
  pontosEsperados,
  pontasDeslocadas,
  pontasNoVerticeMovido,
  wallLength,
} from './model';
import {
  type AlinhamentoParede,
  type Point,
  areCollinear,
  interiorPoint,
  pointInPolygon,
  pointsEqual,
} from './geom';
import { recomputeSpaces } from './arrangement';
import { snapshotHash } from './canonical';
import { novoUid } from './identity';

export type Command =
  | { type: 'AddLevel'; name: string; elevationMm: number; defaultHeightMm: number }
  | {
      type: 'AddWall';
      levelId: ObjectId;
      a: Point;
      b: Point;
      thicknessMm: number;
      heightMm: number;
      /**
       * De que lado do eixo estava o traço clicado. `a`/`b` continuam sendo o
       * EIXO já resolvido por `eixoDaParede` — este campo não o desloca, só
       * grava a autoria para quem for mudar a espessura depois. Omitido =
       * `'EIXO'`, o comportamento de sempre. Ver `Wall.alinhamento`.
       */
      alinhamento?: AlinhamentoParede;
    }
  | {
      type: 'AddOpening';
      wallId: ObjectId;
      kind: 'door' | 'window' | 'passage' | 'sliding';
      offsetMm: number;
      widthMm: number;
      heightMm: number;
      sillMm: number;
      /** Omitido = `true`/`false` — o padrão de sempre, para não obrigar todo
       * chamador existente a decidir orientação numa porta nova. */
      hingeAtStart?: boolean;
      swingReversed?: boolean;
      /** Só para `sliding`. Omitido = corre por FORA, que é a forma comum. */
      embutida?: boolean;
    }
  /**
   * Limite sem material. `kind` distingue o anel do LOTE de uma divisa solta —
   * ver `BoundaryKind`. Omitido continua valendo `DIVISA`, para não obrigar o
   * chamador antigo (os testes de ambiente dividido) a decidir sobre terreno.
   */
  | {
      type: 'AddBoundary';
      levelId: ObjectId;
      a: Point;
      b: Point;
      kind?: BoundaryKind;
      papel?: BoundaryPapel | null;
    }
  | { type: 'MoveBoundaryVertex'; boundaryId: ObjectId; end: 'a' | 'b'; to: Point }
  | { type: 'DeleteBoundary'; boundaryId: ObjectId }
  /**
   * Cria um elemento de estrutura. `pontos` já vem com a cardinalidade da forma
   * (1, 2 ou ≥3) — quem monta o gesto é que sabe quando o contorno fechou, e
   * inferir a forma pelo tamanho do array aqui aceitaria em silêncio uma laje
   * de dois vértices como se fosse viga.
   *
   * Os campos que não se aplicam à forma (profundidade numa viga, largura numa
   * laje) são opcionais e nascem em 0 — pela mesma razão que `sillMm` existe em
   * porta: um tipo que bifurca por `kind` espalha o `switch` por todo chamador.
   */
  | {
      type: 'AddStructural';
      levelId: ObjectId;
      kind: StructuralKind;
      pontos: Point[];
      larguraMm?: number;
      profundidadeMm?: number;
      alturaMm: number;
      baseMm?: number;
      circular?: boolean;
      rotacaoDeg?: number;
      rotulo?: string | null;
    }
  /** Campo omitido fica como está — o painel edita uma medida por vez. */
  | {
      type: 'SetStructuralProps';
      structuralId: ObjectId;
      larguraMm?: number;
      profundidadeMm?: number;
      alturaMm?: number;
      baseMm?: number;
      circular?: boolean;
      rotacaoDeg?: number;
      rotulo?: string | null;
    }
  /**
   * Troca o tipo de uma peça já lançada — DENTRO da mesma forma geométrica.
   *
   * Existe pela lição de `SetOpeningKind`: sem ele, quem lançou um pilar e
   * queria uma estaca tem de apagar e refazer, perdendo seção, cota e rótulo já
   * ajustados. E RECUSA a troca que mude a forma (pilar → viga) porque os
   * `pontos` não sobrevivem: um centro não é um eixo, e converter inventaria
   * geometria que ninguém desenhou. A UI oferece só os destinos compatíveis.
   */
  | { type: 'SetStructuralKind'; structuralId: ObjectId; kind: StructuralKind }
  /** Move UM vértice. Espelha `MoveBoundaryVertex`; em `PONTO` reposiciona a peça. */
  | { type: 'MoveStructuralVertex'; structuralId: ObjectId; index: number; to: Point }
  | { type: 'DeleteStructural'; structuralId: ObjectId }
  /**
   * Lança uma ÁGUA de telhado — o polígono em planta mais a regra de caimento.
   *
   * `beiralIndex` nasce em 0 (o primeiro lado desenhado) porque quem contorna
   * uma água costuma começar pelo beiral, que é a linha que ele enxerga na
   * fachada. Trocar depois é um clique no painel, e o desenho mostra a seta.
   */
  | {
      type: 'AddAgua';
      levelId: ObjectId;
      pontos: Point[];
      inclinacaoPct: number;
      beiralIndex?: number;
      baseMm?: number;
      espessuraMm?: number;
    }
  /** Campo omitido fica como está — o painel edita uma medida por vez. */
  | {
      type: 'SetAguaProps';
      aguaId: ObjectId;
      inclinacaoPct?: number;
      beiralIndex?: number;
      baseMm?: number;
      espessuraMm?: number;
    }
  /** Move UM vértice da água. Espelha `MoveStructuralVertex`. */
  | { type: 'MoveAguaVertex'; aguaId: ObjectId; index: number; to: Point }
  | { type: 'DeleteAgua'; aguaId: ObjectId }
  /**
   * Quem CEDE o volume disputado quando dois componentes ocupam o mesmo espaço.
   *
   * Um comando só para parede e para peça de concreto porque a pergunta é a
   * mesma dos dois lados — "este componente abre mão do que divide com o
   * outro?" — e o `id` já diz qual família é. Dois comandos gêmeos obrigariam
   * quem chama a saber o tipo antes de perguntar, para responder o mesmo.
   *
   * O comando grava só a DECISÃO. O volume é recalculado a cada leitura do
   * quantitativo (`sobreposicoesDoModelo`), senão mover o pilar deixaria para
   * trás um desconto obsoleto — que não some da tela, vira número plausível.
   */
  | { type: 'SetCedeSobreposicao'; id: ObjectId; cede: boolean }
  /**
   * CORTA a parede onde a peça de concreto passa: ela deixa de atravessar o
   * pilar e termina na face dele.
   *
   * Pedido do usuário (01/09/2026): *"A parede tem de ser cortada de verdade"*.
   * Diferente de `SetCedeSobreposicao`, que só abate o volume no cálculo, aqui a
   * GEOMETRIA muda — e por isso o desconto sai de graça: a parede fica mais
   * curta, e alvenaria mais curta é menos alvenaria.
   *
   * ⚠️ Só faz sentido com a PONTE ESTRUTURAL do arranjo planar
   * (`pontesEstruturais`). Sem ela, o pedaço removido abre o anel e o ambiente
   * some — medido: sala de 4 × 3 m cai de 12,00 m² para zero.
   */
  | { type: 'CutWallAtStructural'; wallId: ObjectId; structuralId: ObjectId }
  /** Qual recuo se aplica a esta divisa. `null` tira o papel. */
  | { type: 'SetBoundaryPapel'; boundaryId: ObjectId; papel: BoundaryPapel | null }
  /**
   * O que a ESCRITURA diz deste lado: a medida da matrícula e o confrontante.
   *
   * Os dois num comando só porque é assim que se lê uma matrícula — "12,00 m
   * confrontando com a Rua das Acácias" é uma frase, não duas. `null` em
   * qualquer um apaga aquele campo; confrontante em branco vira `null`, para não
   * guardar string vazia que depois se compara com `!== null` e engana.
   */
  | {
      type: 'SetBoundaryEscritura';
      boundaryId: ObjectId;
      medidaMm: number | null;
      confrontante: string | null;
    }
  /** Área do lote na escritura, em mm². `null` tira. */
  | { type: 'SetAreaEscritura'; areaMm2: number | null }
  /**
   * ⚠️ RECUSADO numa parede que tem camadas (`THICKNESS_FROM_LAYERS`): lá a
   * espessura é a SOMA da composição, e usar este comando obrigaria a escolher
   * como redistribuir os milímetros entre as faixas. Escalar proporcionalmente
   * daria espessuras fracionárias e mexeria em material que ninguém mandou
   * mexer — em silêncio, que é a pior forma. Use `SetWallLayers`.
   */
  | { type: 'SetThickness'; wallId: ObjectId; thicknessMm: number }
  /**
   * Troca a COMPOSIÇÃO inteira da parede, e com ela a espessura.
   *
   * ─── UM COMANDO, E NÃO CINCO ────────────────────────────────────────────
   *
   * Adicionar, excluir, duplicar, reordenar e editar camada são todos ESTE
   * comando: a UI monta a lista nova inteira e manda. Cinco comandos
   * granulares custariam caro em três frentes ao mesmo tempo, e a terceira é
   * fatal: `applyBatch` revalida o modelo a cada comando, um gesto viraria
   * vários passos de desfazer, e os estados intermediários seriam INVÁLIDOS —
   * tirar uma camada antes de engrossar outra viola
   * `LAYERS_THICKNESS_MISMATCH` numa edição que, vista como um todo, fecha.
   * É a mesma razão que `TranslateEntities` documenta.
   *
   * ─── A ESPESSURA VEM JUNTO ──────────────────────────────────────────────
   *
   * `thicknessMm` é RECALCULADO como a soma — não é o chamador que informa. Uma
   * espessura passada por fora seria a segunda fonte da verdade sobre a mesma
   * medida, e a primeira coisa a divergir.
   *
   * ⚠️ A geometria NÃO se move sozinha aqui. Mudar a espessura de uma parede
   * traçada pela face exige transladar o eixo para a face escolhida ficar
   * parada — quem chama emite `TranslateEntities` com `manterJuncoes` no MESMO
   * lote, como `mudarEspessura` já faz para `SetThickness`.
   *
   * `camadas: null` volta a parede a homogênea, preservando a espessura atual.
   */
  | { type: 'SetWallLayers'; wallId: ObjectId; camadas: CamadaParede[] | null }
  /**
   * Move UMA ponta de UMA parede.
   *
   * `manterJuncoes` (padrão `false`) leva junto o que estava preso naquela ponta:
   * as pontas de outras paredes/limites que estavam no vértice, e as que
   * repousavam no CORPO da parede movida (o T). Sem ele, o vértice se desprende —
   * que é a semântica CRUA de que `conectarAgora`, `juntarPontas` e o lote de
   * `esticarParede` dependem, e por isso o padrão não pode mudar.
   */
  | {
      type: 'MoveVertex';
      wallId: ObjectId;
      end: 'a' | 'b';
      to: Point;
      manterJuncoes?: boolean;
    }
  /**
   * Desloca um CONJUNTO de paredes e limites de uma vez, rigidamente.
   *
   * Existe em vez de um lote de `MoveVertex` por três motivos independentes,
   * cada um suficiente sozinho:
   *
   * 1. `applyBatch` roda `recomputeSpaces` + `assertModelInvariants` +
   *    `snapshotHash` A CADA comando. Mover 40 paredes seriam 80 recomputações
   *    do arranjo planar num único gesto do usuário.
   * 2. **Os estados intermediários de um lote são inválidos.** `MoveVertex`
   *    mexe numa ponta de cada vez, e com uma ponta andada a parede fica mais
   *    curta — o suficiente para `OPENING_OUT_OF_BOUNDS` recusar o lote inteiro
   *    numa translação que, vista como um todo, não encurta nada. Aqui as duas
   *    pontas andam juntas: o comprimento é preservado por construção, então
   *    nenhuma abertura sai de posição.
   * 3. Um gesto = um passo de desfazer, sem depender de `runBatch` para fingir
   *    atomicidade.
   *
   * As ABERTURAS não precisam de nada: `offsetMm` é relativo à parede que as
   * hospeda, e a parede inteira andou.
   *
   * `manterJuncoes` é a diferença entre MANTER e SOLTAR: ligado, a ponta de um
   * segmento NÃO selecionado que estava presa ao bloco acompanha pela componente
   * do deslocamento paralela ao eixo dela — muda de comprimento, nunca de
   * direção. Desligado, o bloco se desprende, mantendo as próprias medidas.
   * A regra completa, e por que não é a translação crua, está em
   * `pontasDeslocadas`.
   */
  | {
      type: 'TranslateEntities';
      wallIds: ObjectId[];
      /**
       * Limites deslocados no MESMO passo das paredes. Separar em dois comandos
       * quebraria o anel do lote em cada passo intermediário — e é justamente o
       * anel que o `manterJuncoes` precisa enxergar inteiro.
       */
      boundaryIds: ObjectId[];
      /**
       * Estruturas deslocadas no mesmo passo. Elas andam RÍGIDAS: não têm
       * junção com nada (não entram no arranjo planar), então `manterJuncoes`
       * não as alcança e o delta é aplicado a cada vértice sem mais nenhuma
       * regra. Ficarem de fora seria pior do que parece — arrastar uma parede
       * com o pilar embutido deixaria o pilar para trás, no meio do ambiente.
       */
      structuralIds: ObjectId[];
      /**
       * Águas deslocadas junto. Opcional pela razão do `aguaIds` de
       * `DuplicateEntities`, e presente pela razão do `structuralIds` logo
       * acima: arrastar a casa sem levar o telhado o deixaria para trás, no ar.
       */
      aguaIds?: ObjectId[];
      delta: Point;
      manterJuncoes: boolean;
    }
  | { type: 'SplitWall'; wallId: ObjectId; at: Point }
  | { type: 'MergeWalls'; firstId: ObjectId; secondId: ObjectId }
  | { type: 'DeleteWall'; wallId: ObjectId }
  | { type: 'DeleteOpening'; openingId: ObjectId }
  /**
   * Alterna um dos dois eixos do símbolo de porta. Os dois são independentes —
   * ver o comentário de `Opening.hingeAtStart`/`swingReversed` em `model.ts` —
   * então o comando pede QUAL eixo, nunca os dois de uma vez.
   */
  | { type: 'FlipOpening'; openingId: ObjectId; axis: 'hinge' | 'swing' }
  /**
   * Muda o tamanho de uma abertura já inserida. Campo omitido fica como está —
   * o painel edita uma medida de cada vez, e mandar as três a cada tecla faria
   * um comando dizer que mexeu no que ninguém tocou.
   */
  | {
      type: 'SetOpeningSize';
      openingId: ObjectId;
      widthMm?: number;
      heightMm?: number;
      sillMm?: number;
    }
  /**
   * Desliza a abertura ao longo da parede que já a hospeda.
   *
   * NÃO troca de parede: `wallId` fica como está. Mudar de hospedeira é outra
   * operação, com outras perguntas (o que acontece com a orientação da folha
   * quando a parede nova aponta para outro lado?) — e resolver as duas no mesmo
   * comando esconderia a segunda dentro da primeira.
   */
  | { type: 'MoveOpening'; openingId: ObjectId; offsetMm: number }
  /**
   * Troca o TIPO de uma abertura já inserida.
   *
   * Faltava, e a falta era mais cara do que parece: o tipo só podia ser
   * escolhido no seletor ANTES do clique, então quem inseriu uma porta e
   * queria janela tinha de apagar e refazer — perdendo posição, largura,
   * altura e peitoril já ajustados. Com quatro tipos e dois deles novos, era
   * o caminho por onde todo mundo passava.
   *
   * `embutida` só é lida quando o tipo de destino é `sliding`; nos outros ela
   * é zerada, para não guardar uma afirmação sobre bolso numa janela.
   */
  | {
      type: 'SetOpeningKind';
      openingId: ObjectId;
      kind: 'door' | 'window' | 'passage' | 'sliding';
      embutida?: boolean;
    }
  /** Nome vazio remove a etiqueta. */
  | { type: 'NameSpace'; spaceId: ObjectId; name: string }
  /**
   * Renomeia e reposiciona um pavimento. Campo omitido fica como está — o painel
   * edita uma propriedade de cada vez.
   *
   * `elevationMm`/`defaultHeightMm` não tocam nas paredes: cada parede carrega o
   * próprio `heightMm`, e `defaultHeightMm` é só o palpite para a PRÓXIMA parede
   * do nível. Por isso o comando não pode invalidar abertura nenhuma.
   */
  | {
      type: 'SetLevelProps';
      levelId: ObjectId;
      name?: string;
      elevationMm?: number;
      defaultHeightMm?: number;
    }
  /**
   * Remove um pavimento E tudo que vive nele (paredes, aberturas, limites,
   * etiquetas) — cascata. Recusa o ÚLTIMO nível: um modelo sem nível nenhum não
   * tem onde desenhar, e `useBlueprintEditor` recria um "Térreo" no vazio, o que
   * mascararia a remoção.
   */
  | { type: 'RemoveLevel'; levelId: ObjectId }
  /**
   * Cria um pavimento novo com a geometria de outro — o "copiar andar" do CAD.
   *
   * Um passo de histórico, e não um lote de `AddLevel` + N×`AddWall`: a cópia é
   * geometria derivada do modelo, então mora no kernel, testável por golden. Os
   * ids saem do contador determinístico (`nextId`), nunca de `randomUUID`.
   */
  | { type: 'DuplicateLevel'; levelId: ObjectId; novoNome: string; elevationMm: number }
  /**
   * Copia paredes, limites e aberturas para outro lugar — o "colar" do editor.
   *
   * UM comando, e não um lote de `AddWall` + N×`AddOpening`, por duas razões que
   * o lote não alcança:
   *
   * 1. **A abertura precisa do id da parede que ainda não existe.** Num lote,
   *    quem monta os comandos teria de adivinhar o id que `nextId` vai gerar no
   *    passo anterior. Aqui o de-para é interno, como já é em `DuplicateLevel`.
   * 2. **Um gesto = um passo de desfazer.** Colar seis paredes e voltar atrás
   *    seis vezes seria o mesmo defeito que `TranslateEntities` já corrigiu para
   *    o arraste.
   *
   * As aberturas hospedadas em `wallIds` **vêm junto sozinhas** — é o que faz
   * "copiar a parede" trazer a porta e a janela dela. Pedi-las também em
   * `openings` duplicaria cada uma.
   *
   * `openings` é para a abertura AVULSA: a porta copiada sem a parede, que o
   * usuário cola em outra parede qualquer. Por isso ela carrega o hospedeiro e o
   * offset de destino, decididos pela UI (a parede sob o cursor) — `delta` não
   * diz nada sobre onde uma abertura cai, porque o offset dela é medido ao longo
   * do eixo do hospedeiro, não no plano.
   */
  | {
      type: 'DuplicateEntities';
      /**
       * Nível de destino das cópias. É parâmetro, e não o nível de origem, para
       * que colar num pavimento diferente do copiado seja o mesmo comando.
       */
      levelId: ObjectId;
      wallIds: ObjectId[];
      boundaryIds: ObjectId[];
      /** Estruturas copiadas, deslocadas por `delta` como paredes e limites. */
      structuralIds: ObjectId[];
      /**
       * Águas copiadas. OPCIONAL, ao contrário das outras listas: toda chamada
       * existente foi escrita antes do telhado existir, e exigir a lista aqui
       * quebraria as onze delas para dizer `[]`.
       */
      aguaIds?: ObjectId[];
      openings: { openingId: ObjectId; wallId: ObjectId; offsetMm: number }[];
      delta: Point;
    };

export interface Diff {
  created: ObjectId[];
  updated: ObjectId[];
  deleted: ObjectId[];
  /** split/merge: quem veio de quem. Preserva linhagem quando o ID muda. */
  ancestry: Record<ObjectId, ObjectId[]>;
}

export interface CommandResult {
  model: BlueprintModel;
  diff: Diff;
  hash: string;
}

function emptyDiff(): Diff {
  return { created: [], updated: [], deleted: [], ancestry: {} };
}

/**
 * Aplica um comando sobre uma CÓPIA do modelo.
 *
 * Copiar antes de validar é o que garante que um comando rejeitado não deixa o
 * modelo pela metade: ou o diff inteiro entra, ou nada muda.
 */
export function applyCommand(model: BlueprintModel, command: Command): CommandResult {
  const next = cloneModel(model);
  const diff = emptyDiff();

  switch (command.type) {
    case 'AddLevel': {
      const id = nextId(next, 'lvl');
      next.levels.push({
        id,
        uid: novoUid(),
        name: command.name,
        elevationMm: command.elevationMm,
        defaultHeightMm: command.defaultHeightMm,
      });
      diff.created.push(id);
      break;
    }

    case 'AddWall': {
      if (pointsEqual(command.a, command.b)) {
        throw new KernelError('DEGENERATE_WALL', 'Parede de comprimento zero');
      }
      const id = nextId(next, 'wal');
      next.walls.push({
        id,
        uid: novoUid(),
        levelId: command.levelId,
        a: { ...command.a },
        b: { ...command.b },
        thicknessMm: command.thicknessMm,
        heightMm: command.heightMm,
        // `'EIXO'` não é gravado: é o padrão, e emitir a chave em toda parede
        // faria o payload canônico de TODO desenho antigo crescer sem que nada
        // no desenho tivesse mudado. Mesma razão de `areaEscrituraMm2`.
        ...(command.alinhamento && command.alinhamento !== 'EIXO'
          ? { alinhamento: command.alinhamento }
          : {}),
      });
      diff.created.push(id);
      break;
    }

    case 'AddOpening': {
      const wall = findWall(next, command.wallId);
      const limit = wallLength(wall);
      if (command.offsetMm < 0 || command.offsetMm + command.widthMm > limit) {
        throw new KernelError(
          'OPENING_OUT_OF_BOUNDS',
          `Abertura ${command.offsetMm}+${command.widthMm} não cabe em ${limit} mm`,
        );
      }
      const id = nextId(next, 'opn');
      next.openings.push({
        id,
        uid: novoUid(),
        wallId: command.wallId,
        kind: command.kind,
        offsetMm: command.offsetMm,
        widthMm: command.widthMm,
        heightMm: command.heightMm,
        sillMm: command.sillMm,
        hingeAtStart: command.hingeAtStart ?? true,
        swingReversed: command.swingReversed ?? false,
        // Por FORA é o padrão: é a forma comum, e o bolso exige parede
        // preparada — quem tem bolso sabe que tem, quem não pensou no assunto
        // não tem.
        embutida: command.embutida ?? false,
      });
      diff.created.push(id);
      break;
    }

    case 'AddBoundary': {
      // A MESMA guarda de `AddWall`. Faltava enquanto nenhuma UI criava limite:
      // agora que se desenha terreno clicando, dois cliques no mesmo vértice
      // produziriam uma aresta nula, que o arranjo planar engole sem erro — o
      // lado sumiria do anel e a área do lote sairia menor, calada.
      if (pointsEqual(command.a, command.b)) {
        throw new KernelError('DEGENERATE_BOUNDARY', 'Limite de comprimento zero');
      }
      findLevel(next, command.levelId);
      const id = nextId(next, 'bnd');
      next.boundaries.push({
        id,
        uid: novoUid(),
        levelId: command.levelId,
        a: { ...command.a },
        b: { ...command.b },
        kind: command.kind ?? 'DIVISA',
        papel: command.papel ?? null,
      });
      diff.created.push(id);
      break;
    }

    case 'MoveBoundaryVertex': {
      const boundary = findBoundary(next, command.boundaryId);
      const outra = command.end === 'a' ? boundary.b : boundary.a;
      if (pointsEqual(command.to, outra)) {
        throw new KernelError('DEGENERATE_BOUNDARY', 'Mover o vértice colapsaria o limite');
      }
      boundary[command.end] = { ...command.to };
      diff.updated.push(boundary.id);
      // Sem a checagem de abertura que `MoveVertex` faz: limite não hospeda
      // porta nem janela. Encurtá-lo não pode deixar nada pendurado fora.
      break;
    }

    case 'DeleteBoundary': {
      const boundary = findBoundary(next, command.boundaryId);
      next.boundaries = next.boundaries.filter((b) => b.id !== boundary.id);
      diff.deleted.push(boundary.id);
      break;
    }

    case 'SetBoundaryPapel': {
      const boundary = findBoundary(next, command.boundaryId);
      boundary.papel = command.papel;
      diff.updated.push(boundary.id);
      break;
    }

    // ── Estrutura ────────────────────────────────────────────────────────────

    case 'AddStructural': {
      findLevel(next, command.levelId);

      const forma = FORMA_ESTRUTURAL[command.kind];
      if (!forma) {
        throw new KernelError('BAD_STRUCTURAL_KIND', `Tipo estrutural desconhecido: ${command.kind}`);
      }

      // A cardinalidade é conferida AQUI, e não só nos invariantes, para a
      // mensagem falar do gesto que falhou ("a laje precisa de 3 vértices") em
      // vez de citar um id que o usuário nunca viu.
      const minimo = pontosEsperados(command.kind);
      const ok = forma === 'AREA' ? command.pontos.length >= minimo : command.pontos.length === minimo;
      if (!ok) {
        throw new KernelError(
          'BAD_STRUCTURAL_POINTS',
          `${nomeDoTipoEstrutural(command.kind)} precisa de ${forma === 'AREA' ? `pelo menos ${minimo}` : minimo} vértice(s); recebeu ${command.pontos.length}`,
        );
      }

      const pontos = command.pontos.map((p, i) => ({
        x: assertIntegerMm(roundToMm(p.x), `pontos[${i}].x`),
        y: assertIntegerMm(roundToMm(p.y), `pontos[${i}].y`),
      }));

      if (forma === 'LINHA' && pointsEqual(pontos[0], pontos[1])) {
        throw new KernelError('DEGENERATE_STRUCTURAL', 'Estrutura linear de comprimento zero');
      }

      const id = nextId(next, 'str');
      next.structures.push({
        id,
        uid: novoUid(),
        levelId: command.levelId,
        kind: command.kind,
        pontos,
        larguraMm: command.larguraMm ?? 0,
        profundidadeMm: command.profundidadeMm ?? 0,
        alturaMm: command.alturaMm,
        baseMm: command.baseMm ?? 0,
        circular: command.circular ?? false,
        rotacaoDeg: command.rotacaoDeg ?? 0,
        rotulo: command.rotulo?.trim() ? command.rotulo.trim() : null,
      });
      diff.created.push(id);
      break;
    }

    case 'SetStructuralProps': {
      const s = findStructural(next, command.structuralId);
      if (command.larguraMm !== undefined) s.larguraMm = command.larguraMm;
      if (command.profundidadeMm !== undefined) s.profundidadeMm = command.profundidadeMm;
      if (command.alturaMm !== undefined) s.alturaMm = command.alturaMm;
      if (command.baseMm !== undefined) s.baseMm = command.baseMm;
      if (command.circular !== undefined) s.circular = command.circular;
      if (command.rotacaoDeg !== undefined) {
        // Normaliza para [0, 360) — sem isso, girar dez vezes guardaria 3600 no
        // payload canônico e duas peças visualmente idênticas teriam hashes
        // diferentes.
        const g = Math.round(command.rotacaoDeg) % 360;
        s.rotacaoDeg = g < 0 ? g + 360 : g;
      }
      // String vazia vira `null`: guardar '' faria `rotulo !== null` mentir, e
      // a tela mostraria um rótulo em branco onde não há rótulo nenhum.
      if (command.rotulo !== undefined) {
        s.rotulo = command.rotulo?.trim() ? command.rotulo.trim() : null;
      }
      diff.updated.push(s.id);
      break;
    }

    case 'CutWallAtStructural': {
      const wall = findWall(next, command.wallId);
      const peca = (next.structures ?? []).find((s) => s.id === command.structuralId);
      if (!peca) {
        throw new KernelError('NOT_FOUND', `Peça ${command.structuralId} não existe`);
      }

      const faixa = faixaDaEstruturaNaParede(wall, peca);
      if (!faixa) {
        throw new KernelError(
          'NO_OVERLAP',
          'A peça não atravessa esta parede — não há o que cortar',
        );
      }

      const comp = wallLength(wall);
      const x0 = Math.max(0, Math.round(faixa.x0));
      const x1 = Math.min(comp, Math.round(faixa.x1));
      if (x1 <= x0) {
        throw new KernelError('NO_OVERLAP', 'A peça toca a parede sem atravessá-la');
      }

      // Ponto sobre o eixo a `t` mm de `a`.
      const ux = (wall.b.x - wall.a.x) / comp;
      const uy = (wall.b.y - wall.a.y) / comp;
      const sobreOEixo = (t: number): Point => ({
        x: roundToMm(wall.a.x + ux * t),
        y: roundToMm(wall.a.y + uy * t),
      });

      const daParede = next.openings.filter((o) => o.wallId === wall.id);
      // ⚠️ A CONFERÊNCIA VEM ANTES DE QUALQUER MUTAÇÃO. Abertura que ficaria
      // partida — ou que mora inteira no pedaço removido — aborta o corte. Some
      // uma porta em silêncio é pior do que não cortar: o desenho continua
      // parecendo certo e o orçamento perde uma esquadria.
      for (const o of daParede) {
        const oFim = o.offsetMm + o.widthMm;
        const foraDoVao = oFim <= x0 || o.offsetMm >= x1;
        if (!foraDoVao) {
          throw new KernelError(
            'CUT_THROUGH_OPENING',
            `O corte atravessa a abertura ${o.id}`,
          );
        }
      }

      const sobraInicio = x0 > 0;
      const sobraFim = x1 < comp;

      // A peça cobre a parede inteira: não sobra alvenaria nenhuma.
      if (!sobraInicio && !sobraFim) {
        next.openings = next.openings.filter((o) => o.wallId !== wall.id);
        next.walls = next.walls.filter((w) => w.id !== wall.id);
        for (const o of daParede) diff.deleted.push(o.id);
        diff.deleted.push(wall.id);
        break;
      }

      // Sobra UM trecho: encurta no lugar, sem criar id novo. Manter a mesma
      // parede preserva o que estiver pendurado nela (o `alinhamento`, a decisão
      // de sobreposição) e não polui o histórico com uma peça "nova" que é a
      // mesma de antes.
      if (sobraInicio !== sobraFim) {
        if (sobraInicio) wall.b = sobreOEixo(x0);
        else {
          wall.a = sobreOEixo(x1);
          for (const o of next.openings) {
            if (o.wallId === wall.id) o.offsetMm -= x1;
          }
        }
        diff.updated.push(wall.id);
        break;
      }

      // Sobram os DOIS trechos: vira duas paredes, com o vão do concreto entre
      // elas. Mesmo idioma de `SplitWall` — ids novos, ancestralidade nos dois.
      const primeiroId = nextId(next, 'wal');
      const segundoId = nextId(next, 'wal');
      // IDENTIDADE: o trecho que contém `a` HERDA o uid (pelo spread); o outro
      // nasce com uid novo. Mesma regra de `SplitWall`, pelo mesmo motivo — ver
      // o comentário lá.
      const primeiro: Wall = { ...wall, id: primeiroId, a: { ...wall.a }, b: sobreOEixo(x0) };
      const segundo: Wall = {
        ...wall,
        id: segundoId,
        uid: novoUid(),
        a: sobreOEixo(x1),
        b: { ...wall.b },
      };

      next.walls = next.walls.filter((w) => w.id !== wall.id);
      next.walls.push(primeiro, segundo);
      next.openings = next.openings.map((o) => {
        if (o.wallId !== wall.id) return o;
        return o.offsetMm + o.widthMm <= x0
          ? { ...o, wallId: primeiroId }
          : { ...o, wallId: segundoId, offsetMm: o.offsetMm - x1 };
      });

      diff.deleted.push(wall.id);
      diff.created.push(primeiroId, segundoId);
      diff.ancestry[primeiroId] = [wall.id];
      diff.ancestry[segundoId] = [wall.id];
      break;
    }

    case 'SetCedeSobreposicao': {
      const alvo =
        next.walls.find((w) => w.id === command.id) ??
        (next.structures ?? []).find((s) => s.id === command.id);
      if (!alvo) {
        throw new KernelError('NOT_FOUND', `Componente ${command.id} não existe`);
      }
      // `false` APAGA a chave em vez de gravá-la. `cedeSobreposicao: false` e a
      // ausência significam a mesma coisa, e emitir a chave acrescentaria peso
      // ao payload canônico de todo desenho que passasse por aqui uma vez.
      if (command.cede) alvo.cedeSobreposicao = true;
      else delete alvo.cedeSobreposicao;
      diff.updated.push(alvo.id);
      break;
    }

    case 'SetStructuralKind': {
      const s = findStructural(next, command.structuralId);
      const destino = FORMA_ESTRUTURAL[command.kind];
      if (!destino) {
        throw new KernelError('BAD_STRUCTURAL_KIND', `Tipo estrutural desconhecido: ${command.kind}`);
      }
      if (destino !== FORMA_ESTRUTURAL[s.kind]) {
        throw new KernelError(
          'STRUCTURAL_SHAPE_MISMATCH',
          `Não dá para converter ${nomeDoTipoEstrutural(s.kind)} em ${nomeDoTipoEstrutural(command.kind)}: as formas geométricas são diferentes`,
        );
      }
      s.kind = command.kind;
      diff.updated.push(s.id);
      break;
    }

    case 'MoveStructuralVertex': {
      const s = findStructural(next, command.structuralId);
      if (command.index < 0 || command.index >= s.pontos.length) {
        throw new KernelError(
          'BAD_STRUCTURAL_POINTS',
          `Vértice ${command.index} fora de ${s.id} (${s.pontos.length} vértices)`,
        );
      }
      const to = {
        x: assertIntegerMm(roundToMm(command.to.x), 'to.x'),
        y: assertIntegerMm(roundToMm(command.to.y), 'to.y'),
      };
      // Colapsar o eixo da viga é o mesmo defeito que `MoveBoundaryVertex`
      // recusa no limite: a peça continua na tela e o volume vai a zero.
      if (FORMA_ESTRUTURAL[s.kind] === 'LINHA') {
        const outra = s.pontos[command.index === 0 ? 1 : 0];
        if (pointsEqual(to, outra)) {
          throw new KernelError('DEGENERATE_STRUCTURAL', 'Mover o vértice colapsaria a peça');
        }
      }
      s.pontos[command.index] = to;
      diff.updated.push(s.id);
      break;
    }

    case 'DeleteStructural': {
      const s = findStructural(next, command.structuralId);
      next.structures = next.structures.filter((e) => e.id !== s.id);
      diff.deleted.push(s.id);
      break;
    }

    // ── Telhado ──────────────────────────────────────────────────────────────

    case 'AddAgua': {
      findLevel(next, command.levelId);

      // A cardinalidade é conferida AQUI, e não só nos invariantes, pela razão
      // de `AddStructural`: a mensagem tem de falar do gesto que falhou, não
      // citar um id que o usuário nunca viu.
      if (command.pontos.length < 3) {
        throw new KernelError(
          'BAD_ROOF_POINTS',
          `A água precisa de pelo menos 3 vértices; recebeu ${command.pontos.length}`,
        );
      }

      const pontos = command.pontos.map((p, i) => ({
        x: assertIntegerMm(roundToMm(p.x), `pontos[${i}].x`),
        y: assertIntegerMm(roundToMm(p.y), `pontos[${i}].y`),
      }));

      const beiral = command.beiralIndex ?? 0;
      if (!Number.isInteger(beiral) || beiral < 0 || beiral >= pontos.length) {
        throw new KernelError(
          'BAD_ROOF_EDGE',
          `Lado ${beiral} não existe num polígono de ${pontos.length} lados`,
        );
      }

      const id = nextId(next, 'agu');
      next.roofs = [
        ...(next.roofs ?? []),
        {
          id,
          uid: novoUid(),
          levelId: command.levelId,
          pontos,
          beiralIndex: beiral,
          inclinacaoPct: command.inclinacaoPct,
          baseMm: command.baseMm ?? 0,
          // 120 mm é o pacote telha + trama de uma cobertura cerâmica comum. É
          // ponto de partida editável, não afirmação: o painel mostra o campo.
          espessuraMm: command.espessuraMm ?? 120,
        },
      ];
      diff.created.push(id);
      break;
    }

    case 'SetAguaProps': {
      const agua = findAgua(next, command.aguaId);
      if (command.inclinacaoPct !== undefined) agua.inclinacaoPct = command.inclinacaoPct;
      if (command.baseMm !== undefined) agua.baseMm = assertIntegerMm(roundToMm(command.baseMm), 'baseMm');
      if (command.espessuraMm !== undefined) {
        agua.espessuraMm = assertIntegerMm(roundToMm(command.espessuraMm), 'espessuraMm');
      }
      if (command.beiralIndex !== undefined) agua.beiralIndex = command.beiralIndex;
      diff.updated.push(agua.id);
      break;
    }

    case 'MoveAguaVertex': {
      const agua = findAgua(next, command.aguaId);
      if (command.index < 0 || command.index >= agua.pontos.length) {
        throw new KernelError(
          'BAD_ROOF_POINTS',
          `Vértice ${command.index} não existe em ${agua.id}`,
        );
      }
      agua.pontos[command.index] = {
        x: assertIntegerMm(roundToMm(command.to.x), 'to.x'),
        y: assertIntegerMm(roundToMm(command.to.y), 'to.y'),
      };
      diff.updated.push(agua.id);
      break;
    }

    case 'DeleteAgua': {
      const agua = findAgua(next, command.aguaId);
      next.roofs = (next.roofs ?? []).filter((r) => r.id !== agua.id);
      diff.deleted.push(agua.id);
      break;
    }

    case 'SetBoundaryEscritura': {
      const boundary = findBoundary(next, command.boundaryId);
      boundary.medidaEscrituraMm =
        command.medidaMm === null ? null : assertIntegerMm(command.medidaMm, 'medidaEscrituraMm');
      // Espaço em volta some, e o que sobrar vazio vira `null`. String vazia
      // guardada passaria por "informado" em toda checagem de presença e
      // desenharia uma coluna de confrontantes cheia de nada.
      const texto = command.confrontante?.trim() ?? '';
      boundary.confrontante = texto === '' ? null : texto;
      diff.updated.push(boundary.id);
      break;
    }

    case 'SetAreaEscritura': {
      next.areaEscrituraMm2 = command.areaMm2;
      // Sem `diff.updated`: a área da escritura é do LOTE, não de um objeto com
      // id. Empurrar um id inventado aqui faria a trilha de auditoria apontar
      // para algo que não existe.
      break;
    }

    case 'SetThickness': {
      const wall = findWall(next, command.wallId);
      // Numa parede com composição a espessura é DERIVADA. Recusar em vez de
      // redistribuir: escalar as faixas produziria milímetro fracionário e
      // mexeria em material que ninguém mandou mexer, calado. Ver o comentário
      // do comando.
      if (wall.camadas) {
        throw new KernelError(
          'THICKNESS_FROM_LAYERS',
          `A espessura de ${wall.id} vem das camadas — edite a composição`,
        );
      }
      wall.thicknessMm = command.thicknessMm;
      diff.updated.push(wall.id);
      break;
    }

    case 'SetWallLayers': {
      const wall = findWall(next, command.wallId);

      if (command.camadas === null) {
        // Volta a homogênea PRESERVANDO a espessura: as camadas somavam
        // `thicknessMm` (invariante), então largar a decomposição não muda nada
        // de geometria — nenhum canto se mexe, nenhum ambiente muda de área.
        delete wall.camadas;
      } else {
        // Cópia profunda: o array vem de fora (da UI), e guardá-lo por
        // referência deixaria quem o montou capaz de reescrever o modelo por
        // baixo do histórico.
        wall.camadas = clonarCamadas(command.camadas);
        // A soma MANDA. `assertModelInvariants` confere logo em seguida e
        // recusa camada de espessura zero ou negativa — aqui não se valida de
        // novo, para não haver duas cópias da mesma regra.
        wall.thicknessMm = somaDasCamadas(command.camadas);
      }

      diff.updated.push(wall.id);
      break;
    }

    case 'MoveVertex': {
      const wall = findWall(next, command.wallId);
      const other = command.end === 'a' ? wall.b : wall.a;
      if (pointsEqual(command.to, other)) {
        throw new KernelError('DEGENERATE_WALL', 'Mover o vértice colapsaria a parede');
      }

      // O VÉRTICE COMO ESTAVA, e o corpo como fica. A vizinhança é procurada no
      // lugar antigo — no novo é justamente onde ela não está.
      const antes = { ...wall[command.end] };
      const corpoNovo =
        command.end === 'a' ? { a: { ...command.to }, b: wall.b } : { a: wall.a, b: { ...command.to } };

      if (command.manterJuncoes) {
        const acompanham = pontasNoVerticeMovido(
          [...next.walls, ...next.boundaries],
          wall.id,
          antes,
          command.to,
          corpoNovo,
        );
        for (const alvo of [...next.walls, ...next.boundaries]) {
          const destino = acompanham.get(alvo.id);
          if (!destino) continue;
          alvo.a = { x: assertIntegerMm(destino.a.x, 'x'), y: assertIntegerMm(destino.a.y, 'y') };
          alvo.b = { x: assertIntegerMm(destino.b.x, 'x'), y: assertIntegerMm(destino.b.y, 'y') };
          diff.updated.push(alvo.id);
        }
      }

      wall[command.end] = { ...command.to };
      diff.updated.push(wall.id);

      // §9.1: mexer na parede hospedeira pode invalidar a abertura. Erro explícito
      // é melhor que silenciosamente deixar a abertura pendurada fora da parede.
      // Com `manterJuncoes` as VIZINHAS também mudaram de comprimento, então a
      // checagem tem de cobrir todas as paredes tocadas, não só a movida.
      const tocadas = new Set(diff.updated);
      for (const alvo of next.walls) {
        if (!tocadas.has(alvo.id)) continue;
        const newLimit = wallLength(alvo);
        for (const opening of next.openings.filter((o) => o.wallId === alvo.id)) {
          if (opening.offsetMm + opening.widthMm > newLimit) {
            throw new KernelError(
              'OPENING_OUT_OF_BOUNDS',
              `Encurtar ${alvo.id} deixaria a abertura ${opening.id} fora da parede`,
            );
          }
        }
      }
      break;
    }

    case 'TranslateEntities': {
      const estruturaIds = command.structuralIds ?? [];
      const aguaIds = command.aguaIds ?? [];
      if (
        command.wallIds.length === 0 &&
        command.boundaryIds.length === 0 &&
        estruturaIds.length === 0 &&
        aguaIds.length === 0
      ) {
        throw new KernelError('EMPTY_SELECTION', 'Nada para deslocar');
      }

      const dx = assertIntegerMm(roundToMm(command.delta.x), 'delta.x');
      const dy = assertIntegerMm(roundToMm(command.delta.y), 'delta.y');

      // `findWall`/`findBoundary` lançam em id inexistente — resolver TODOS
      // antes de mexer em qualquer um é o que garante que um id errado no meio
      // da lista não deixe metade do conjunto deslocada.
      command.wallIds.forEach((id) => findWall(next, id));
      command.boundaryIds.forEach((id) => findBoundary(next, id));
      const estruturas = estruturaIds.map((id) => findStructural(next, id));

      // PAREDES E LIMITES NA MESMA CONTA. Rodar duas vezes, uma para cada
      // família, faria a vizinhança de um tipo não enxergar o outro: arrastar um
      // bloco de paredes com "esticar" deixaria a divisa encostada nele para
      // trás, o anel do lote abriria e o ambiente derivado sumiria sem erro.
      // `soltas` é sinal de UI (a prévia desenha o anel de alerta), não regra de
      // modelo: aqui só interessam os destinos.
      const { destinos } = pontasDeslocadas(
        [...next.walls, ...next.boundaries],
        [...command.wallIds, ...command.boundaryIds],
        { x: dx, y: dy },
        command.manterJuncoes,
      );

      const inteiro = (v: number) => assertIntegerMm(v, 'coordenada deslocada');
      for (const alvo of [...next.walls, ...next.boundaries]) {
        const destino = destinos.get(alvo.id);
        if (!destino) continue;
        alvo.a = { x: inteiro(destino.a.x), y: inteiro(destino.a.y) };
        alvo.b = { x: inteiro(destino.b.x), y: inteiro(destino.b.y) };
        diff.updated.push(alvo.id);
      }

      // Estrutura anda RÍGIDA, fora de `pontasDeslocadas`: ela não tem junção
      // com nada (não entra no arranjo planar), então não há vizinha para
      // esticar nem ponta para soltar. Todo vértice recebe o mesmo delta.
      for (const s of estruturas) {
        s.pontos = s.pontos.map((p) => ({
          x: inteiro(p.x + dx),
          y: inteiro(p.y + dy),
        }));
        diff.updated.push(s.id);
      }

      // Água anda rígida pelo mesmo motivo da estrutura: não tem junção com
      // nada. `beiralIndex` é índice de lado e acompanha os vértices sem
      // precisar de ajuste — o lado continua sendo o mesmo lado.
      for (const id of aguaIds) {
        const agua = findAgua(next, id);
        agua.pontos = agua.pontos.map((p) => ({
          x: inteiro(p.x + dx),
          y: inteiro(p.y + dy),
        }));
        diff.updated.push(agua.id);
      }

      // Só as VIZINHAS podem ter mudado de comprimento — as selecionadas
      // andaram rígidas. `assertModelInvariants` no fim de `applyCommand` cobre
      // a abertura que ficaria fora da parede, e como a cópia é feita antes de
      // validar, o modelo original fica intacto quando isso acontece.
      break;
    }

    case 'SplitWall': {
      const wall = findWall(next, command.wallId);
      if (!areCollinear(wall.a, wall.b, command.at)) {
        throw new KernelError('SPLIT_OFF_AXIS', 'Ponto de divisão fora do eixo da parede');
      }
      if (pointsEqual(command.at, wall.a) || pointsEqual(command.at, wall.b)) {
        throw new KernelError('SPLIT_AT_ENDPOINT', 'Divisão coincide com uma ponta');
      }

      const firstId = nextId(next, 'wal');
      const secondId = nextId(next, 'wal');
      // Os dois fragmentos herdam a MESMA composição — dividir uma parede não
      // muda de que ela é feita —, mas cada um com a sua CÓPIA: `...wall` copia
      // a referência do array, e as duas metades ficariam com a mesma lista.
      const first: Wall = {
        ...wall,
        id: firstId,
        a: { ...wall.a },
        b: { ...command.at },
        ...(wall.camadas ? { camadas: clonarCamadas(wall.camadas)! } : {}),
      };
      // IDENTIDADE: `first` HERDA o uid da parede original (pelo spread) e
      // `second` nasce com um novo. É `first`, e não "a metade maior", porque é
      // o fragmento que preservou a origem `a`, o sentido `a → b` e, com eles,
      // os `offsetMm` das aberturas intactos — para o mundo de fora (IFC,
      // cronograma) ele é a mesma parede, encurtada. "A maior" seria ambígua no
      // corte ao meio e dependeria de onde o usuário clicou.
      const second: Wall = {
        ...wall,
        id: secondId,
        uid: novoUid(),
        a: { ...command.at },
        b: { ...wall.b },
        ...(wall.camadas ? { camadas: clonarCamadas(wall.camadas)! } : {}),
      };

      next.walls = next.walls.filter((w) => w.id !== wall.id);
      next.walls.push(first, second);

      // Cada abertura vai para o fragmento que a contém, com offset recalculado.
      const cutAt = Math.round(
        Math.sqrt((command.at.x - wall.a.x) ** 2 + (command.at.y - wall.a.y) ** 2),
      );
      const rehosted: Opening[] = [];
      for (const opening of next.openings) {
        if (opening.wallId !== wall.id) {
          rehosted.push(opening);
          continue;
        }
        if (opening.offsetMm + opening.widthMm <= cutAt) {
          rehosted.push({ ...opening, wallId: firstId });
        } else if (opening.offsetMm >= cutAt) {
          rehosted.push({ ...opening, wallId: secondId, offsetMm: opening.offsetMm - cutAt });
        } else {
          throw new KernelError(
            'SPLIT_THROUGH_OPENING',
            `A divisão atravessa a abertura ${opening.id}`,
          );
        }
      }
      next.openings = rehosted;

      diff.deleted.push(wall.id);
      diff.created.push(firstId, secondId);
      diff.ancestry[firstId] = [wall.id];
      diff.ancestry[secondId] = [wall.id];
      break;
    }

    case 'MergeWalls': {
      const first = findWall(next, command.firstId);
      const second = findWall(next, command.secondId);

      if (first.levelId !== second.levelId) {
        throw new KernelError('MERGE_CROSS_LEVEL', 'Paredes em níveis diferentes');
      }
      if (first.thicknessMm !== second.thicknessMm) {
        throw new KernelError('MERGE_THICKNESS_MISMATCH', 'Espessuras diferentes');
      }
      // A COMPOSIÇÃO também tem de bater, e a checagem de espessura não cobre
      // isto: 25+140+25 e 190 homogênea somam o mesmo, e uma delas é bloco com
      // reboco e a outra é concreto. Unir sem conferir escolheria a composição
      // da `first` em silêncio e apagaria a da `second` — um material sumindo do
      // orçamento sem nada na tela dizendo que sumiu.
      if (assinaturaDasCamadas(first.camadas) !== assinaturaDasCamadas(second.camadas)) {
        throw new KernelError('MERGE_LAYERS_MISMATCH', 'Composições de camadas diferentes');
      }
      if (!areCollinear(first.a, first.b, second.a) || !areCollinear(first.a, first.b, second.b)) {
        throw new KernelError('MERGE_NOT_COLLINEAR', 'Paredes não são colineares');
      }

      // Encontrar a ponta compartilhada e montar o eixo resultante.
      let start: Point | null = null;
      let end: Point | null = null;
      if (pointsEqual(first.b, second.a)) {
        start = first.a;
        end = second.b;
      } else if (pointsEqual(first.a, second.b)) {
        start = second.a;
        end = first.b;
      } else if (pointsEqual(first.a, second.a)) {
        start = first.b;
        end = second.b;
      } else if (pointsEqual(first.b, second.b)) {
        start = first.a;
        end = second.a;
      }
      if (!start || !end) {
        throw new KernelError('MERGE_NOT_ADJACENT', 'Paredes não compartilham uma ponta');
      }

      const mergedId = nextId(next, 'wal');
      next.walls = next.walls.filter((w) => w.id !== first.id && w.id !== second.id);

      // O LADO DO TRAÇO ACOMPANHA O SENTIDO, como o offset das aberturas logo
      // abaixo — é a mesma pergunta ("a `first` foi percorrida ao contrário?") e
      // tem de ter a mesma resposta. Só o caso `first.a === second.a` inverte a
      // `first`, e ali a face que era à DIREITA passa a estar à ESQUERDA do
      // sentido novo. Sem isto, unir duas paredes viraria a face do avesso e a
      // próxima troca de espessura andaria para o lado errado.
      const primeiraInvertida = !pointsEqual(start, first.a);
      const alinhamentoUnido = primeiraInvertida
        ? ladoOposto(first.alinhamento)
        : (first.alinhamento ?? 'EIXO');

      // A ORDEM DAS CAMADAS ACOMPANHA O SENTIDO, pela mesma razão do lado do
      // traço logo acima: a composição é gravada da face ESQUERDA para a
      // DIREITA relativas a `a → b`, então inverter o sentido troca as duas
      // faces de lugar. Sem isto, unir duas paredes poria o reboco externo do
      // lado de dentro — e como os dois rebocos costumam ter a mesma espessura,
      // o desenho continuaria plausível e ninguém veria.
      const camadasUnidas = primeiraInvertida
        ? clonarCamadas(first.camadas)?.reverse()
        : clonarCamadas(first.camadas);

      next.walls.push({
        id: mergedId,
        // IDENTIDADE: a parede unida continua sendo a `first` para o mundo de
        // fora — o uid da `second` some com ela. Simétrico ao `SplitWall`, em
        // que `first` é quem herda.
        uid: first.uid,
        levelId: first.levelId,
        a: { ...start },
        b: { ...end },
        thicknessMm: first.thicknessMm,
        heightMm: first.heightMm,
        ...(alinhamentoUnido !== 'EIXO' ? { alinhamento: alinhamentoUnido } : {}),
        ...(camadasUnidas ? { camadas: camadasUnidas } : {}),
      });

      // Reancorar aberturas medindo o offset a partir da nova origem.
      const firstLen = wallLength(first);
      next.openings = next.openings.map((o) => {
        if (o.wallId !== first.id && o.wallId !== second.id) return o;
        const fromFirst = o.wallId === first.id;
        const flipped = fromFirst ? !pointsEqual(start!, first.a) : !pointsEqual(start!, second.a);
        const base = fromFirst ? 0 : firstLen;
        const own = flipped
          ? (fromFirst ? firstLen : wallLength(second)) - o.offsetMm - o.widthMm
          : o.offsetMm;
        return { ...o, wallId: mergedId, offsetMm: base + own };
      });

      diff.deleted.push(first.id, second.id);
      diff.created.push(mergedId);
      diff.ancestry[mergedId] = [first.id, second.id];
      break;
    }

    case 'DeleteOpening': {
      const opening = next.openings.find((o) => o.id === command.openingId);
      if (!opening) {
        throw new KernelError('OPENING_NOT_FOUND', `Abertura inexistente: ${command.openingId}`);
      }
      next.openings = next.openings.filter((o) => o.id !== opening.id);
      diff.deleted.push(opening.id);
      break;
    }

    case 'SetOpeningKind': {
      const opening = next.openings.find((o) => o.id === command.openingId);
      if (!opening) {
        throw new KernelError('OPENING_NOT_FOUND', `Abertura inexistente: ${command.openingId}`);
      }
      // Posição e medidas ficam: trocar o tipo é dizer O QUE é a abertura, não
      // onde ela está nem quanto ela mede. Zerar isso obrigaria a refazer o
      // ajuste — exatamente o que este comando existe para evitar.
      next.openings = next.openings.map((o) =>
        o.id === opening.id
          ? {
              ...o,
              kind: command.kind,
              embutida: command.kind === 'sliding' ? (command.embutida ?? o.embutida) : false,
            }
          : o,
      );
      diff.updated.push(opening.id);
      break;
    }

    case 'SetOpeningSize': {
      const opening = next.openings.find((o) => o.id === command.openingId);
      if (!opening) {
        throw new KernelError('OPENING_NOT_FOUND', `Abertura inexistente: ${command.openingId}`);
      }
      const wall = findWall(next, opening.wallId);

      const largura = command.widthMm ?? opening.widthMm;
      const altura = command.heightMm ?? opening.heightMm;
      const peitoril = command.sillMm ?? opening.sillMm;

      // Recusar ANTES de gravar, com a medida no texto. `assertModelInvariants`
      // pegaria os mesmos casos no fim do comando, mas a mensagem dela fala de
      // um id de abertura — aqui dá para dizer quanto sobrou, que é o que a
      // pessoa precisa saber para escolher outro número.
      if (largura <= 0) {
        throw new KernelError('BAD_OPENING_WIDTH', 'Largura tem que ser maior que zero');
      }
      if (altura <= 0) {
        throw new KernelError('BAD_OPENING_HEIGHT', 'Altura tem que ser maior que zero');
      }
      if (peitoril < 0) {
        throw new KernelError('BAD_SILL', 'Peitoril não pode ser negativo');
      }

      const limite = wallLength(wall);
      if (opening.offsetMm + largura > limite) {
        throw new KernelError(
          'OPENING_OUT_OF_BOUNDS',
          `Largura máxima aqui é ${limite - opening.offsetMm} mm — a abertura começa a ${opening.offsetMm} mm de uma parede de ${limite} mm`,
        );
      }
      if (peitoril + altura > wall.heightMm) {
        throw new KernelError(
          'OPENING_TALLER_THAN_WALL',
          `Altura máxima aqui é ${wall.heightMm - peitoril} mm — a parede tem ${wall.heightMm} mm e o peitoril está em ${peitoril} mm`,
        );
      }

      next.openings = next.openings.map((o) =>
        o.id !== opening.id
          ? o
          : { ...o, widthMm: largura, heightMm: altura, sillMm: peitoril },
      );
      diff.updated.push(opening.id);
      break;
    }

    case 'MoveOpening': {
      const opening = next.openings.find((o) => o.id === command.openingId);
      if (!opening) {
        throw new KernelError('OPENING_NOT_FOUND', `Abertura inexistente: ${command.openingId}`);
      }
      const wall = findWall(next, opening.wallId);
      const limite = wallLength(wall);

      if (command.offsetMm < 0) {
        throw new KernelError('OPENING_OUT_OF_BOUNDS', 'A abertura não pode começar antes da parede');
      }
      // A medida MÁXIMA na mensagem, como em `SetOpeningSize`: recusar sem dizer
      // até onde dá obriga a descobrir por tentativa.
      if (command.offsetMm + opening.widthMm > limite) {
        throw new KernelError(
          'OPENING_OUT_OF_BOUNDS',
          `Distância máxima aqui é ${limite - opening.widthMm} mm — a abertura tem ${opening.widthMm} mm numa parede de ${limite} mm`,
        );
      }

      next.openings = next.openings.map((o) =>
        o.id !== opening.id ? o : { ...o, offsetMm: command.offsetMm },
      );
      diff.updated.push(opening.id);
      break;
    }

    case 'FlipOpening': {
      const opening = next.openings.find((o) => o.id === command.openingId);
      if (!opening) {
        throw new KernelError('OPENING_NOT_FOUND', `Abertura inexistente: ${command.openingId}`);
      }
      // Não muda offset/largura/parede hospedeira — é só o SÍMBOLO que muda de
      // lado. Por isso não há validação de limite aqui: nada que `AddOpening`
      // já aceitou pode deixar de caber por causa de girar ou espelhar.
      next.openings = next.openings.map((o) =>
        o.id !== opening.id
          ? o
          : command.axis === 'hinge'
            ? { ...o, hingeAtStart: !o.hingeAtStart }
            : { ...o, swingReversed: !o.swingReversed },
      );
      diff.updated.push(opening.id);
      break;
    }

    case 'DeleteWall': {
      const wall = findWall(next, command.wallId);
      next.walls = next.walls.filter((w) => w.id !== wall.id);
      const orphans = next.openings.filter((o) => o.wallId === wall.id);
      next.openings = next.openings.filter((o) => o.wallId !== wall.id);
      diff.deleted.push(wall.id, ...orphans.map((o) => o.id));
      break;
    }

    case 'NameSpace': {
      const space = next.spaces.find((s) => s.id === command.spaceId);
      if (!space) {
        throw new KernelError('SPACE_NOT_FOUND', `Ambiente inexistente: ${command.spaceId}`);
      }

      // O nome é ancorado num PONTO dentro do ambiente, não no id dele. Ambiente
      // é derivado: mover uma parede recria todos com ids novos, e um nome
      // guardado por id não sobreviveria a nenhuma edição.
      const ancora = interiorPoint(space.ring, space.holes);

      // Renomear o mesmo ambiente substitui a etiqueta, não empilha outra.
      const existente = next.labels.find(
        (l) =>
          l.levelId === space.levelId &&
          pointInPolygon(space.ring, l.at) &&
          !space.holes.some((h) => pointInPolygon(h, l.at)),
      );

      const nome = command.name.trim();

      if (!nome) {
        if (existente) {
          next.labels = next.labels.filter((l) => l.id !== existente.id);
          diff.deleted.push(existente.id);
        }
        break;
      }

      if (existente) {
        next.labels = next.labels.map((l) =>
          l.id === existente.id ? { ...l, name: nome } : l,
        );
        diff.updated.push(existente.id);
      } else {
        const id = nextId(next, 'lbl');
        next.labels.push({ id, uid: novoUid(), levelId: space.levelId, at: ancora, name: nome });
        diff.created.push(id);
      }
      break;
    }

    case 'SetLevelProps': {
      const level = findLevel(next, command.levelId);
      if (command.name !== undefined) {
        const nome = command.name.trim();
        if (!nome) {
          throw new KernelError('BAD_LEVEL_NAME', 'Nome do pavimento não pode ser vazio');
        }
        level.name = nome;
      }
      if (command.elevationMm !== undefined) {
        level.elevationMm = assertIntegerMm(command.elevationMm, 'elevationMm');
      }
      if (command.defaultHeightMm !== undefined) {
        const altura = assertIntegerMm(command.defaultHeightMm, 'defaultHeightMm');
        if (altura <= 0) {
          throw new KernelError('BAD_LEVEL_HEIGHT', 'Pé-direito tem que ser maior que zero');
        }
        level.defaultHeightMm = altura;
      }
      diff.updated.push(level.id);
      break;
    }

    case 'RemoveLevel': {
      const level = findLevel(next, command.levelId);
      if (next.levels.length <= 1) {
        throw new KernelError('LAST_LEVEL', 'Não dá para remover o único pavimento');
      }
      const paredesDoNivel = new Set(
        next.walls.filter((w) => w.levelId === level.id).map((w) => w.id),
      );
      const aberturasOrfas = next.openings.filter((o) => paredesDoNivel.has(o.wallId));
      const limitesDoNivel = next.boundaries.filter((b) => b.levelId === level.id);
      const etiquetasDoNivel = next.labels.filter((l) => l.levelId === level.id);
      const estruturasDoNivel = next.structures.filter((s) => s.levelId === level.id);
      const aguasDoNivel = (next.roofs ?? []).filter((r) => r.levelId === level.id);

      next.walls = next.walls.filter((w) => w.levelId !== level.id);
      next.openings = next.openings.filter((o) => !paredesDoNivel.has(o.wallId));
      next.boundaries = next.boundaries.filter((b) => b.levelId !== level.id);
      next.structures = next.structures.filter((s) => s.levelId !== level.id);
      next.roofs = (next.roofs ?? []).filter((r) => r.levelId !== level.id);
      next.labels = next.labels.filter((l) => l.levelId !== level.id);
      next.levels = next.levels.filter((l) => l.id !== level.id);

      diff.deleted.push(
        level.id,
        ...paredesDoNivel,
        ...aberturasOrfas.map((o) => o.id),
        ...limitesDoNivel.map((b) => b.id),
        ...estruturasDoNivel.map((s) => s.id),
        ...aguasDoNivel.map((r) => r.id),
        ...etiquetasDoNivel.map((l) => l.id),
      );
      break;
    }

    case 'DuplicateLevel': {
      const origem = findLevel(next, command.levelId);
      const nome = command.novoNome.trim();
      if (!nome) {
        throw new KernelError('BAD_LEVEL_NAME', 'Nome do pavimento não pode ser vazio');
      }
      const novoNivelId = nextId(next, 'lvl');
      // IDENTIDADE: toda cópia — o nível e cada peça dele — nasce com uid NOVO,
      // atribuído DEPOIS do spread para sobrescrever o herdado. Cópia com o uid
      // do original seria `DUPLICATE_UID` nos invariantes.
      next.levels.push({
        id: novoNivelId,
        uid: novoUid(),
        name: nome,
        elevationMm: assertIntegerMm(command.elevationMm, 'elevationMm'),
        defaultHeightMm: origem.defaultHeightMm,
      });
      diff.created.push(novoNivelId);

      // `.filter` tira uma FOTO do array antes dos `push` abaixo — o laço não
      // enxerga o que ele mesmo acabou de acrescentar, então não há cópia da
      // cópia.
      const dePara = new Map<ObjectId, ObjectId>();
      for (const w of next.walls.filter((w) => w.levelId === origem.id)) {
        const id = nextId(next, 'wal');
        dePara.set(w.id, id);
        next.walls.push({ ...w, id, uid: novoUid(), levelId: novoNivelId, a: { ...w.a }, b: { ...w.b } });
        diff.created.push(id);
      }
      for (const o of next.openings.filter((o) => dePara.has(o.wallId))) {
        const id = nextId(next, 'opn');
        next.openings.push({ ...o, id, uid: novoUid(), wallId: dePara.get(o.wallId)! });
        diff.created.push(id);
      }
      for (const b of next.boundaries.filter((b) => b.levelId === origem.id)) {
        const id = nextId(next, 'bnd');
        next.boundaries.push({ ...b, id, uid: novoUid(), levelId: novoNivelId, a: { ...b.a }, b: { ...b.b } });
        diff.created.push(id);
      }
      for (const s of next.structures.filter((s) => s.levelId === origem.id)) {
        const id = nextId(next, 'str');
        next.structures.push({
          ...s,
          id,
          uid: novoUid(),
          levelId: novoNivelId,
          pontos: s.pontos.map((p) => ({ ...p })),
        });
        diff.created.push(id);
      }
      // `.filter` sobre a lista ANTES dos push, como as famílias acima — aqui a
      // cópia é reatribuída em vez de `push`ada porque `roofs` pode não existir
      // num modelo antigo, e `?? []` só funciona numa expressão.
      for (const r of (next.roofs ?? []).filter((r) => r.levelId === origem.id)) {
        const id = nextId(next, 'agu');
        next.roofs = [
          ...(next.roofs ?? []),
          { ...r, id, uid: novoUid(), levelId: novoNivelId, pontos: r.pontos.map((p) => ({ ...p })) },
        ];
        diff.created.push(id);
      }
      for (const l of next.labels.filter((l) => l.levelId === origem.id)) {
        const id = nextId(next, 'lbl');
        next.labels.push({ ...l, id, uid: novoUid(), levelId: novoNivelId, at: { ...l.at } });
        diff.created.push(id);
      }
      break;
    }

    case 'DuplicateEntities': {
      findLevel(next, command.levelId);

      // O deslocamento passa pela MESMA porta do arraste (`TranslateEntities`):
      // arredondado ao milímetro e conferido como inteiro. Colar com um delta
      // fracionário poria coordenada quebrada no payload canônico, e o hash da
      // versão publicada deixaria de ser reproduzível.
      const dx = assertIntegerMm(roundToMm(command.delta.x), 'delta.x');
      const dy = assertIntegerMm(roundToMm(command.delta.y), 'delta.y');
      const deslocar = (p: Point): Point => ({
        x: assertIntegerMm(p.x + dx, 'coordenada colada'),
        y: assertIntegerMm(p.y + dy, 'coordenada colada'),
      });

      // Resolver TODOS os originais antes de criar qualquer cópia: um id
      // inexistente na lista tem de derrubar o comando inteiro, e não deixar
      // metade da seleção colada. `applyCommand` já trabalha sobre uma cópia do
      // modelo, mas só se ninguém publicar resultado parcial no caminho.
      const paredes = command.wallIds.map((id) => findWall(next, id));
      const limites = command.boundaryIds.map((id) => findBoundary(next, id));
      const estruturas = (command.structuralIds ?? []).map((id) => findStructural(next, id));
      const aguas = (command.aguaIds ?? []).map((id) => findAgua(next, id));
      const avulsas = command.openings.map((alvo) => {
        const original = next.openings.find((o) => o.id === alvo.openingId);
        if (!original) {
          throw new KernelError('OPENING_NOT_FOUND', `Abertura inexistente: ${alvo.openingId}`);
        }
        return { alvo, original, hospedeira: findWall(next, alvo.wallId) };
      });

      if (
        paredes.length === 0 &&
        limites.length === 0 &&
        estruturas.length === 0 &&
        aguas.length === 0 &&
        avulsas.length === 0
      ) {
        throw new KernelError('NOTHING_TO_DUPLICATE', 'Nada selecionado para copiar');
      }

      const dePara = new Map<ObjectId, ObjectId>();
      for (const w of paredes) {
        const id = nextId(next, 'wal');
        dePara.set(w.id, id);
        // IDENTIDADE: cópia nasce com uid NOVO, depois do spread — ver
        // `DuplicateLevel`.
        next.walls.push({
          ...w,
          id,
          uid: novoUid(),
          levelId: command.levelId,
          a: deslocar(w.a),
          b: deslocar(w.b),
        });
        diff.created.push(id);
      }

      // `.filter` tira uma FOTO antes dos `push` — o laço não enxerga o que ele
      // mesmo acrescenta, então não há cópia da cópia. Mesma disciplina de
      // `DuplicateLevel`.
      for (const o of next.openings.filter((o) => dePara.has(o.wallId))) {
        const id = nextId(next, 'opn');
        next.openings.push({ ...o, id, uid: novoUid(), wallId: dePara.get(o.wallId)! });
        diff.created.push(id);
      }

      for (const { alvo, original, hospedeira } of avulsas) {
        const offset = assertIntegerMm(roundToMm(alvo.offsetMm), 'offsetMm');
        const limite = wallLength(hospedeira);
        // Recusar AQUI, e não deixar para `assertModelInvariants`: a mensagem
        // dela fala de um id de abertura, e quem colou precisa saber quanto
        // sobrou na parede que ele mirou.
        if (offset < 0 || offset + original.widthMm > limite) {
          throw new KernelError(
            'OPENING_OUT_OF_BOUNDS',
            `Abertura ${offset}+${original.widthMm} não cabe em ${limite} mm`,
          );
        }
        const id = nextId(next, 'opn');
        next.openings.push({ ...original, id, uid: novoUid(), wallId: alvo.wallId, offsetMm: offset });
        diff.created.push(id);
      }

      for (const b of limites) {
        const id = nextId(next, 'bnd');
        next.boundaries.push({
          ...b,
          id,
          uid: novoUid(),
          levelId: command.levelId,
          a: deslocar(b.a),
          b: deslocar(b.b),
        });
        diff.created.push(id);
      }

      for (const s of estruturas) {
        const id = nextId(next, 'str');
        next.structures.push({
          ...s,
          id,
          uid: novoUid(),
          levelId: command.levelId,
          pontos: s.pontos.map(deslocar),
        });
        diff.created.push(id);
      }

      for (const r of aguas) {
        const id = nextId(next, 'agu');
        next.roofs = [
          ...(next.roofs ?? []),
          { ...r, id, uid: novoUid(), levelId: command.levelId, pontos: r.pontos.map(deslocar) },
        ];
        diff.created.push(id);
      }
      break;
    }

    default: {
      const exhaustive: never = command;
      throw new KernelError('UNKNOWN_COMMAND', `Comando desconhecido: ${JSON.stringify(exhaustive)}`);
    }
  }

  recomputeSpaces(next);
  assertModelInvariants(next);

  return { model: next, diff, hash: snapshotHash(next) };
}

/**
 * Histórico com undo/redo.
 *
 * Guarda estados inteiros, não comandos inversos. Para um spike isso é o certo:
 * comando inverso exige uma prova de que cada operação é reversível, e é
 * exatamente essa prova que o caso 23 quer testar sem circularidade.
 */
export class ModelHistory {
  private readonly states: BlueprintModel[] = [];
  private cursor = -1;
  private readonly applied = new Map<string, string>();

  constructor(initial: BlueprintModel) {
    this.states.push(cloneModel(initial));
    this.cursor = 0;
  }

  get current(): BlueprintModel {
    return this.states[this.cursor];
  }

  get hash(): string {
    return snapshotHash(this.current);
  }

  get canUndo(): boolean {
    return this.cursor > 0;
  }

  get canRedo(): boolean {
    return this.cursor < this.states.length - 1;
  }

  /**
   * Aplica um comando. `commandId` repetido devolve o hash já conhecido sem
   * reaplicar — idempotência do PRD §12.3.
   */
  apply(command: Command, commandId?: string): CommandResult {
    if (commandId && this.applied.has(commandId)) {
      return { model: this.current, diff: emptyDiff(), hash: this.applied.get(commandId)! };
    }

    const result = applyCommand(this.current, command);

    // Um novo comando descarta o ramo de redo.
    this.states.splice(this.cursor + 1);
    this.states.push(result.model);
    this.cursor = this.states.length - 1;

    if (commandId) this.applied.set(commandId, result.hash);
    return result;
  }

  /**
   * Aplica vários comandos como UM passo do histórico.
   *
   * Existe porque um gesto do usuário pode precisar de mais de um comando para
   * deixar o modelo coerente: desenhar um trecho encadeado pela face cria a
   * parede nova E corrige a ponta da anterior para o canto mitrado. Aplicados
   * separadamente, um "desfazer" desfaria só metade do gesto e deixaria o canto
   * pela metade — estado que o usuário nunca pediu e não sabe nomear.
   *
   * Aborta inteiro no primeiro erro (`applyBatch`), então o histórico nunca
   * recebe um lote parcial.
   */
  applyMany(commands: Command[]): CommandResult {
    const result = applyBatch(this.current, commands);

    this.states.splice(this.cursor + 1);
    this.states.push(result.model);
    this.cursor = this.states.length - 1;
    return result;
  }

  undo(): BlueprintModel {
    if (!this.canUndo) throw new KernelError('NOTHING_TO_UNDO', 'Nada a desfazer');
    this.cursor -= 1;
    return this.current;
  }

  redo(): BlueprintModel {
    if (!this.canRedo) throw new KernelError('NOTHING_TO_REDO', 'Nada a refazer');
    this.cursor += 1;
    return this.current;
  }
}

/** Aplica um lote na ordem dada, abortando inteiro no primeiro erro. */
export function applyBatch(model: BlueprintModel, commands: Command[]): CommandResult {
  let current = model;
  const merged = emptyDiff();

  for (const command of commands) {
    const result = applyCommand(current, command);
    current = result.model;
    merged.created.push(...result.diff.created);
    merged.updated.push(...result.diff.updated);
    merged.deleted.push(...result.diff.deleted);
    Object.assign(merged.ancestry, result.diff.ancestry);
  }

  return { model: current, diff: merged, hash: snapshotHash(current) };
}
