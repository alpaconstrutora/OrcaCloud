/**
 * RF-127 — exportar IFC SOMENTE com declaração de cobertura semântica.
 *
 * ─── A CONDIÇÃO É O REQUISITO ───────────────────────────────────────────────
 *
 * O PRD não pede "exportar IFC". Pede IFC *somente com* declaração de cobertura.
 * A diferença é tudo: um IFC é lido como modelo de informação, e o que ele NÃO
 * contém é indistinguível do que não existe. Por isso a cobertura não é um
 * comentário no código: ela vai DENTRO do arquivo, no cabeçalho STEP e num
 * `IfcProject.Description`, onde qualquer visualizador mostra.
 *
 * ─── O QUE ESTE EXPORTADOR É (desde 04/09/2026) ─────────────────────────────
 *
 * Um IFC de COORDENAÇÃO com identidade, aberturas, propriedades e quantidades:
 *
 *   • cada elemento tem `GlobalId` derivado do `uid` persistente (`identity.ts`)
 *     — a MESMA parede tem o MESMO GUID na revisão seguinte, que é o que Revit,
 *     Solibri e BIMcollab precisam para dizer "esta parede mudou" em vez de
 *     "sumiu uma, apareceu outra";
 *   • porta e janela saem como `IfcDoor`/`IfcWindow`, cada uma com o seu
 *     `IfcOpeningElement` ligado à parede por `IfcRelVoidsElement` e preenchido
 *     por `IfcRelFillsElement` — o corpo da parede continua SÓLIDO, porque é
 *     assim que o IFC representa vão (o receptor faz o booleano);
 *   • `Pset_*Common` só com o que o desenho sabe derivar, mais `Pset_OpuraPlanta`
 *     com a procedência (uid, estudo, hash, versão do kernel, código de item);
 *   • `Qto_*BaseQuantities` a partir do MESMO `computeQuantities` da aba
 *     Quantitativos — não há segunda conta aqui.
 *
 * ─── O QUE ELE AINDA NÃO É ──────────────────────────────────────────────────
 *
 * Não há telhado, escada, forro, revestimento como elemento, instalações, tipos
 * (`IfcTypeObject`) nem armadura. A cobertura abaixo diz isso dentro do arquivo,
 * e a UI continua evitando a expressão "exportação BIM completa".
 *
 * ─── IFC4 EM STEP, ESCRITO À MÃO ────────────────────────────────────────────
 *
 * Sem biblioteca: o subconjunto necessário cabe em STEP previsível, e escrever à
 * mão mantém o resultado inspecionável e testável por conteúdo. O preço é a
 * CONTAGEM DE ATRIBUTOS: cada entidade tem de sair com exatamente os atributos
 * do schema IFC4, senão o arquivo abre num leitor e falha noutro — o pior modo
 * de erro. As contagens estão travadas em teste.
 *
 * ─── COORDENADAS ────────────────────────────────────────────────────────────
 *
 * O modelo é Y PARA CIMA (é o papel e a tela que invertem — ver `paraTela` e o
 * teste "o Y do papel cresce para baixo"). O IFC também é Y para cima, então as
 * coordenadas saem cruas: nada de espelhar.
 */

import {
  FORMA_ESTRUTURAL,
  KERNEL_VERSION,
  POLITICA_PADRAO,
  computeQuantities,
  extensaoDeCanto,
  medirAgua,
  medirEscada,
  fatiasDaEscada,
  nomeDoTipoDeAbertura,
  nomeDoTipoEstrutural,
  normalDaAgua,
  paredeEhExterna,
  perfilDaAguaNoPlano,
  planoDaAgua,
  rotuloCurto,
  uidDeterministico,
  wallLength,
  type Agua,
  type BlueprintModel as ModeloIfc,
  type Escada,
  type BlueprintModel,
  type Level,
  type Opening,
  type QuantidadeAbertura,
  type QuantidadeAgua,
  type QuantidadeAmbiente,
  type QuantidadeEstrutural,
  type QuantidadeParede,
  type Space,
  type Structural,
  type StructuralKind,
  type Wall,
} from './blueprintKernel';

/**
 * O que este IFC representa, e o que não representa.
 *
 * Escrito para ser lido por quem RECEBE o arquivo, não por quem o gera.
 */
export const COBERTURA_IFC = [
  'CONTÉM: pavimentos (IfcBuildingStorey), paredes (IfcWall — eixo, espessura e altura; com IfcMaterialLayerSetUsage quando a composição em camadas foi declarada) e ambientes (IfcSpace — contorno e área).',
  'CONTÉM portas e janelas: IfcDoor e IfcWindow, cada uma com o próprio IfcOpeningElement (IfcRelVoidsElement na parede, IfcRelFillsElement no vão). Vão livre sai só como IfcOpeningElement, sem preenchimento. A folha é uma caixa simples na espessura da parede.',
  'CONTÉM estrutura de concreto: IfcColumn (pilar), IfcBeam (viga), IfcSlab (laje), IfcPile (estaca), IfcFooting (bloco de coroamento e viga de fundação).',
  'CONTÉM propriedades e quantidades: Pset_*Common só com o que o desenho sabe derivar (IsExternal, LoadBearing), Pset_OpuraPlanta com a identidade e a procedência de cada elemento, e Qto_*BaseQuantities calculadas pelo mesmo motor da aba Quantitativos.',
  'O GlobalId de cada elemento é ESTÁVEL entre versões publicadas do mesmo estudo: a mesma parede tem o mesmo GUID na revisão seguinte.',
  'CONTÉM telhado: um IfcRoof por pavimento agregando uma IfcSlab .ROOF. por água — sólido inclinado extrudado ao longo da normal do plano —, com Pset_RoofCommon (ProjectedArea e TotalArea), Pset_SlabCommon.PitchAngle e Qto_Roof/SlabBaseQuantities. A área TOTAL é a da superfície inclinada, não a projeção.',
  'CONTÉM escada e rampa: IfcStair e IfcRamp (PredefinedType STRAIGHT_RUN / QUARTER_TURN / HALF_TURN pela contagem de vértices do eixo), com um sólido por degrau (ou por trecho de rampa) — o perfil lateral extrudado pela largura —, Pset_StairCommon (NumberOfRiser, NumberOfTreads, RiserHeight, TreadLength), Pset_RampCommon.RequiredSlope e Qto_Stair/RampBaseQuantities. O número de degraus é o DERIVADO do desnível, o mesmo do desenho. O furo na laje NÃO é IfcOpeningElement: a laje sai inteira e o desconto fica no Qto.',
  'NÃO CONTÉM forro, piso ou revestimento como elemento, nem instalações de nenhuma disciplina.',
  'NÃO CONTÉM ARMADURA. Nenhuma barra de aço, estribo ou cobrimento — a estrutura aqui é só a forma do concreto.',
  'NÃO CONTÉM tipos (IfcDoorType, IfcWallType…) nem classificação (IfcClassificationReference).',
  'Ambientes: o contorno do IfcSpace e a GrossFloorArea são pelo EIXO das paredes; a NetFloorArea é a área de PISO (contorno recuado em meia espessura, ~9% menor).',
  'Geometria por extrusão simples; canto de parede fechado por avanço, mas peças estruturais se INTERPENETRAM no encontro. O corpo da parede é sólido: o vão vem da relação IfcRelVoidsElement.',
  'Uso pretendido: COORDENAÇÃO geométrica e de identidade. As quantidades são as do estudo preliminar e não substituem projeto executivo.',
];

/**
 * A classe IFC de cada tipo, e o `PredefinedType` dela.
 *
 * ─── POR QUE NÃO `IfcBuildingElementProxy` PARA TODOS ───────────────────────
 *
 * Proxy é o "não sei o que isto é" do IFC. Seria uma linha de código e mataria
 * o propósito do arquivo: quem federa no Revit/Navisworks filtra POR CLASSE —
 * "me dê todos os pilares" — e um modelo de proxies não responde a essa
 * pergunta. Sair com a classe certa é a diferença entre coordenação e um saco
 * de sólidos.
 *
 * `IfcPile` tem UM ATRIBUTO A MAIS que as outras (`ConstructionType`, depois de
 * `PredefinedType`). Emitir 9 atributos nela produz um arquivo que abre em uns
 * leitores e falha em outros — o pior modo de erro possível, porque parece
 * funcionar. Por isso a tabela carrega o `extra`.
 */
const CLASSE_IFC: Record<
  StructuralKind,
  { entidade: string; tipo: string; extra?: string; qto: string; superficie: string; loadBearing: boolean }
> = {
  PILAR: { entidade: 'IFCCOLUMN', tipo: '.COLUMN.', qto: 'Qto_ColumnBaseQuantities', superficie: 'OuterSurfaceArea', loadBearing: true },
  VIGA: { entidade: 'IFCBEAM', tipo: '.BEAM.', qto: 'Qto_BeamBaseQuantities', superficie: 'OuterSurfaceArea', loadBearing: true },
  LAJE: { entidade: 'IFCSLAB', tipo: '.FLOOR.', qto: 'Qto_SlabBaseQuantities', superficie: 'GrossArea', loadBearing: true },
  // BORED = escavada, que é a estaca comum na obra brasileira de porte médio.
  ESTACA: { entidade: 'IFCPILE', tipo: '.BORED.', extra: '$', qto: 'Qto_PileBaseQuantities', superficie: 'GrossSurfaceArea', loadBearing: false },
  BLOCO_COROAMENTO: { entidade: 'IFCFOOTING', tipo: '.PILE_CAP.', qto: 'Qto_FootingBaseQuantities', superficie: 'OuterSurfaceArea', loadBearing: false },
  VIGA_FUNDACAO: { entidade: 'IFCFOOTING', tipo: '.FOOTING_BEAM.', qto: 'Qto_FootingBaseQuantities', superficie: 'OuterSurfaceArea', loadBearing: false },
};

/** `Pset_*Common` por classe — só as que têm `LoadBearing` no schema. */
const PSET_COMMON_ESTRUTURA: Partial<Record<StructuralKind, string>> = {
  PILAR: 'Pset_ColumnCommon',
  VIGA: 'Pset_BeamCommon',
  LAJE: 'Pset_SlabCommon',
};

/**
 * Folga do vão para cada lado da face da parede, em mm.
 *
 * O `IfcOpeningElement` atravessa a parede inteira e um pouco mais: faces
 * exatamente coplanares deixam o booleano do receptor com resíduo (uma película
 * de alvenaria de espessura zero que aparece como ruído no Revit). 10 mm é
 * invisível e resolve.
 */
export const FOLGA_VAO_MM = 10;

/** Identificador global do IFC: 22 caracteres na base 64 própria do formato. */
const B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

/**
 * GUID determinístico a partir de uma semente — para RELAÇÕES e para o que não
 * tem uid (modelo de teste construído à mão, snapshot sem `studyId`).
 *
 * Aleatório seria mais fácil e estaria errado: reexportar a mesma versão
 * publicada tem que produzir o MESMO arquivo, senão duas exportações do mesmo
 * snapshot ficam impossíveis de comparar — e a comparação é metade do motivo de
 * exportar IFC.
 *
 * ⚠️ Não é a compressão padrão de UUID (o primeiro caractere pode ser qualquer
 * um). Para ELEMENTOS use `ifcGuidDeUid`, que é.
 */
export function ifcGuid(semente: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < semente.length; i++) {
    h1 = Math.imul(h1 ^ semente.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + semente.charCodeAt(i) + i, 0x85ebca6b) >>> 0;
  }
  let saida = '';
  for (let i = 0; i < 22; i++) {
    const misto = (h1 ^ Math.imul(h2, i + 1)) >>> 0;
    saida += B64[(misto >>> (i % 24)) % 64];
    h1 = Math.imul(h1 ^ (misto + i), 0x27d4eb2f) >>> 0;
  }
  return saida;
}

/**
 * A COMPRESSÃO PADRÃO de UUID para `IfcGloballyUniqueId`: 128 bits em 22
 * caracteres, MSB primeiro — 2 bits no primeiro caractere (por isso ele é
 * sempre `0`–`3`) e 6 bits em cada um dos outros 21. É reversível: quem recebe
 * o arquivo recupera o UUID do elemento, que é o mesmo `element_uid` de
 * `blueprint_objects`.
 */
export function ifcGuidDeUid(uid: string): string {
  const hex = uid.replace(/-/g, '');
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) {
    throw new Error(`uid fora do formato UUID: ${uid}`);
  }
  let n = BigInt(`0x${hex}`);
  const saida = new Array<string>(22);
  for (let i = 21; i >= 1; i--) {
    saida[i] = B64[Number(n & 63n)];
    n >>= 6n;
  }
  saida[0] = B64[Number(n & 3n)];
  return saida.join('');
}

/**
 * `OperationType` de porta pela convenção do canvas.
 *
 * No IFC, "esquerda/direita" é vista OLHANDO NO SENTIDO DO +Y local da porta —
 * o lado para onde ela abre —, com o +X à direita. O placement da folha aqui é
 * montado com +Y = direção da folha (`swingReversed` gira o eixo 180°), então:
 *
 *   • dobradiça em `ini` e folha para +n  → dobradiça no −X → LEFT
 *   • dobradiça em `ini` e folha para −n  → o eixo girou, `ini` fica no +X → RIGHT
 *   • dobradiça em `fim`                  → o inverso de cada linha acima
 *
 * `n = (−uy, ux)` é a normal ESQUERDA do sentido `a → b` — a do canvas — e é o
 * +Y local da parede neste exportador. É o mesmo XOR que o canvas usa para o
 * sentido do arco (`antiHorario = hingeAtStart !== swingReversed`).
 *
 * Porta de CORRER: `swingReversed` diz sobre qual face ela corre, não para onde
 * abre; o eixo não gira, e "esquerda" é a ponta para onde a folha recolhe.
 */
export function operacaoIfcDaAbertura(o: Opening): string {
  if (o.kind === 'sliding') return o.hingeAtStart ? '.SLIDING_TO_LEFT.' : '.SLIDING_TO_RIGHT.';
  return o.hingeAtStart !== o.swingReversed ? '.SINGLE_SWING_LEFT.' : '.SINGLE_SWING_RIGHT.';
}

/** Texto para STEP: aspas simples dobradas, e o resto literal. */
function s(texto: string): string {
  return `'${texto.replace(/'/g, "''")}'`;
}

function n(v: number): string {
  return Number.isInteger(v) ? `${v}.` : v.toFixed(6);
}

/** Valor tipado de um `IfcPropertySingleValue`. */
type ValorIfc =
  | { tipo: 'IFCBOOLEAN'; v: boolean }
  | { tipo: 'IFCLABEL' | 'IFCTEXT' | 'IFCIDENTIFIER'; v: string }
  | { tipo: 'IFCINTEGER'; v: number }
  /** Medidas reais. Área em m², ângulo em RADIANO — as unidades declaradas no projeto. */
  | { tipo: 'IFCAREAMEASURE' | 'IFCPLANEANGLEMEASURE' | 'IFCREAL' | 'IFCPOSITIVELENGTHMEASURE'; v: number };

/** Uma grandeza de `IfcElementQuantity`. Comprimento em mm; área m²; volume m³. */
type GrandezaIfc = {
  classe: 'IFCQUANTITYLENGTH' | 'IFCQUANTITYAREA' | 'IFCQUANTITYVOLUME' | 'IFCQUANTITYCOUNT';
  nome: string;
  valor: number;
  formula?: string;
};

export interface OpcoesIfc {
  titulo: string;
  revisao: number;
  hash: string;
  autor?: string;
  data?: Date;
  /**
   * Id do estudo. Com ele, projeto/terreno/edifício ganham GUID estável entre
   * revisões (derivado do estudo, não do hash). Sem ele, caem no hash — e
   * mudam a cada revisão, como antes.
   */
  studyId?: string;
  /** Versão do kernel para o `Pset_OpuraPlanta`. Padrão: a do módulo. */
  kernelVersion?: string;
}

interface Ctx {
  emitir: (corpo: string) => string;
  /** GUID por semente + hash — relações e o que não tem identidade. */
  guid: (semente: string) => string;
  /** GUID de ELEMENTO: pelo uid quando há, senão pela semente. */
  guidDe: (uid: string | undefined, semente: string) => string;
  /** GUID de um FILHO do elemento (Pset, Qto): derivado do uid do pai. */
  guidFilho: (uidPai: string | undefined, papel: string, semente: string) => string;
  historico: string;
  dirZ: string;
  dirX: string;
  subContexto: string;
}

export function gerarIfc(model: BlueprintModel, o: OpcoesIfc): string {
  const linhas: string[] = [];
  let proximo = 1;
  /** Emite uma entidade e devolve a referência `#n`. */
  const emitir = (corpo: string): string => {
    const id = `#${proximo++}`;
    linhas.push(`${id}= ${corpo};`);
    return id;
  };

  const guid = (semente: string) => s(ifcGuid(`${o.hash}:${semente}`));
  const guidDe = (uid: string | undefined, semente: string) =>
    uid ? s(ifcGuidDeUid(uid)) : guid(semente);
  const guidFilho = (uidPai: string | undefined, papel: string, semente: string) =>
    uidPai ? s(ifcGuidDeUid(uidDeterministico(`${uidPai}:${papel}`))) : guid(`${papel}:${semente}`);
  const guidDoEstudo = (papel: string) =>
    o.studyId ? s(ifcGuidDeUid(uidDeterministico(`${o.studyId}:${papel}`))) : guid(papel);
  const data = o.data ?? new Date();
  const kernelVersion = o.kernelVersion ?? KERNEL_VERSION;

  // ── Quantidades: UMA vez, do mesmo motor da aba Quantitativos ─────────────
  const quant = computeQuantities(model, POLITICA_PADRAO, kernelVersion);
  const qParede = new Map(quant.paredes.map((q) => [q.wallId, q]));
  const qAbertura = new Map(quant.aberturas.map((q) => [q.openingId, q]));
  const qEstrutura = new Map(quant.estruturas.map((q) => [q.structuralId, q]));
  const qAmbiente = new Map(quant.ambientes.map((q) => [q.spaceId, q]));
  const qAgua = new Map(quant.telhados.map((q) => [q.aguaId, q]));

  // ── Contexto geométrico ───────────────────────────────────────────────────
  const dirZ = emitir('IFCDIRECTION((0.,0.,1.))');
  const dirX = emitir('IFCDIRECTION((1.,0.,0.))');
  const origem = emitir('IFCCARTESIANPOINT((0.,0.,0.))');
  const eixos = emitir(`IFCAXIS2PLACEMENT3D(${origem},${dirZ},${dirX})`);
  const contexto = emitir(
    `IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${eixos},$)`,
  );
  const subContexto = emitir(
    `IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${contexto},$,.MODEL_VIEW.,$)`,
  );

  // ── Unidades: MILÍMETRO, explícito ────────────────────────────────────────
  const comprimento = emitir('IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)');
  const area = emitir('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)');
  const volume = emitir('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)');
  const angulo = emitir('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)');
  const unidades = emitir(`IFCUNITASSIGNMENT((${comprimento},${area},${volume},${angulo}))`);

  const pessoa = emitir(`IFCPERSON($,${s(o.autor ?? 'ORCACLOUD')},$,$,$,$,$,$)`);
  const organizacao = emitir(`IFCORGANIZATION($,${s('ORCACLOUD')},$,$,$)`);
  const pessoaOrg = emitir(`IFCPERSONANDORGANIZATION(${pessoa},${organizacao},$)`);
  const aplicacao = emitir(
    `IFCAPPLICATION(${organizacao},${s('2.0')},${s('OPURA Planta Inteligente')},${s('OPURA-PLANTA')})`,
  );
  const historico = emitir(
    `IFCOWNERHISTORY(${pessoaOrg},${aplicacao},$,.ADDED.,$,$,$,${Math.floor(data.getTime() / 1000)})`,
  );

  const ctx: Ctx = { emitir, guid, guidDe, guidFilho, historico, dirZ, dirX, subContexto };

  // A COBERTURA VAI NA DESCRIÇÃO DO PROJETO. É o campo que todo visualizador
  // mostra nas propriedades — é onde quem recebe o arquivo vai olhar.
  const projeto = emitir(
    `IFCPROJECT(${guidDoEstudo('projeto')},${historico},${s(`${o.titulo} — versão ${o.revisao}`)},` +
      `${s(COBERTURA_IFC.join(' '))},$,$,$,(${contexto}),${unidades})`,
  );

  const local = emitir(`IFCLOCALPLACEMENT($,${eixos})`);
  const terreno = emitir(
    `IFCSITE(${guidDoEstudo('terreno')},${historico},${s('Terreno')},$,$,${local},$,$,.ELEMENT.,$,$,$,$,$)`,
  );
  const localEdificio = emitir(`IFCLOCALPLACEMENT(${local},${eixos})`);
  const edificio = emitir(
    `IFCBUILDING(${guidDoEstudo('edificio')},${historico},${s(o.titulo)},$,$,${localEdificio},$,$,.ELEMENT.,$,$,$)`,
  );

  emitir(`IFCRELAGGREGATES(${guid('agg-projeto')},${historico},$,$,${projeto},(${terreno}))`);
  emitir(`IFCRELAGGREGATES(${guid('agg-terreno')},${historico},$,$,${terreno},(${edificio}))`);

  /** Procedência comum a todo elemento — o `Pset_OpuraPlanta`. */
  const psetOpura = (
    produto: string,
    uid: string | undefined,
    rotulo: string | undefined,
    itemCodes: string[] = [],
  ) => {
    const props: [string, ValorIfc][] = [];
    if (uid) props.push(['ElementUid', { tipo: 'IFCIDENTIFIER', v: uid }]);
    if (rotulo) props.push(['ElementLabel', { tipo: 'IFCLABEL', v: rotulo }]);
    if (o.studyId) props.push(['StudyId', { tipo: 'IFCIDENTIFIER', v: o.studyId }]);
    props.push(['SnapshotHash', { tipo: 'IFCIDENTIFIER', v: o.hash }]);
    props.push(['SnapshotRevision', { tipo: 'IFCINTEGER', v: o.revisao }]);
    props.push(['KernelVersion', { tipo: 'IFCLABEL', v: kernelVersion }]);
    props.push(['QuantitiesVersion', { tipo: 'IFCLABEL', v: POLITICA_PADRAO.version }]);
    const codigos = [...new Set(itemCodes.filter((c) => c.trim()))];
    if (codigos.length) props.push(['ItemCode', { tipo: 'IFCLABEL', v: codigos.join(';') }]);
    emitirPset(ctx, produto, uid, 'Pset_OpuraPlanta', props);
  };

  // ── Pavimentos ────────────────────────────────────────────────────────────
  const pavimentos: string[] = [];
  const produtosPorPavimento = new Map<string, string[]>();

  for (const nivel of model.levels) {
    const pontoNivel = emitir(`IFCCARTESIANPOINT((0.,0.,${n(nivel.elevationMm)}))`);
    const eixoNivel = emitir(`IFCAXIS2PLACEMENT3D(${pontoNivel},${dirZ},${dirX})`);
    const localNivel = emitir(`IFCLOCALPLACEMENT(${localEdificio},${eixoNivel})`);
    const pavimento = emitir(
      `IFCBUILDINGSTOREY(${guidDe(nivel.uid, `pav-${nivel.id}`)},${historico},${s(nivel.name)},$,$,` +
        `${localNivel},$,$,.ELEMENT.,${n(nivel.elevationMm)})`,
    );
    pavimentos.push(pavimento);
    const produtos: string[] = [];
    produtosPorPavimento.set(nivel.id, produtos);

    // ── Paredes do nível (e as aberturas de cada uma) ───────────────────────
    const paredesDoNivel = model.walls.filter((x) => x.levelId === nivel.id);
    for (const w of paredesDoNivel) {
      const { produto, localParede, avA, comp } = emitirParede(w, ctx, localNivel, paredesDoNivel);
      produtos.push(produto);
      emitirMaterialDaParede(w, produto, ctx);

      // Pset_WallCommon: só o que se sabe. `IsExternal` derivado dos ambientes;
      // `LoadBearing` só quando há composição declarada (é ela que diz se há
      // camada estrutural). Parede homogênea não afirma nada sobre isso.
      const externa = paredeEhExterna(model, w);
      const props: [string, ValorIfc][] = [];
      if (externa !== null) props.push(['IsExternal', { tipo: 'IFCBOOLEAN', v: externa }]);
      if (w.camadas?.length) {
        props.push([
          'LoadBearing',
          { tipo: 'IFCBOOLEAN', v: w.camadas.some((c) => c.funcao === 'ESTRUTURAL') },
        ]);
      }
      emitirPset(ctx, produto, w.uid, 'Pset_WallCommon', props);
      psetOpura(produto, w.uid, w.uid ? rotuloCurto(w.uid, 'wall') : undefined, (w.camadas ?? []).map((c) => c.itemCode));
      emitirQtoParede(ctx, produto, w, qParede.get(w.id));

      for (const abertura of model.openings.filter((x) => x.wallId === w.id)) {
        const preenchimento = emitirAbertura(abertura, w, { produto, localParede, avA, comp }, ctx, {
          externa,
          quant: qAbertura.get(abertura.id),
          psetOpura,
        });
        if (preenchimento) produtos.push(preenchimento);
      }
    }

    // ── Estrutura do nível ──────────────────────────────────────────────────
    for (const peca of (model.structures ?? []).filter((x) => x.levelId === nivel.id)) {
      const produto = emitirEstrutura(peca, ctx, localNivel);
      produtos.push(produto);
      const classe = CLASSE_IFC[peca.kind];
      const pset = PSET_COMMON_ESTRUTURA[peca.kind];
      if (pset) emitirPset(ctx, produto, peca.uid, pset, [['LoadBearing', { tipo: 'IFCBOOLEAN', v: classe.loadBearing }]]);
      psetOpura(produto, peca.uid, peca.uid ? rotuloCurto(peca.uid, 'structural') : undefined);
      emitirQtoEstrutura(ctx, produto, peca, qEstrutura.get(peca.id));
    }

    // ── Ambientes do nível ──────────────────────────────────────────────────
    for (const espaco of model.spaces.filter((x) => x.levelId === nivel.id)) {
      const produto = emitirAmbiente(espaco, nivel.defaultHeightMm, ctx, localNivel);
      produtos.push(produto);
      emitirPset(ctx, produto, espaco.labelUid, 'Pset_SpaceCommon', [['IsExternal', { tipo: 'IFCBOOLEAN', v: false }]]);
      psetOpura(produto, espaco.labelUid, espaco.labelUid ? rotuloCurto(espaco.labelUid, 'label') : undefined);
      emitirQtoAmbiente(ctx, produto, espaco, nivel.defaultHeightMm, qAmbiente.get(espaco.id));
    }

    // ── Escadas e rampas do nível ───────────────────────────────────────────
    for (const escada of (model.stairs ?? []).filter((x) => x.levelId === nivel.id)) {
      const produto = emitirEscada(model, escada, ctx, localNivel);
      if (!produto) continue;
      produtos.push(produto);
      psetOpura(produto, escada.uid, escada.uid ? rotuloCurto(escada.uid, 'stair') : undefined);
    }

    // ── Telhado do nível ────────────────────────────────────────────────────
    const aguasDoNivel = (model.roofs ?? []).filter((r) => r.levelId === nivel.id);
    if (aguasDoNivel.length > 0) {
      produtos.push(emitirTelhado(aguasDoNivel, nivel, ctx, localNivel, { qAgua, psetOpura }));
    }

    if (produtos.length > 0) {
      emitir(
        `IFCRELCONTAINEDINSPATIALSTRUCTURE(${guid(`cont-${nivel.id}`)},${historico},$,$,` +
          `(${produtos.join(',')}),${pavimento})`,
      );
    }
  }

  if (pavimentos.length > 0) {
    emitir(
      `IFCRELAGGREGATES(${guid('agg-edificio')},${historico},$,$,${edificio},(${pavimentos.join(',')}))`,
    );
  }

  // ── Cabeçalho STEP ────────────────────────────────────────────────────────
  //
  // A cobertura aparece DUAS vezes de propósito: aqui, onde um editor de texto a
  // mostra na primeira tela, e no IfcProject, onde o visualizador a mostra nas
  // propriedades. Quem abre o arquivo de um jeito não vê o outro.
  const carimbo = data.toISOString().replace(/\.\d{3}Z$/, '');
  const cabecalho =
    `ISO-10303-21;\nHEADER;\n` +
    `FILE_DESCRIPTION((${s('ViewDefinition [CoordinationView]')},` +
    `${s(`COBERTURA PARCIAL: ${COBERTURA_IFC.join(' | ')}`)}),${s('2;1')});\n` +
    `FILE_NAME(${s(`${o.titulo} v${o.revisao}`)},${s(carimbo)},(${s(o.autor ?? 'ORCACLOUD')}),` +
    `(${s('ORCACLOUD')}),${s('OPURA Planta Inteligente')},${s('OPURA')},${s(o.hash)});\n` +
    `FILE_SCHEMA((${s('IFC4')}));\nENDSEC;\nDATA;\n`;

  return `${cabecalho}${linhas.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Propriedades e quantidades
// ─────────────────────────────────────────────────────────────────────────────

function valorIfc(v: ValorIfc): string {
  switch (v.tipo) {
    case 'IFCBOOLEAN':
      return `IFCBOOLEAN(${v.v ? '.T.' : '.F.'})`;
    case 'IFCINTEGER':
      return `IFCINTEGER(${Math.trunc(v.v)})`;
    case 'IFCAREAMEASURE':
    case 'IFCPLANEANGLEMEASURE':
    case 'IFCREAL':
    case 'IFCPOSITIVELENGTHMEASURE':
      return `${v.tipo}(${n(v.v)})`;
    default:
      return `${v.tipo}(${s(v.v)})`;
  }
}

/**
 * `IfcPropertySet` + `IfcRelDefinesByProperties`. NUNCA vazio: `HasProperties`
 * é SET [1:?] no schema, e um Pset sem propriedade é arquivo inválido — quando
 * não há o que afirmar, não se emite nada.
 */
function emitirPset(
  ctx: Ctx,
  produto: string,
  uidPai: string | undefined,
  nome: string,
  props: [string, ValorIfc][],
): void {
  if (props.length === 0) return;
  const { emitir, guidFilho, historico } = ctx;
  const refs = props.map(([nomeProp, v]) =>
    emitir(`IFCPROPERTYSINGLEVALUE(${s(nomeProp)},$,${valorIfc(v)},$)`),
  );
  const pset = emitir(
    `IFCPROPERTYSET(${guidFilho(uidPai, nome, produto)},${historico},${s(nome)},$,(${refs.join(',')}))`,
  );
  emitir(
    `IFCRELDEFINESBYPROPERTIES(${guidFilho(uidPai, `rel-${nome}`, produto)},${historico},$,$,(${produto}),${pset})`,
  );
}

/** `IfcElementQuantity` + relação. Grandeza não finita é descartada, não zerada. */
function emitirQto(
  ctx: Ctx,
  produto: string,
  uidPai: string | undefined,
  nome: string,
  grandezas: GrandezaIfc[],
): void {
  const validas = grandezas.filter((g) => Number.isFinite(g.valor));
  if (validas.length === 0) return;
  const { emitir, guidFilho, historico } = ctx;
  const refs = validas.map((g) =>
    emitir(`${g.classe}(${s(g.nome)},$,$,${n(g.valor)},${g.formula ? s(g.formula) : '$'})`),
  );
  const qto = emitir(
    `IFCELEMENTQUANTITY(${guidFilho(uidPai, nome, produto)},${historico},${s(nome)},$,$,(${refs.join(',')}))`,
  );
  emitir(
    `IFCRELDEFINESBYPROPERTIES(${guidFilho(uidPai, `rel-${nome}`, produto)},${historico},$,$,(${produto}),${qto})`,
  );
}

const M = 1000;

function emitirQtoParede(ctx: Ctx, produto: string, w: Wall, q: QuantidadeParede | undefined): void {
  if (!q) return;
  emitirQto(ctx, produto, w.uid, 'Qto_WallBaseQuantities', [
    { classe: 'IFCQUANTITYLENGTH', nome: 'Length', valor: wallLength(w) },
    { classe: 'IFCQUANTITYLENGTH', nome: 'Width', valor: w.thicknessMm },
    { classe: 'IFCQUANTITYLENGTH', nome: 'Height', valor: w.heightMm },
    { classe: 'IFCQUANTITYAREA', nome: 'GrossSideArea', valor: q.areaFaceBrutaM2 },
    { classe: 'IFCQUANTITYAREA', nome: 'NetSideArea', valor: q.areaFaceLiquidaM2 },
    { classe: 'IFCQUANTITYVOLUME', nome: 'GrossVolume', valor: q.areaFaceBrutaM2 * q.espessuraM },
    { classe: 'IFCQUANTITYVOLUME', nome: 'NetVolume', valor: q.volumeM3 },
  ]);
}

function emitirQtoAbertura(ctx: Ctx, produto: string, o: Opening, q: QuantidadeAbertura | undefined): void {
  emitirQto(ctx, produto, o.uid, o.kind === 'window' ? 'Qto_WindowBaseQuantities' : 'Qto_DoorBaseQuantities', [
    { classe: 'IFCQUANTITYLENGTH', nome: 'Width', valor: o.widthMm },
    { classe: 'IFCQUANTITYLENGTH', nome: 'Height', valor: o.heightMm },
    { classe: 'IFCQUANTITYAREA', nome: 'Area', valor: q?.areaM2 ?? (o.widthMm * o.heightMm) / (M * M) },
  ]);
}

function emitirQtoEstrutura(ctx: Ctx, produto: string, peca: Structural, q: QuantidadeEstrutural | undefined): void {
  if (!q) return;
  const classe = CLASSE_IFC[peca.kind];
  const forma = FORMA_ESTRUTURAL[peca.kind];
  const grandezas: GrandezaIfc[] = [];
  if (forma === 'AREA') {
    grandezas.push({ classe: 'IFCQUANTITYLENGTH', nome: 'Depth', valor: peca.alturaMm });
    grandezas.push({ classe: 'IFCQUANTITYAREA', nome: 'GrossArea', valor: q.areaPlantaM2 });
  } else {
    // Viga/baldrame: comprimento do eixo. Pilar/estaca/bloco: a extensão
    // vertical — é o que `Length` significa em Column/Pile.
    grandezas.push({
      classe: 'IFCQUANTITYLENGTH',
      nome: 'Length',
      valor: forma === 'LINHA' ? q.comprimentoM * M : peca.alturaMm,
    });
    grandezas.push({ classe: 'IFCQUANTITYAREA', nome: classe.superficie, valor: q.areaFormaM2 });
  }
  grandezas.push(
    { classe: 'IFCQUANTITYVOLUME', nome: 'GrossVolume', valor: q.volumeConcretoM3 + q.volumeCedidoM3, formula: q.formula },
    { classe: 'IFCQUANTITYVOLUME', nome: 'NetVolume', valor: q.volumeConcretoM3, formula: q.formula },
  );
  emitirQto(ctx, produto, peca.uid, classe.qto, grandezas);
}

function emitirQtoAmbiente(
  ctx: Ctx,
  produto: string,
  espaco: Space,
  peDireitoMm: number,
  q: QuantidadeAmbiente | undefined,
): void {
  if (!q) return;
  emitirQto(ctx, produto, espaco.labelUid, 'Qto_SpaceBaseQuantities', [
    { classe: 'IFCQUANTITYLENGTH', nome: 'Height', valor: peDireitoMm },
    { classe: 'IFCQUANTITYLENGTH', nome: 'GrossPerimeter', valor: q.perimetroEixoM * M },
    // EIXO × PISO — a distinção que decide o orçamento (ver `quantities.ts`).
    { classe: 'IFCQUANTITYAREA', nome: 'GrossFloorArea', valor: q.areaEixoM2 },
    { classe: 'IFCQUANTITYAREA', nome: 'NetFloorArea', valor: q.areaPisoM2, formula: q.formulaAreaPiso },
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Elementos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ESCADA E RAMPA: `IfcStair` ou `IfcRamp`, com um sólido por FATIA.
 *
 * ─── O SÓLIDO É O PERFIL LATERAL, EXTRUDADO PELA LARGURA ────────────────────
 *
 * Cada fatia (`fatiasDaEscada`) é um prisma convexo: no degrau, um retângulo
 * de lado; na rampa, um trapézio. Esse perfil é desenhado no plano vertical
 * que contém o eixo e extrudado pela largura. É a única forma que serve às duas
 * sem caso especial — uma extrusão VERTICAL do retângulo em planta desenharia
 * um degrau plano onde a rampa sobe.
 *
 * ─── A BASE DO PLACEMENT, E O SINAL DA NORMAL ───────────────────────────────
 *
 * `Axis` (Z local, direção da extrusão) é a normal DIREITA do trecho, e a
 * origem fica na borda ESQUERDA: o sólido cresce da esquerda para a direita e
 * cobre a largura. `RefDirection` (X local) é a direção do trecho. O IFC deriva
 * o Y local como `Axis × RefDirection`, e com a normal direita esse produto
 * aponta PARA CIMA — com a esquerda apontaria para baixo e o perfil sairia
 * enterrado. É a mesma armadilha do `eixoX` do telhado, do outro lado.
 *
 * ─── O FURO NA LAJE NÃO É `IfcOpeningElement` ───────────────────────────────
 *
 * Seria o caminho "certo" do IFC, mas a laje deste kernel é uma `IfcSlab`
 * emitida por `emitirEstrutura`, que não sabe da escada, e o furo é derivado
 * (pode mudar sem ninguém tocar na laje). O desconto vai no Qto da laje, que é
 * onde o número importa; a geometria da laje sai inteira, e a cobertura diz.
 *
 * Devolve `null` quando a escada não tem fatia (percurso degenerado): melhor
 * nenhum produto do que um `IfcStair` sem representação.
 */
function emitirEscada(model: ModeloIfc, e: Escada, ctx: Ctx, localNivel: string): string | null {
  const { emitir, guidDe, historico, dirZ, dirX, subContexto } = ctx;
  const fatias = fatiasDaEscada(model, e);
  if (fatias.length === 0) return null;
  const med = medirEscada(model, e);
  const rampa = e.tipo === 'RAMPA';

  const solidos: string[] = [];
  let volumeMm3 = 0;
  for (const f of fatias) {
    // Direção do trecho: dos cantos de partida (0 e 3) aos de chegada (1 e 2).
    const p0 = f.cantos[0];
    const p1 = f.cantos[1];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const comp = Math.hypot(dx, dy);
    if (comp === 0) continue;
    const dir = { x: dx / comp, y: dy / comp };
    // Normal DIREITA (ver o cabeçalho). `cantos[0]` é a borda esquerda.
    const nrm = { x: dir.y, y: -dir.x };
    const largura = Math.hypot(f.cantos[3].x - p0.x, f.cantos[3].y - p0.y);
    if (largura === 0) continue;

    const xs = f.cantos.map((c) => (c.x - p0.x) * dir.x + (c.y - p0.y) * dir.y);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const cotaA = f.cotasMm[0];
    const cotaB = f.cotasMm[1];
    if (xMax - xMin <= 0) continue;

    // Perfil lateral (x ao longo do trecho, y para cima), em mm.
    const perfil = [
      { x: xMin, y: 0 },
      { x: xMax, y: 0 },
      { x: xMax, y: cotaB },
      { x: xMin, y: cotaA },
    ];
    volumeMm3 += ((xMax - xMin) * (cotaA + cotaB)) / 2 * largura;

    const pontos = perfil.map((q) => emitir(`IFCCARTESIANPOINT((${n(q.x)},${n(q.y)}))`));
    const contorno = emitir(`IFCPOLYLINE((${pontos.join(',')},${pontos[0]}))`);
    const perfilDef = emitir(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${contorno})`);
    const origem = emitir(`IFCCARTESIANPOINT((${n(p0.x)},${n(p0.y)},0.))`);
    const eixoZ = emitir(`IFCDIRECTION((${n(nrm.x)},${n(nrm.y)},0.))`);
    const eixoX = emitir(`IFCDIRECTION((${n(dir.x)},${n(dir.y)},0.))`);
    const placement = emitir(`IFCAXIS2PLACEMENT3D(${origem},${eixoZ},${eixoX})`);
    // A `Position` do sólido É o placement do trecho. Vários sólidos numa
    // mesma representação têm de estar no sistema do PRODUTO, e é a Position
    // de cada um que os leva para lá — ao contrário do telhado, que tem um
    // sólido por produto e põe o placement no IfcLocalPlacement.
    const solido = emitir(`IFCEXTRUDEDAREASOLID(${perfilDef},${placement},${dirZ},${n(largura)})`);
    solidos.push(solido);
  }
  if (solidos.length === 0) return null;

  const forma = emitir(`IFCSHAPEREPRESENTATION(${subContexto},'Body','SweptSolid',(${solidos.join(',')}))`);
  const pds = emitir(`IFCPRODUCTDEFINITIONSHAPE($,$,(${forma}))`);
  const eixo = emitir(`IFCAXIS2PLACEMENT3D(${emitir('IFCCARTESIANPOINT((0.,0.,0.))')},${dirZ},${dirX})`);
  const local = emitir(`IFCLOCALPLACEMENT(${localNivel},${eixo})`);

  // O tipo pela CONTAGEM de vértices do eixo, como a forma da escada no kernel.
  const voltas = e.pontos.length - 2;
  const tipo =
    voltas <= 0
      ? rampa ? '.STRAIGHT_RUN_RAMP.' : '.STRAIGHT_RUN_STAIR.'
      : voltas === 1
        ? rampa ? '.QUARTER_TURN_RAMP.' : '.QUARTER_TURN_STAIR.'
        : voltas === 2
          ? rampa ? '.HALF_TURN_RAMP.' : '.HALF_TURN_STAIR.'
          : '.NOTDEFINED.';
  const nome = e.rotulo || (rampa ? 'Rampa' : `Escada ${med.degraus} degraus`);
  const rotulo = e.uid ? rotuloCurto(e.uid, 'stair') : undefined;
  // 9 atributos no IFC4, os mesmos de IfcSlab.
  const produto = emitir(
    `${rampa ? 'IFCRAMP' : 'IFCSTAIR'}(${guidDe(e.uid, `escada-${e.id}`)},${historico},${s(nome)},$,$,` +
      `${local},${pds},${rotulo ? s(rotulo) : '$'},${tipo})`,
  );

  if (rampa) {
    // `RequiredSlope` é a propriedade padrão de inclinação da rampa. Num estudo
    // preliminar a inclinação desenhada É a de projeto, então é ela que vai.
    emitirPset(ctx, produto, e.uid, 'Pset_RampCommon', [
      ['IsExternal', { tipo: 'IFCBOOLEAN', v: false }],
      ['RequiredSlope', { tipo: 'IFCPLANEANGLEMEASURE', v: Math.atan(med.inclinacaoPct / 100) }],
    ]);
    emitirQto(ctx, produto, e.uid, 'Qto_RampBaseQuantities', [
      { classe: 'IFCQUANTITYLENGTH', nome: 'Length', valor: med.comprimentoInclinadoMm },
      { classe: 'IFCQUANTITYLENGTH', nome: 'Width', valor: e.larguraMm },
      { classe: 'IFCQUANTITYAREA', nome: 'GrossArea', valor: med.areaPlantaMm2 / 1_000_000 },
      { classe: 'IFCQUANTITYAREA', nome: 'NetArea', valor: med.areaPlantaMm2 / 1_000_000 },
      { classe: 'IFCQUANTITYVOLUME', nome: 'GrossVolume', valor: volumeMm3 / 1e9 },
      { classe: 'IFCQUANTITYVOLUME', nome: 'NetVolume', valor: volumeMm3 / 1e9 },
    ]);
  } else {
    emitirPset(ctx, produto, e.uid, 'Pset_StairCommon', [
      ['IsExternal', { tipo: 'IFCBOOLEAN', v: false }],
      ['NumberOfRiser', { tipo: 'IFCINTEGER', v: med.degraus }],
      ['NumberOfTreads', { tipo: 'IFCINTEGER', v: Math.max(0, med.degraus - 1) }],
      ['RiserHeight', { tipo: 'IFCPOSITIVELENGTHMEASURE', v: med.espelhoMm }],
      ['TreadLength', { tipo: 'IFCPOSITIVELENGTHMEASURE', v: med.pisoMm }],
    ]);
    emitirQto(ctx, produto, e.uid, 'Qto_StairBaseQuantities', [
      { classe: 'IFCQUANTITYLENGTH', nome: 'Length', valor: med.comprimentoInclinadoMm },
      { classe: 'IFCQUANTITYVOLUME', nome: 'GrossVolume', valor: volumeMm3 / 1e9 },
      { classe: 'IFCQUANTITYVOLUME', nome: 'NetVolume', valor: volumeMm3 / 1e9 },
    ]);
  }
  return produto;
}

/**
 * TELHADO: um `IfcRoof` por pavimento, agregando uma `IfcSlab` `.ROOF.` por água.
 *
 * ─── POR QUE ROOF + SLABS, E NÃO UMA SLAB SOLTA POR ÁGUA ────────────────────
 *
 * É a forma que o IFC tem para "telhado": `IfcRoof` é o AGREGADO (o que se
 * seleciona como "o telhado" no Revit, o que recebe `Pset_RoofCommon` com a
 * área total), e cada água é uma `IfcSlab` com `PredefinedType = .ROOF.` dentro
 * dele. Slabs soltas seriam quatro lajes inclinadas sem nada dizendo que formam
 * uma cobertura — e o receptor filtra POR CLASSE.
 *
 * ─── O SÓLIDO É O PERFIL NO PLANO, EXTRUDADO PELA NORMAL ────────────────────
 *
 * `perfilDaAguaNoPlano` dá a forma VERDADEIRA da água (sem encurtamento), e o
 * placement a põe de pé: `Axis = normal do plano`, `RefDirection = eixoX`. O IFC
 * deriva o Y local como `Axis × RefDirection`, que com esses dois vetores cai
 * exatamente na direção de subida da rampa — é a razão de `eixoX` existir em
 * `PlanoDaAgua`. A origem é a primeira ponta do beiral, na cota do beiral,
 * DESCIDA de uma espessura ao longo da normal: assim a face de CIMA do sólido é
 * o plano da água, que é o que o desenho define.
 *
 * O `IfcRoof` fica no pavimento (`IfcRelContainedInSpatialStructure`); as slabs
 * NÃO — elas estão agregadas ao roof, e contê-las também as duplicaria na
 * árvore espacial de todo visualizador.
 */
function emitirTelhado(
  aguas: Agua[],
  nivel: Level,
  ctx: Ctx,
  localNivel: string,
  extras: {
    qAgua: Map<string, QuantidadeAgua>;
    psetOpura: (produto: string, uid: string | undefined, rotulo: string | undefined) => void;
  },
): string {
  const { emitir, guid, guidDe, guidFilho, historico, dirZ, dirX, subContexto } = ctx;

  const lajes: string[] = [];
  let projetadaM2 = 0;
  let realM2 = 0;

  for (const r of aguas) {
    const plano = planoDaAgua(r);
    const nrm = normalDaAgua(r);
    const med = extras.qAgua.get(r.id) ?? medirAgua(r);
    projetadaM2 += med.areaProjetadaM2;
    realM2 += med.areaRealM2;

    const perfil = perfilDaAguaNoPlano(r);
    const pontos = perfil.map((p) => emitir(`IFCCARTESIANPOINT((${n(p.x)},${n(p.y)}))`));
    const contorno = emitir(`IFCPOLYLINE((${pontos.join(',')},${pontos[0]}))`);
    const perfilDef = emitir(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${contorno})`);

    const o = plano.origem;
    const origem = emitir(
      `IFCCARTESIANPOINT((${n(o.x - nrm.x * r.espessuraMm)},${n(o.y - nrm.y * r.espessuraMm)},${n(r.baseMm - nrm.z * r.espessuraMm)}))`,
    );
    const eixoZ = emitir(`IFCDIRECTION((${n(nrm.x)},${n(nrm.y)},${n(nrm.z)}))`);
    const eixoX = emitir(`IFCDIRECTION((${n(plano.eixoX.x)},${n(plano.eixoX.y)},0.))`);
    const placement = emitir(`IFCAXIS2PLACEMENT3D(${origem},${eixoZ},${eixoX})`);
    const eixoPerfil = emitir(
      `IFCAXIS2PLACEMENT3D(${emitir('IFCCARTESIANPOINT((0.,0.,0.))')},${dirZ},${dirX})`,
    );
    const solido = emitir(`IFCEXTRUDEDAREASOLID(${perfilDef},${eixoPerfil},${dirZ},${n(r.espessuraMm)})`);
    const forma = emitir(`IFCSHAPEREPRESENTATION(${subContexto},'Body','SweptSolid',(${solido}))`);
    const pds = emitir(`IFCPRODUCTDEFINITIONSHAPE($,$,(${forma}))`);
    const local = emitir(`IFCLOCALPLACEMENT(${localNivel},${placement})`);

    const rotulo = r.uid ? rotuloCurto(r.uid, 'roof') : undefined;
    // 9 atributos no IFC4; `.ROOF.` é o PredefinedType que diz "isto é cobertura".
    const laje = emitir(
      `IFCSLAB(${guidDe(r.uid, `agua-${r.id}`)},${historico},${s(`Água ${r.inclinacaoPct}%`)},$,$,` +
        `${local},${pds},${rotulo ? s(rotulo) : '$'},.ROOF.)`,
    );
    lajes.push(laje);

    // PitchAngle em RADIANO — a unidade de ângulo declarada no projeto.
    emitirPset(ctx, laje, r.uid, 'Pset_SlabCommon', [
      ['IsExternal', { tipo: 'IFCBOOLEAN', v: true }],
      ['PitchAngle', { tipo: 'IFCPLANEANGLEMEASURE', v: Math.atan(plano.tg) }],
    ]);
    extras.psetOpura(laje, r.uid, rotulo);
    emitirQto(ctx, laje, r.uid, 'Qto_SlabBaseQuantities', [
      { classe: 'IFCQUANTITYLENGTH', nome: 'Depth', valor: r.espessuraMm },
      { classe: 'IFCQUANTITYLENGTH', nome: 'Perimeter', valor: med.comprimentoBeiralM * 1000 * 0 + perimetroMm(r) },
      // ÁREA REAL, não projetada: é a superfície da laje inclinada.
      { classe: 'IFCQUANTITYAREA', nome: 'GrossArea', valor: med.areaRealM2, formula: med.formula },
      { classe: 'IFCQUANTITYAREA', nome: 'NetArea', valor: med.areaRealM2 },
      { classe: 'IFCQUANTITYVOLUME', nome: 'GrossVolume', valor: (med.areaRealM2 * r.espessuraMm) / 1000 },
      { classe: 'IFCQUANTITYVOLUME', nome: 'NetVolume', valor: (med.areaRealM2 * r.espessuraMm) / 1000 },
    ]);
  }

  // O tipo do telhado só quando é inequívoco: uma água plana é FLAT, uma água só
  // inclinada é SHED. Com duas ou mais, não se adivinha (duas águas podem ser
  // GABLE ou duas SHED separadas) — NOTDEFINED é honesto.
  const tipo =
    aguas.length === 1
      ? aguas[0].inclinacaoPct === 0
        ? '.FLAT_ROOF.'
        : '.SHED_ROOF.'
      : '.NOTDEFINED.';

  const eixoTelhado = emitir(
    `IFCAXIS2PLACEMENT3D(${emitir('IFCCARTESIANPOINT((0.,0.,0.))')},${dirZ},${dirX})`,
  );
  const localTelhado = emitir(`IFCLOCALPLACEMENT(${localNivel},${eixoTelhado})`);
  const telhado = emitir(
    `IFCROOF(${guidFilho(nivel.uid, 'telhado', `telhado-${nivel.id}`)},${historico},` +
      `${s(`Telhado — ${nivel.name}`)},$,$,${localTelhado},$,$,${tipo})`,
  );
  emitir(`IFCRELAGGREGATES(${guid(`agg-telhado-${nivel.id}`)},${historico},$,$,${telhado},(${lajes.join(',')}))`);

  // As DUAS áreas no Pset padrão — o IFC tem campo para cada uma, e é aqui que
  // quem recebe vê que 24 m² de planta são 25 de telha.
  emitirPset(ctx, telhado, undefined, 'Pset_RoofCommon', [
    ['IsExternal', { tipo: 'IFCBOOLEAN', v: true }],
    ['ProjectedArea', { tipo: 'IFCAREAMEASURE', v: projetadaM2 }],
    ['TotalArea', { tipo: 'IFCAREAMEASURE', v: realM2 }],
  ]);
  emitirQto(ctx, telhado, undefined, 'Qto_RoofBaseQuantities', [
    { classe: 'IFCQUANTITYAREA', nome: 'GrossArea', valor: realM2 },
    { classe: 'IFCQUANTITYAREA', nome: 'NetArea', valor: realM2 },
    { classe: 'IFCQUANTITYAREA', nome: 'ProjectedArea', valor: projetadaM2 },
  ]);

  return telhado;
}

/** Perímetro do polígono da água em planta, em mm. */
function perimetroMm(r: Agua): number {
  let total = 0;
  for (let i = 0; i < r.pontos.length; i++) {
    const a = r.pontos[i];
    const b = r.pontos[(i + 1) % r.pontos.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

/**
 * Parede como sólido extrudado a partir do eixo.
 *
 * `IfcWallStandardCase` exigiria um eixo material com camadas declaradas; sem
 * material, o correto é `IfcWall` mesmo. Declarar StandardCase sem a camada
 * seria dizer ao receptor que existe uma composição construtiva que não existe.
 *
 * ─── O CANTO ────────────────────────────────────────────────────────────────
 *
 * O comprimento do perfil NÃO é `wallLength`. A parede vai de eixo a eixo, mas
 * o CORPO precisa avançar além do vértice para fechar a junção — senão o canto
 * chega ao Revit com um entalhe de meia espessura na face externa. O avanço é
 * `extensaoDeCanto`, a régua do kernel, a MESMA da planta baixa e do PDF.
 *
 * Como o `IFCRECTANGLEPROFILEDEF` é CENTRADO, esticar as duas pontas por
 * valores diferentes desloca o centro: ele deixa de ser o meio do eixo e passa
 * a ser o meio do trecho estendido. Sem esse deslocamento a parede sai com o
 * comprimento certo e a posição errada — pior que o defeito original.
 *
 * ─── O CORPO É SÓLIDO, COM PORTA E TUDO ─────────────────────────────────────
 *
 * O vão NÃO é furado aqui. O IFC representa abertura como `IfcOpeningElement`
 * ligado por `IfcRelVoidsElement`, e é o receptor quem subtrai — é isso que
 * permite ao Revit mover a porta sem reconstruir a parede. Furar o sólido e
 * AINDA emitir o vão subtrairia duas vezes.
 *
 * Devolve também o placement e o avanço `avA`: é a partir deles que a abertura
 * se posiciona no sistema local da parede.
 */
function emitirParede(
  w: Wall,
  ctx: Ctx,
  localNivel: string,
  /** Vizinhança para o avanço de canto — só o MESMO pavimento (ver abaixo). */
  paredesDoNivel: Wall[],
): { produto: string; localParede: string; avA: number; comp: number } {
  const { emitir, guidDe, historico, dirZ, dirX, subContexto } = ctx;

  // Recorte por nível porque `extensaoDeCanto`/`isFreeWallEnd` comparam
  // coordenada e não `levelId`: uma parede do pavimento de cima, no mesmo
  // vértice, viraria vizinha e daria avanço numa ponta livre.
  const avA = extensaoDeCanto(paredesDoNivel, w, 'a');
  const avB = extensaoDeCanto(paredesDoNivel, w, 'b');
  const comp = wallLength(w) + avA + avB;

  // Perfil retangular centrado, extrudado ao longo do eixo da parede.
  const perfil = emitir(
    `IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${n(comp)},${n(w.thicknessMm)})`,
  );

  const angulo = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x);
  // O centro anda `(avB − avA)/2` ao longo do versor do eixo: com avanços
  // iguais ele fica onde estava, e com um só (ponta livre do outro lado) ele
  // acompanha metade do que a parede cresceu.
  const desloc = (avB - avA) / 2;
  const meioX = (w.a.x + w.b.x) / 2 + Math.cos(angulo) * desloc;
  const meioY = (w.a.y + w.b.y) / 2 + Math.sin(angulo) * desloc;

  const direcao = emitir(
    `IFCDIRECTION((${n(Math.cos(angulo))},${n(Math.sin(angulo))},0.))`,
  );
  const centro = emitir(`IFCCARTESIANPOINT((${n(meioX)},${n(meioY)},0.))`);
  const eixoParede = emitir(`IFCAXIS2PLACEMENT3D(${centro},${dirZ},${direcao})`);
  const eixoPerfil = emitir(
    `IFCAXIS2PLACEMENT3D(${emitir('IFCCARTESIANPOINT((0.,0.,0.))')},${dirZ},${dirX})`,
  );

  const solido = emitir(
    `IFCEXTRUDEDAREASOLID(${perfil},${eixoPerfil},${dirZ},${n(w.heightMm)})`,
  );
  const forma = emitir(`IFCSHAPEREPRESENTATION(${subContexto},'Body','SweptSolid',(${solido}))`);
  const produtoForma = emitir(`IFCPRODUCTDEFINITIONSHAPE($,$,(${forma}))`);
  const localParede = emitir(`IFCLOCALPLACEMENT(${localNivel},${eixoParede})`);

  // `Tag` recebe o rótulo curto (P-1A2B): é o que a lista do visualizador mostra
  // e o que o painel de propriedades da planta exibe — o mesmo nome nos dois.
  const tag = w.uid ? s(rotuloCurto(w.uid, 'wall')) : '$';

  const produto = emitir(
    `IFCWALL(${guidDe(w.uid, `par-${w.id}`)},${historico},` +
      `${s(
        w.camadas?.length
          ? `Parede ${w.thicknessMm} mm (${w.camadas.length} camadas)`
          : `Parede ${w.thicknessMm} mm`,
      )},$,$,` +
      `${localParede},${produtoForma},${tag},.NOTDEFINED.)`,
  );

  return { produto, localParede, avA, comp };
}

/**
 * Abertura: o VÃO (`IfcOpeningElement` + `IfcRelVoidsElement`) e, quando há
 * esquadria, a FOLHA (`IfcDoor`/`IfcWindow` + `IfcRelFillsElement`).
 *
 * ─── ONDE FICA O VÃO ────────────────────────────────────────────────────────
 *
 * Tudo no sistema LOCAL da parede: origem no centro do trecho ESTENDIDO, +X ao
 * longo do eixo `a → b`, +Y = normal esquerda, +Z para cima. A ponta `a` está
 * em `x = −comp/2 + avA` (o avanço de canto empurrou o centro), e `offsetMm` é
 * medido a partir dela. Errar isto por `avA` põe a porta 75 mm fora do lugar em
 * TODA parede de canto — e o desenho da planta não mostra, porque a planta
 * desenha o vão pelo eixo, sem avanço.
 *
 * O vão é uma caixa `largura × (espessura + 2·folga) × altura` a partir do
 * peitoril. Vai fora de `IfcRelContainedInSpatialStructure`: vão não é produto
 * do pavimento, é subtração de um produto.
 *
 * ─── A FOLHA ────────────────────────────────────────────────────────────────
 *
 * Caixa `largura × espessura × altura`, no mesmo lugar do vão. A espessura é a
 * da parede porque é o que o modelo SABE — inventar 45 mm de folha declararia
 * uma posição de batente que ninguém desenhou. O placement da folha gira 180°
 * quando a porta abre para o lado `−n` (`swingReversed`), para que o +Y local
 * dela seja SEMPRE o lado para onde abre — é a convenção que dá sentido ao
 * `OperationType` (ver `operacaoIfcDaAbertura`).
 *
 * `passage` (vão livre) é só o vão: não há esquadria a preencher, e emitir uma
 * `IfcDoor` ali poria no orçamento do receptor uma porta que não se compra.
 */
function emitirAbertura(
  o: Opening,
  w: Wall,
  parede: { produto: string; localParede: string; avA: number; comp: number },
  ctx: Ctx,
  extras: {
    externa: boolean | null;
    quant: QuantidadeAbertura | undefined;
    psetOpura: (produto: string, uid: string | undefined, rotulo: string | undefined) => void;
  },
): string | null {
  const { emitir, guid, guidDe, historico, dirZ, dirX, subContexto } = ctx;
  const nome = nomeDoTipoDeAbertura(o.kind, o.embutida);
  const rotulo = o.uid ? rotuloCurto(o.uid, 'opening') : undefined;

  // ── O vão ─────────────────────────────────────────────────────────────────
  const xVao = -parede.comp / 2 + parede.avA + o.offsetMm + o.widthMm / 2;
  const pontoVao = emitir(`IFCCARTESIANPOINT((${n(xVao)},0.,${n(o.sillMm)}))`);
  const eixoVao = emitir(`IFCAXIS2PLACEMENT3D(${pontoVao},${dirZ},${dirX})`);
  const localVao = emitir(`IFCLOCALPLACEMENT(${parede.localParede},${eixoVao})`);

  const perfilVao = emitir(
    `IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${n(o.widthMm)},${n(w.thicknessMm + 2 * FOLGA_VAO_MM)})`,
  );
  const eixoPerfilVao = emitir(
    `IFCAXIS2PLACEMENT3D(${emitir('IFCCARTESIANPOINT((0.,0.,0.))')},${dirZ},${dirX})`,
  );
  const solidoVao = emitir(`IFCEXTRUDEDAREASOLID(${perfilVao},${eixoPerfilVao},${dirZ},${n(o.heightMm)})`);
  const formaVao = emitir(`IFCSHAPEREPRESENTATION(${subContexto},'Body','SweptSolid',(${solidoVao}))`);
  const pdsVao = emitir(`IFCPRODUCTDEFINITIONSHAPE($,$,(${formaVao}))`);

  // 9 atributos no IFC4 (o último é `PredefinedType`).
  const vao = emitir(
    `IFCOPENINGELEMENT(${ctx.guidFilho(o.uid, 'vao', `vao-${o.id}`)},${historico},${s(`Vão — ${nome}`)},$,$,` +
      `${localVao},${pdsVao},$,.OPENING.)`,
  );
  emitir(`IFCRELVOIDSELEMENT(${guid(`voids-${o.uid ?? o.id}`)},${historico},$,$,${parede.produto},${vao})`);

  if (o.kind === 'passage') return null;

  // ── A folha ───────────────────────────────────────────────────────────────
  const gira = o.kind !== 'sliding' && o.swingReversed;
  const dirFolha = gira ? emitir('IFCDIRECTION((-1.,0.,0.))') : dirX;
  const eixoFolha = emitir(
    `IFCAXIS2PLACEMENT3D(${emitir('IFCCARTESIANPOINT((0.,0.,0.))')},${dirZ},${dirFolha})`,
  );
  const localFolha = emitir(`IFCLOCALPLACEMENT(${localVao},${eixoFolha})`);

  const perfilFolha = emitir(`IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${n(o.widthMm)},${n(w.thicknessMm)})`);
  const eixoPerfilFolha = emitir(
    `IFCAXIS2PLACEMENT3D(${emitir('IFCCARTESIANPOINT((0.,0.,0.))')},${dirZ},${dirX})`,
  );
  const solidoFolha = emitir(
    `IFCEXTRUDEDAREASOLID(${perfilFolha},${eixoPerfilFolha},${dirZ},${n(o.heightMm)})`,
  );
  const formaFolha = emitir(`IFCSHAPEREPRESENTATION(${subContexto},'Body','SweptSolid',(${solidoFolha}))`);
  const pdsFolha = emitir(`IFCPRODUCTDEFINITIONSHAPE($,$,(${formaFolha}))`);
  const tag = rotulo ? s(rotulo) : '$';

  // IfcDoor e IfcWindow: 13 atributos no IFC4 (…, Tag, OverallHeight,
  // OverallWidth, PredefinedType, OperationType|PartitioningType, UserDefined…).
  const produto =
    o.kind === 'window'
      ? emitir(
          `IFCWINDOW(${guidDe(o.uid, `abr-${o.id}`)},${historico},${s(`${nome} ${o.widthMm}×${o.heightMm}`)},$,$,` +
            `${localFolha},${pdsFolha},${tag},${n(o.heightMm)},${n(o.widthMm)},.WINDOW.,.NOTDEFINED.,$)`,
        )
      : emitir(
          `IFCDOOR(${guidDe(o.uid, `abr-${o.id}`)},${historico},${s(`${nome} ${o.widthMm}×${o.heightMm}`)},$,$,` +
            `${localFolha},${pdsFolha},${tag},${n(o.heightMm)},${n(o.widthMm)},.DOOR.,${operacaoIfcDaAbertura(o)},$)`,
        );
  emitir(`IFCRELFILLSELEMENT(${guid(`fills-${o.uid ?? o.id}`)},${historico},$,$,${vao},${produto})`);

  // Pset_DoorCommon / Pset_WindowCommon: `IsExternal` herdado da parede, quando
  // a parede sabe.
  if (extras.externa !== null) {
    emitirPset(ctx, produto, o.uid, o.kind === 'window' ? 'Pset_WindowCommon' : 'Pset_DoorCommon', [
      ['IsExternal', { tipo: 'IFCBOOLEAN', v: extras.externa }],
    ]);
  }
  extras.psetOpura(produto, o.uid, rotulo);
  emitirQtoAbertura(ctx, produto, o, extras.quant);

  return produto;
}

/**
 * A COMPOSIÇÃO da parede, na forma que o IFC tem para isso.
 *
 * ─── O SÓLIDO NÃO MUDA ──────────────────────────────────────────────────────
 *
 * A tentação é emitir um `IfcExtrudedAreaSolid` por camada. Seria errado duas
 * vezes: o IFC já tem uma representação própria para parede multicamada —
 * `IfcMaterialLayerSetUsage` sobre o eixo — e é ela que Revit e ArchiCAD leem
 * para mostrar a composição, medir e trocar material. Fatiar o sólido produziria
 * N paredes finas onde o projeto tem UMA parede de três camadas, e quem abrisse
 * o arquivo perderia justamente a informação que este bloco existe para levar.
 *
 * ─── A ORIENTAÇÃO ───────────────────────────────────────────────────────────
 *
 * `.AXIS2.` é a direção transversal ao eixo da parede em planta — a espessura.
 * `OffsetFromReferenceLine` é `−t/2` porque o eixo do modelo passa pelo MEIO da
 * parede, e o IFC mede o conjunto de camadas a partir da linha de referência.
 * `.POSITIVE.` com a ordem da lista como está: a composição é gravada da face
 * esquerda para a direita do sentido `a → b`, que é a mesma direção em que o
 * offset cresce a partir de `−t/2`.
 *
 * Parede homogênea não emite nada — não há composição a declarar.
 */
function emitirMaterialDaParede(w: Wall, produtoParede: string, ctx: Ctx): void {
  const { emitir, guid, historico } = ctx;
  if (!w.camadas || w.camadas.length === 0) return;

  const camadas = w.camadas.map((c) => {
    // O nome do material é o que o receptor mostra. A descrição em cache é o
    // rótulo que o usuário escolheu ver; o código entra junto quando existe,
    // porque é ele que liga a camada de volta ao orçamento.
    const nome = c.descricao || c.itemCode || 'Material não especificado';
    const material = emitir(`IFCMATERIAL(${s(nome)})`);
    return emitir(`IFCMATERIALLAYER(${material},${n(c.espessuraMm)},$)`);
  });

  const conjunto = emitir(
    `IFCMATERIALLAYERSET((${camadas.join(',')}),${s(`Parede ${w.thicknessMm} mm`)})`,
  );
  const uso = emitir(
    `IFCMATERIALLAYERSETUSAGE(${conjunto},.AXIS2.,.POSITIVE.,${n(-w.thicknessMm / 2)})`,
  );

  emitir(
    `IFCRELASSOCIATESMATERIAL(${guid(`mat-${w.uid ?? w.id}`)},${historico},$,$,` +
      `(${produtoParede}),${uso})`,
  );
}

/** Ambiente: prisma do anel do EIXO até o pé-direito do nível. */
function emitirAmbiente(espaco: Space, peDireitoMm: number, ctx: Ctx, localNivel: string): string {
  const { emitir, guidDe, historico, dirZ, dirX, subContexto } = ctx;
  const pontos = espaco.ring.map((p) => emitir(`IFCCARTESIANPOINT((${n(p.x)},${n(p.y)}))`));
  const contorno = emitir(`IFCPOLYLINE((${pontos.join(',')},${pontos[0]}))`);
  const perfil = emitir(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${contorno})`);
  const pontoBase = emitir('IFCCARTESIANPOINT((0.,0.,0.))');
  const eixoBase = emitir(`IFCAXIS2PLACEMENT3D(${pontoBase},${dirZ},${dirX})`);
  const solido = emitir(`IFCEXTRUDEDAREASOLID(${perfil},${eixoBase},${dirZ},${n(peDireitoMm)})`);
  const forma = emitir(`IFCSHAPEREPRESENTATION(${subContexto},'Body','SweptSolid',(${solido}))`);
  const produtoForma = emitir(`IFCPRODUCTDEFINITIONSHAPE($,$,(${forma}))`);
  const localEspaco = emitir(`IFCLOCALPLACEMENT(${localNivel},${eixoBase})`);

  // Identidade do ambiente = a da ETIQUETA que o nomeia (ver `Space.labelUid`).
  // Sem etiqueta, cai no GUID por hash — muda a cada revisão, e é honesto que
  // mude: um ambiente sem nome não tem como ser "o mesmo" na versão seguinte.
  return emitir(
    `IFCSPACE(${guidDe(espaco.labelUid, `esp-${espaco.id}`)},${historico},` +
      `${s(espaco.name ?? 'Ambiente')},$,$,${localEspaco},${produtoForma},$,.ELEMENT.,.INTERNAL.,$)`,
  );
}

/**
 * Peça estrutural como sólido extrudado, na classe IFC que lhe cabe.
 *
 * ─── TODAS EXTRUDADAS PARA CIMA, INCLUSIVE A VIGA ───────────────────────────
 *
 * O perfil é sempre a PEGADA EM PLANTA e a extrusão é sempre vertical, ao longo
 * de `alturaMm`. Numa viga o "correto de manual" seria o oposto — seção
 * transversal varrida ao longo do eixo — mas o sólido resultante é exatamente o
 * mesmo prisma, e este caminho reusa a colocação já provada da parede.
 *
 * ─── A COTA ENTRA NO PLACEMENT, NÃO NO PERFIL ───────────────────────────────
 *
 * O `IfcLocalPlacement` do pavimento já está em `elevationMm`; aqui só entra o
 * `baseMm`, que é relativo ao piso. É isso que põe a estaca abaixo do térreo
 * sem inventar um pavimento "Fundação" — e é a mesma decisão do modelo.
 */
function emitirEstrutura(peca: Structural, ctx: Ctx, localNivel: string): string {
  const { emitir, guidDe, historico, dirZ, dirX, subContexto } = ctx;
  const forma = FORMA_ESTRUTURAL[peca.kind];
  const classe = CLASSE_IFC[peca.kind];

  let perfil: string;
  let cx = 0;
  let cy = 0;
  let anguloDeg = 0;

  if (forma === 'AREA') {
    // Anel arbitrário, como o ambiente. As coordenadas vão no PERFIL, então o
    // placement fica na origem do nível — só a cota Z entra.
    const pontos = peca.pontos.map((p) => emitir(`IFCCARTESIANPOINT((${n(p.x)},${n(p.y)}))`));
    const contorno = emitir(`IFCPOLYLINE((${pontos.join(',')},${pontos[0]}))`);
    perfil = emitir(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${contorno})`);
  } else if (forma === 'LINHA') {
    const [a, b] = peca.pontos;
    const comp = Math.hypot(b.x - a.x, b.y - a.y);
    perfil = emitir(`IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${n(comp)},${n(peca.larguraMm)})`);
    cx = (a.x + b.x) / 2;
    cy = (a.y + b.y) / 2;
    anguloDeg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  } else if (peca.circular) {
    // Círculo de verdade — a mesma razão do `CIRCLE` no DXF: aqui a geometria
    // é o produto, e o quadrado envolvente daria 27% de concreto a mais.
    perfil = emitir(`IFCCIRCLEPROFILEDEF(.AREA.,$,$,${n(peca.larguraMm / 2)})`);
    cx = peca.pontos[0].x;
    cy = peca.pontos[0].y;
  } else {
    perfil = emitir(
      `IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${n(peca.larguraMm)},${n(peca.profundidadeMm)})`,
    );
    cx = peca.pontos[0].x;
    cy = peca.pontos[0].y;
    anguloDeg = peca.rotacaoDeg;
  }

  const rad = (anguloDeg * Math.PI) / 180;
  const direcao = emitir(`IFCDIRECTION((${n(Math.cos(rad))},${n(Math.sin(rad))},0.))`);
  const centro = emitir(`IFCCARTESIANPOINT((${n(cx)},${n(cy)},${n(peca.baseMm)}))`);
  const eixoPeca = emitir(`IFCAXIS2PLACEMENT3D(${centro},${dirZ},${direcao})`);
  const eixoPerfil = emitir(
    `IFCAXIS2PLACEMENT3D(${emitir('IFCCARTESIANPOINT((0.,0.,0.))')},${dirZ},${dirX})`,
  );

  const solido = emitir(
    `IFCEXTRUDEDAREASOLID(${perfil},${eixoPerfil},${dirZ},${n(peca.alturaMm)})`,
  );
  const forma3d = emitir(`IFCSHAPEREPRESENTATION(${subContexto},'Body','SweptSolid',(${solido}))`);
  const produtoForma = emitir(`IFCPRODUCTDEFINITIONSHAPE($,$,(${forma3d}))`);
  const local = emitir(`IFCLOCALPLACEMENT(${localNivel},${eixoPeca})`);

  const nome = peca.rotulo
    ? `${peca.rotulo} — ${nomeDoTipoEstrutural(peca.kind)}`
    : nomeDoTipoEstrutural(peca.kind);
  // `Tag` recebe o rótulo da prancha: é o campo que os visualizadores mostram
  // na lista, e é por ele que se casa a peça com o projeto estrutural. Sem
  // rótulo, entra o rótulo curto do uid, para a peça não sair anônima.
  const tag = peca.rotulo ? s(peca.rotulo) : peca.uid ? s(rotuloCurto(peca.uid, 'structural')) : '$';
  const extra = classe.extra ? `,${classe.extra}` : '';

  return emitir(
    `${classe.entidade}(${guidDe(peca.uid, `est-${peca.id}`)},${historico},${s(nome)},$,$,` +
      `${local},${produtoForma},${tag},${classe.tipo}${extra})`,
  );
}
