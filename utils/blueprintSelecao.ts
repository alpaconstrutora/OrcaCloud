/**
 * GESTOS SOBRE A SELEÇÃO — duplicar, espelhar, isolar (17/09/2026: os botões
 * do acesso rápido, *"implemente todos"*); girar, alinhar e matriz (18/09/2026,
 * roadmap E0.1 — os P0 de edição básica que faltavam).
 *
 * Regra pura, sem React: o editor só entrega `model` + `selectedIds` e recebe
 * o comando (ou o aviso) de volta. A partição por família é a mesma para os
 * três gestos, e mora aqui para não nascer três vezes com três diferenças.
 *
 * ⚠️ Medições NÃO entram: são de outra camada e de outra gravação (ver
 * `useBlueprintMedicoes`), e nenhum destes gestos as toca.
 */
import type { BlueprintModel, Command, ObjectId, Point } from './blueprintKernel';
import { contornoEmPlanta } from './blueprintKernel';

/** A seleção separada por família — o formato que os comandos de lote pedem. */
export interface FamiliasDaSelecao {
  wallIds: ObjectId[];
  /** Só as aberturas cuja parede NÃO está na seleção (as outras vão com ela). */
  openingIds: ObjectId[];
  boundaryIds: ObjectId[];
  structuralIds: ObjectId[];
  aguaIds: ObjectId[];
  trechoIds: ObjectId[];
  terminalIds: ObjectId[];
  quadroIds: ObjectId[];
}

/**
 * E10.3 (climatização): o `TranslateEntities` de uma seleção — o mover do 3D. As
 * famílias de `familiasDaSelecao` e mais núcleo, vaga, componente e bloco (o que o
 * 2D também move). `null` quando nada da seleção se move ou o deslocamento é zero.
 * Um comando = um passo de Ctrl+Z.
 */
export function comandoDeMover(model: BlueprintModel, selectedIds: readonly string[], delta: { x: number; y: number }, manterJuncoes: boolean): Command | null {
  if (!delta.x && !delta.y) return null;
  const f = familiasDaSelecao(model, selectedIds);
  const sel = new Set(selectedIds);
  const nucleoIds = (model.nucleos ?? []).filter((x) => sel.has(x.id)).map((x) => x.id);
  const vagaIds = (model.vagas ?? []).filter((x) => sel.has(x.id)).map((x) => x.id);
  const componenteIds = (model.componentes ?? []).filter((x) => sel.has(x.id)).map((x) => x.id);
  const blocoIds = (model.blocos ?? []).filter((x) => sel.has(x.id)).map((x) => x.id);
  const total = f.wallIds.length + f.boundaryIds.length + f.structuralIds.length + f.aguaIds.length + f.trechoIds.length + f.terminalIds.length + f.quadroIds.length + nucleoIds.length + vagaIds.length + componenteIds.length + blocoIds.length;
  if (!total) return null;
  return {
    type: 'TranslateEntities',
    wallIds: f.wallIds,
    boundaryIds: f.boundaryIds,
    structuralIds: f.structuralIds,
    aguaIds: f.aguaIds,
    trechoIds: f.trechoIds,
    terminalIds: f.terminalIds,
    quadroIds: f.quadroIds,
    nucleoIds,
    vagaIds,
    componenteIds,
    blocoIds,
    delta: { x: delta.x, y: delta.y } as Point,
    manterJuncoes,
  } as Command;
}

/**
 * ELEVAR no 3D (10/10/2026, pendência da E10.3): soma `dzMm` à COTA de tudo da
 * seleção que tem cota — ponto, trecho (as duas pontas), quadro e componente. Um
 * `Set*Props` por peça, e o lote é um passo de Ctrl+Z.
 *
 * - O componente não desce abaixo do piso (cota ≥ 0 é invariante dele); o que
 *   bateu no piso é dito.
 * - Parede, divisa, estrutura e telhado não têm cota própria (a altura é do
 *   pavimento) — ficam onde estão, com aviso.
 * - O trecho LIGADO a um selecionado que não está na seleção não acompanha: a
 *   prumada abriria um degrau. O aviso diz quantos, para a pessoa selecionar a
 *   rede inteira.
 */
export function comandosDeElevar(model: BlueprintModel, selectedIds: readonly string[], dzMm: number): ResultadoLote {
  const dz = Math.round(dzMm);
  if (!dz) return { ok: false, aviso: 'Deslocamento vertical zero.' };
  const sel = new Set(selectedIds);
  const comandos: Command[] = [];
  for (const t of model.terminais ?? []) if (sel.has(t.id)) comandos.push({ type: 'SetTerminalProps', terminalId: t.id, cotaMm: t.cotaMm + dz } as Command);
  const trechos = (model.trechos ?? []).filter((t) => sel.has(t.id));
  for (const t of trechos) comandos.push({ type: 'SetTrechoProps', trechoId: t.id, cotaAMm: t.cotaAMm + dz, cotaBMm: t.cotaBMm + dz } as Command);
  for (const q of model.quadros ?? []) if (sel.has(q.id)) comandos.push({ type: 'SetQuadroProps', quadroId: q.id, cotaMm: q.cotaMm + dz } as Command);
  let noPiso = 0;
  for (const c of model.componentes ?? []) {
    if (!sel.has(c.id)) continue;
    const alvo = (c.cotaMm ?? 0) + dz;
    if (alvo < 0) noPiso++;
    comandos.push({ type: 'SetComponenteProps', componenteId: c.id, cotaMm: Math.max(0, alvo) } as Command);
  }
  const semCota =
    model.walls.filter((w) => sel.has(w.id)).length +
    model.boundaries.filter((b) => sel.has(b.id)).length +
    model.structures.filter((e) => sel.has(e.id)).length +
    (model.roofs ?? []).filter((r) => sel.has(r.id)).length;
  if (comandos.length === 0) {
    return { ok: false, aviso: 'Nada da seleção tem cota própria para subir ou descer (parede, divisa, estrutura e telhado seguem a altura do pavimento).' };
  }
  const avisos: string[] = [];
  if (semCota > 0) avisos.push(`${semCota} peça(s) sem cota própria (parede, divisa, estrutura, telhado) ficou(aram) onde estava(m).`);
  if (noPiso > 0) avisos.push(`${noPiso} componente(s) parou(aram) no piso (cota 0).`);
  const pontas = new Set(trechos.flatMap((t) => [`${t.levelId}|${t.a.x},${t.a.y}`, `${t.levelId}|${t.b.x},${t.b.y}`]));
  const soltos = (model.trechos ?? []).filter(
    (t) => !sel.has(t.id) && (pontas.has(`${t.levelId}|${t.a.x},${t.a.y}`) || pontas.has(`${t.levelId}|${t.b.x},${t.b.y}`)),
  ).length;
  if (soltos > 0) avisos.push(`${soltos} trecho(s) ligado(s) fora da seleção ficou(aram) na cota antiga — selecione a rede inteira para ela subir junta.`);
  return { ok: true, comandos, aviso: avisos.length > 0 ? avisos.join(' ') : null };
}

export function familiasDaSelecao(model: BlueprintModel, selectedIds: readonly string[]): FamiliasDaSelecao {
  const sel = new Set(selectedIds);
  const wallIds = model.walls.filter((w) => sel.has(w.id)).map((w) => w.id);
  const paredes = new Set(wallIds);
  return {
    wallIds,
    openingIds: model.openings.filter((o) => sel.has(o.id) && !paredes.has(o.wallId)).map((o) => o.id),
    boundaryIds: model.boundaries.filter((b) => sel.has(b.id)).map((b) => b.id),
    structuralIds: model.structures.filter((s) => sel.has(s.id)).map((s) => s.id),
    aguaIds: (model.roofs ?? []).filter((r) => sel.has(r.id)).map((r) => r.id),
    trechoIds: (model.trechos ?? []).filter((t) => sel.has(t.id)).map((t) => t.id),
    terminalIds: (model.terminais ?? []).filter((t) => sel.has(t.id)).map((t) => t.id),
    quadroIds: (model.quadros ?? []).filter((q) => sel.has(q.id)).map((q) => q.id),
  };
}

/** Quantas peças de kernel a partição alcança (abertura avulsa inclusive). */
export function tamanhoDasFamilias(f: FamiliasDaSelecao): number {
  return (
    f.wallIds.length +
    f.openingIds.length +
    f.boundaryIds.length +
    f.structuralIds.length +
    f.aguaIds.length +
    f.trechoIds.length +
    f.terminalIds.length +
    f.quadroIds.length
  );
}

/**
 * A caixa envolvente do que está selecionado, em mm — `null` quando nada tem
 * geometria no plano (seleção só de aberturas avulsas, por exemplo).
 */
/**
 * E10.3: onde fica a ALÇA de mover no 3D (METRO, Y para cima): o centro em planta
 * da seleção (as famílias de `familiasDaSelecao`; os componentes também) e, na
 * altura, o piso do pavimento da primeira peça + metade do pé-direito (até 1,5 m).
 * `null` quando nada da seleção tem posição.
 */
export function pontoDaAlca(model: BlueprintModel, selectedIds: readonly string[]): [number, number, number] | null {
  const sel = new Set(selectedIds);
  const f = familiasDaSelecao(model, selectedIds);
  const caixa = caixaDaSelecao(model, f);
  const comps = (model.componentes ?? []).filter((c) => sel.has(c.id));
  let minX = caixa?.minX ?? Infinity;
  let minY = caixa?.minY ?? Infinity;
  let maxX = caixa?.maxX ?? -Infinity;
  let maxY = caixa?.maxY ?? -Infinity;
  for (const c of comps) {
    minX = Math.min(minX, c.at.x);
    maxX = Math.max(maxX, c.at.x);
    minY = Math.min(minY, c.at.y);
    maxY = Math.max(maxY, c.at.y);
  }
  if (!Number.isFinite(minX)) return null;
  const comNivel = [...model.walls, ...(model.terminais ?? []), ...(model.trechos ?? []), ...model.structures, ...(model.componentes ?? []), ...(model.quadros ?? [])].find((x) => sel.has(x.id)) as { levelId?: string } | undefined;
  const nivel = model.levels.find((l) => l.id === comNivel?.levelId) ?? model.levels[0];
  const altura = (nivel?.elevationMm ?? 0) + Math.min((nivel?.defaultHeightMm ?? 2800) / 2, 1500);
  return [((minX + maxX) / 2) / 1000, altura / 1000, ((minY + maxY) / 2) / 1000];
}

export function caixaDaSelecao(
  model: BlueprintModel,
  f: FamiliasDaSelecao,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const marcar = (p: Point) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  const ids = (lista: ObjectId[]) => new Set(lista);
  const w = ids(f.wallIds);
  for (const x of model.walls) if (w.has(x.id)) (marcar(x.a), marcar(x.b));
  const b = ids(f.boundaryIds);
  for (const x of model.boundaries) if (b.has(x.id)) (marcar(x.a), marcar(x.b));
  const s = ids(f.structuralIds);
  // A estrutura entra pela SEÇÃO (contorno), não pelo eixo: espelhar um pilar
  // em torno do próprio centro tem de deixá-lo no lugar, e o centro da caixa
  // dos eixos de uma viga não é o centro da peça com a largura.
  for (const x of model.structures) if (s.has(x.id)) contornoEmPlanta(x).forEach(marcar);
  const a = ids(f.aguaIds);
  for (const x of model.roofs ?? []) if (a.has(x.id)) x.pontos.forEach(marcar);
  const t = ids(f.trechoIds);
  for (const x of model.trechos ?? []) if (t.has(x.id)) (marcar(x.a), marcar(x.b));
  const te = ids(f.terminalIds);
  for (const x of model.terminais ?? []) if (te.has(x.id)) marcar(x.at);
  const q = ids(f.quadroIds);
  for (const x of model.quadros ?? []) if (q.has(x.id)) marcar(x.at);
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

export type Resultado = { ok: true; comando: Command; aviso: string | null } | { ok: false; aviso: string };

/**
 * DUPLICAR (Ctrl+D): a cópia cai ao lado, deslocada de `passoMm` em x e −y
 * (para a direita e para baixo na tela) — sem depender de onde está o cursor,
 * que é a diferença para Ctrl+V. Aberturas avulsas são copiadas NA MESMA
 * PAREDE, logo depois do vão original; a que não couber fica de fora, com aviso.
 *
 * Águas e instalações ficam de fora porque `DuplicateEntities` não as copia
 * (só paredes, limites, estruturas e aberturas) — o aviso diz o que não foi.
 */
export function comandoDeDuplicacao(
  model: BlueprintModel,
  selectedIds: readonly string[],
  levelId: ObjectId,
  passoMm: number,
): Resultado {
  const f = familiasDaSelecao(model, selectedIds);
  const passo = Math.max(1, Math.round(passoMm));
  const openings: { openingId: ObjectId; wallId: ObjectId; offsetMm: number }[] = [];
  let deFora = 0;
  for (const id of f.openingIds) {
    const o = model.openings.find((x) => x.id === id);
    const w = o && model.walls.find((x) => x.id === o.wallId);
    if (!o || !w) continue;
    const comprimento = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    const offset = o.offsetMm + o.widthMm + passo;
    if (offset + o.widthMm > comprimento) {
      deFora++;
      continue;
    }
    openings.push({ openingId: o.id, wallId: w.id, offsetMm: Math.round(offset) });
  }
  if (f.wallIds.length === 0 && f.boundaryIds.length === 0 && f.structuralIds.length === 0 && openings.length === 0) {
    return {
      ok: false,
      aviso:
        deFora > 0
          ? 'A abertura não cabe duplicada na mesma parede.'
          : 'Nada que se possa duplicar está selecionado (paredes, esquadrias, estruturas ou divisas).',
    };
  }
  const ignorados = f.aguaIds.length + f.trechoIds.length + f.terminalIds.length + f.quadroIds.length;
  const avisos: string[] = [];
  if (deFora > 0) avisos.push(`${deFora} abertura(s) não coube(ram) na mesma parede e ficou(aram) de fora.`);
  if (ignorados > 0) avisos.push(`${ignorados} peça(s) de telhado/instalações não entram na duplicação.`);
  return {
    ok: true,
    comando: {
      type: 'DuplicateEntities',
      levelId,
      wallIds: f.wallIds,
      boundaryIds: f.boundaryIds,
      structuralIds: f.structuralIds,
      openings,
      delta: { x: passo, y: -passo },
    },
    aviso: avisos.length > 0 ? avisos.join(' ') : null,
  };
}

/**
 * ESPELHAR a seleção em torno do CENTRO da própria caixa: `'VERTICAL'` troca
 * esquerda ↔ direita (reta x = centro), `'HORIZONTAL'` troca frente ↔ fundos
 * (reta y = centro). A peça sozinha vira no lugar; o conjunto vira como um
 * bloco. Abertura avulsa não tem reflexão própria — ela acompanha a parede, e
 * sem a parede na seleção nada acontece com ela.
 */
export function comandoDeEspelhamento(
  model: BlueprintModel,
  selectedIds: readonly string[],
  eixo: 'VERTICAL' | 'HORIZONTAL',
): Resultado {
  const f = familiasDaSelecao(model, selectedIds);
  const caixa = caixaDaSelecao(model, f);
  if (!caixa) {
    return { ok: false, aviso: 'Nada que se possa espelhar está selecionado (esquadria sozinha acompanha a parede).' };
  }
  const em = eixo === 'VERTICAL' ? (caixa.minX + caixa.maxX) / 2 : (caixa.minY + caixa.maxY) / 2;
  return {
    ok: true,
    comando: {
      type: 'MirrorEntities',
      wallIds: f.wallIds,
      boundaryIds: f.boundaryIds,
      structuralIds: f.structuralIds,
      aguaIds: f.aguaIds,
      trechoIds: f.trechoIds,
      terminalIds: f.terminalIds,
      quadroIds: f.quadroIds,
      eixo,
      em,
    },
    aviso: f.openingIds.length > 0 ? 'A esquadria selecionada sem a parede não foi espelhada.' : null,
  };
}

/**
 * GIRAR a seleção em torno do CENTRO da própria caixa, em graus inteiros
 * (positivo = anti-horário no sistema do modelo, o sentido de `rotacaoDeg`).
 * O centro é arredondado ao milímetro — é o que deixa o giro de 90° exato no
 * kernel (`RotateEntities`). Abertura avulsa, como no espelho, só acompanha a
 * parede.
 */
export function comandoDeRotacao(
  model: BlueprintModel,
  selectedIds: readonly string[],
  anguloGraus: number,
): Resultado {
  const f = familiasDaSelecao(model, selectedIds);
  const caixa = caixaDaSelecao(model, f);
  if (!caixa) {
    return { ok: false, aviso: 'Nada que se possa girar está selecionado (esquadria sozinha acompanha a parede).' };
  }
  const angulo = Math.round(anguloGraus);
  if (angulo % 360 === 0) return { ok: false, aviso: 'Giro de 0° não muda nada.' };
  return {
    ok: true,
    comando: {
      type: 'RotateEntities',
      wallIds: f.wallIds,
      boundaryIds: f.boundaryIds,
      structuralIds: f.structuralIds,
      aguaIds: f.aguaIds,
      trechoIds: f.trechoIds,
      terminalIds: f.terminalIds,
      quadroIds: f.quadroIds,
      anguloGraus: angulo,
      centro: { x: Math.round((caixa.minX + caixa.maxX) / 2), y: Math.round((caixa.minY + caixa.maxY) / 2) },
    },
    aviso: f.openingIds.length > 0 ? 'A esquadria selecionada sem a parede não foi girada.' : null,
  };
}

/** Resultado de um gesto que pode precisar de MAIS de um comando (um lote = um passo de desfazer). */
export type ResultadoLote = { ok: true; comandos: Command[]; aviso: string | null } | { ok: false; aviso: string };

/** Cosseno do desvio angular a partir do qual duas retas ainda contam como paralelas (1°). */
const COS_PARALELO = Math.cos((1 * Math.PI) / 180);

/**
 * ALINHAR a seleção a uma REFERÊNCIA — a parede (ou divisa) escolhida por
 * último. Cada outra peça anda RÍGIDA, na perpendicular, até o eixo dela cair
 * sobre a reta da referência:
 *
 * - parede/limite/viga PARALELA (≤ 1°): o ponto médio é projetado na reta e a
 *   peça inteira segue o deslocamento — o comprimento não muda, então nenhuma
 *   abertura sai do lugar. Não paralela: fica onde está, com aviso — "alinhar"
 *   uma parede perpendicular seria girá-la, e giro é outro gesto.
 * - pilar, terminal, quadro: o centro vai para a reta.
 * - E10.4 (08/10/2026): o TRECHO de rede alinha como a parede (paralelo, pelo
 *   meio) e o COMPONENTE (evaporadora, condensadora, reserva) como o terminal
 *   (pelo centro). A referência também pode ser um trecho — "alinhar as
 *   evaporadoras ao duto".
 *
 * Sai UM `TranslateEntities` por deslocamento distinto (peças que andam o mesmo
 * tanto vão juntas), com `manterJuncoes` — as vizinhas presas esticam para
 * acompanhar, como no arraste, e o ambiente continua fechado.
 */
export function comandosDeAlinhamento(
  model: BlueprintModel,
  selectedIds: readonly string[],
  referenciaId: ObjectId,
): ResultadoLote {
  const ref =
    model.walls.find((w) => w.id === referenciaId) ??
    model.boundaries.find((b) => b.id === referenciaId) ??
    (model.trechos ?? []).find((t) => t.id === referenciaId);
  if (!ref) {
    return { ok: false, aviso: 'Escolha uma parede, divisa ou trecho como referência (a última selecionada).' };
  }
  const f = familiasDaSelecao(
    model,
    selectedIds.filter((id) => id !== referenciaId),
  );
  const rx = ref.b.x - ref.a.x;
  const ry = ref.b.y - ref.a.y;
  const comp = Math.hypot(rx, ry);
  if (comp === 0) return { ok: false, aviso: 'A referência não tem comprimento.' };
  const ux = rx / comp;
  const uy = ry / comp;
  // Deslocamento perpendicular que leva `p` até a reta da referência.
  const ateAReta = (p: Point): Point => {
    const dx = p.x - ref.a.x;
    const dy = p.y - ref.a.y;
    const ao = dx * ux + dy * uy;
    return { x: Math.round(ref.a.x + ao * ux - p.x), y: Math.round(ref.a.y + ao * uy - p.y) };
  };
  const paralela = (a: Point, b: Point) => {
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const c = Math.hypot(vx, vy);
    return c > 0 && Math.abs((vx * ux + vy * uy) / c) >= COS_PARALELO;
  };
  const meio = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  const grupos = new GruposDeDeslocamento();
  const grupo = (delta: Point) => grupos.de(delta);
  let naoParalelas = 0;
  let jaAlinhadas = 0;
  const alinharSegmento = (a: Point, b: Point, id: ObjectId, lista: 'wallIds' | 'boundaryIds' | 'structuralIds' | 'trechoIds') => {
    if (!paralela(a, b)) {
      naoParalelas++;
      return;
    }
    const d = ateAReta(meio(a, b));
    if (d.x === 0 && d.y === 0) {
      jaAlinhadas++;
      return;
    }
    grupo(d)[lista].push(id);
  };
  for (const w of model.walls) if (f.wallIds.includes(w.id)) alinharSegmento(w.a, w.b, w.id, 'wallIds');
  for (const b of model.boundaries) if (f.boundaryIds.includes(b.id)) alinharSegmento(b.a, b.b, b.id, 'boundaryIds');
  for (const e of model.structures) {
    if (!f.structuralIds.includes(e.id)) continue;
    if (e.pontos.length === 1) {
      const d = ateAReta(e.pontos[0]);
      if (d.x === 0 && d.y === 0) jaAlinhadas++;
      else grupo(d).structuralIds.push(e.id);
    } else if (e.pontos.length === 2) {
      alinharSegmento(e.pontos[0], e.pontos[1], e.id, 'structuralIds');
    } else {
      naoParalelas++;
    }
  }
  for (const t of model.terminais ?? []) {
    if (!f.terminalIds.includes(t.id)) continue;
    const d = ateAReta(t.at);
    if (d.x === 0 && d.y === 0) jaAlinhadas++;
    else grupo(d).terminalIds.push(t.id);
  }
  for (const q of model.quadros ?? []) {
    if (!f.quadroIds.includes(q.id)) continue;
    const d = ateAReta(q.at);
    if (d.x === 0 && d.y === 0) jaAlinhadas++;
    else grupo(d).quadroIds.push(q.id);
  }
  for (const t of model.trechos ?? []) if (f.trechoIds.includes(t.id)) alinharSegmento(t.a, t.b, t.id, 'trechoIds');
  const componentes = new Set(selectedIds.filter((id) => id !== referenciaId));
  for (const c of model.componentes ?? []) {
    if (!componentes.has(c.id)) continue;
    const d = ateAReta(c.at);
    if (d.x === 0 && d.y === 0) jaAlinhadas++;
    else grupo(d).componenteIds.push(c.id);
  }

  const avisos: string[] = [];
  if (naoParalelas > 0) avisos.push(`${naoParalelas} peça(s) não paralela(s) à referência ficou(aram) onde estava(m).`);
  const ignorados = f.aguaIds.length + f.openingIds.length;
  if (ignorados > 0) avisos.push(`${ignorados} peça(s) de telhado/esquadria avulsa não entram no alinhamento.`);
  if (grupos.tamanho === 0) {
    return {
      ok: false,
      aviso:
        jaAlinhadas > 0 && naoParalelas === 0
          ? 'Tudo já está alinhado à referência.'
          : avisos.length > 0
            ? avisos.join(' ')
            : 'Selecione a referência e pelo menos mais uma peça para alinhar.',
    };
  }
  return { ok: true, comandos: grupos.comandos(), aviso: avisos.length > 0 ? avisos.join(' ') : null };
}

/**
 * Peças que andam o MESMO deslocamento vão no mesmo `TranslateEntities` (com
 * `manterJuncoes`, como o arraste) — o lote inteiro é um passo de desfazer.
 * Alinhar e distribuir usam a mesma partição.
 */
class GruposDeDeslocamento {
  private readonly mapa = new Map<
    string,
    { delta: Point; wallIds: ObjectId[]; boundaryIds: ObjectId[]; structuralIds: ObjectId[]; trechoIds: ObjectId[]; terminalIds: ObjectId[]; quadroIds: ObjectId[]; componenteIds: ObjectId[] }
  >();
  de(delta: Point) {
    const chave = `${delta.x},${delta.y}`;
    let g = this.mapa.get(chave);
    if (!g) {
      g = { delta, wallIds: [], boundaryIds: [], structuralIds: [], trechoIds: [], terminalIds: [], quadroIds: [], componenteIds: [] };
      this.mapa.set(chave, g);
    }
    return g;
  }
  get tamanho() {
    return this.mapa.size;
  }
  comandos(): Command[] {
    return [...this.mapa.values()].map((g) => ({
      type: 'TranslateEntities',
      wallIds: g.wallIds,
      boundaryIds: g.boundaryIds,
      structuralIds: g.structuralIds,
      trechoIds: g.trechoIds,
      terminalIds: g.terminalIds,
      quadroIds: g.quadroIds,
      componenteIds: g.componenteIds,
      delta: g.delta,
      manterJuncoes: true,
    }));
  }
}

export type EixoDaDistribuicao = 'X' | 'Y';

/**
 * DISTRIBUIR (E10.4, 08/10/2026 — "arranjo"): espaçamento IGUAL entre os
 * centros, ao longo de um eixo da planta. A primeira e a última peça (na ordem
 * do eixo) ficam; as do meio andam SÓ naquele eixo até ficarem a passos iguais —
 * a fileira de difusores no forro, as evaporadoras ao longo do corredor.
 *
 * O centro de cada peça: o meio do eixo (parede, divisa, viga, trecho), o
 * centro do contorno (pilar) ou o ponto (terminal, quadro, componente). Sem
 * eixo dado, vale o de maior espalhamento dos centros. Precisa de 3 peças ou
 * mais — com duas não há "do meio".
 */
export function comandosDeDistribuicao(
  model: BlueprintModel,
  selectedIds: readonly string[],
  eixo?: EixoDaDistribuicao,
): ResultadoLote {
  const f = familiasDaSelecao(model, selectedIds);
  const sel = new Set(selectedIds);
  type Peca = { centro: Point; lista: 'wallIds' | 'boundaryIds' | 'structuralIds' | 'trechoIds' | 'terminalIds' | 'quadroIds' | 'componenteIds'; id: ObjectId };
  const pecas: Peca[] = [];
  const meio = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  for (const w of model.walls) if (f.wallIds.includes(w.id)) pecas.push({ centro: meio(w.a, w.b), lista: 'wallIds', id: w.id });
  for (const b of model.boundaries) if (f.boundaryIds.includes(b.id)) pecas.push({ centro: meio(b.a, b.b), lista: 'boundaryIds', id: b.id });
  for (const e of model.structures) {
    if (!f.structuralIds.includes(e.id)) continue;
    const c = contornoEmPlanta(e);
    const xs = c.map((p) => p.x);
    const ys = c.map((p) => p.y);
    pecas.push({ centro: { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }, lista: 'structuralIds', id: e.id });
  }
  for (const t of model.trechos ?? []) if (f.trechoIds.includes(t.id)) pecas.push({ centro: meio(t.a, t.b), lista: 'trechoIds', id: t.id });
  for (const t of model.terminais ?? []) if (f.terminalIds.includes(t.id)) pecas.push({ centro: t.at, lista: 'terminalIds', id: t.id });
  for (const q of model.quadros ?? []) if (f.quadroIds.includes(q.id)) pecas.push({ centro: q.at, lista: 'quadroIds', id: q.id });
  for (const c of model.componentes ?? []) if (sel.has(c.id)) pecas.push({ centro: c.at, lista: 'componenteIds', id: c.id });

  const ignorados = f.aguaIds.length + f.openingIds.length;
  const avisoIgnorados = ignorados > 0 ? `${ignorados} peça(s) de telhado/esquadria avulsa não entram na distribuição.` : null;
  if (pecas.length < 3) {
    return { ok: false, aviso: 'Distribuir pede 3 peças ou mais (a primeira e a última ficam; as do meio se espaçam).' };
  }
  const espalhamento = (k: 'x' | 'y') => Math.max(...pecas.map((p) => p.centro[k])) - Math.min(...pecas.map((p) => p.centro[k]));
  const k: 'x' | 'y' = eixo ? (eixo === 'X' ? 'x' : 'y') : espalhamento('x') >= espalhamento('y') ? 'x' : 'y';
  const ordem = [...pecas].sort((a, b) => a.centro[k] - b.centro[k]);
  const ini = ordem[0].centro[k];
  const fim = ordem[ordem.length - 1].centro[k];
  if (fim - ini <= 0) {
    return { ok: false, aviso: `As peças estão todas na mesma ${k === 'x' ? 'coluna' : 'linha'} — não há o que espaçar nesse eixo.` };
  }
  const passo = (fim - ini) / (ordem.length - 1);
  const grupos = new GruposDeDeslocamento();
  for (let i = 1; i < ordem.length - 1; i++) {
    const d = Math.round(ini + i * passo - ordem[i].centro[k]);
    if (d === 0) continue;
    grupos.de(k === 'x' ? { x: d, y: 0 } : { x: 0, y: d })[ordem[i].lista].push(ordem[i].id);
  }
  if (grupos.tamanho === 0) return { ok: false, aviso: 'As peças já estão igualmente espaçadas.' };
  return { ok: true, comandos: grupos.comandos(), aviso: avisoIgnorados };
}

export interface ParametrosDaMatriz {
  /** Total de exemplares, o original incluído (≥ 2). */
  quantidade: number;
  /** Passo entre exemplares consecutivos, em mm (pode ser negativo; não pode ser 0 nos dois eixos). */
  passoXMm: number;
  passoYMm: number;
}

/**
 * MATRIZ: `quantidade − 1` cópias da seleção, a k·passo do original — a
 * fileira de pilares, o pavimento de vagas, a bateria de banheiros. Cada cópia
 * é um `DuplicateEntities` a partir do ORIGINAL (ids conhecidos), e o lote é um
 * passo de desfazer. Abertura avulsa fica de fora: não há "k·passo" ao longo de
 * uma parede que não foi copiada.
 *
 * E10.4 (08/10/2026): pontos, trechos e quadros ENTRAM — o `DuplicateEntities`
 * os copia desde a E1.3 do elétrico (a cópia nasce sem circuito). E os
 * COMPONENTES também (10/10/2026): o comando passou a copiá-los — a fileira de
 * condensadoras, o mobiliário repetido.
 */
export function comandosDeMatriz(
  model: BlueprintModel,
  selectedIds: readonly string[],
  levelId: ObjectId,
  parametros: ParametrosDaMatriz,
): ResultadoLote {
  const f = familiasDaSelecao(model, selectedIds);
  const quantidade = Math.floor(parametros.quantidade);
  const px = Math.round(parametros.passoXMm);
  const py = Math.round(parametros.passoYMm);
  const componenteIds = (model.componentes ?? []).filter((c) => selectedIds.includes(c.id)).map((c) => c.id);
  if (
    f.wallIds.length === 0 &&
    f.boundaryIds.length === 0 &&
    f.structuralIds.length === 0 &&
    f.aguaIds.length === 0 &&
    f.trechoIds.length === 0 &&
    f.terminalIds.length === 0 &&
    f.quadroIds.length === 0 &&
    componenteIds.length === 0
  ) {
    return { ok: false, aviso: 'Nada que se possa repetir está selecionado (paredes, estruturas, divisas, telhado, instalações ou componentes).' };
  }
  if (quantidade < 2) return { ok: false, aviso: 'A matriz precisa de pelo menos 2 exemplares.' };
  if (quantidade > 200) return { ok: false, aviso: 'No máximo 200 exemplares por matriz.' };
  if (px === 0 && py === 0) return { ok: false, aviso: 'Informe um passo diferente de zero em X ou em Y.' };
  const comandos: Command[] = [];
  for (let k = 1; k < quantidade; k++) {
    comandos.push({
      type: 'DuplicateEntities',
      levelId,
      wallIds: f.wallIds,
      boundaryIds: f.boundaryIds,
      structuralIds: f.structuralIds,
      aguaIds: f.aguaIds,
      terminalIds: f.terminalIds,
      trechoIds: f.trechoIds,
      quadroIds: f.quadroIds,
      componenteIds,
      openings: [],
      delta: { x: px * k, y: py * k },
    });
  }
  return {
    ok: true,
    comandos,
    aviso: f.openingIds.length > 0 ? `${f.openingIds.length} esquadria(s) avulsa(s) não entram na matriz.` : null,
  };
}

/**
 * ISOLAR: os ids do pavimento que devem ficar OCULTOS para só a seleção
 * aparecer. As aberturas das paredes selecionadas continuam visíveis (a porta
 * é parte da parede); as demais somem com o resto.
 */
export function idsParaIsolar(
  model: BlueprintModel,
  levelId: ObjectId | null,
  selectedIds: readonly string[],
): string[] {
  const sel = new Set(selectedIds);
  const noNivel = <T extends { levelId: ObjectId }>(xs: readonly T[]) =>
    xs.filter((x) => !levelId || x.levelId === levelId);
  const paredesSel = new Set(model.walls.filter((w) => sel.has(w.id)).map((w) => w.id));
  const ocultar: string[] = [];
  for (const w of noNivel(model.walls)) if (!sel.has(w.id)) ocultar.push(w.id);
  for (const o of model.openings) {
    if (sel.has(o.id) || paredesSel.has(o.wallId)) continue;
    const w = model.walls.find((x) => x.id === o.wallId);
    if (!w || !levelId || w.levelId === levelId) ocultar.push(o.id);
  }
  for (const b of noNivel(model.boundaries)) if (!sel.has(b.id)) ocultar.push(b.id);
  for (const s of noNivel(model.structures)) if (!sel.has(s.id)) ocultar.push(s.id);
  for (const r of noNivel(model.roofs ?? [])) if (!sel.has(r.id)) ocultar.push(r.id);
  for (const e of noNivel(model.stairs ?? [])) if (!sel.has(e.id)) ocultar.push(e.id);
  for (const t of noNivel(model.trechos ?? [])) if (!sel.has(t.id)) ocultar.push(t.id);
  for (const t of noNivel(model.terminais ?? [])) if (!sel.has(t.id)) ocultar.push(t.id);
  for (const q of noNivel(model.quadros ?? [])) if (!sel.has(q.id)) ocultar.push(q.id);
  return ocultar;
}
