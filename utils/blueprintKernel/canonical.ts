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
  type DisciplinaDeRede,
  type TipoDePontoEletrico,
  type TipoDeInterruptor,
  type TipoDePontoHidraulico,
  type LigacaoDoCircuito,
  type FaseDoCircuito,
  type TipoDeAmbiente,
  type FuncaoCamada,
  type StructuralKind,
  type Parametros,
  type TipoDeRestricao,
  type FamiliaRestringivel,
  type RotacaoDoGrupo,
  type EspelhoDoGrupo,
  type TipoDeNucleo,
  type TipoDeVaga,
  type TipoDeComponente,
  type FamiliaDeComponente,
  type TipoDeGuardaCorpo,
  type MaterialDeGuardaCorpo,
  type TipoDeAnotacao,
  type VistaDaAnotacao,
  type TracoDaAnotacao,
  type PadraoDeHachura,
  type TipoDeRestricaoDoLote,
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
/**
 * Parâmetros personalizados (0.33.0): a chave só sai quando há ao menos um;
 * `stableStringify` ordena as chaves internas. Cópia, para o payload não
 * apontar para o objeto do modelo.
 */
function parametrosCanonicos(p: Parametros | undefined): Parametros | undefined {
  return p && Object.keys(p).length > 0 ? { ...p } : undefined;
}

function projetar(model: BlueprintModel): {
  geometria: Omit<CanonicalPayload, 'identity'>;
  identidade: IdentidadeCanonica;
} {
  // Níveis em ordem canônica, e o índice de cada um. Igual às paredes: o payload
  // referencia POSIÇÃO, não identificador.
  // Dois passos: primeiro a ordem (sem o vínculo), depois o vínculo por ÍNDICE
  // nessa ordem — o pavimento tipo (0.36.0) referencia outro pavimento, e a
  // referência canônica é sempre posição, nunca id.
  const ordemDosNiveis = ordenar(
    model.levels,
    (l) => ({ name: l.name, elevationMm: l.elevationMm, defaultHeightMm: l.defaultHeightMm }),
    (a, b) => a.elevationMm - b.elevationMm || a.name.localeCompare(b.name),
  );
  const levelIndex = new Map(ordemDosNiveis.map((l, i) => [l.item.id, i]));
  const nivel = (levelId: string) => levelIndex.get(levelId) ?? 0;
  const levels = ordemDosNiveis.map((l) => ({
    ...l,
    geom: { ...l.geom, tipoDe: l.item.tipoDeId !== undefined ? nivel(l.item.tipoDeId) : undefined },
  }));

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
      // FASE DE REFORMA (0.46.0): só quando EXISTENTE ou DEMOLIR — NOVO é o padrão e a ausência.
      fase: w.fase && w.fase !== 'NOVO' ? w.fase : undefined,
      // PAREDE CURVA (0.48.0): o círculo da faceta, só quando existe — parede
      // reta não ganha chave. É conteúdo (o canvas desenha o arco e o painel o
      // reconhece), então entra no hash.
      arco: w.arco ? { centro: { x: w.arco.centro.x, y: w.arco.centro.y }, raioMm: w.arco.raioMm } : undefined,
      parametros: parametrosCanonicos(w.parametros),
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
      fase: o.fase && o.fase !== 'NOVO' ? o.fase : undefined,
      // O TIPO, só quando declarado — a disciplina de `camadas`: emitir sempre
      // acrescentaria a chave a toda abertura do acervo. Campos reescritos um
      // a um, e `descricao` ENTRA pela razão escrita nas camadas: é o que o
      // usuário lê ao reabrir, e o payload é o único lugar onde ela sobrevive.
      esquadria: o.esquadria
        ? { nome: o.esquadria.nome, itemCode: o.esquadria.itemCode, descricao: o.esquadria.descricao }
        : undefined,
      parametros: parametrosCanonicos(o.parametros),
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
      // Restrição (0.41.0): só na RESTRICAO; ausente nas demais — a chave some.
      restricao: b.restricao ? { tipo: b.restricao.tipo, faixaMm: b.restricao.faixaMm } : undefined,
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
      fase: s.fase && s.fase !== 'NOVO' ? s.fase : undefined,
      parametros: parametrosCanonicos(s.parametros),
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
      // COBERTURA POR EXTRUSÃO (0.49.0): o eixo, só quando a água nasceu dele.
      extrusao: r.extrusao ? { a: { x: r.extrusao.a.x, y: r.extrusao.a.y }, b: { x: r.extrusao.b.x, y: r.extrusao.b.y } } : undefined,
      parametros: parametrosCanonicos(r.parametros),
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

  // EIXOS (0.34.0). Sem nível, como o corte; omitidos quando não há nenhum.
  const eixos = ordenar(
    model.eixos ?? [],
    (e) => ({
      nome: e.nome,
      a: { x: e.a.x, y: e.a.y },
      b: { x: e.b.x, y: e.b.y },
    }),
    (x, y) => x.a.x - y.a.x || x.a.y - y.a.y || x.b.x - y.b.x || x.b.y - y.b.y,
  );

  // RESTRIÇÕES (0.35.0): referências por ÍNDICE na ordem canônica da família —
  // nunca uid nem id. Omitidas quando não há nenhuma. Ordenadas por (tipo,
  // alvo, referência, valor) para o hash não depender da ordem de criação.
  const indiceDaParede = new Map(walls.map((w, i) => [w.item.uid, i]));
  const indiceDaEstrutura = new Map(structures.map((s, i) => [s.item.uid, i]));
  const indiceDoEixo = new Map(eixos.map((e, i) => [e.item.uid, i]));
  const indiceDe = (familia: 'wall' | 'structural' | 'eixo', uid: string | undefined): number =>
    (familia === 'wall' ? indiceDaParede : familia === 'structural' ? indiceDaEstrutura : indiceDoEixo).get(uid ?? '') ?? -1;
  const restricoes = ordenar(
    (model.restricoes ?? []).filter(
      (r) => indiceDe(r.alvo.familia, r.alvo.uid) >= 0 && (!r.referencia || indiceDe(r.referencia.familia, r.referencia.uid) >= 0),
    ),
    (r) => ({
      tipo: r.tipo,
      alvo: { familia: r.alvo.familia, indice: indiceDe(r.alvo.familia, r.alvo.uid) },
      referencia: r.referencia ? { familia: r.referencia.familia, indice: indiceDe(r.referencia.familia, r.referencia.uid) } : undefined,
      valorMm: r.valorMm,
    }),
    (x, y) =>
      cmpStr(x.tipo, y.tipo) ||
      cmpStr(x.alvo.familia, y.alvo.familia) ||
      indiceDe(x.alvo.familia, x.alvo.uid) - indiceDe(y.alvo.familia, y.alvo.uid) ||
      cmpStr(x.referencia?.familia ?? '', y.referencia?.familia ?? '') ||
      (x.referencia ? indiceDe(x.referencia.familia, x.referencia.uid) : -1) - (y.referencia ? indiceDe(y.referencia.familia, y.referencia.uid) : -1) ||
      (x.valorMm ?? -1) - (y.valorMm ?? -1),
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
      parametros: parametrosCanonicos(e.parametros),
      // Escada multiandares (0.39.0): chegada por índice; ausente = próximo acima.
      ate: e.ateLevelId && model.levels.some((l) => l.id === e.ateLevelId) ? nivel(e.ateLevelId) : undefined,
    }),
    (x, y) =>
      nivel(x.levelId) - nivel(y.levelId) ||
      x.pontos[0].x - y.pontos[0].x ||
      x.pontos[0].y - y.pontos[0].y,
  );

  // NÚCLEOS VERTICAIS (0.39.0): como as escadas — pavimentos por índice,
  // contorno inteiro, medidas do elevador só quando declaradas. Omitidos
  // quando não há nenhum.
  const nucleos = ordenar(
    model.nucleos ?? [],
    (n) => ({
      level: nivel(n.levelId),
      ate: n.ateLevelId && model.levels.some((l) => l.id === n.ateLevelId) ? nivel(n.ateLevelId) : undefined,
      tipo: n.tipo,
      ring: n.ring.map((p) => ({ x: p.x, y: p.y })),
      rotulo: n.rotulo ?? null,
      disciplina: n.disciplina ?? undefined,
      pocoMm: n.pocoMm ?? undefined,
      casaDeMaquinasMm: n.casaDeMaquinasMm ?? undefined,
      capacidade: n.capacidade ?? undefined,
      parametros: parametrosCanonicos(n.parametros),
    }),
    (x, y) => nivel(x.levelId) - nivel(y.levelId) || x.ring[0].x - y.ring[0].x || x.ring[0].y - y.ring[0].y || cmpStr(x.tipo, y.tipo),
  );

  // VAGAS (0.40.0): centro, medidas, giro, tipo, número; `sugerida` só quando
  // verdadeira. Omitidas quando não há nenhuma.
  const vagas = ordenar(
    model.vagas ?? [],
    (v) => ({
      level: nivel(v.levelId),
      at: { x: v.at.x, y: v.at.y },
      larguraMm: v.larguraMm,
      comprimentoMm: v.comprimentoMm,
      rotacaoGraus: v.rotacaoGraus,
      tipo: v.tipo,
      numero: v.numero ?? null,
      sugerida: v.sugerida ? true : undefined,
      parametros: parametrosCanonicos(v.parametros),
    }),
    (x, y) => nivel(x.levelId) - nivel(y.levelId) || x.at.x - y.at.x || x.at.y - y.at.y || cmpStr(x.tipo, y.tipo),
  );

  // COMPONENTES (0.42.0): centro, medidas, giro, tipo do catálogo, família,
  // rótulo; `sugerido` só quando verdadeiro. Omitidos quando não há nenhum.
  const componentes = ordenar(
    model.componentes ?? [],
    (c) => ({
      level: nivel(c.levelId),
      at: { x: c.at.x, y: c.at.y },
      larguraMm: c.larguraMm,
      profundidadeMm: c.profundidadeMm,
      alturaMm: c.alturaMm,
      rotacaoGraus: c.rotacaoGraus,
      cotaMm: c.cotaMm ? c.cotaMm : undefined,
      tipoId: c.tipoId,
      familia: c.familia,
      rotulo: c.rotulo ?? null,
      sugerido: c.sugerido ? true : undefined,
      fase: c.fase && c.fase !== 'NOVO' ? c.fase : undefined,
      parametros: parametrosCanonicos(c.parametros),
    }),
    (x, y) => nivel(x.levelId) - nivel(y.levelId) || x.at.x - y.at.x || x.at.y - y.at.y || cmpStr(x.tipoId, y.tipoId),
  );

  // GUARDA-CORPOS (0.44.0): polilinha, altura, tipo, material, código,
  // descrição, rótulo; `sugerido` só quando verdadeiro. Omitidos quando não há.
  const guardaCorpos = ordenar(
    model.guardaCorpos ?? [],
    (g) => ({
      level: nivel(g.levelId),
      pontos: g.pontos.map((p) => ({ x: p.x, y: p.y })),
      alturaMm: g.alturaMm,
      tipo: g.tipo,
      material: g.material,
      itemCode: g.itemCode,
      descricao: g.descricao,
      rotulo: g.rotulo ?? null,
      sugerido: g.sugerido ? true : undefined,
      parametros: parametrosCanonicos(g.parametros),
    }),
    (x, y) => nivel(x.levelId) - nivel(y.levelId) || x.pontos[0].x - y.pontos[0].x || x.pontos[0].y - y.pontos[0].y || cmpStr(x.tipo, y.tipo),
  );

  // ANOTAÇÕES (0.45.0): a vista por ÍNDICE (pavimento na ordem canônica de
  // `levels`; corte na ordem canônica de `sections`; elevação pela direção),
  // pontos, tipo, texto, altura, traço, hachura, giro, cor. Omitidas quando não há.
  const indiceDoCorte = new Map(sections.map((c, i) => [c.item.id, i]));
  const anotacoes = ordenar(
    (model.anotacoes ?? []).filter((a) => a.vista.tipo !== 'CORTE' || indiceDoCorte.has(a.vista.corteId)),
    (a) => ({
      vista:
        a.vista.tipo === 'PLANTA'
          ? { tipo: 'PLANTA' as const, level: nivel(a.vista.levelId) }
          : a.vista.tipo === 'CORTE'
            ? { tipo: 'CORTE' as const, corte: indiceDoCorte.get(a.vista.corteId) ?? -1 }
            : { tipo: 'ELEVACAO' as const, direcao: a.vista.direcao },
      pontos: a.pontos.map((p) => ({ x: p.x, y: p.y })),
      tipo: a.tipo,
      texto: a.texto ?? null,
      alturaMm: a.alturaMm,
      traco: a.traco,
      hachura: a.hachura ?? null,
      rotacaoGraus: a.rotacaoGraus,
      cor: a.cor ?? null,
      // NUVEM DE REVISÃO (0.50.0): só a nuvem tem; as demais não ganham chave.
      revisao: a.revisao ? { numero: a.revisao.numero, data: a.revisao.data } : undefined,
      parametros: parametrosCanonicos(a.parametros),
    }),
    (x, y) => {
      const kx = x.vista.tipo === 'PLANTA' ? `0:${String(nivel(x.vista.levelId)).padStart(4, '0')}` : x.vista.tipo === 'CORTE' ? `1:${String(indiceDoCorte.get(x.vista.corteId) ?? 0).padStart(4, '0')}` : `2:${x.vista.direcao}`;
      const ky = y.vista.tipo === 'PLANTA' ? `0:${String(nivel(y.vista.levelId)).padStart(4, '0')}` : y.vista.tipo === 'CORTE' ? `1:${String(indiceDoCorte.get(y.vista.corteId) ?? 0).padStart(4, '0')}` : `2:${y.vista.direcao}`;
      return cmpStr(kx, ky) || x.pontos[0].x - y.pontos[0].x || x.pontos[0].y - y.pontos[0].y || cmpStr(x.tipo, y.tipo) || cmpStr(x.texto ?? '', y.texto ?? '');
    },
  );

  // QUADROS e CIRCUITOS, ANTES das instalações.
  //
  // ⚠️ A ordem é OBRIGATÓRIA, não estética: a projeção do terminal referencia
  // `indiceDoCircuito`, e ela roda dentro de `ordenar` — ou seja, na linha em
  // que o terminal é projetado, não depois. Com este bloco embaixo, o kernel
  // estourava "Cannot access before initialization" em todo desenho com ponto
  // elétrico. É o mesmo defeito de TDZ que derrubou a vista 3D em 05/09/2026.
  //
  // Omitidos quando não há nenhum, como as instalações.
  //
  // ⚠️ O circuito referencia o quadro por POSIÇÃO na ordem canônica, e não por
  // id — é a mesma disciplina de `level` em toda família: o payload não carrega
  // identificador de linha, carrega índice. E o terminal referencia o circuito
  // do mesmo jeito.
  const quadros = ordenar(
    model.quadros ?? [],
    (q) => ({
      level: nivel(q.levelId),
      nome: q.nome,
      at: { x: q.at.x, y: q.at.y },
      cotaMm: q.cotaMm,
      // ⚠️ `undefined` quando não declarado, e não o PADRÃO: gravar 400 aqui
      // mudaria a forma canônica — e o hash — de todo desenho anterior às
      // medidas, e o acervo inteiro apareceria como alterado sem que ninguém
      // tivesse mexido nele. É a mesma decisão do `circuito` no terminal.
      larguraMm: q.larguraMm ?? undefined,
      alturaMm: q.alturaMm ?? undefined,
      profundidadeMm: q.profundidadeMm ?? undefined,
      rotacaoGraus: q.rotacaoGraus ?? undefined,
      // A alimentação (13/09/2026): omitida quando não declarada.
      ligacao: q.ligacao ?? undefined,
      tensaoV: q.tensaoV ?? undefined,
      alimentadorM: q.alimentadorM ?? undefined,
      parametros: parametrosCanonicos(q.parametros),
    }),
    (x, y) => nivel(x.levelId) - nivel(y.levelId) || x.at.x - y.at.x || x.at.y - y.at.y,
  );
  const indiceDoQuadro = new Map(quadros.map((q, i) => [q.item.id, i]));

  const circuitos = ordenar(
    model.circuitos ?? [],
    (c) => ({
      quadro: indiceDoQuadro.get(c.quadroId) ?? 0,
      nome: c.nome,
      tipo: c.tipo ?? null,
      tensaoV: c.tensaoV ?? null,
      disjuntorA: c.disjuntorA ?? null,
      secaoMm2: c.secaoMm2 ?? null,
      // Os três são omitidos quando ausentes — todo circuito anterior a
      // 13/09/2026 está assim, e o hash dele não muda por isto.
      ligacao: c.ligacao ?? undefined,
      protecaoDR: c.protecaoDR ?? undefined,
      fase: c.fase ?? undefined,
    }),
    (x, y) =>
      (indiceDoQuadro.get(x.quadroId) ?? 0) - (indiceDoQuadro.get(y.quadroId) ?? 0) ||
      cmpStr(x.nome, y.nome),
  );
  const indiceDoCircuito = new Map(circuitos.map((c, i) => [c.item.id, i]));

  // INSTALAÇÕES. Como as escadas, a chave é OMITIDA quando não há nenhuma —
  // assim o payload e o hash de todo desenho sem instalação continuam
  // exatamente o que eram, e as goldens do acervo não se movem.
  //
  // ⚠️ As DUAS COTAS entram. Sem elas o payload não distinguiria uma prumada de
  // um trecho degenerado, nem um esgoto com caimento de um sem — e as duas
  // coisas são o desenho, não derivação dele.
  const trechos = ordenar(
    model.trechos ?? [],
    (t) => ({
      level: nivel(t.levelId),
      disciplina: t.disciplina,
      a: { x: t.a.x, y: t.a.y },
      b: { x: t.b.x, y: t.b.y },
      cotaAMm: t.cotaAMm,
      cotaBMm: t.cotaBMm,
      bitolaMm: t.bitolaMm,
      itemCode: t.itemCode ?? null,
      rotulo: t.rotulo ?? null,
      // ⚠️ `undefined` quando não há: emitir a chave em todo trecho mudaria a
      // forma canônica — e o hash — dos desenhos anteriores. Vários circuitos
      // (0.31): índices em ordem crescente, sem repetição.
      circuitos:
        t.circuitoIds && t.circuitoIds.length > 0
          ? [...new Set(t.circuitoIds.map((cid) => indiceDoCircuito.get(cid) ?? 0))].sort((p, q) => p - q)
          : undefined,
      condutores: t.condutores ?? undefined,
      // `true` ou AUSENTE — nunca `false`, pela razão do `sugerida` do terminal.
      sugerido: t.sugerido ? (true as const) : undefined,
      parametros: parametrosCanonicos(t.parametros),
    }),
    (x, y) =>
      nivel(x.levelId) - nivel(y.levelId) ||
      x.a.x - y.a.x ||
      x.a.y - y.a.y ||
      x.cotaAMm - y.cotaAMm,
  );

  const terminais = ordenar(
    model.terminais ?? [],
    (t) => ({
      level: nivel(t.levelId),
      disciplina: t.disciplina,
      tipo: t.tipo,
      at: { x: t.at.x, y: t.at.y },
      cotaMm: t.cotaMm,
      itemCode: t.itemCode ?? null,
      rotulo: t.rotulo ?? null,
      // ⚠️ `undefined` quando não há, e não `null`: o `stableStringify` filtra
      // `undefined`, então a CHAVE SOME. Emitir `null` em todo terminal mudaria
      // a forma canônica dos desenhos que nunca souberam o que é circuito — e o
      // hash deles junto. É a mesma decisão de `alinhamento` na parede.
      circuito: t.circuitoId != null ? (indiceDoCircuito.get(t.circuitoId) ?? 0) : undefined,
      potenciaW: t.potenciaW ?? undefined,
      tipoEletrico: t.tipoEletrico ?? undefined,
      comando: t.comando ?? undefined,
      // ⚠️ `true` ou AUSENTE — nunca `false`. "Não sugerida" é o estado de todo
      // ponto anterior a 10/09/2026, e emitir `false` neles mudaria o hash do
      // acervo inteiro.
      sugerida: t.sugerida ? (true as const) : undefined,
      interruptor: t.interruptor ?? undefined,
      tipoHidraulico: t.tipoHidraulico ?? undefined,
      volumeL: t.volumeL ?? undefined,
      larguraMm: t.larguraMm ?? undefined,
      alturaMm: t.alturaMm ?? undefined,
      profundidadeMm: t.profundidadeMm ?? undefined,
      rotacaoGraus: t.rotacaoGraus ?? undefined,
      parametros: parametrosCanonicos(t.parametros),
    }),
    (x, y) =>
      nivel(x.levelId) - nivel(y.levelId) || x.at.x - y.at.x || x.at.y - y.at.y || x.cotaMm - y.cotaMm,
  );

  // Etiquetas de ambiente. Entram no canônico porque são CONTEÚDO: renomear um
  // ambiente muda o desenho de forma observável e tem que mudar o hash — senão
  // publicar depois de renomear seria idempotente e o nome nunca chegaria ao
  // snapshot. Ordenadas por posição, como todo o resto.
  const labels = ordenar(
    model.labels ?? [],
    (l) => ({
      level: nivel(l.levelId),
      at: { x: l.at.x, y: l.at.y },
      name: l.name,
      // `undefined` quando ausente: a chave some, e o hash dos desenhos que
      // nunca souberam de tipo de ambiente não muda.
      tipoDeAmbiente: l.tipoDeAmbiente ?? undefined,
      // ACABAMENTOS (0.43.0): só quando declarados, campo a campo na ordem
      // fixa — o `stableStringify` ordena chaves, mas a forma tem de ser a
      // mesma na ida e na volta.
      acabamentos: l.acabamentos
        ? {
            piso: l.acabamentos.piso?.map((c) => ({ espessuraMm: c.espessuraMm, itemCode: c.itemCode, descricao: c.descricao, funcao: c.funcao })),
            forro: l.acabamentos.forro
              ? { camadas: l.acabamentos.forro.camadas.map((c) => ({ espessuraMm: c.espessuraMm, itemCode: c.itemCode, descricao: c.descricao, funcao: c.funcao })), rebaixoMm: l.acabamentos.forro.rebaixoMm }
              : undefined,
            rodape: l.acabamentos.rodape === undefined ? undefined : l.acabamentos.rodape === null ? null : { alturaMm: l.acabamentos.rodape.alturaMm, itemCode: l.acabamentos.rodape.itemCode, descricao: l.acabamentos.rodape.descricao },
          }
        : undefined,
    }),
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

  // UNIDADES (0.37.0): etiquetas por ÍNDICE na ordem canônica de `labels`,
  // ordenadas por número (único). Omitidas quando não há nenhuma. Etiqueta
  // fora da lista é descartada — nunca uid nem id no hash.
  const indiceDaEtiqueta = new Map(labels.map((l, i) => [l.item.uid, i]));
  const unidades = ordenar(
    model.unidades ?? [],
    (u) => ({
      numero: u.numero,
      tipologia: u.tipologia ?? undefined,
      pcd: u.pcd,
      etiquetas: u.etiquetaUids
        .map((uid) => indiceDaEtiqueta.get(uid))
        .filter((i): i is number => i !== undefined)
        .sort((x, y) => x - y),
    }),
    (x, y) => cmpStr(x.numero, y.numero),
  );

  // GRUPOS (0.38.0): origem por ÍNDICE nas famílias ordenadas; instâncias com a
  // transformação. Omitidos quando não há nenhum. Ordenados por (pavimento,
  // pivô, nome); as instâncias por (pavimento, translação, giro, espelho).
  const indiceDeParede = new Map(walls.map((w, i) => [w.item.uid, i]));
  const indiceDeEstruturaG = new Map(structures.map((s, i) => [s.item.uid, i]));
  const indiceDeEtiquetaG = new Map(labels.map((l, i) => [l.item.uid, i]));
  const indices = (uids: string[], m: Map<string | undefined, number>) => uids.map((u) => m.get(u)).filter((i): i is number => i !== undefined).sort((x, y) => x - y);
  const grupos = ordenar(
    (model.grupos ?? []).filter((g) => model.levels.some((l) => l.id === g.levelId)),
    (g) => ({
      nome: g.nome,
      level: nivel(g.levelId),
      pivo: { x: g.pivo.x, y: g.pivo.y },
      origem: { walls: indices(g.origem.walls, indiceDeParede), structures: indices(g.origem.structures, indiceDeEstruturaG), labels: indices(g.origem.labels, indiceDeEtiquetaG) },
      instancias: [...g.instancias]
        .filter((i) => model.levels.some((l) => l.id === i.levelId))
        .sort((x, y) => nivel(x.levelId) - nivel(y.levelId) || x.translacao.x - y.translacao.x || x.translacao.y - y.translacao.y || x.rotacaoGraus - y.rotacaoGraus || cmpStr(x.espelho, y.espelho))
        .map((i) => ({ level: nivel(i.levelId), translacao: { x: i.translacao.x, y: i.translacao.y }, rotacaoGraus: i.rotacaoGraus, espelho: i.espelho })),
    }),
    (x, y) => nivel(x.levelId) - nivel(y.levelId) || x.pivo.x - y.pivo.x || x.pivo.y - y.pivo.y || cmpStr(x.nome, y.nome),
  );
  const instanciasOrdenadas = grupos.flatMap((g) =>
    [...g.item.instancias]
      .filter((i) => model.levels.some((l) => l.id === i.levelId))
      .sort((x, y) => nivel(x.levelId) - nivel(y.levelId) || x.translacao.x - y.translacao.x || x.translacao.y - y.translacao.y || x.rotacaoGraus - y.rotacaoGraus || cmpStr(x.espelho, y.espelho)),
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
    // Mesma regra, pela mesma razão: sem coordenada informada, o payload de
    // TODO desenho do acervo continua exatamente o que era. E os campos de
    // dentro seguem a regra também — `elevacaoM` ausente não vira `null`, senão
    // dois desenhos iguais teriam formas canônicas diferentes conforme por qual
    // caminho a georreferência foi gravada.
    georreferencia: model.georreferencia
      ? {
          latitude: model.georreferencia.latitude,
          longitude: model.georreferencia.longitude,
          ...(model.georreferencia.elevacaoM === null ||
          model.georreferencia.elevacaoM === undefined
            ? {}
            : { elevacaoM: model.georreferencia.elevacaoM }),
          ...(model.georreferencia.rotacaoNorteDeg === null ||
          model.georreferencia.rotacaoNorteDeg === undefined
            ? {}
            : { rotacaoNorteDeg: model.georreferencia.rotacaoNorteDeg }),
          ...(model.georreferencia.projetada
            ? {
                projetada: {
                  lesteM: model.georreferencia.projetada.lesteM,
                  norteM: model.georreferencia.projetada.norteM,
                  crs: model.georreferencia.projetada.crs,
                },
              }
            : {}),
        }
      : undefined,
    levels: levels.map((l) => l.geom),
    walls: walls.map((w) => w.geom),
    openings: openings.map((o) => o.geom),
    boundaries: boundaries.map((b) => b.geom),
    structures: structures.length ? structures.map((s) => s.geom) : undefined,
    roofs: roofs.length ? roofs.map((r) => r.geom) : undefined,
    sections: sections.length ? sections.map((c) => c.geom) : undefined,
    eixos: eixos.length ? eixos.map((e) => e.geom) : undefined,
    restricoes: restricoes.length ? restricoes.map((r) => r.geom) : undefined,
    stairs: stairs.length ? stairs.map((e) => e.geom) : undefined,
    nucleos: nucleos.length ? nucleos.map((n) => n.geom) : undefined,
    vagas: vagas.length ? vagas.map((v) => v.geom) : undefined,
    componentes: componentes.length ? componentes.map((c) => c.geom) : undefined,
    guardaCorpos: guardaCorpos.length ? guardaCorpos.map((g) => g.geom) : undefined,
    anotacoes: anotacoes.length ? anotacoes.map((a) => a.geom) : undefined,
    trechos: trechos.length ? trechos.map((t) => t.geom) : undefined,
    terminais: terminais.length ? terminais.map((t) => t.geom) : undefined,
    quadros: quadros.length ? quadros.map((q) => q.geom) : undefined,
    circuitos: circuitos.length ? circuitos.map((c) => c.geom) : undefined,
    labels: labels.map((l) => l.geom),
    unidades: unidades.length ? unidades.map((u) => u.geom) : undefined,
    grupos: grupos.length ? grupos.map((g) => g.geom) : undefined,
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
    eixos: eixos.map((e) => e.item.uid ?? null),
    restricoes: restricoes.map((r) => r.item.uid ?? null),
    stairs: stairs.map((e) => e.item.uid ?? null),
    nucleos: nucleos.map((n) => n.item.uid ?? null),
    vagas: vagas.map((v) => v.item.uid ?? null),
    componentes: componentes.map((c) => c.item.uid ?? null),
    guardaCorpos: guardaCorpos.map((g) => g.item.uid ?? null),
    anotacoes: anotacoes.map((a) => a.item.uid ?? null),
    trechos: trechos.map((t) => t.item.uid ?? null),
    terminais: terminais.map((t) => t.item.uid ?? null),
    quadros: quadros.map((q) => q.item.uid ?? null),
    circuitos: circuitos.map((c) => c.item.uid ?? null),
    labels: labels.map((l) => l.item.uid ?? null),
    unidades: unidades.map((u) => u.item.uid ?? null),
    grupos: grupos.map((g) => g.item.uid ?? null),
    instanciasDeGrupo: instanciasOrdenadas.map((i) => i.uid ?? null),
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
  /** Ausente em payload gravado sob kernel anterior a 0.34.0. */
  eixos?: (ElementUid | null)[];
  /** Ausente em payload gravado sob kernel anterior a 0.35.0. */
  restricoes?: (ElementUid | null)[];
  /** Ausente em payload gravado sob kernel anterior a 0.14.0. */
  stairs?: (ElementUid | null)[];
  /** Ausente em payload gravado sob kernel anterior a 0.39.0. */
  nucleos?: (ElementUid | null)[];
  /** Ausente em payload gravado sob kernel anterior a 0.40.0. */
  vagas?: (ElementUid | null)[];
  componentes?: (ElementUid | null)[];
  guardaCorpos?: (ElementUid | null)[];
  anotacoes?: (ElementUid | null)[];
  trechos?: (ElementUid | null)[];
  terminais?: (ElementUid | null)[];
  quadros?: (ElementUid | null)[];
  circuitos?: (ElementUid | null)[];
  labels: (ElementUid | null)[];
  /** Ausente em payload gravado sob kernel anterior a 0.37.0. */
  unidades?: (ElementUid | null)[];
  /** Ausentes em payload gravado sob kernel anterior a 0.38.0. As instâncias, achatadas na ordem canônica. */
  grupos?: (ElementUid | null)[];
  instanciasDeGrupo?: (ElementUid | null)[];
  spaces: (ElementUid | null)[];
}

/** Forma tipada do payload canônico. É o contrato de persistência do snapshot. */
export interface CanonicalPayload {
  kernel: string;
  toleranceMm: number;
  /** Ausente em payload gravado sob kernel < 0.6.0. */
  areaEscrituraMm2?: number | null;
  /** Ausente em payload gravado sob kernel < 0.17.0, e em todo desenho sem lugar. */
  georreferencia?: {
    latitude: number;
    longitude: number;
    elevacaoM?: number;
    rotacaoNorteDeg?: number;
    projetada?: { lesteM: number; norteM: number; crs: string };
  };
  levels: { name: string; elevationMm: number; defaultHeightMm: number; /** Índice do pavimento TIPO (0.36.0); ausente = pavimento próprio. */ tipoDe?: number }[];
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
    /** Ausente sob kernel < 0.48.0 e em toda parede RETA. Faceta de parede curva: o círculo dela. */
    arco?: { centro: { x: number; y: number }; raioMm: number };
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
    /** Ausente sob kernel < 0.33.0 e em toda peça sem parâmetro. */
    parametros?: Parametros;
    /** Fase de reforma (0.46.0). Ausente = NOVO. */
    fase?: 'EXISTENTE' | 'DEMOLIR';
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
    /** Fase de reforma (0.46.0). Ausente = NOVO. */
    fase?: 'EXISTENTE' | 'DEMOLIR';
    parametros?: Parametros;
  }[];
  boundaries: {
    level: number;
    /** Ausentes em payload gravado sob kernel < 0.5.0. */
    kind?: BoundaryKind;
    papel?: BoundaryPapel | null;
    /** Ausentes em payload gravado sob kernel < 0.6.0. */
    medidaEscrituraMm?: number | null;
    confrontante?: string | null;
    /** Só na RESTRICAO (kernel ≥ 0.41.0). */
    restricao?: { tipo: TipoDeRestricaoDoLote; faixaMm: number };
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
    /** Fase de reforma (0.46.0). Ausente = NOVO. */
    fase?: 'EXISTENTE' | 'DEMOLIR';
    parametros?: Parametros;
  }[];
  /**
   * Águas de telhado. Ausente em payload gravado sob kernel < 0.12.0 e em
   * desenho sem cobertura — a chave só existe quando há o que declarar.
   */
  roofs?: {
    level: number;
    pontos: { x: number; y: number }[];
    beiralIndex: number;
    parametros?: Parametros;
    inclinacaoPct: number;
    baseMm: number;
    espessuraMm: number;
    /** Ausente sob kernel < 0.49.0 e em água desenhada à mão: o eixo da extrusão que a gerou. */
    extrusao?: { a: { x: number; y: number }; b: { x: number; y: number } };
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
  /** Eixos da malha. Ausente sob kernel < 0.34.0 e em desenho sem eixo. */
  eixos?: {
    nome: string;
    a: { x: number; y: number };
    b: { x: number; y: number };
  }[];
  /** Restrições. Ausente sob kernel < 0.35.0 e em desenho sem nenhuma. Referências por índice. */
  restricoes?: {
    tipo: TipoDeRestricao;
    alvo: { familia: 'wall' | 'structural'; indice: number };
    referencia?: { familia: FamiliaRestringivel; indice: number };
    valorMm?: number;
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
    parametros?: Parametros;
    /** Chegada declarada (índice). Ausente sob kernel < 0.39.0 e quando é o próximo acima. */
    ate?: number;
  }[];
  /** Vagas de garagem. Ausente sob kernel < 0.40.0 e em desenho sem nenhuma. */
  vagas?: {
    level: number;
    at: { x: number; y: number };
    larguraMm: number;
    comprimentoMm: number;
    rotacaoGraus: number;
    tipo: TipoDeVaga;
    numero: string | null;
    sugerida?: boolean;
    parametros?: Parametros;
  }[];
  /** Componentes (mobiliário, louças…). Ausente sob kernel < 0.42.0 e em desenho sem nenhum. */
  componentes?: {
    level: number;
    at: { x: number; y: number };
    larguraMm: number;
    profundidadeMm: number;
    alturaMm: number;
    rotacaoGraus: number;
    /** Base acima do piso (0.47.0). Ausente = 0. */
    cotaMm?: number;
    tipoId: TipoDeComponente;
    familia: FamiliaDeComponente;
    rotulo: string | null;
    sugerido?: boolean;
    /** Fase de reforma (0.46.0). Ausente = NOVO. */
    fase?: 'EXISTENTE' | 'DEMOLIR';
    parametros?: Parametros;
  }[];
  /** Guarda-corpos e corrimãos. Ausente sob kernel < 0.44.0 e em desenho sem nenhum. */
  guardaCorpos?: {
    level: number;
    pontos: { x: number; y: number }[];
    alturaMm: number;
    tipo: TipoDeGuardaCorpo;
    material: MaterialDeGuardaCorpo;
    itemCode: string;
    descricao: string;
    rotulo: string | null;
    sugerido?: boolean;
    parametros?: Parametros;
  }[];
  /** Anotações por vista. Ausente sob kernel < 0.45.0 e em desenho sem nenhuma. */
  anotacoes?: {
    vista: { tipo: 'PLANTA'; level: number } | { tipo: 'CORTE'; corte: number } | { tipo: 'ELEVACAO'; direcao: BoundaryPapel };
    pontos: { x: number; y: number }[];
    tipo: TipoDeAnotacao;
    texto: string | null;
    alturaMm: number;
    traco: TracoDaAnotacao;
    hachura: PadraoDeHachura | null;
    rotacaoGraus: number;
    cor: string | null;
    /** Só na NUVEM (kernel ≥ 0.50.0): número e data ISO da revisão. */
    revisao?: { numero: number; data: string };
    parametros?: Parametros;
  }[];
  /** Núcleos verticais. Ausente sob kernel < 0.39.0 e em desenho sem nenhum. */
  nucleos?: {
    level: number;
    ate?: number;
    tipo: TipoDeNucleo;
    ring: { x: number; y: number }[];
    rotulo: string | null;
    /** Só shaft (0.47.0): a disciplina da prumada. */
    disciplina?: DisciplinaDeRede;
    pocoMm?: number;
    casaDeMaquinasMm?: number;
    capacidade?: number;
    parametros?: Parametros;
  }[];
  /**
   * Trechos de instalação. Ausente sob kernel < 0.18.0 e em desenho sem rede.
   *
   * ⚠️ As DUAS COTAS são gravadas, e não uma altura só. É o que distingue a
   * PRUMADA (mesmo ponto em planta, cotas diferentes) do trecho degenerado, e o
   * esgoto COM caimento do sem — e as duas coisas são o desenho, não derivação
   * dele. Ver o cabeçalho de `Trecho` em `model.ts`.
   */
  trechos?: {
    level: number;
    disciplina: string;
    a: { x: number; y: number };
    b: { x: number; y: number };
    cotaAMm: number;
    cotaBMm: number;
    bitolaMm: number;
    itemCode: string | null;
    rotulo: string | null;
    /** ÍNDICE do circuito na ordem canônica. Ausente = trecho sem circuito. */
    /** Legado (um circuito por trecho, até 0.30). Lido como lista de um. */
    circuito?: number;
    /** Índices dos circuitos que passam pelo eletroduto (0.31+). */
    circuitos?: number[];
    /** Quantos fios passam no eletroduto. Ausente sob kernel < 0.23.0. */
    condutores?: number;
    /** Lançado pelo sistema e ainda não confirmado. Ausente sob kernel < 0.30.0 e quando falso. */
    sugerido?: true;
    parametros?: Parametros;
  }[];
  /** Terminais de instalação. Ausente sob kernel < 0.18.0 e em desenho sem rede. */
  terminais?: {
    level: number;
    disciplina: string;
    tipo: string;
    at: { x: number; y: number };
    cotaMm: number;
    itemCode: string | null;
    rotulo: string | null;
    /** ÍNDICE do circuito na ordem canônica. Ausente = ponto sem circuito. */
    circuito?: number;
    /** Carga DECLARADA. Ausente = ninguém informou — que é diferente de zero. */
    potenciaW?: number;
    /** Letra do comando ("a", "b"). Ausente sob kernel < 0.23.0 e quando não há. */
    comando?: string;
    /** Gerado pelo sistema e ainda não tocado. Ausente sob kernel < 0.24.0 e quando falso. */
    sugerida?: true;
    /** Variante do interruptor. Ausente sob kernel < 0.27.0 e quando não declarada. */
    interruptor?: string;
    /** Classificação do ponto. Ausente sob kernel < 0.22.0 e quando não classificado. */
    tipoEletrico?: string;
    /** Classificação hidráulica. Ausente sob kernel < 0.32.0 e quando não classificado. */
    tipoHidraulico?: string;
    /** Volume do reservatório em litros. Ausente sob kernel < 0.32.0 e fora de RESERVATORIO. */
    volumeL?: number;
    /** Medidas em mm. Ausentes sob kernel < 0.20.0 e quando não declaradas. */
    larguraMm?: number;
    alturaMm?: number;
    profundidadeMm?: number;
    /** Giro em planta, graus inteiros 0–359. Ausente sob kernel < 0.21.0 e = 0. */
    rotacaoGraus?: number;
    /** Alimentação do quadro. Ausentes sob kernel < 0.29.0 e quando não declarados. */
    ligacao?: string;
    tensaoV?: number;
    alimentadorM?: number;
    parametros?: Parametros;
  }[];
  /** Quadros de distribuição. Ausente sob kernel < 0.19.0 e em desenho sem um. */
  quadros?: {
    level: number;
    nome: string;
    at: { x: number; y: number };
    cotaMm: number;
    /** Medidas em mm. Ausentes sob kernel < 0.20.0 e quando não declaradas. */
    larguraMm?: number;
    alturaMm?: number;
    profundidadeMm?: number;
    /** Giro em planta, graus inteiros 0–359. Ausente sob kernel < 0.21.0 e = 0. */
    rotacaoGraus?: number;
    /** Alimentação do quadro. Ausentes sob kernel < 0.29.0 e quando não declarados. */
    ligacao?: string;
    tensaoV?: number;
    alimentadorM?: number;
    parametros?: Parametros;
  }[];
  /**
   * Circuitos. Ausente sob kernel < 0.19.0 e em desenho sem nenhum.
   *
   * ⚠️ Sem `level`, e é de propósito: um circuito alimenta pontos de mais de um
   * pavimento. `quadro` é o ÍNDICE do quadro na ordem canônica.
   */
  circuitos?: {
    quadro: number;
    nome: string;
    tipo: string | null;
    tensaoV: number | null;
    disjuntorA: number | null;
    secaoMm2: number | null;
    /** Ausentes sob kernel < 0.28.0 e quando não declarados. */
    ligacao?: string;
    protecaoDR?: boolean;
    fase?: string;
  }[];
  labels: {
    level: number;
    at: { x: number; y: number };
    name: string;
    /** Tipo do ambiente (NBR 5410). Ausente sob kernel < 0.24.0 e quando não classificado. */
    tipoDeAmbiente?: string;
    /** Piso, forro e rodapé (E7.2). Ausente sob kernel < 0.43.0 e quando nada foi declarado. */
    acabamentos?: {
      piso?: { espessuraMm: number; itemCode: string; descricao: string; funcao: string }[];
      forro?: { camadas: { espessuraMm: number; itemCode: string; descricao: string; funcao: string }[]; rebaixoMm: number };
      rodape?: { alturaMm: number; itemCode: string; descricao: string } | null;
    };
  }[];
  /** Unidades. Ausente sob kernel < 0.37.0 e em desenho sem nenhuma. Etiquetas por índice em `labels`. */
  unidades?: {
    numero: string;
    tipologia?: string;
    pcd: boolean;
    etiquetas: number[];
  }[];
  /** Grupos com origem. Ausente sob kernel < 0.38.0 e em desenho sem nenhum. Origem por índice. */
  grupos?: {
    nome: string;
    level: number;
    pivo: { x: number; y: number };
    origem: { walls: number[]; structures: number[]; labels: number[] };
    instancias: { level: number; translacao: { x: number; y: number }; rotacaoGraus: number; espelho: string }[];
  }[];
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
  model.georreferencia = payload.georreferencia
    ? {
        latitude: payload.georreferencia.latitude,
        longitude: payload.georreferencia.longitude,
        elevacaoM: payload.georreferencia.elevacaoM ?? null,
        rotacaoNorteDeg: payload.georreferencia.rotacaoNorteDeg ?? null,
        projetada: payload.georreferencia.projetada
          ? { ...payload.georreferencia.projetada }
          : null,
      }
    : null;

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
  // O vínculo do pavimento tipo, DEPOIS de todos existirem (é índice na lista).
  payload.levels.forEach((l, i) => {
    if (l.tipoDe !== undefined && levelIds[l.tipoDe] && l.tipoDe !== i) model.levels[i].tipoDeId = levelIds[l.tipoDe];
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
      ...(w.fase ? { fase: w.fase } : {}),
      ...(w.arco ? { arco: { centro: { x: w.arco.centro.x, y: w.arco.centro.y }, raioMm: w.arco.raioMm } } : {}),
      ...(w.parametros && Object.keys(w.parametros).length > 0 ? { parametros: { ...w.parametros } } : {}),
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
      ...(o.fase ? { fase: o.fase } : {}),
      ...(o.esquadria
        ? { esquadria: { nome: o.esquadria.nome, itemCode: o.esquadria.itemCode, descricao: o.esquadria.descricao } }
        : {}),
      ...(o.parametros && Object.keys(o.parametros).length > 0 ? { parametros: { ...o.parametros } } : {}),
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
      ...(b.restricao ? { restricao: { tipo: b.restricao.tipo, faixaMm: b.restricao.faixaMm } } : {}),
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
      ...(s.fase ? { fase: s.fase } : {}),
      ...(s.parametros && Object.keys(s.parametros).length > 0 ? { parametros: { ...s.parametros } } : {}),
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
      ...(r.extrusao ? { extrusao: { a: { x: r.extrusao.a.x, y: r.extrusao.a.y }, b: { x: r.extrusao.b.x, y: r.extrusao.b.y } } } : {}),
      ...(r.parametros && Object.keys(r.parametros).length > 0 ? { parametros: { ...r.parametros } } : {}),
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

  const eixos = payload.eixos ?? [];
  eixos.forEach((e, i) => {
    model.eixos.push({
      id: nextId(model, 'eix'),
      uid: uidDe('eixos', i, eixos.length),
      nome: e.nome,
      a: { x: e.a.x, y: e.a.y },
      b: { x: e.b.x, y: e.b.y },
    });
  });

  // Restrições: DEPOIS de paredes, estruturas e eixos, porque referenciam os
  // três por índice. Referência fora da lista é descartada, não erro — payload
  // editado à mão não pode derrubar a leitura do desenho inteiro.
  const restricoesLidas = payload.restricoes ?? [];
  const uidPorIndice = (familia: 'wall' | 'structural' | 'eixo', i: number): string | null =>
    (familia === 'wall' ? model.walls[i] : familia === 'structural' ? model.structures[i] : model.eixos[i])?.uid ?? null;
  restricoesLidas.forEach((r, i) => {
    const alvoUid = uidPorIndice(r.alvo.familia, r.alvo.indice);
    const refUid = r.referencia ? uidPorIndice(r.referencia.familia, r.referencia.indice) : null;
    if (!alvoUid || (r.referencia && !refUid)) return;
    model.restricoes.push({
      id: nextId(model, 'rst'),
      uid: uidDe('restricoes', i, restricoesLidas.length),
      tipo: r.tipo,
      alvo: { familia: r.alvo.familia, uid: alvoUid },
      ...(r.referencia && refUid ? { referencia: { familia: r.referencia.familia, uid: refUid } } : {}),
      ...(r.valorMm !== undefined ? { valorMm: r.valorMm } : {}),
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
      ...(e.parametros && Object.keys(e.parametros).length > 0 ? { parametros: { ...e.parametros } } : {}),
      ...(e.ate !== undefined && levelIds[e.ate] ? { ateLevelId: levelIds[e.ate] } : {}),
    });
  });

  const vagas = payload.vagas ?? [];
  vagas.forEach((v, i) => {
    model.vagas.push({
      id: nextId(model, 'vag'),
      uid: uidDe('vagas', i, vagas.length),
      levelId: levelIds[v.level],
      at: { x: v.at.x, y: v.at.y },
      larguraMm: v.larguraMm,
      comprimentoMm: v.comprimentoMm,
      rotacaoGraus: v.rotacaoGraus,
      tipo: v.tipo,
      numero: v.numero,
      ...(v.sugerida ? { sugerida: true } : {}),
      ...(v.parametros && Object.keys(v.parametros).length > 0 ? { parametros: { ...v.parametros } } : {}),
    });
  });

  const componentes = payload.componentes ?? [];
  componentes.forEach((c, i) => {
    model.componentes.push({
      id: nextId(model, 'cmp'),
      uid: uidDe('componentes', i, componentes.length),
      levelId: levelIds[c.level],
      at: { x: c.at.x, y: c.at.y },
      larguraMm: c.larguraMm,
      profundidadeMm: c.profundidadeMm,
      alturaMm: c.alturaMm,
      rotacaoGraus: c.rotacaoGraus,
      ...(c.cotaMm ? { cotaMm: c.cotaMm } : {}),
      tipoId: c.tipoId,
      familia: c.familia,
      rotulo: c.rotulo,
      ...(c.sugerido ? { sugerido: true } : {}),
      ...(c.fase ? { fase: c.fase } : {}),
      ...(c.parametros && Object.keys(c.parametros).length > 0 ? { parametros: { ...c.parametros } } : {}),
    });
  });

  const guardaCorpos = payload.guardaCorpos ?? [];
  guardaCorpos.forEach((g, i) => {
    model.guardaCorpos.push({
      id: nextId(model, 'grc'),
      uid: uidDe('guardaCorpos', i, guardaCorpos.length),
      levelId: levelIds[g.level],
      pontos: g.pontos.map((p) => ({ x: p.x, y: p.y })),
      alturaMm: g.alturaMm,
      tipo: g.tipo,
      material: g.material,
      itemCode: g.itemCode,
      descricao: g.descricao,
      rotulo: g.rotulo,
      ...(g.sugerido ? { sugerido: true } : {}),
      ...(g.parametros && Object.keys(g.parametros).length > 0 ? { parametros: { ...g.parametros } } : {}),
    });
  });

  // ANOTAÇÕES: depois de pavimentos e cortes, que elas referenciam por índice.
  // Corte por índice fora da lista = anotação descartada (não erro), como as unidades.
  const anotacoes = payload.anotacoes ?? [];
  anotacoes.forEach((a, i) => {
    let vista: VistaDaAnotacao | null = null;
    if (a.vista.tipo === 'PLANTA') vista = levelIds[a.vista.level] ? { tipo: 'PLANTA', levelId: levelIds[a.vista.level] } : null;
    else if (a.vista.tipo === 'CORTE') vista = model.sections[a.vista.corte] ? { tipo: 'CORTE', corteId: model.sections[a.vista.corte].id } : null;
    else vista = { tipo: 'ELEVACAO', direcao: a.vista.direcao };
    if (!vista) return;
    model.anotacoes.push({
      id: nextId(model, 'ant'),
      uid: uidDe('anotacoes', i, anotacoes.length),
      vista,
      tipo: a.tipo,
      pontos: a.pontos.map((p) => ({ x: p.x, y: p.y })),
      texto: a.texto,
      alturaMm: a.alturaMm,
      traco: a.traco,
      hachura: a.hachura,
      rotacaoGraus: a.rotacaoGraus,
      cor: a.cor,
      ...(a.revisao ? { revisao: { numero: a.revisao.numero, data: a.revisao.data } } : {}),
      ...(a.parametros && Object.keys(a.parametros).length > 0 ? { parametros: { ...a.parametros } } : {}),
    });
  });

  const nucleos = payload.nucleos ?? [];
  nucleos.forEach((n, i) => {
    model.nucleos.push({
      id: nextId(model, 'nuc'),
      uid: uidDe('nucleos', i, nucleos.length),
      levelId: levelIds[n.level],
      ...(n.ate !== undefined && levelIds[n.ate] ? { ateLevelId: levelIds[n.ate] } : {}),
      tipo: n.tipo,
      ring: n.ring.map((p) => ({ x: p.x, y: p.y })),
      rotulo: n.rotulo,
      ...(n.disciplina ? { disciplina: n.disciplina } : {}),
      ...(n.pocoMm !== undefined ? { pocoMm: n.pocoMm } : {}),
      ...(n.casaDeMaquinasMm !== undefined ? { casaDeMaquinasMm: n.casaDeMaquinasMm } : {}),
      ...(n.capacidade !== undefined ? { capacidade: n.capacidade } : {}),
      ...(n.parametros && Object.keys(n.parametros).length > 0 ? { parametros: { ...n.parametros } } : {}),
    });
  });

  // Quadros ANTES dos circuitos, e circuitos antes dos terminais: cada um
  // referencia o anterior por índice, e ler fora de ordem deixaria a referência
  // apontando para um array ainda vazio.
  const quadros = payload.quadros ?? [];
  const idsDeQuadro: string[] = [];
  quadros.forEach((q, i) => {
    const id = nextId(model, 'qdr');
    idsDeQuadro.push(id);
    model.quadros.push({
      id,
      uid: uidDe('quadros', i, quadros.length),
      levelId: levelIds[q.level],
      nome: q.nome,
      at: { x: q.at.x, y: q.at.y },
      cotaMm: q.cotaMm,
      // `?? null` na volta: ausente e nulo são a mesma coisa — "use o padrão".
      larguraMm: q.larguraMm ?? null,
      alturaMm: q.alturaMm ?? null,
      profundidadeMm: q.profundidadeMm ?? null,
      rotacaoGraus: q.rotacaoGraus ?? null,
      ligacao: (q.ligacao as LigacaoDoCircuito | undefined) ?? null,
      tensaoV: q.tensaoV ?? null,
      alimentadorM: q.alimentadorM ?? null,
      ...(q.parametros && Object.keys(q.parametros).length > 0 ? { parametros: { ...q.parametros } } : {}),
    });
  });

  const circuitos = payload.circuitos ?? [];
  const idsDeCircuito: string[] = [];
  circuitos.forEach((c, i) => {
    const id = nextId(model, 'cir');
    idsDeCircuito.push(id);
    model.circuitos.push({
      id,
      uid: uidDe('circuitos', i, circuitos.length),
      quadroId: idsDeQuadro[c.quadro],
      nome: c.nome,
      tipo: c.tipo,
      tensaoV: c.tensaoV,
      disjuntorA: c.disjuntorA,
      secaoMm2: c.secaoMm2,
      ligacao: (c.ligacao as LigacaoDoCircuito | undefined) ?? null,
      protecaoDR: c.protecaoDR ?? null,
      fase: (c.fase as FaseDoCircuito | undefined) ?? null,
    });
  });

  // ⚠️ Os TRECHOS vêm DEPOIS dos circuitos, e a ordem é obrigatória: desde
  // 09/09/2026 o trecho referencia o circuito por índice, e lê-lo antes deixaria
  // a referência apontando para um array ainda vazio. É a mesma armadilha que já
  // derrubou a projeção do terminal — ali como TDZ, aqui como lista vazia, que é
  // pior porque não estoura: o desenho volta com todos os trechos sem circuito.
  const trechos = payload.trechos ?? [];
  trechos.forEach((t, i) => {
    model.trechos.push({
      id: nextId(model, 'trc'),
      uid: uidDe('trechos', i, trechos.length),
      levelId: levelIds[t.level],
      disciplina: t.disciplina as DisciplinaDeRede,
      a: { x: t.a.x, y: t.a.y },
      b: { x: t.b.x, y: t.b.y },
      cotaAMm: t.cotaAMm,
      cotaBMm: t.cotaBMm,
      bitolaMm: t.bitolaMm,
      itemCode: t.itemCode,
      rotulo: t.rotulo,
      // `circuitos` (0.31) ou o `circuito` escalar antigo como lista de um.
      circuitoIds:
        t.circuitos && t.circuitos.length > 0
          ? t.circuitos.map((k) => idsDeCircuito[k])
          : t.circuito != null
            ? [idsDeCircuito[t.circuito]]
            : null,
      condutores: t.condutores ?? null,
      sugerido: t.sugerido ? true : null,
      ...(t.parametros && Object.keys(t.parametros).length > 0 ? { parametros: { ...t.parametros } } : {}),
    });
  });


  const terminais = payload.terminais ?? [];
  terminais.forEach((t, i) => {
    model.terminais.push({
      id: nextId(model, 'trm'),
      uid: uidDe('terminais', i, terminais.length),
      levelId: levelIds[t.level],
      disciplina: t.disciplina as DisciplinaDeRede,
      tipo: t.tipo,
      at: { x: t.at.x, y: t.at.y },
      cotaMm: t.cotaMm,
      itemCode: t.itemCode,
      rotulo: t.rotulo,
      // Ausente e `null` são a mesma coisa na volta — ver a projeção.
      circuitoId: t.circuito != null ? idsDeCircuito[t.circuito] : null,
      potenciaW: t.potenciaW ?? null,
      tipoEletrico: (t.tipoEletrico as TipoDePontoEletrico) ?? null,
      comando: t.comando ?? null,
      sugerida: t.sugerida ? true : null,
      interruptor: (t.interruptor as TipoDeInterruptor | undefined) ?? null,
      tipoHidraulico: (t.tipoHidraulico as TipoDePontoHidraulico | undefined) ?? null,
      volumeL: t.volumeL ?? null,
      larguraMm: t.larguraMm ?? null,
      alturaMm: t.alturaMm ?? null,
      profundidadeMm: t.profundidadeMm ?? null,
      rotacaoGraus: t.rotacaoGraus ?? null,
      ...(t.parametros && Object.keys(t.parametros).length > 0 ? { parametros: { ...t.parametros } } : {}),
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
      tipoDeAmbiente: (l.tipoDeAmbiente as TipoDeAmbiente) ?? null,
      ...(l.acabamentos
        ? {
            acabamentos: {
              ...(l.acabamentos.piso ? { piso: l.acabamentos.piso.map((c) => ({ espessuraMm: c.espessuraMm, itemCode: c.itemCode, descricao: c.descricao, funcao: c.funcao as FuncaoCamada })) } : {}),
              ...(l.acabamentos.forro ? { forro: { camadas: l.acabamentos.forro.camadas.map((c) => ({ espessuraMm: c.espessuraMm, itemCode: c.itemCode, descricao: c.descricao, funcao: c.funcao as FuncaoCamada })), rebaixoMm: l.acabamentos.forro.rebaixoMm } } : {}),
              ...(l.acabamentos.rodape !== undefined ? { rodape: l.acabamentos.rodape === null ? null : { alturaMm: l.acabamentos.rodape.alturaMm, itemCode: l.acabamentos.rodape.itemCode, descricao: l.acabamentos.rodape.descricao } } : {}),
            },
          }
        : {}),
    });
  });

  // Unidades: DEPOIS das etiquetas, que referenciam por índice. Índice fora da
  // lista é descartado, não erro.
  const unidadesLidas = payload.unidades ?? [];
  unidadesLidas.forEach((u, i) => {
    model.unidades.push({
      id: nextId(model, 'und'),
      uid: uidDe('unidades', i, unidadesLidas.length),
      numero: u.numero,
      tipologia: u.tipologia ?? null,
      pcd: u.pcd,
      etiquetaUids: u.etiquetas.map((k) => model.labels[k]?.uid).filter((x): x is string => typeof x === 'string'),
    });
  });

  // Grupos: DEPOIS de paredes, estruturas e etiquetas (origem por índice). As
  // cópias já estão materializadas no payload como peças normais; a próxima
  // sincronização as reencontra pelo uid da instância.
  const gruposLidos = payload.grupos ?? [];
  let k = 0;
  const totalDeInstancias = gruposLidos.reduce((s, g) => s + g.instancias.length, 0);
  gruposLidos.forEach((g, i) => {
    const uidsDe = (idx: number[], lista: { uid: string }[]) => idx.map((j) => lista[j]?.uid).filter((x): x is string => typeof x === 'string');
    model.grupos.push({
      id: nextId(model, 'grp'),
      uid: uidDe('grupos', i, gruposLidos.length),
      nome: g.nome,
      levelId: levelIds[g.level],
      pivo: { x: g.pivo.x, y: g.pivo.y },
      origem: { walls: uidsDe(g.origem.walls, model.walls), structures: uidsDe(g.origem.structures, model.structures), labels: uidsDe(g.origem.labels, model.labels) },
      instancias: g.instancias.map((inst) => ({
        uid: uidDe('instanciasDeGrupo', k++, totalDeInstancias),
        levelId: levelIds[inst.level],
        translacao: { x: inst.translacao.x, y: inst.translacao.y },
        rotacaoGraus: inst.rotacaoGraus as RotacaoDoGrupo,
        espelho: inst.espelho as EspelhoDoGrupo,
      })),
    });
  });

  // `spaces` é derivado: recalculado pelo arranjo planar, nunca lido do payload.
  // O payload guarda os ambientes para consulta e auditoria do snapshot, não para
  // realimentar o kernel — se voltassem por aqui, uma divergência entre o gravado e
  // o recalculável passaria despercebida. O mesmo vale para `identity.spaces`:
  // o `labelUid` de cada ambiente volta a ser derivado da etiqueta.
  return recomputeSpaces(model);
}
