/**
 * DISTRIBUIÇÃO AUTOMÁTICA DE PONTOS HIDRÁULICOS por ambiente (18/09/2026, F3
 * da hidráulica: *"distribuir pontos por tipo de ambiente"*).
 *
 * O molde é a distribuição de tomadas (`blueprintDistribuicao.ts`): cada
 * ambiente CLASSIFICADO (`SpaceLabel.tipoDeAmbiente`) recebe o KIT do seu tipo
 * em posições provisórias, marcadas como `sugerida` — mover confirma, e
 * "Aceitar sugeridas" confirma todas. Nada é decidido pelo sistema: a posição é
 * um ponto de partida plausível, e o kit é trocável por ambiente na gaveta.
 *
 * Os KITS (o que uma casa comum tem):
 *   BANHEIRO      — vaso sanitário (AF + esgoto), lavatório (AF [+ AQ] + esgoto),
 *                   chuveiro (AF [+ AQ]; o esgoto do box vai pelo coletor),
 *                   coletor (caixa sifonada ou ralo sifonado, esgoto)
 *   COZINHA       — pia (AF [+ AQ] + esgoto). A caixa de gordura fica fora do
 *                   ambiente e é do usuário (o esgoto automático avisa se faltar).
 *   AREA_SERVICO  — tanque (AF + esgoto), máquina de lavar (AF + esgoto), ralo seco
 *
 * `TIPOS_DE_AMBIENTE` só tem COZINHA_SERVICO para os dois últimos: a heurística
 * é o NOME do ambiente ("serviço", "lavanderia" → área de serviço; senão
 * cozinha), e a gaveta deixa trocar — sem valor novo no kernel.
 *
 * POSIÇÕES (todas dentro do anel recuado do ambiente, a `recuoDaParedeMm` da
 * face): vaso no maior lado sem porta; lavatório junto à porta; chuveiro no
 * canto mais longe da porta; coletor a 300 mm do chuveiro rumo ao centro; pia
 * no maior lado oposto à porta; tanque e máquina lado a lado no maior lado;
 * ralo seco perto do tanque. Um aparelho com ponto de mais de uma disciplina
 * gera N terminais no MESMO (x, y), cada um na cota da ficha.
 *
 * IDEMPOTENTE por (tipo, disciplina) dentro do ambiente: rodar de novo não
 * duplica; uma disciplina que faltava (a água quente ligada depois) nasce na
 * posição do ponto irmão que já existe.
 */
import type { BlueprintModel, Command, DisciplinaDeRede, Opening, Space, SpaceLabel, Terminal, TipoDePontoHidraulico, Wall } from './blueprintKernel';
import { DISCIPLINAS_DO_PONTO_HIDRAULICO, pointInPolygon, signedArea } from './blueprintKernel';
import type { Point } from './blueprintKernel';
import { etiquetaDoAmbiente, ladosDePiso, pontoJuntoAPorta, type LadoDoAmbiente } from './blueprintDistribuicao';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';

export type KitHidraulico = 'BANHEIRO' | 'COZINHA' | 'AREA_SERVICO';

export const ROTULO_DO_KIT: Record<KitHidraulico, string> = {
  BANHEIRO: 'Banheiro',
  COZINHA: 'Cozinha',
  AREA_SERVICO: 'Área de serviço',
};

export interface HipotesesDePontos {
  /** Tipos que recebem também ponto de ÁGUA QUENTE. */
  aguaQuenteEm: TipoDePontoHidraulico[];
  /** O coletor do box do banheiro. */
  coletorDoBanheiro: 'CAIXA_SIFONADA' | 'RALO_SIFONADO';
  /** Afastamento do ponto à FACE da parede, em mm. */
  recuoDaParedeMm: number;
}

export const HIPOTESES_PONTOS_PADRAO: HipotesesDePontos = {
  aguaQuenteEm: ['CHUVEIRO', 'LAVATORIO', 'PIA_COZINHA'],
  coletorDoBanheiro: 'CAIXA_SIFONADA',
  recuoDaParedeMm: 150,
};

export type PapelNoKit = 'vaso' | 'lavatorio' | 'chuveiro' | 'coletor' | 'pia' | 'tanque' | 'maquina' | 'ralo';

export interface PecaPrevista {
  papel: PapelNoKit;
  tipo: TipoDePontoHidraulico;
  /** As disciplinas que este aparelho pede (já filtradas pela hipótese de AQ). */
  disciplinas: DisciplinaDeRede[];
  ponto: Point;
  /** As disciplinas que JÁ existem no ambiente para este tipo — não serão criadas. */
  existentes: DisciplinaDeRede[];
}

export interface PlanoDePontosDoAmbiente {
  spaceId: string;
  levelId: string;
  nome: string;
  kit: KitHidraulico | null;
  pecas: PecaPrevista[];
  comandos: Command[];
  /** Quantos terminais o lote cria. */
  aCriar: number;
  /** Quantos (tipo, disciplina) já existiam. */
  jaExistentes: number;
  motivo: string | null;
}

/** O kit que o tipo de ambiente sugere, com a heurística do nome para cozinha × serviço. */
export function kitDoAmbiente(space: Space, labels: readonly SpaceLabel[]): KitHidraulico | null {
  const tipo = etiquetaDoAmbiente(space, labels)?.tipoDeAmbiente ?? null;
  if (tipo === 'BANHEIRO') return 'BANHEIRO';
  if (tipo === 'COZINHA_SERVICO') {
    const nome = (space.name ?? '').toLowerCase();
    return /serv|lavand/.test(nome) ? 'AREA_SERVICO' : 'COZINHA';
  }
  return null;
}

/** Os terminais hidráulicos dentro do ambiente (qualquer disciplina de água/esgoto). */
export function terminaisHidraulicosDoAmbiente(space: Space, terminais: readonly Terminal[]): Terminal[] {
  return terminais.filter(
    (t) =>
      t.levelId === space.levelId &&
      t.disciplina !== 'ELETRICA' &&
      pointInPolygon(space.ring, t.at) &&
      !space.holes.some((h) => pointInPolygon(h, t.at)),
  );
}

// ─── Geometria de apoio ───────────────────────────────────────────────────────

const comprimento = (l: LadoDoAmbiente) => Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y);
const centroide = (ring: readonly Point[]): Point => ({
  x: ring.reduce((s, p) => s + p.x, 0) / ring.length,
  y: ring.reduce((s, p) => s + p.y, 0) / ring.length,
});

/** Ponto a `f` do lado (0–1), afastado `recuo` mm para DENTRO do ambiente. */
function pontoNoLado(lado: LadoDoAmbiente, f: number, recuo: number, ring: Point[]): Point {
  const base = { x: lado.a.x + (lado.b.x - lado.a.x) * f, y: lado.a.y + (lado.b.y - lado.a.y) * f };
  const comp = comprimento(lado);
  if (comp === 0) return { x: Math.round(base.x), y: Math.round(base.y) };
  const ux = (lado.b.x - lado.a.x) / comp;
  const uy = (lado.b.y - lado.a.y) / comp;
  // A normal que aponta para dentro depende da orientação do anel.
  const horario = signedArea(ring) < 0;
  const nx = horario ? uy : -uy;
  const ny = horario ? -ux : ux;
  const dentro = { x: base.x + nx * recuo, y: base.y + ny * recuo };
  const fora = { x: base.x - nx * recuo, y: base.y - ny * recuo };
  const escolhido = pointInPolygon(ring, dentro) ? dentro : pointInPolygon(ring, fora) ? fora : base;
  return { x: Math.round(escolhido.x), y: Math.round(escolhido.y) };
}

/** Anda `mm` de `de` na direção de `para`. */
function rumoA(de: Point, para: Point, mm: number): Point {
  const d = Math.hypot(para.x - de.x, para.y - de.y);
  if (d === 0) return { ...de };
  return { x: Math.round(de.x + ((para.x - de.x) / d) * mm), y: Math.round(de.y + ((para.y - de.y) / d) * mm) };
}

function ladoDaPorta(space: Space, lados: LadoDoAmbiente[], walls: readonly Wall[], openings: readonly Opening[]): LadoDoAmbiente | null {
  for (const lado of lados) {
    if (!lado.wallId) continue;
    if (openings.some((o) => o.wallId === lado.wallId && (o.kind === 'door' || o.kind === 'sliding'))) return lado;
  }
  return null;
}

// ─── O kit em posições ────────────────────────────────────────────────────────

interface PecaPosicionada {
  papel: PapelNoKit;
  tipo: TipoDePontoHidraulico;
  ponto: Point;
}

function posicionarKit(
  kit: KitHidraulico,
  space: Space,
  walls: readonly Wall[],
  openings: readonly Opening[],
  hip: HipotesesDePontos,
): PecaPosicionada[] | null {
  const todos = ladosDePiso(space, walls);
  if (todos.length < 3) return null;
  // O anel é o CONTORNO inteiro (recuado à face); os lados curtos demais só
  // saem da escolha de onde pôr peça — tirá-los do anel deformaria o polígono.
  const anel = todos.map((l) => l.a);
  const lados = todos.filter((l) => comprimento(l) > 2 * hip.recuoDaParedeMm);
  if (lados.length === 0) return null;
  const centro = centroide(anel);
  const porta = ladoDaPorta(space, lados, walls, openings);
  const juntoAPorta = pontoJuntoAPorta(space, walls, openings, 300);
  const referenciaDaPorta = juntoAPorta ?? (porta ? pontoNoLado(porta, 0.5, 0, anel) : null);
  const porComprimento = [...lados].sort((x, y) => comprimento(y) - comprimento(x));
  const semPorta = porComprimento.filter((l) => l !== porta);
  const maiorSemPorta = semPorta[0] ?? porComprimento[0];
  const distancia = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const recuo = hip.recuoDaParedeMm;

  if (kit === 'BANHEIRO') {
    const vaso = pontoNoLado(maiorSemPorta, 0.3, recuo + 200, anel);
    const lavatorio = referenciaDaPorta
      ? rumoA(referenciaDaPorta, centro, recuo + 100)
      : pontoNoLado(semPorta[1] ?? maiorSemPorta, 0.5, recuo + 150, anel);
    // O canto mais longe da porta (ou do lavatório) recebe o box.
    const longe = referenciaDaPorta ?? lavatorio;
    const canto = [...anel].sort((a, b) => distancia(b, longe) - distancia(a, longe))[0];
    const chuveiro = rumoA(canto, centro, 450);
    const coletor = rumoA(chuveiro, centro, 300);
    return [
      { papel: 'vaso', tipo: 'VASO_SANITARIO', ponto: vaso },
      { papel: 'lavatorio', tipo: 'LAVATORIO', ponto: lavatorio },
      { papel: 'chuveiro', tipo: 'CHUVEIRO', ponto: chuveiro },
      { papel: 'coletor', tipo: hip.coletorDoBanheiro, ponto: coletor },
    ];
  }
  if (kit === 'COZINHA') {
    // O maior lado mais longe da porta: é onde a bancada fica.
    const candidato = referenciaDaPorta
      ? [...semPorta].sort((x, y) => {
          const dx = distancia(pontoNoLado(x, 0.5, 0, anel), referenciaDaPorta) + comprimento(x) * 0.5;
          const dy = distancia(pontoNoLado(y, 0.5, 0, anel), referenciaDaPorta) + comprimento(y) * 0.5;
          return dy - dx;
        })[0]
      : maiorSemPorta;
    return [{ papel: 'pia', tipo: 'PIA_COZINHA', ponto: pontoNoLado(candidato ?? maiorSemPorta, 0.5, recuo + 300, anel) }];
  }
  const lado = maiorSemPorta;
  const tanque = pontoNoLado(lado, 0.32, recuo + 300, anel);
  const maquina = pontoNoLado(lado, 0.68, recuo + 300, anel);
  const ralo = rumoA(tanque, centro, 500);
  return [
    { papel: 'tanque', tipo: 'TANQUE', ponto: tanque },
    { papel: 'maquina', tipo: 'MAQUINA_LAVAR', ponto: maquina },
    { papel: 'ralo', tipo: 'RALO_SECO', ponto: ralo },
  ];
}

/** As disciplinas que o aparelho pede neste kit (esgoto do chuveiro vai pelo coletor). */
function disciplinasDaPeca(peca: PecaPosicionada, hip: HipotesesDePontos): DisciplinaDeRede[] {
  const admitidas = DISCIPLINAS_DO_PONTO_HIDRAULICO[peca.tipo];
  return admitidas.filter((d) => {
    if (d === 'AGUA_QUENTE') return hip.aguaQuenteEm.includes(peca.tipo);
    if (d === 'ESGOTO' && peca.tipo === 'CHUVEIRO') return false;
    return true;
  });
}

// ─── O plano ─────────────────────────────────────────────────────────────────

export function planejarPontosDoAmbiente(
  model: BlueprintModel,
  space: Space,
  hip: HipotesesDePontos = HIPOTESES_PONTOS_PADRAO,
  kitForcado?: KitHidraulico | null,
): PlanoDePontosDoAmbiente {
  const nome = space.name ?? 'Ambiente';
  const kit = kitForcado !== undefined ? kitForcado : kitDoAmbiente(space, model.labels);
  const vazio = (motivo: string | null): PlanoDePontosDoAmbiente => ({
    spaceId: space.id, levelId: space.levelId, nome, kit, pecas: [], comandos: [], aCriar: 0, jaExistentes: 0, motivo,
  });
  if (!kit) return vazio('ambiente sem tipo hidráulico — classifique como banheiro ou cozinha/serviço');
  const walls = model.walls.filter((w) => w.levelId === space.levelId);
  const posicionadas = posicionarKit(kit, space, walls, model.openings, hip);
  if (!posicionadas) return vazio('ambiente sem parede suficiente para posicionar o kit');

  const existentes = terminaisHidraulicosDoAmbiente(space, model.terminais ?? []).filter((t) => t.tipoHidraulico);
  const comandos: Command[] = [];
  const pecas: PecaPrevista[] = [];
  let jaExistentes = 0;
  for (const p of posicionadas) {
    const disciplinas = disciplinasDaPeca(p, hip);
    const irmaos = existentes.filter((t) => t.tipoHidraulico === p.tipo);
    // A posição do irmão que já existe vale para a disciplina que falta: os
    // pontos do mesmo aparelho ficam no mesmo (x, y).
    const ponto = irmaos[0]?.at ?? p.ponto;
    const jaTem = disciplinas.filter((d) => irmaos.some((t) => t.disciplina === d));
    jaExistentes += jaTem.length;
    pecas.push({ papel: p.papel, tipo: p.tipo, disciplinas, ponto, existentes: jaTem });
    for (const d of disciplinas) {
      if (jaTem.includes(d)) continue;
      const ficha = FICHA_DO_PONTO_HIDRAULICO[p.tipo];
      comandos.push({
        type: 'AddTerminal',
        levelId: space.levelId,
        disciplina: d,
        tipo: ficha.rotulo,
        at: ponto,
        cotaMm: ficha.cotaMm[d] ?? 0,
        tipoHidraulico: p.tipo,
        sugerida: true,
        rotulo: `${ROTULO_DO_KIT[kit]} · ${nome}`,
      });
    }
  }
  return {
    spaceId: space.id, levelId: space.levelId, nome, kit, pecas, comandos, aCriar: comandos.length, jaExistentes,
    motivo: comandos.length === 0 ? 'o kit já está completo neste ambiente' : null,
  };
}

/** Um plano por ambiente do pavimento — só os que têm tipo (ou kit forçado). */
export function planejarPontosDoNivel(
  model: BlueprintModel,
  levelId: string | null,
  hip: HipotesesDePontos = HIPOTESES_PONTOS_PADRAO,
  kitsForcados: Record<string, KitHidraulico | null> = {},
): PlanoDePontosDoAmbiente[] {
  return model.spaces
    .filter((s) => !levelId || s.levelId === levelId)
    .map((s) => planejarPontosDoAmbiente(model, s, hip, s.id in kitsForcados ? kitsForcados[s.id] : undefined))
    .filter((p) => p.kit !== null || p.spaceId in kitsForcados);
}
