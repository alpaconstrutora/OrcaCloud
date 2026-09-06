/**
 * Serialização canônica e hash do snapshot (PRD §9.2, §15.3).
 *
 * O critério de saída do Spike A é "igualdade bit a bit do payload canônico entre
 * navegador e servidor". Isso exige duas garantias:
 *
 *  1. ORDEM TOTAL. Nada é escrito na ordem em que está no array; tudo é ordenado por
 *     chave explícita antes. Chaves de objeto também são emitidas em ordem fixa —
 *     `JSON.stringify` preserva ordem de inserção, que difere entre caminhos de
 *     código que constroem o mesmo objeto de formas diferentes.
 *
 *  2. SHA-256 PRÓPRIO (ver `hash.ts`): idêntico nos dois lados por construção.
 *
 * ─── GEOMETRIA × IDENTIDADE (04/09/2026) ────────────────────────────────────
 *
 * O payload tem DUAS partes, e só uma entra no hash:
 *
 *   • a GEOMETRIA — tudo o que define o desenho, exatamente a forma que o payload
 *     sempre teve. `snapshotHash` é o SHA-256 dela e de mais nada.
 *   • a IDENTIDADE — a chave de topo `identity`, com um array por família,
 *     PARALELO ao array geométrico correspondente (mesma ordem canônica), trazendo
 *     o `uid` de cada elemento. Fica FORA do hash.
 *
 * Por que separado, e não um `uid` dentro de cada elemento com um filtro na hora
 * de hashear: porque assim a neutralidade é POR CONSTRUÇÃO. O objeto hasheado é o
 * mesmo objeto de antes — quem esquecer de filtrar uma família nova não vaza uid
 * para o hash, porque não há o que filtrar. A prova está nos goldens
 * (`blueprintKernelGoldens.test.ts`): a entrada da identidade não recapturou
 * hash nenhum, e por isso `KERNEL_VERSION` NÃO subiu — ela versiona a forma
 * hasheada, e a forma hasheada não mudou. O sidecar tem a própria marca
 * (`identity.v`).
 *
 * Consequência que precisa estar escrita: republicar geometria idêntica com uids
 * diferentes NÃO cria versão nova — a publicação é idempotente por hash, e
 * identidade não é conteúdo. É coerente com o que `uid` significa (ver
 * `identity.ts`), mas surpreende quem esperava que "trocar o uid" fosse edição.
 *
 * ─── O UID NÃO PODE DECIDIR A ORDEM ─────────────────────────────────────────
 *
 * Se o uid influenciasse a ordem dos arrays, dois desenhos idênticos com uids
 * diferentes produziriam geometrias em ordens diferentes — e hashes diferentes.
 * Por isso todo `sort` daqui desempata primeiro pela SERIALIZAÇÃO COMPLETA do
 * elemento geométrico (dois elementos só chegam ao uid se forem byte a byte
 * iguais) e só então pelo uid, que nesse ponto não pode mais mudar a geometria
 * emitida — os dois objetos são idênticos, tanto faz qual vem antes.
 */

import {
  type BlueprintModel,
  type BoundaryKind,
  type BoundaryPapel,
  type CamadaParede,
  type FuncaoCamada,
  type StructuralKind,
  assinaturaDasCamadas,
  emptyModel,
  nextId,
} from './model';
import { recomputeSpaces } from './arrangement';
import { type AlinhamentoParede } from './geom';
import { KERNEL_VERSION, DEFAULT_TOLERANCE_MM } from './units';
import { sha256, stableStringify } from './hash';
import { type ElementUid, uidDeterministico } from './identity';

// A superfície pública continuou exportando `sha256` daqui depois que ele foi
// para `hash.ts`; quem importa de `canonical` não precisou mudar.
export { sha256 } from './hash';

// ─────────────────────────────────────────────────────────────────────────────
// Payload canônico
// ─────────────────────────────────────────────────────────────────────────────

function cmpStr(x: string, y: string): number {
  return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * Ordena elementos já projetados: primeiro pelo comparador explícito da
 * família, depois pela serialização da projeção geométrica, por último pelo
 * uid. Ver o cabeçalho ("o uid não pode decidir a ordem").
 */
function ordenar<T extends { uid?: ElementUid }, G>(
  itens: T[],
  projetar: (t: T) => G,
  chave: (x: T, y: T) => number,
): { item: T; geom: G; serial: string }[] {
  return itens
    .map((item) => {
      const geom = projetar(item);
      return { item, geom, serial: stableStringify(geom) };
    })
    .sort(
      (x, y) =>
        chave(x.item, y.item) ||
        cmpStr(x.serial, y.serial) ||
        cmpStr(x.item.uid ?? '', y.item.uid ?? ''),
    );
}

/**
 * Projeta o modelo nas duas partes do payload: a geometria (hasheada) e a
 * identidade (fora do hash). É a única função que conhece a forma canônica;
 * `canonicalPayload`, `payloadDoHash` e `snapshotHash` são vistas dela.
 *
 * `seq` fica de fora de propósito. Ele é estado do alocador de IDs, não conteúdo:
 * dois modelos com a mesma geometria construída por caminhos diferentes têm
 * contadores diferentes e mesmo assim são o mesmo desenho.
 */
function projetar(model: BlueprintModel): {
  geometria: Omit<CanonicalPayload, 'identity'>;
  identidade: IdentidadeCanonica;
} {
  // Níveis em ordem canônica, e o índice de cada um. Igual às paredes: o payload
  // referencia POSIÇÃO, não identificador.
  const levels = ordenar(
    model.levels,
    (l) => ({ name: l.name, elevationMm: l.elevationMm, defaultHeightMm: l.defaultHeightMm }),
    (a, b) => a.elevationMm - b.elevationMm || a.name.localeCompare(b.name),
  );
  const levelIndex = new Map(levels.map((l, i) => [l.item.id, i]));
  const nivel = (levelId: string) => levelIndex.get(levelId) ?? 0;

  // Ordem geométrica, não ordem de criação: duas sessões que desenham as mesmas
  // paredes em ordens diferentes precisam produzir o mesmo payload.
  const walls = ordenar(
    model.walls,
    (w) => ({
      level: nivel(w.levelId),
      a: { x: w.a.x, y: w.a.y },
      b: { x: w.b.x, y: w.b.y },
      thicknessMm: w.thicknessMm,
      heightMm: w.heightMm,
      // ⚠️ `undefined` no alinhamento `EIXO`, e não `'EIXO'` explícito —
      // `stableStringify` filtra undefined, então a chave SOME. É a mesma
      // decisão de `areaEscrituraMm2` e pela mesma razão: emitir a chave em toda
      // parede mudaria a forma canônica de TODO desenho do acervo, inclusive os
      // que nunca souberam o que é traçar pela face. Na volta, ausente e
      // `'EIXO'` são a mesma coisa.
      //
      // É conteúdo, não parâmetro de tela: ele muda o que uma troca de espessura
      // FAZ com o desenho, então tem de entrar no hash — mesmo motivo de
      // `labels`.
      alinhamento: w.alinhamento && w.alinhamento !== 'EIXO' ? w.alinhamento : undefined,
      // Mesma disciplina: emitida SÓ quando `true`. É conteúdo — decide quanto
      // de alvenaria o orçamento compra —, então entra no hash; mas `false` e
      // ausente significam o mesmo, e emitir `false` mudaria a forma canônica
      // de todo desenho que nunca teve um pilar embutido.
      cedeSobreposicao: w.cedeSobreposicao ? true : undefined,
      // A COMPOSIÇÃO. Mesma disciplina das três chaves acima: emitida só quando
      // existe, para não acrescentar `camadas` a toda parede homogênea do
      // acervo e mudar a forma canônica de desenhos que não têm composição
      // nenhuma. Ausente = homogênea, que é o que todos eles significavam.
      //
      // Os campos são reescritos um a um, e não por `{ ...c }`, pela razão de
      // sempre no canônico: um spread carregaria para o payload qualquer campo
      // que alguém acrescente ao objeto em memória, e o hash mudaria por um dado
      // que ninguém decidiu persistir.
      //
      // `descricao` ENTRA, apesar de ser cache de rótulo: ela é o que o usuário
      // lê ao reabrir um estudo antigo, e o payload é o único lugar onde ela
      // sobrevive — o kernel não consulta catálogo. O preço é conhecido e
      // aceito: recadastrar o item com outra grafia muda o hash sem a geometria
      // ter mudado. É por isso que ela fica FORA de `assinaturaDasCamadas`, que
      // é quem responde "é a mesma composição?" para unir parede e para o diff.
      camadas: w.camadas?.length
        ? w.camadas.map((c) => ({
            espessuraMm: c.espessuraMm,
            itemCode: c.itemCode,
            descricao: c.descricao,
            funcao: c.funcao,
          }))
        : undefined,
    }),
    (x, y) =>
      nivel(x.levelId) - nivel(y.levelId) ||
      x.a.x - y.a.x ||
      x.a.y - y.a.y ||
      x.b.x - y.b.x ||
      x.b.y - y.b.y ||
      x.thicknessMm - y.thicknessMm ||
      // Desempate pela COMPOSIÇÃO (0.11.0). Sem ele, duas paredes com a mesma
      // geometria e a mesma espessura total mas camadas diferentes (25+140+25
      // contra 190 de concreto) ficavam em ordem indefinida — a do array vinha
      // da ordem de criação —, e o payload saía diferente a cada sessão. O hash
      // mudaria sem a geometria ter mudado, que é exatamente o que a ordenação
      // canônica existe para impedir. (Hoje `ordenar` fecha o resto por
      // serialização, mas este critério continua explícito porque é o que o
      // leitor procura primeiro.)
      assinaturaDasCamadas(x.camadas).localeCompare(assinaturaDasCamadas(y.camadas)),
  );
  const wallIndex = new Map(walls.map((w, i) => [w.item.id, i]));
  const parede = (wallId: string) => wallIndex.get(wallId) ?? 0;

  // `wall` é o ÍNDICE da parede hospedeira na lista acima, nunca o `wallId`.
  //
  // Guardar o id aqui furava o canônico por dois lados: o payload passava a
  // conter um identificador volátil (`wal_0001`), e esse id apontava para uma
  // parede que o próprio payload não identifica — impossível reconstruir o
  // modelo a partir dele. Duas plantas idênticas desenhadas em ordem diferente
  // produziam hashes diferentes assim que tivessem uma porta.
  const openings = ordenar(
    model.openings,
    (o) => ({
      wall: parede(o.wallId),
      kind: o.kind,
      offsetMm: o.offsetMm,
      widthMm: o.widthMm,
      heightMm: o.heightMm,
      sillMm: o.sillMm,
      hingeAtStart: o.hingeAtStart,
      swingReversed: o.swingReversed,
      // SÓ em abertura de correr. Emitir sempre daria chave nova a todo
      // desenho que não tem porta de correr, e o hash de todos eles mudaria
      // por um campo que não os descreve — o mesmo cuidado que a área de
      // escritura teve em 0.6.0.
      embutida: o.kind === 'sliding' ? o.embutida : undefined,
      // O TIPO, só quando declarado — a disciplina de `camadas`: emitir sempre
      // acrescentaria a chave a toda abertura do acervo. Campos reescritos um
      // a um, e `descricao` ENTRA pela razão escrita nas camadas: é o que o
      // usuário lê ao reabrir, e o payload é o único lugar onde ela sobrevive.
      esquadria: o.esquadria
        ? { nome: o.esquadria.nome, itemCode: o.esquadria.itemCode, descricao: o.esquadria.descricao }
        : undefined,
    }),
    (x, y) => parede(x.wallId) - parede(y.wallId) || x.offsetMm - y.offsetMm,
  );

  const boundaries = ordenar(
    model.boundaries,
    (b) => ({
      level: nivel(b.levelId),
      kind: b.kind,
      papel: b.papel ?? null,
      // A escritura é ATRIBUTO, não critério de ordem: a ordenação continua por
      // nível e coordenada. Ordenar por confrontante faria dois desenhos
      // idênticos com o mesmo lote produzirem payloads diferentes porque alguém
      // digitou o nome da rua com outra grafia.
      medidaEscrituraMm: b.medidaEscrituraMm ?? null,
      confrontante: b.confrontante ?? null,
      a: { x: b.a.x, y: b.a.y },
      b: { x: b.b.x, y: b.b.y },
    }),
    (x, y) =>
      nivel(x.levelId) - nivel(y.levelId) ||
      x.a.x - y.a.x ||
      x.a.y - y.a.y ||
      x.b.x - y.b.x ||
      x.b.y - y.b.y,
  );

  // ESTRUTURA. `undefined` quando não há nenhuma, e não `[]` — a chave SOME do
  // payload, pela mesma decisão de `areaEscrituraMm2` e `alinhamento`
  // (`stableStringify` filtra undefined). Emitir `"structures":[]` sempre
  // acrescentaria a chave a TODO desenho do acervo, mudando a forma canônica
  // de plantas que não têm um pilar sequer. Diferente de `boundaries` e
  // `labels`, que já eram emitidas vazias quando nasceram e por isso não
  // tinham acervo a preservar. Na volta, ausente e `[]` são a mesma coisa.
  const structures = ordenar(
    model.structures ?? [],
    (s) => ({
      level: nivel(s.levelId),
      kind: s.kind,
      pontos: s.pontos.map((p) => ({ x: p.x, y: p.y })),
      larguraMm: s.larguraMm,
      profundidadeMm: s.profundidadeMm,
      alturaMm: s.alturaMm,
      baseMm: s.baseMm,
      circular: s.circular,
      rotacaoDeg: s.rotacaoDeg,
      // `null` explícito, como em `boundaries.papel`: aqui a chave só existe
      // dentro de uma peça estrutural, que por definição é desenho novo — não
      // há acervo para proteger, e `null` deixa a ausência legível no payload
      // em vez de sumir.
      rotulo: s.rotulo ?? null,
      // Ausente quando `false`, ao contrário do `rotulo` acima: aqui a ausência
      // já é o padrão de toda peça, e a chave só aparece na que recebeu a
      // decisão do usuário.
      cedeSobreposicao: s.cedeSobreposicao ? true : undefined,
      // Seção T: mesma regra da linha acima, e pela mesma razão. Toda peça do
      // acervo é de seção cheia, então a chave ausente mantém o payload —
      // e o hash — byte a byte como estava.
      secaoT: s.secaoT
        ? { mesaAlturaMm: s.secaoT.mesaAlturaMm, almaLarguraMm: s.secaoT.almaLarguraMm }
        : undefined,
    }),
    (x, y) =>
      nivel(x.levelId) - nivel(y.levelId) ||
      x.pontos[0].x - y.pontos[0].x ||
      x.pontos[0].y - y.pontos[0].y ||
      cmpStr(x.kind, y.kind),
  );

  // TELHADO. Mesma disciplina de `structures`: a chave é OMITIDA quando não há
  // nenhuma água, para que o payload — e portanto o hash — de todo desenho sem
  // cobertura continue exatamente o que era. Na volta, ausente e `[]` são a
  // mesma coisa.
  const roofs = ordenar(
    model.roofs ?? [],
    (r) => ({
      level: nivel(r.levelId),
      pontos: r.pontos.map((p) => ({ x: p.x, y: p.y })),
      beiralIndex: r.beiralIndex,
      inclinacaoPct: r.inclinacaoPct,
      baseMm: r.baseMm,
      espessuraMm: r.espessuraMm,
    }),
    (x, y) =>
      nivel(x.levelId) - nivel(y.levelId) ||
      x.pontos[0].x - y.pontos[0].x ||
      x.pontos[0].y - y.pontos[0].y,
  );

  // CORTES. Mesma disciplina de `structures` e `roofs`: a chave é OMITIDA
  // quando não há nenhum, para que o payload — e o hash — de todo desenho sem
  // corte continue exatamente o que era.
  const sections = ordenar(
    model.sections ?? [],
    (c) => ({
      a: { x: c.a.x, y: c.a.y },
      b: { x: c.b.x, y: c.b.y },
      olharPara: c.olharPara,
      rotulo: c.rotulo,
    }),
    // Sem nível: o corte atravessa a edificação inteira. Ordena por posição,
    // como todo o resto.
    (x, y) => x.a.x - y.a.x || x.a.y - y.a.y || x.b.x - y.b.x || x.b.y - y.b.y,
  );

  // ESCADAS E RAMPAS. Mesma disciplina de `structures`, `roofs` e `sections`:
  // a chave é OMITIDA quando não há nenhuma, para que o payload — e o hash — de
  // todo desenho sem circulação vertical continue exatamente o que era.
  //
  // ⚠️ O que entra é só o que o USUÁRIO decidiu: percurso, largura, tipo e alvo
  // de espelho. O número de degraus, o espelho real e o piso NÃO entram, porque
  // são derivados do desnível — e gravá-los faria o payload discordar de si
  // mesmo no dia em que alguém mudasse a cota de um pavimento.
  const stairs = ordenar(
    model.stairs ?? [],
    (e) => ({
      level: nivel(e.levelId),
      tipo: e.tipo,
      pontos: e.pontos.map((p) => ({ x: p.x, y: p.y })),
      larguraMm: e.larguraMm,
      alvoEspelhoMm: e.alvoEspelhoMm,
      rotulo: e.rotulo ?? null,
    }),
    (x, y) =>
      nivel(x.levelId) - nivel(y.levelId) ||
      x.pontos[0].x - y.pontos[0].x ||
      x.pontos[0].y - y.pontos[0].y,
  );

  // Etiquetas de ambiente. Entram no canônico porque são CONTEÚDO: renomear um
  // ambiente muda o desenho de forma observável e tem que mudar o hash — senão
  // publicar depois de renomear seria idempotente e o nome nunca chegaria ao
  // snapshot. Ordenadas por posição, como todo o resto.
  const labels = ordenar(
    model.labels ?? [],
    (l) => ({ level: nivel(l.levelId), at: { x: l.at.x, y: l.at.y }, name: l.name }),
    (x, y) =>
      nivel(x.levelId) - nivel(y.levelId) ||
      x.at.x - y.at.x ||
      x.at.y - y.at.y ||
      cmpStr(x.name, y.name),
  );

  // Ambiente é DERIVADO e não tem uid próprio: a identidade dele, quando existe,
  // é a da etiqueta que o nomeia (`labelUid`), religada por conter o ponto a
  // cada rederivação. Ambiente sem etiqueta não tem identidade estável entre
  // versões — e isso é honesto, porque ele também não tem nome.
  const spaces = ordenar(
    model.spaces.map((s) => ({ ...s, uid: s.labelUid })),
    (s) => ({
      level: nivel(s.levelId),
      ring: s.ring.map((p) => ({ x: p.x, y: p.y })),
      holes: s.holes.map((h) => h.map((p) => ({ x: p.x, y: p.y }))),
      areaMm2: s.areaMm2,
      perimeterMm: s.perimeterMm,
    }),
    (x, y) =>
      nivel(x.levelId) - nivel(y.levelId) ||
      x.areaMm2 - y.areaMm2 ||
      x.ring[0].x - y.ring[0].x ||
      x.ring[0].y - y.ring[0].y,
  );

  const geometria: Omit<CanonicalPayload, 'identity'> = {
    kernel: KERNEL_VERSION,
    toleranceMm: DEFAULT_TOLERANCE_MM,
    // Área do lote na escritura. Chave de topo porque é do LOTE, não de um lado —
    // e conteúdo, não parâmetro de tela: mudá-la muda o que o desenho afirma e
    // tem que mudar o hash, pelo mesmo motivo que `labels` entra aqui.
    //
    // ⚠️ `undefined` quando não informada, e não `null` — `stableStringify` filtra
    // undefined, então a chave SOME do payload. É diferente da convenção usada
    // dentro de `boundaries` (que emite `papel: null` explícito) e a diferença é
    // deliberada: aqui a chave entraria em TODO payload do acervo, inclusive nos
    // desenhos que não têm lote nenhum, mudando a forma canônica de plantas que
    // não têm nada a ver com terreno. Sem lote informado, o payload continua
    // exatamente o que era. Na volta, ausente e `null` são a mesma coisa.
    areaEscrituraMm2: model.areaEscrituraMm2 ?? undefined,
    levels: levels.map((l) => l.geom),
    walls: walls.map((w) => w.geom),
    openings: openings.map((o) => o.geom),
    boundaries: boundaries.map((b) => b.geom),
    structures: structures.length ? structures.map((s) => s.geom) : undefined,
    roofs: roofs.length ? roofs.map((r) => r.geom) : undefined,
    sections: sections.length ? sections.map((c) => c.geom) : undefined,
    stairs: stairs.length ? stairs.map((e) => e.geom) : undefined,
    labels: labels.map((l) => l.geom),
    spaces: spaces.map((s) => s.geom),
  };

  // `?? null`, e não `undefined`: dentro de ARRAY o `stableStringify` não
  // filtra nada, e um `undefined` viraria a palavra `undefined` no texto — JSON
  // inválido. `null` é "este elemento não tem uid" (modelo construído à mão em
  // teste), e a leitura deriva um.
  const identidade: IdentidadeCanonica = {
    v: 1,
    levels: levels.map((l) => l.item.uid ?? null),
    walls: walls.map((w) => w.item.uid ?? null),
    openings: openings.map((o) => o.item.uid ?? null),
    boundaries: boundaries.map((b) => b.item.uid ?? null),
    structures: structures.map((s) => s.item.uid ?? null),
    roofs: roofs.map((r) => r.item.uid ?? null),
    sections: sections.map((c) => c.item.uid ?? null),
    stairs: stairs.map((e) => e.item.uid ?? null),
    labels: labels.map((l) => l.item.uid ?? null),
    spaces: spaces.map((s) => s.item.uid ?? null),
  };

  return { geometria, identidade };
}

/** O payload COMPLETO — geometria + identidade. É o que se persiste. */
export function canonicalPayload(model: BlueprintModel): string {
  const { geometria, identidade } = projetar(model);
  return stableStringify({ ...geometria, identity: identidade });
}

/**
 * Só a parte HASHEADA do payload. Byte a byte igual ao que `canonicalPayload`
 * devolvia antes da identidade existir — é isso que mantém o hash do acervo.
 */
export function payloadDoHash(model: BlueprintModel): string {
  return stableStringify(projetar(model).geometria);
}

export function snapshotHash(model: BlueprintModel): string {
  return sha256(payloadDoHash(model));
}

/**
 * Hash de um payload JÁ SERIALIZADO (lido do banco), sem passar pelo modelo.
 *
 * Remove `identity`, re-serializa em ordem canônica e hasheia. Dá o mesmo
 * resultado que `snapshotHash` do modelo reconstruído — e é o que a leitura de
 * um snapshot antigo usa como semente para derivar uids sem reconstruir nada.
 * Funciona sobre payload que passou por JSONB (o Postgres reordena chaves)
 * porque `stableStringify` reordena de volta.
 */
export function hashDePayload(payload: CanonicalPayload): string {
  const { identity: _ignorada, ...geometria } = payload;
  return sha256(stableStringify(geometria));
}

/**
 * A parte do payload que fica FORA do hash: um array por família, paralelo ao
 * array geométrico de mesmo nome (mesma ordem canônica, mesmo comprimento).
 *
 * `null` numa posição = aquele elemento não tinha uid ao ser serializado; a
 * leitura deriva um determinístico. `spaces` traz o uid da ETIQUETA que nomeia
 * o ambiente (ambiente é derivado e não tem uid próprio).
 *
 * `structures` é SEMPRE emitido aqui, mesmo quando a geometria omite a chave por
 * estar vazia: fora do hash não há acervo a proteger, e um array sempre presente
 * é mais simples de ler do lado do SQL.
 */
export interface IdentidadeCanonica {
  v: 1;
  levels: (ElementUid | null)[];
  walls: (ElementUid | null)[];
  openings: (ElementUid | null)[];
  boundaries: (ElementUid | null)[];
  structures: (ElementUid | null)[];
  /** Ausente em payload gravado sob kernel anterior a 0.12.0. */
  roofs?: (ElementUid | null)[];
  /** Ausente em payload gravado sob kernel anterior a 0.13.0. */
  sections?: (ElementUid | null)[];
  /** Ausente em payload gravado sob kernel anterior a 0.14.0. */
  stairs?: (ElementUid | null)[];
  labels: (ElementUid | null)[];
  spaces: (ElementUid | null)[];
}

/** Forma tipada do payload canônico. É o contrato de persistência do snapshot. */
export interface CanonicalPayload {
  kernel: string;
  toleranceMm: number;
  /** Ausente em payload gravado sob kernel < 0.6.0. */
  areaEscrituraMm2?: number | null;
  levels: { name: string; elevationMm: number; defaultHeightMm: number }[];
  walls: {
    level: number;
    a: { x: number; y: number };
    b: { x: number; y: number };
    thicknessMm: number;
    heightMm: number;
    /**
     * Ausente em payload sob kernel < 0.8.0, e ausente também no alinhamento
     * `'EIXO'` — que é o que uma parede sem o campo sempre significou.
     */
    alinhamento?: AlinhamentoParede;
    /** Ausente sob kernel < 0.10.0 e em toda parede que não cede volume. */
    cedeSobreposicao?: boolean;
    /**
     * Ausente sob kernel < 0.11.0 e em toda parede HOMOGÊNEA. Nunca `[]` — lista
     * vazia é recusada pelos invariantes, para não haver duas escritas do mesmo
     * estado.
     *
     * Da face ESQUERDA para a DIREITA relativas ao sentido `a → b`. A soma das
     * espessuras é `thicknessMm`, por invariante.
     */
    camadas?: {
      espessuraMm: number;
      itemCode: string;
      descricao: string;
      funcao: FuncaoCamada;
    }[];
  }[];
  openings: {
    wall: number;
    kind: 'door' | 'window' | 'passage' | 'sliding';
    offsetMm: number;
    widthMm: number;
    heightMm: number;
    sillMm: number;
    /** Ausentes em payload gravado sob kernel < 0.4.0. */
    hingeAtStart?: boolean;
    swingReversed?: boolean;
    /** Só em `kind: 'sliding'`, e ausente em payload sob kernel < 0.7.0. */
    embutida?: boolean;
    /** Ausente em payload sob kernel < 0.15.0 e em abertura sem tipo. */
    esquadria?: { nome: string; itemCode: string; descricao: string };
  }[];
  boundaries: {
    level: number;
    /** Ausentes em payload gravado sob kernel < 0.5.0. */
    kind?: BoundaryKind;
    papel?: BoundaryPapel | null;
    /** Ausentes em payload gravado sob kernel < 0.6.0. */
    medidaEscrituraMm?: number | null;
    confrontante?: string | null;
    a: { x: number; y: number };
    b: { x: number; y: number };
  }[];
  /** Ausente em payload gravado sob kernel < 0.9.0 e em desenho sem estrutura. */
  structures?: {
    level: number;
    kind: StructuralKind;
    pontos: { x: number; y: number }[];
    larguraMm: number;
    profundidadeMm: number;
    alturaMm: number;
    baseMm: number;
    circular: boolean;
    secaoT?: { mesaAlturaMm: number; almaLarguraMm: number };
    rotacaoDeg: number;
    rotulo?: string | null;
    /** Ausente sob kernel < 0.10.0 e em toda peça que não cede volume. */
    cedeSobreposicao?: boolean;
  }[];
  /**
   * Águas de telhado. Ausente em payload gravado sob kernel < 0.12.0 e em
   * desenho sem cobertura — a chave só existe quando há o que declarar.
   */
  roofs?: {
    level: number;
    pontos: { x: number; y: number }[];
    beiralIndex: number;
    inclinacaoPct: number;
    baseMm: number;
    espessuraMm: number;
  }[];
  /**
   * Linhas de corte. Ausente sob kernel < 0.13.0 e em desenho sem corte —
   * a chave só existe quando há o que declarar. Sem `level`: o plano
   * atravessa a edificação inteira.
   */
  sections?: {
    a: { x: number; y: number };
    b: { x: number; y: number };
    olharPara: 'ESQUERDA' | 'DIREITA';
    rotulo: string;
  }[];
  /**
   * Escadas e rampas. Ausente sob kernel < 0.14.0 e em desenho sem nenhuma.
   *
   * Sem `degraus`, sem `espelhoMm` e sem `pisoMm`: os três são derivados do
   * desnível entre pavimentos, e gravá-los faria o payload discordar de si
   * mesmo assim que alguém mudasse a cota de um pavimento.
   */
  stairs?: {
    level: number;
    tipo: 'ESCADA' | 'RAMPA';
    pontos: { x: number; y: number }[];
    larguraMm: number;
    alvoEspelhoMm: number;
    rotulo: string | null;
  }[];
  labels: { level: number; at: { x: number; y: number }; name: string }[];
  spaces: {
    level: number;
    ring: { x: number; y: number }[];
    holes: { x: number; y: number }[][];
    areaMm2: number;
    perimeterMm: number;
  }[];
  /**
   * Ausente em payload gravado antes de 04/09/2026 (identidade de elemento).
   * FORA do hash — ver o cabeçalho deste arquivo. Snapshot antigo é lido com
   * uids derivados; snapshot novo traz os seus.
   */
  identity?: IdentidadeCanonica;
}

export function parseCanonicalPayload(json: string): CanonicalPayload {
  return JSON.parse(json) as CanonicalPayload;
}

/**
 * Reconstrói um modelo editável a partir do payload canônico.
 *
 * É o que fecha o ciclo da persistência: um snapshot é guardado como payload
 * canônico (imutável, com hash), e voltar a editá-lo exige devolver objetos com
 * identidade de sessão. Os `id` são REATRIBUÍDOS pelo contador determinístico na
 * ordem canônica — como a ordem é função só da geometria, o modelo reconstruído
 * re-serializa para exatamente o mesmo payload e o mesmo hash.
 *
 * Os `uid` NÃO são reatribuídos: vêm de `payload.identity` quando existe. Quando
 * não existe (snapshot antigo), ou quando um array de identidade não tem o
 * comprimento do array geométrico (payload adulterado — tratado como ausente
 * para aquela família), cada elemento recebe um uid determinístico derivado do
 * hash geométrico, da família e do índice canônico. Duas leituras do mesmo
 * payload dão os mesmos uids.
 */
export function modelFromCanonicalPayload(payload: CanonicalPayload): BlueprintModel {
  const model = emptyModel();
  model.areaEscrituraMm2 = payload.areaEscrituraMm2 ?? null;

  // O hash geométrico só é calculado se algum uid faltar — e uma vez só.
  let hashGeom: string | null = null;
  const uidDe = (
    familia: keyof IdentidadeCanonica,
    i: number,
    esperados: number,
  ): ElementUid => {
    const lista = payload.identity?.[familia];
    const u = Array.isArray(lista) && lista.length === esperados ? lista[i] : null;
    if (typeof u === 'string' && u) return u;
    hashGeom ??= hashDePayload(payload);
    return uidDeterministico(`${hashGeom}:${familia}:${i}`);
  };

  const levelIds = payload.levels.map((l, i) => {
    const id = nextId(model, 'lvl');
    model.levels.push({
      id,
      uid: uidDe('levels', i, payload.levels.length),
      name: l.name,
      elevationMm: l.elevationMm,
      defaultHeightMm: l.defaultHeightMm,
    });
    return id;
  });

  const wallIds = payload.walls.map((w, i) => {
    const id = nextId(model, 'wal');
    model.walls.push({
      id,
      uid: uidDe('walls', i, payload.walls.length),
      levelId: levelIds[w.level],
      a: { x: w.a.x, y: w.a.y },
      b: { x: w.b.x, y: w.b.y },
      thicknessMm: w.thicknessMm,
      heightMm: w.heightMm,
      // Ausente = `'EIXO'`, e `'EIXO'` não volta ao modelo como campo: assim o
      // modelo relido de um payload antigo é IDÊNTICO ao que o gravou, e o
      // round-trip continua fechando byte a byte.
      ...(w.alinhamento && w.alinhamento !== 'EIXO' ? { alinhamento: w.alinhamento } : {}),
      // Mesma regra do alinhamento: ausente não volta como `false`, volta como
      // nada — é o que mantém o round-trip fechando byte a byte.
      ...(w.cedeSobreposicao ? { cedeSobreposicao: true } : {}),
      // Idem: ausente (e `[]`, que payload nenhum deveria ter) não volta como
      // lista vazia, volta como nada — parede homogênea, que é o que um payload
      // de antes de 0.11.0 significa.
      ...(w.camadas?.length
        ? {
            camadas: w.camadas.map((c) => ({
              espessuraMm: c.espessuraMm,
              itemCode: c.itemCode,
              descricao: c.descricao,
              funcao: c.funcao,
            })) as CamadaParede[],
          }
        : {}),
    });
    return id;
  });

  payload.openings.forEach((o, i) => {
    model.openings.push({
      id: nextId(model, 'opn'),
      uid: uidDe('openings', i, payload.openings.length),
      wallId: wallIds[o.wall],
      kind: o.kind,
      offsetMm: o.offsetMm,
      widthMm: o.widthMm,
      heightMm: o.heightMm,
      sillMm: o.sillMm,
      // `?? true`/`?? false`: payload gravado sob kernel < 0.4.0 não tem os
      // campos. São os mesmos valores que `AddOpening` já usava como padrão
      // antes deles existirem — reabrir um snapshot antigo não pode fazer as
      // portas dele "virarem" sozinhas.
      hingeAtStart: o.hingeAtStart ?? true,
      swingReversed: o.swingReversed ?? false,
      embutida: o.embutida ?? false,
      ...(o.esquadria
        ? { esquadria: { nome: o.esquadria.nome, itemCode: o.esquadria.itemCode, descricao: o.esquadria.descricao } }
        : {}),
    });
  });

  payload.boundaries.forEach((b, i) => {
    model.boundaries.push({
      id: nextId(model, 'bnd'),
      uid: uidDe('boundaries', i, payload.boundaries.length),
      levelId: levelIds[b.level],
      a: { x: b.a.x, y: b.a.y },
      b: { x: b.b.x, y: b.b.y },
      // Payload de antes do terreno existir não tem `kind`. `DIVISA` é o que
      // aquele desenho significava: um limite solto, que divide ambiente e não
      // participa de anel de lote nenhum. Ler como TERRENO inventaria um lote
      // que ninguém desenhou, com área e recuos saindo do nada.
      kind: b.kind ?? 'DIVISA',
      papel: b.papel ?? null,
      // Payload de antes da escritura existir não tem os campos. `null` é
      // "ninguém informou" — e é o que impede o quadro de acusar divergência
      // contra uma medida que nunca foi digitada.
      medidaEscrituraMm: b.medidaEscrituraMm ?? null,
      confrontante: b.confrontante ?? null,
    });
  });

  // `?? []` cobre dois casos que dão no mesmo: payload de antes de 0.9.0, e
  // payload de um desenho sem nenhuma estrutura (onde a chave é omitida de
  // propósito, para não mudar o hash do acervo — ver `projetar`).
  const structures = payload.structures ?? [];
  structures.forEach((s, i) => {
    model.structures.push({
      id: nextId(model, 'str'),
      uid: uidDe('structures', i, structures.length),
      levelId: levelIds[s.level],
      kind: s.kind,
      pontos: s.pontos.map((p) => ({ x: p.x, y: p.y })),
      larguraMm: s.larguraMm,
      profundidadeMm: s.profundidadeMm,
      alturaMm: s.alturaMm,
      baseMm: s.baseMm,
      circular: s.circular,
      rotacaoDeg: s.rotacaoDeg,
      rotulo: s.rotulo ?? null,
      ...(s.cedeSobreposicao ? { cedeSobreposicao: true } : {}),
      ...(s.secaoT ? { secaoT: s.secaoT } : {}),
    });
  });

  // `?? []` cobre os dois casos que dão no mesmo, como em `structures`: payload
  // anterior a 0.12.0, e desenho sem cobertura nenhuma (onde a chave é omitida
  // de propósito, para não mudar o hash do acervo).
  const roofs = payload.roofs ?? [];
  roofs.forEach((r, i) => {
    model.roofs.push({
      id: nextId(model, 'agu'),
      uid: uidDe('roofs', i, roofs.length),
      levelId: levelIds[r.level],
      pontos: r.pontos.map((p) => ({ x: p.x, y: p.y })),
      beiralIndex: r.beiralIndex,
      inclinacaoPct: r.inclinacaoPct,
      baseMm: r.baseMm,
      espessuraMm: r.espessuraMm,
    });
  });

  // `?? []` pela razão de `roofs`: payload anterior a 0.13.0, ou desenho sem
  // corte nenhum (onde a chave é omitida de propósito).
  const sections = payload.sections ?? [];
  sections.forEach((c, i) => {
    model.sections.push({
      id: nextId(model, 'cor'),
      uid: uidDe('sections', i, sections.length),
      a: { x: c.a.x, y: c.a.y },
      b: { x: c.b.x, y: c.b.y },
      olharPara: c.olharPara,
      rotulo: c.rotulo,
    });
  });

  // `?? []` pela razão de `roofs` e `sections`: payload anterior a 0.14.0, ou
  // desenho sem escada nenhuma (onde a chave é omitida de propósito).
  const stairs = payload.stairs ?? [];
  stairs.forEach((e, i) => {
    model.stairs.push({
      id: nextId(model, 'esc'),
      uid: uidDe('stairs', i, stairs.length),
      levelId: levelIds[e.level],
      tipo: e.tipo,
      pontos: e.pontos.map((p) => ({ x: p.x, y: p.y })),
      larguraMm: e.larguraMm,
      alvoEspelhoMm: e.alvoEspelhoMm,
      rotulo: e.rotulo,
    });
  });

  // `?? []` porque payload gravado antes das etiquetas existirem não tem o campo.
  // Snapshot é imutável: os antigos vão continuar sem ele para sempre, e quebrar
  // ao reabrir uma versão publicada seria perder o acervo por uma vírgula.
  const labels = payload.labels ?? [];
  labels.forEach((l, i) => {
    model.labels.push({
      id: nextId(model, 'lbl'),
      uid: uidDe('labels', i, labels.length),
      levelId: levelIds[l.level],
      at: { x: l.at.x, y: l.at.y },
      name: l.name,
    });
  });

  // `spaces` é derivado: recalculado pelo arranjo planar, nunca lido do payload.
  // O payload guarda os ambientes para consulta e auditoria do snapshot, não para
  // realimentar o kernel — se voltassem por aqui, uma divergência entre o gravado e
  // o recalculável passaria despercebida. O mesmo vale para `identity.spaces`:
  // o `labelUid` de cada ambiente volta a ser derivado da etiqueta.
  return recomputeSpaces(model);
}
