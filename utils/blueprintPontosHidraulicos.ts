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
 *   LAVABO        — vaso sanitário e lavatório; sem chuveiro e sem coletor
 *                   (14/10/2026 — antes o lavabo só podia ser BANHEIRO e ganhava box)
 *
 * O kit vem do USO declarado na etiqueta (`SpaceLabel.uso`, kernel 0.102.0):
 * banheiro, lavabo, cozinha, área de serviço. Sem uso (desenho antigo), do
 * tipo NBR 5410 — que só tem COZINHA_SERVICO para cozinha e serviço, e aí a
 * heurística é o NOME ("serviço", "lavanderia" → área de serviço; senão
 * cozinha). A gaveta deixa trocar o kit em qualquer caso.
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
import type { BlueprintModel, Command, Componente, UsoDoAmbiente, DisciplinaDeRede, FichaDoComponente, ObjectId, Opening, Space, SpaceLabel, Terminal, TipoDePontoHidraulico, Wall } from './blueprintKernel';
import { CATALOGO_DE_COMPONENTES, DISCIPLINAS_DO_PONTO_HIDRAULICO, TIPOS_DE_EVAPORADORA, pointInPolygon, signedArea } from './blueprintKernel';
import type { Point } from './blueprintKernel';
import { etiquetaDoAmbiente, ladosDePiso, pontoJuntoAPorta, type LadoDoAmbiente } from './blueprintDistribuicao';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import { encaixarNaParede, faceDaParede } from './blueprintRotaPelasParedes';
import { CONTORNO_DO_PILAR_MM, anelDoPilar, pegadasDePilares } from './blueprintObstaculosEstruturais';
import { COTA_USUAL_DO_PONTO_ELETRICO, ROTULO_DO_PONTO_ELETRICO } from './blueprintRede';
import { potenciaPadraoVA } from './blueprintPotenciaPadrao';
import { potenciaEletricaVA } from './blueprintSelecaoClimatizacao';
import { ehEvaporadoraDeParede, encostoNaParede, estaEncostada, lugaresDoPontoDeForca } from './blueprintEncostoNaParede';

export type KitHidraulico = 'BANHEIRO' | 'LAVABO' | 'COZINHA' | 'AREA_SERVICO';

export const ROTULO_DO_KIT: Record<KitHidraulico, string> = {
  BANHEIRO: 'Banheiro',
  LAVABO: 'Lavabo',
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
  /**
   * F14a da casa automática (15/10/2026): a água fria e a quente da mesma louça LADO A LADO na face da parede (como o
   * misturador), a esta distância entre si, mm — juntas no mesmo ponto, as duas descidas se encostavam. Ausente ou 0
   * = no mesmo ponto, como antes.
   */
  afastamentoFriaQuenteMm?: number;
  /**
   * F18 da casa automática (16/10/2026): o ponto de ÁGUA que cairia dentro do vão de uma janela da parede dele desce
   * para esta distância abaixo do peitoril, mm — a máquina de lavar sob a janela da área de serviço tinha a torneira a
   * 1,10 m, com o peitoril a 1,00 m, e a água só chegava a ela pela janela. Ausente = 100.
   */
  abaixoDoPeitorilMm?: number;
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

/** O kit que o USO declarado pede; sem uso, o tipo de ambiente, com a heurística do nome para cozinha × serviço. */
export function kitDoAmbiente(space: Space, labels: readonly SpaceLabel[]): KitHidraulico | null {
  const etiqueta = etiquetaDoAmbiente(space, labels);
  if (etiqueta?.uso) return KIT_DO_USO[etiqueta.uso] ?? null;
  const tipo = etiqueta?.tipoDeAmbiente ?? null;
  if (tipo === 'BANHEIRO') return 'BANHEIRO';
  if (tipo === 'COZINHA_SERVICO') {
    const nome = (space.name ?? '').toLowerCase();
    return /serv|lavand/.test(nome) ? 'AREA_SERVICO' : 'COZINHA';
  }
  return null;
}

/** O kit de cada uso que tem ponto de água; os demais (sala, dormitório…) não pedem. */
const KIT_DO_USO: Partial<Record<UsoDoAmbiente, KitHidraulico>> = {
  BANHEIRO: 'BANHEIRO',
  LAVABO: 'LAVABO',
  COZINHA: 'COZINHA',
  AREA_DE_SERVICO: 'AREA_SERVICO',
};

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

  if (kit === 'BANHEIRO' || kit === 'LAVABO') {
    const vaso = pontoNoLado(maiorSemPorta, 0.3, recuo + 200, anel);
    const lavatorio = referenciaDaPorta
      ? rumoA(referenciaDaPorta, centro, recuo + 100)
      : pontoNoLado(semPorta[1] ?? maiorSemPorta, 0.5, recuo + 150, anel);
    // O canto mais longe da porta (ou do lavatório) recebe o box.
    const longe = referenciaDaPorta ?? lavatorio;
    const canto = [...anel].sort((a, b) => distancia(b, longe) - distancia(a, longe))[0];
    const chuveiro = rumoA(canto, centro, 450);
    const coletor = rumoA(chuveiro, centro, 300);
    // O lavabo é o banheiro sem o box: vaso e lavatório, nas mesmas posições.
    if (kit === 'LAVABO') {
      return [
        { papel: 'vaso', tipo: 'VASO_SANITARIO', ponto: vaso },
        { papel: 'lavatorio', tipo: 'LAVATORIO', ponto: lavatorio },
      ];
    }
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
/** As redes que o aparelho recebe — a mesma regra no kit do ambiente e na louça. */
function disciplinasDoAparelho(tipo: TipoDePontoHidraulico, hip: HipotesesDePontos): DisciplinaDeRede[] {
  const admitidas = DISCIPLINAS_DO_PONTO_HIDRAULICO[tipo];
  return admitidas.filter((d) => {
    if (d === 'AGUA_QUENTE') return hip.aguaQuenteEm.includes(tipo);
    if (d === 'ESGOTO' && tipo === 'CHUVEIRO') return false;
    return true;
  });
}
const disciplinasDaPeca = (peca: PecaPosicionada, hip: HipotesesDePontos) => disciplinasDoAparelho(peca.tipo, hip);

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
  if (!kit) return vazio('ambiente sem uso hidráulico — classifique como banheiro, lavabo, cozinha ou área de serviço');
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
    // F14a: a fria e a quente lado a lado ao longo da parede (`afastamentoFriaQuenteMm`) — como em `pontosDaLouca`.
    const posicaoDe = (d: DisciplinaDeRede) => {
      const meio = (hip.afastamentoFriaQuenteMm ?? 0) / 2;
      const ehAgua = (x: DisciplinaDeRede) => x === 'AGUA_FRIA' || x === 'AGUA_QUENTE';
      if (!meio || !ehAgua(d) || !(disciplinas.includes('AGUA_FRIA') && disciplinas.includes('AGUA_QUENTE'))) return ponto;
      const e = encaixarNaParede(ponto, walls, 1500);
      if (!e || e.d < 1) return ponto;
      const t = { x: -(ponto.y - e.q.y) / e.d, y: (ponto.x - e.q.x) / e.d };
      const s = d === 'AGUA_FRIA' ? -1 : 1;
      // Um já existe (o irmão está em `ponto`): o outro nasce a um afastamento inteiro dele; os dois novos, meio para cada lado.
      const passo = irmaos.some((x) => ehAgua(x.disciplina)) ? 2 * meio : meio;
      return { x: Math.round(ponto.x + s * t.x * passo), y: Math.round(ponto.y + s * t.y * passo) };
    };
    for (const d of disciplinas) {
      if (jaTem.includes(d)) continue;
      const ficha = FICHA_DO_PONTO_HIDRAULICO[p.tipo];
      comandos.push({
        type: 'AddTerminal',
        levelId: space.levelId,
        disciplina: d,
        tipo: ficha.rotulo,
        at: posicaoDe(d),
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

// ─── A louça lança os pontos dela (27/09/2026) ──────────────────────────────

/** Raio em que um ponto é "da" louça — o mesmo de `pontoHidraulicoDoComponente`. */
const RAIO_DA_LOUCA_MM = 600;
/** A5: "o mesmo ponto" — a posição em que o novo nasceria, ao mm do kernel mais folga. */
const MESMO_PONTO_MM = 50;

/**
 * Os `AddTerminal` que faltam à louça (vaso, lavatório, box, tanque, máquina,
 * bancada com pia): um por rede do aparelho, no centro da peça, na cota da
 * ficha. Nasceu de *"na planta tem uma vaso sanitaria. o sistema nao
 * reconheceu?"* — a peça desenhada não criava ponto, e o esgoto automático só
 * lê pontos. IDEMPOTENTE por (tipo, disciplina) a até 600 mm; a rede que falta
 * nasce na posição do irmão que já existe. Não é `sugerida`: a peça foi
 * colocada pelo usuário.
 *
 * ONDE (27/09/2026, "agua fria e quente passam embutidas nas paredes"): a ÁGUA
 * (fria e quente) nasce na FACE da parede atrás da peça — é onde fica a saída —,
 * e o esgoto no centro da peça (o do vaso é no piso). No centro, o último toco
 * da água atravessava o cômodo no ar até a louça. Sem parede ao alcance
 * (a peça solta no ambiente), tudo no centro, como antes.
 */
/** F14b: até onde se procura a parede que dá a DIREÇÃO do par fria/quente da louça longe dela, mm. */
const ALCANCE_DA_DIRECAO_MM = 3000;
/** F14b: até onde (e de quanto em quanto) o par fria/quente escorrega pela parede para sair do pilar, mm. */
const DESLIZE_MAXIMO_DO_PAR_MM = 600;
const PASSO_DO_DESLIZE_MM = 25;

export function pontosDaLouca(
  model: BlueprintModel,
  componente: Componente,
  hip: HipotesesDePontos = HIPOTESES_PONTOS_PADRAO,
  /** Casa automática F7 (15/10/2026): os pontos nascem `sugerida` quando a louça também é sugerida (mobiliário aceito, casa gerada). */
  opcoes: { sugerida?: boolean } = {},
): Extract<Command, { type: 'AddTerminal' }>[] {
  const tipo = (CATALOGO_DE_COMPONENTES[componente.tipoId] as FichaDoComponente | undefined)?.ligaAoPonto;
  if (!tipo) return [];
  const alcance = Math.max(componente.larguraMm, componente.profundidadeMm) / 2 + 400;
  const encaixe = faceDaParede(componente.at, model.walls.filter((w) => w.levelId === componente.levelId), alcance);
  const naFace = encaixe?.face;
  // ⚠️ A5 (plano pós-roadmap): "irmão" também é o ponto que já está ONDE o novo nasceria (a face da
  // parede). Medindo só a partir do centro, o box grande afastado da parede (face a > 600 mm) não
  // achava a própria água e a lançava de novo no mesmo lugar a cada vez.
  const irmaos = (model.terminais ?? [])
    .filter((t) => t.levelId === componente.levelId && t.tipoHidraulico === tipo)
    .map((t) => ({ t, d: Math.hypot(t.at.x - componente.at.x, t.at.y - componente.at.y), f: naFace ? Math.hypot(t.at.x - naFace.x, t.at.y - naFace.y) : Infinity }))
    .filter((x) => x.d <= RAIO_DA_LOUCA_MM || x.f <= MESMO_PONTO_MM)
    .sort((a, b) => Math.min(a.d, a.f) - Math.min(b.d, b.f))
    .map((x) => x.t);
  const ficha = FICHA_DO_PONTO_HIDRAULICO[tipo];
  const ehAgua = (d: DisciplinaDeRede) => d === 'AGUA_FRIA' || d === 'AGUA_QUENTE';
  const irmaoDeAgua = irmaos.find((t) => ehAgua(t.disciplina));
  // F14a: fria e quente lado a lado AO LONGO da parede (a direção é a da face: perpendicular a eixo → face).
  const lado = (() => {
    const meio = (hip.afastamentoFriaQuenteMm ?? 0) / 2;
    // F14b: a louça LONGE da parede (o mobiliário a pôs a 60 cm dela) não tinha direção: fria e quente nasciam no
    // MESMO ponto e, encostadas cada uma pela sua rede, ficavam a 4,5 cm. A direção vem da parede mais perto.
    const ref = encaixe ?? faceDaParede(componente.at, model.walls.filter((w) => w.levelId === componente.levelId), ALCANCE_DA_DIRECAO_MM);
    if (!meio || !ref || irmaoDeAgua) return null;
    const nx = ref.face.x - ref.q.x;
    const ny = ref.face.y - ref.q.y;
    const n = Math.hypot(nx, ny);
    if (n < 1) return null;
    return { x: (-ny / n) * meio, y: (nx / n) * meio };
  })();
  const comQuente = disciplinasDoAparelho(tipo, hip).includes('AGUA_QUENTE');
  // F14b (16/10/2026, sobrado a 30°): o PAR fria/quente que cai no contorno do pilar do canto escorrega JUNTO pela
  // parede, mantendo o afastamento — escorregados um a um no traçado da água, os dois paravam no mesmo lugar (4,5 cm).
  const deslize = (() => {
    if (!lado || !comQuente || irmaoDeAgua) return { x: 0, y: 0 };
    const aneis = pegadasDePilares(model, componente.levelId).map((g) => anelDoPilar(g, CONTORNO_DO_PILAR_MM) as Point[]);
    if (aneis.length === 0) return { x: 0, y: 0 };
    const base = naFace ?? componente.at;
    const L = Math.hypot(lado.x, lado.y);
    const u = { x: lado.x / L, y: lado.y / L };
    const livre = (d: number) => [-1, 1].every((s) => !aneis.some((g) => pointInPolygon(g, { x: base.x + u.x * d + s * lado.x, y: base.y + u.y * d + s * lado.y } as Point)));
    for (let k = 0; k <= DESLIZE_MAXIMO_DO_PAR_MM / PASSO_DO_DESLIZE_MM; k++) {
      for (const d of k === 0 ? [0] : [k * PASSO_DO_DESLIZE_MM, -k * PASSO_DO_DESLIZE_MM]) if (livre(d)) return { x: u.x * d, y: u.y * d };
    }
    return { x: 0, y: 0 };
  })();
  const posicao = (d: DisciplinaDeRede) => {
    if (!ehAgua(d)) return irmaos.find((t) => !ehAgua(t.disciplina))?.at ?? componente.at;
    const base = irmaoDeAgua?.at ?? naFace ?? componente.at;
    if (!lado || !comQuente) return base;
    const s = d === 'AGUA_FRIA' ? -1 : 1;
    return { x: Math.round(base.x + deslize.x + s * lado.x), y: Math.round(base.y + deslize.y + s * lado.y) };
  };
  // F18: o ponto de água dentro do vão de uma janela da parede dele desce para abaixo do peitoril.
  const paredesDoNivel = model.walls.filter((w) => w.levelId === componente.levelId);
  const cotaForaDaJanela = (ponto: { x: number; y: number }, cota: number): number => {
    const e = encaixarNaParede(ponto, paredesDoNivel, 400);
    if (!e) return cota;
    const w = e.parede;
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
    const t = ((ponto.x - w.a.x) * (w.b.x - w.a.x) + (ponto.y - w.a.y) * (w.b.y - w.a.y)) / L;
    const folga = hip.abaixoDoPeitorilMm ?? 100;
    const janela = model.openings.find((o) => o.wallId === w.id && o.kind === 'window' && t > o.offsetMm - folga && t < o.offsetMm + o.widthMm + folga && cota > o.sillMm - folga && cota < o.sillMm + o.heightMm);
    return janela ? Math.max(0, janela.sillMm - folga) : cota;
  };
  return disciplinasDoAparelho(tipo, hip)
    .filter((d) => !irmaos.some((t) => t.disciplina === d))
    .map((d) => {
      const ponto = posicao(d);
      const cota = ficha.cotaMm[d] ?? 0;
      return {
        type: 'AddTerminal' as const,
        levelId: componente.levelId,
        disciplina: d,
        tipo: ficha.rotulo,
        at: { x: ponto.x, y: ponto.y },
        cotaMm: ehAgua(d) ? cotaForaDaJanela(ponto, cota) : cota,
        tipoHidraulico: tipo,
        ...(opcoes.sugerida ? { sugerida: true } : {}),
      };
    });
}

/**
 * O PONTO ELÉTRICO do equipamento (E1.2, 29/09/2026) — o irmão elétrico de
 * `pontosDaLouca`: a evaporadora inserida lança o ponto de ar-condicionado na
 * FACE da parede atrás dela (é onde a caixa fica), com a cota usual do tipo e a
 * potência típica (HIPÓTESE — `POTENCIA_TIPICA_DO_EQUIPAMENTO_VA`). IDEMPOTENTE:
 * com um ponto do mesmo tipo a até 600 mm, nada nasce. Não é `sugerida`: a peça
 * foi colocada pelo usuário. Circuito não entra aqui — é do planejador.
 */
export function pontosEletricosDoComponente(
  model: BlueprintModel,
  componente: Componente,
): Extract<Command, { type: 'AddTerminal' }>[] {
  const tipo = (CATALOGO_DE_COMPONENTES[componente.tipoId] as FichaDoComponente | undefined)?.ligaAoPontoEletrico;
  if (!tipo) return [];
  const alcance = Math.max(componente.larguraMm, componente.profundidadeMm) / 2 + 400;
  const naFace = faceDaParede(componente.at, model.walls.filter((w) => w.levelId === componente.levelId), alcance)?.face;
  // ⚠️ A5: o ponto já na posição de nascer (a face) também conta — ver `pontosDaLouca`.
  const jaTem = (model.terminais ?? []).some(
    (t) =>
      t.levelId === componente.levelId &&
      t.disciplina === 'ELETRICA' &&
      t.tipoEletrico === tipo &&
      (Math.hypot(t.at.x - componente.at.x, t.at.y - componente.at.y) <= RAIO_DA_LOUCA_MM || (!!naFace && Math.hypot(t.at.x - naFace.x, t.at.y - naFace.y) <= MESMO_PONTO_MM)),
  );
  if (jaTem) return [];
  const ponto = naFace ?? componente.at;
  const potencia = potenciaPadraoVA(tipo, null);
  return [
    {
      type: 'AddTerminal' as const,
      levelId: componente.levelId,
      disciplina: 'ELETRICA',
      tipo: ROTULO_DO_PONTO_ELETRICO[tipo],
      at: { x: ponto.x, y: ponto.y },
      cotaMm: COTA_USUAL_DO_PONTO_ELETRICO[tipo],
      tipoEletrico: tipo,
      ...(potencia != null ? { potenciaW: potencia } : {}),
    },
  ];
}

/**
 * F10 (10/10/2026): a potência AUTOMÁTICA do ponto de ar-condicionado da
 * evaporadora — pela capacidade declarada ÷ EER das premissas de seleção (a
 * mesma conta do lançamento do split, E4.3); sem capacidade, a típica (1400 VA,
 * hipótese). "Automática" é o que o app põe sozinho; o que o projetista digita
 * no ponto não é tocado (`comandosDaPotenciaDaEvaporadora`).
 */
export function potenciaDaEvaporadoraVA(capacidadeBtuH: number | null | undefined, eerWW: number): number {
  return capacidadeBtuH ? potenciaEletricaVA(capacidadeBtuH, eerWW) : (potenciaPadraoVA('AR_CONDICIONADO', null) ?? 1400);
}

/** O ponto de ar-condicionado que serve a evaporadora: o mais perto, a até `RAIO_DA_LOUCA_MM` dela ou na face da parede atrás. */
export function pontoEletricoDaEvaporadoraExistente(model: BlueprintModel, evap: Pick<Terminal, 'levelId' | 'at' | 'larguraMm' | 'profundidadeMm'>): Terminal | null {
  const alcance = Math.max(evap.larguraMm ?? 0, evap.profundidadeMm ?? 0) / 2 + 400;
  const naFace = faceDaParede(evap.at, model.walls.filter((w) => w.levelId === evap.levelId), alcance)?.face;
  // 11/10/2026: e os dois lugares AO LADO da peça, na face — onde o ponto nasce agora.
  const enc = encostoNaParede(model, evap.levelId, evap.at, evap.profundidadeMm ?? 220);
  const aoLado = enc ? lugaresDoPontoDeForca(model, enc, evap.larguraMm ?? 900) : [];
  const candidatos = (model.terminais ?? []).filter(
    (t) =>
      t.levelId === evap.levelId &&
      t.disciplina === 'ELETRICA' &&
      t.tipoEletrico === 'AR_CONDICIONADO' &&
      (Math.hypot(t.at.x - evap.at.x, t.at.y - evap.at.y) <= RAIO_DA_LOUCA_MM ||
        (!!naFace && Math.hypot(t.at.x - naFace.x, t.at.y - naFace.y) <= MESMO_PONTO_MM) ||
        aoLado.some((l) => Math.hypot(t.at.x - l.x, t.at.y - l.y) <= MESMO_PONTO_MM)),
  );
  return candidatos.sort((a, b) => Math.hypot(a.at.x - evap.at.x, a.at.y - evap.at.y) - Math.hypot(b.at.x - evap.at.x, b.at.y - evap.at.y))[0] ?? null;
}

/**
 * F10 (10/10/2026): o PONTO ELÉTRICO da evaporadora REAL (a peça da rede, E3)
 * inserida à mão — o mesmo gesto do componente de reserva: o ponto de
 * ar-condicionado na FACE da parede atrás dela, com a potência pela capacidade.
 * Antes ela entrava sem ponto nenhum (e a reserva antiga, com 1400 VA fixos).
 * Idempotente: com um ponto de ar-condicionado já servindo a peça, nada nasce.
 */
export function pontoEletricoDaEvaporadora(model: BlueprintModel, evap: Pick<Terminal, 'levelId' | 'at' | 'capacidadeBtuH' | 'larguraMm' | 'profundidadeMm' | 'rotacaoGraus'>, eerWW: number): Extract<Command, { type: 'AddTerminal' }>[] {
  if (pontoEletricoDaEvaporadoraExistente(model, evap)) return [];
  // 11/10/2026 (teste no app real): na face ATRÁS do centro o ponto ficava escondido sob o
  // aparelho. Agora nasce na face, AO LADO dele (meia largura + 150 mm), do lado em que a parede continua.
  const enc = encostoNaParede(model, evap.levelId, evap.at, evap.profundidadeMm ?? 220);
  // 10/10/2026 (teste no app real): SEM parede perto o ponto nascia no centro da peça, um
  // por cima do outro. Agora nasce ao LADO dela, no eixo da largura (meia largura + 150 mm).
  const giro = ((evap.rotacaoGraus ?? 0) * Math.PI) / 180;
  const aoLado = (evap.larguraMm ?? 900) / 2 + 150;
  const ponto = enc ? lugaresDoPontoDeForca(model, enc, evap.larguraMm ?? 900)[0] : { x: evap.at.x + Math.cos(giro) * aoLado, y: evap.at.y + Math.sin(giro) * aoLado };
  return [
    {
      type: 'AddTerminal' as const,
      levelId: evap.levelId,
      disciplina: 'ELETRICA',
      tipo: ROTULO_DO_PONTO_ELETRICO.AR_CONDICIONADO,
      at: { x: Math.round(ponto.x), y: Math.round(ponto.y) },
      cotaMm: COTA_USUAL_DO_PONTO_ELETRICO.AR_CONDICIONADO,
      tipoEletrico: 'AR_CONDICIONADO',
      potenciaW: potenciaDaEvaporadoraVA(evap.capacidadeBtuH, eerWW),
    },
  ];
}

/**
 * F10: a capacidade da evaporadora mudou — a potência do ponto dela acompanha,
 * MAS só se ainda é a automática (a da capacidade anterior, a típica ou vazia).
 * Potência digitada pelo projetista fica (regra: o app preenche, não sobrescreve).
 */
export function comandosDaPotenciaDaEvaporadora(model: BlueprintModel, evap: Terminal, novaCapacidadeBtuH: number | null, eerWW: number): Command[] {
  const ponto = pontoEletricoDaEvaporadoraExistente(model, evap);
  if (!ponto) return [];
  const automaticas = new Set([potenciaDaEvaporadoraVA(evap.capacidadeBtuH, eerWW), potenciaDaEvaporadoraVA(null, eerWW)]);
  if (ponto.potenciaW != null && !automaticas.has(ponto.potenciaW)) return [];
  const nova = potenciaDaEvaporadoraVA(novaCapacidadeBtuH, eerWW);
  return ponto.potenciaW === nova ? [] : [{ type: 'SetTerminalProps', terminalId: ponto.id, potenciaW: nova } as Command];
}

/**
 * 11/10/2026 (teste do usuário no app real): ENCOSTAR na parede a evaporadora de parede já
 * desenhada — a que ficou com metade dentro da alvenaria ou sem giro. A peça anda até o
 * encosto e gira para soprar para dentro; o ponto de força dela que ficou ESCONDIDO sob o
 * aparelho (entre o eixo da parede e a frente da peça, dentro da largura) vai para o lado.
 * Um lote; vazio quando já está encostada ou não há parede ao alcance.
 */
export function comandosParaEncostarEvaporadora(model: BlueprintModel, evap: Terminal): Command[] {
  if (!ehEvaporadoraDeParede(evap.tipoHidraulico)) return [];
  const ficha = evap.tipoHidraulico ? FICHA_DO_PONTO_HIDRAULICO[evap.tipoHidraulico]?.medidasMm : undefined;
  const larguraMm = evap.larguraMm ?? ficha?.larguraMm ?? 900;
  const profundidadeMm = evap.profundidadeMm ?? ficha?.profundidadeMm ?? 220;
  const enc = encostoNaParede(model, evap.levelId, evap.at, profundidadeMm);
  if (!enc || estaEncostada(evap.at, evap.rotacaoGraus, enc)) return [];
  const lote: Command[] = [];
  const delta = { x: enc.at.x - evap.at.x, y: enc.at.y - evap.at.y };
  if (delta.x !== 0 || delta.y !== 0) lote.push({ type: 'TranslateEntities', wallIds: [], boundaryIds: [], structuralIds: [], terminalIds: [evap.id], delta, manterJuncoes: false });
  lote.push({ type: 'SetTerminalProps', terminalId: evap.id, rotacaoGraus: enc.rotacaoGraus });
  const ponto = pontoEletricoDaEvaporadoraExistente(model, evap);
  if (ponto) {
    const w = model.walls.find((x) => x.id === enc.wallId);
    const meia = (w?.thicknessMm ?? 150) / 2;
    const rel = { x: ponto.at.x - enc.face.x, y: ponto.at.y - enc.face.y };
    const aoLongo = rel.x * enc.tangente.x + rel.y * enc.tangente.y;
    const paraDentro = rel.x * enc.normal.x + rel.y * enc.normal.y;
    const escondido = Math.abs(aoLongo) < larguraMm / 2 && paraDentro >= -meia - 1 && paraDentro <= profundidadeMm + 1;
    if (escondido) {
      const destino = lugaresDoPontoDeForca(model, enc, larguraMm)[0];
      lote.push({ type: 'TranslateEntities', wallIds: [], boundaryIds: [], structuralIds: [], terminalIds: [ponto.id], delta: { x: destino.x - ponto.at.x, y: destino.y - ponto.at.y }, manterJuncoes: false });
    }
  }
  return lote;
}

/**
 * 11/10/2026 (pendência do teste do usuário no app real): APAGAR a evaporadora leva o ponto de
 * força DELA — antes ele ficava no desenho, solto, com a potência e o circuito. Só o ponto que
 * nenhuma evaporadora que FICA também usa; o que já está na lista não se repete.
 */
export function pontosQueSaemComAsEvaporadoras(model: BlueprintModel, idsApagados: readonly ObjectId[]): ObjectId[] {
  const apagados = new Set(idsApagados);
  const evaporadoras = (model.terminais ?? []).filter((t) => !!t.tipoHidraulico && (TIPOS_DE_EVAPORADORA as readonly string[]).includes(t.tipoHidraulico));
  const ficam = evaporadoras.filter((e) => !apagados.has(e.id));
  const saem = new Set<ObjectId>();
  for (const e of evaporadoras.filter((x) => apagados.has(x.id))) {
    const p = pontoEletricoDaEvaporadoraExistente(model, e);
    if (!p || apagados.has(p.id)) continue;
    if (ficam.some((f) => pontoEletricoDaEvaporadoraExistente(model, f)?.id === p.id)) continue;
    saem.add(p.id);
  }
  return [...saem];
}

/** O nome que o app dá à condensadora pela capacidade (o mesmo do lançamento do split). */
export const nomeDaCondensadora = (capacidadeBtuH: number | null | undefined): string =>
  capacidadeBtuH ? `Condensadora ${capacidadeBtuH.toLocaleString('pt-BR')} BTU/h` : 'Condensadora';

/**
 * 11/10/2026 (teste do usuário no app real): a capacidade da evaporadora mudou — a da
 * condensadora LIGADA a ela (split) acompanha, MAS só se ainda é a automática (vazia ou
 * igual à anterior da evaporadora); o nome também, se ainda é o automático. O que o
 * projetista declarou na condensadora não é tocado.
 */
export function comandosDaCapacidadeDaCondensadora(model: BlueprintModel, evap: Terminal, novaCapacidadeBtuH: number | null): Command[] {
  const cond = evap.condensadoraId ? (model.terminais ?? []).find((t) => t.id === evap.condensadoraId) : undefined;
  if (!cond || cond.tipoHidraulico !== 'CONDENSADORA_SPLIT') return [];
  const automatica = cond.capacidadeBtuH == null || cond.capacidadeBtuH === evap.capacidadeBtuH;
  if (!automatica || (cond.capacidadeBtuH ?? null) === novaCapacidadeBtuH) return [];
  const nomeAutomatico = cond.tipo === nomeDaCondensadora(cond.capacidadeBtuH) || cond.tipo === 'Condensadora';
  return [{ type: 'SetTerminalProps', terminalId: cond.id, capacidadeBtuH: novaCapacidadeBtuH, ...(nomeAutomatico ? { tipo: nomeDaCondensadora(novaCapacidadeBtuH) } : {}) } as Command];
}

/** Os pontos das louças (e o ponto elétrico dos equipamentos) que ENTRARAM num comando (a peça, ou o conjunto e os filhos). */
export function pontosDasLoucasCriadas(
  depois: BlueprintModel,
  criados: readonly string[],
  hip: HipotesesDePontos = HIPOTESES_PONTOS_PADRAO,
  opcoes: { sugerida?: boolean } = {},
): Extract<Command, { type: 'AddTerminal' }>[] {
  const ids = new Set(criados);
  const comandos: Extract<Command, { type: 'AddTerminal' }>[] = [];
  for (const c of depois.componentes ?? []) {
    if (!ids.has(c.id)) continue;
    comandos.push(...pontosDaLouca(depois, c, hip, opcoes));
    comandos.push(...pontosEletricosDoComponente(depois, c));
  }
  return comandos;
}
