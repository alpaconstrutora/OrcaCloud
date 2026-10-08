/**
 * O DETALHE DAS INSTALAÇÕES no desenho (27/09/2026, pedido com print de
 * isométrico sanitário: *"os tubos e conexoes devem ser detalhados"*).
 *
 * Três coisas que o 3D não mostrava, calculadas aqui e só DESENHADAS no viewer
 * (que é `@ts-nocheck` — um sinal trocado lá passaria calado; aqui o compilador
 * e o teste alcançam):
 *
 *   1. as CONEXÕES — para cada peça de `conexoesDerivadas`, uma BOLSA por boca
 *      (cilindro curto mais grosso que o tubo, saindo do nó na direção do ramal)
 *      e um corpo esférico no nó do joelho, tê, junção e cruzeta. A redução sai
 *      sozinha: cada bolsa tem o diâmetro do seu tubo;
 *   2. os CORPOS das caixas de esgoto na cota CERTA — a CI e a CG com o fundo na
 *      cota, a CS e o ralo com a grelha (o topo) na cota; a caixa genérica do
 *      viewer põe a cota no CENTRO (convenção do IFC para quadro/terminal, ver
 *      `blueprintRede.caixaDaPeca`), e a CI aparecia meia altura abaixo;
 *   3. os RÓTULOS "ø100 mm" — "TQ ø100 mm", "Ventilação ø50 mm" — no meio de
 *      cada trecho hidráulico.
 *
 * Convenção do 3D (a mesma de `cilindroDoTrecho`): X e Z são a planta, Y é a
 * altura, metros; a cota soma a elevação do pavimento.
 */
import type { BlueprintModel, ConexaoDerivada, DisciplinaDeRede, ObjectId, Terminal, Trecho, Wall } from './blueprintKernel';
import { CAIXAS_DE_ESGOTO, conexaoViraPeca, conexoesDerivadas, extensaoVerticalDaCaixa, pointInPolygon } from './blueprintKernel';
import { COR_DA_DISCIPLINA, ESCALA_3D, baseRetangular3D } from './blueprintRede';

type V3 = [number, number, number];

const HIDRAULICAS: readonly DisciplinaDeRede[] = ['AGUA_FRIA', 'AGUA_QUENTE', 'ESGOTO'];

/** A bolsa é 30 % mais grossa que o tubo — o que a torna legível como peça. */
export const FATOR_DA_BOLSA = 1.3;
/** Comprimento da bolsa: um diâmetro, nunca menos de 50 mm. */
export const BOLSA_MINIMA_MM = 50;
/** Raio mínimo desenhado — o mesmo piso do tubo no viewer (15 mm), mais a folga da bolsa. */
const RAIO_MINIMO_DA_BOLSA_M = 0.02;

export interface Cilindro3D {
  centro: V3;
  /** Unitário, na convenção do 3D. */
  eixo: V3;
  raioM: number;
  comprimentoM: number;
  /** E10.3: a bolsa do DUTO RETANGULAR — a caixa com a base de `baseRetangular3D` (o duto e a bolsa giram igual). */
  retangular?: { larguraM: number; alturaM: number; base: { x: V3; y: V3; z: V3 } };
}

export interface PecaDaConexao3D {
  chave: string;
  tipo: ConexaoDerivada['tipo'];
  disciplina: DisciplinaDeRede;
  cor: string;
  bolsas: Cilindro3D[];
  /** O corpo no nó (joelho, tê, junção, cruzeta); `null` na luva e na redução. */
  corpo: { centro: V3; raioM: number } | null;
}

/** A cor escurecida por `quanto` (0–1). */
export function escurecer(hex: string, quanto = 0.35): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const c = (v: number) => Math.round(v * (1 - quanto)).toString(16).padStart(2, '0');
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}

/**
 * A cor da CONEXÃO: tem de CONTRASTAR com o tubo. Na água, a cor da rede
 * escurecida (azul-escuro no azul). No esgoto o tubo já é cinza-escuro, e
 * escurecer dava quase preto sobre cinza — a peça sumia (visto no harness
 * `docs/spikes/esgoto-isometrico`); lá a conexão é cinza-CLARO, como nos
 * isométricos de referência.
 */
export function corDaConexao(disciplina: DisciplinaDeRede): string {
  return disciplina === 'ESGOTO' ? '#a1a1aa' : escurecer(COR_DA_DISCIPLINA[disciplina]);
}

const elevacaoDe = (model: BlueprintModel, levelId: ObjectId) => model.levels.find((l) => l.id === levelId)?.elevationMm ?? 0;

/** [x, y, cota] do MODELO (mm, cota já com a elevação) → ponto do 3D (m). */
const para3D = (x: number, y: number, zMm: number): V3 => [x * ESCALA_3D, zMm * ESCALA_3D, y * ESCALA_3D];

export function pecasDasConexoes3D(model: BlueprintModel, idsVisiveis?: ReadonlySet<ObjectId>): PecaDaConexao3D[] {
  return conexoesDerivadas(model)
    // E10.3: a curva da linha frigorígena não é peça (cobre curvado) — o MESMO predicado do IFC.
    .conexoes.filter((c) => c.ramais && c.ramais.length > 0 && (!idsVisiveis || idsVisiveis.has(c.levelId)) && conexaoViraPeca(c))
    .map((c) => {
      const z = elevacaoDe(model, c.levelId) + c.cotaMm;
      const no = para3D(c.no.x, c.no.y, z);
      // E10.3: no DUTO a bolsa é a do IFC — 1,1 × a seção (retangular quando o duto é), comprimento até 300 mm.
      const duto = c.disciplina === 'MECANICA';
      const bolsas = c.ramais!.map((r) => {
        const comprimentoMm = duto ? Math.max(Math.min(r.alturaDutoMm ?? r.bitolaMm, 300), BOLSA_MINIMA_MM) : Math.max(r.bitolaMm, BOLSA_MINIMA_MM);
        // [x, y, cota] do modelo → [x, cota, y] do 3D.
        const eixo: V3 = [r.u[0], r.u[2], r.u[1]];
        const meio = (comprimentoMm / 2) * ESCALA_3D;
        return {
          centro: [no[0] + eixo[0] * meio, no[1] + eixo[1] * meio, no[2] + eixo[2] * meio] as V3,
          eixo,
          raioM: Math.max(((r.bitolaMm / 2) * (duto ? 1.1 : FATOR_DA_BOLSA)) * ESCALA_3D, RAIO_MINIMO_DA_BOLSA_M),
          comprimentoM: comprimentoMm * ESCALA_3D,
          ...(duto && r.alturaDutoMm != null ? { retangular: { larguraM: Math.round(r.bitolaMm * 11) / 10 * ESCALA_3D, alturaM: Math.round(r.alturaDutoMm * 11) / 10 * ESCALA_3D, base: baseRetangular3D(eixo) } } : {}),
        };
      });
      // A esfera no nó lê como peça de tubo; no duto (como no IFC) a peça são as bolsas.
      const temCorpo = !duto && c.tipo !== 'LUVA' && c.tipo !== 'REDUCAO';
      return {
        chave: `${c.disciplina}|${c.levelId}|${c.no.x},${c.no.y}|${c.cotaMm}`,
        tipo: c.tipo,
        disciplina: c.disciplina,
        cor: corDaConexao(c.disciplina),
        bolsas,
        corpo: temCorpo ? { centro: no, raioM: Math.max(...bolsas.map((b) => b.raioM)) } : null,
      };
    });
}

export interface CorpoDaCaixa3D {
  forma: 'PRISMA' | 'CILINDRO';
  centro: V3;
  /** [largura, altura, profundidade] em m; no cilindro, largura = diâmetro. */
  tamanho: V3;
  /** Tampa (CI, CG) ou grelha (CS, ralo), no topo. */
  tampa: { centro: V3; tamanho: V3 };
}

/** O corpo da caixa de esgoto na cota certa, ou `null` se o terminal não é caixa. */
export function corpoDaCaixa3D(t: Terminal, elevacaoDoNivelMm: number): CorpoDaCaixa3D | null {
  const ext = extensaoVerticalDaCaixa(t);
  const ficha = t.tipoHidraulico ? CAIXAS_DE_ESGOTO[t.tipoHidraulico] : undefined;
  if (!ext || !ficha || t.disciplina !== 'ESGOTO') return null;
  const pegada = pegadaDaCaixa2D(t)!;
  const cilindro = pegada.forma === 'CILINDRO';
  const largura = pegada.larguraMm;
  const profundidade = pegada.profundidadeMm;
  const altura = ext.topoMm - ext.fundoMm;
  const espessura = cilindro ? 15 : 40;
  const aba = cilindro ? 0 : 40;
  const topo = elevacaoDoNivelMm + ext.topoMm;
  return {
    forma: cilindro ? 'CILINDRO' : 'PRISMA',
    centro: para3D(t.at.x, t.at.y, elevacaoDoNivelMm + (ext.fundoMm + ext.topoMm) / 2),
    tamanho: [largura * ESCALA_3D, altura * ESCALA_3D, profundidade * ESCALA_3D],
    tampa: {
      centro: para3D(t.at.x, t.at.y, topo + espessura / 2),
      tamanho: [(largura + aba) * ESCALA_3D, espessura * ESCALA_3D, (profundidade + aba) * ESCALA_3D],
    },
  };
}

export interface RotuloDaRede3D {
  chave: string;
  texto: string;
  posicao: V3;
  cor: string;
}

/** Trecho mais curto que isto não leva rótulo (a menos que seja TQ/ventilação): vira ruído. */
export const COMPRIMENTO_MINIMO_DO_ROTULO_MM = 400;

/** "ø100 mm", "TQ ø100 mm", "Ventilação ø50 mm". */
export const textoDoRotulo = (t: Pick<Trecho, 'bitolaMm' | 'rotulo'>) => `${t.rotulo ? `${t.rotulo} ` : ''}ø${t.bitolaMm} mm`;

/**
 * O trecho corre DENTRO de uma destas paredes? (As duas pontas no retângulo da
 * parede — eixo ± meia espessura — e abaixo do topo dela.) É o tubo embutido
 * pela rede "pelas paredes" (27/09/2026).
 */
export function embutidoEmParede(t: Pick<Trecho, 'levelId' | 'a' | 'b' | 'cotaAMm' | 'cotaBMm'>, paredes: readonly Wall[]): boolean {
  const dentro = (p: { x: number; y: number }, cota: number, w: Wall) => {
    if (w.levelId !== t.levelId || cota > w.heightMm || cota < 0) return false;
    const dx = w.b.x - w.a.x;
    const dy = w.b.y - w.a.y;
    const L = Math.hypot(dx, dy);
    if (L === 0) return false;
    const s = ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / L;
    const d = Math.abs((p.x - w.a.x) * dy - (p.y - w.a.y) * dx) / L;
    return s >= -w.thicknessMm / 2 && s <= L + w.thicknessMm / 2 && d <= w.thicknessMm / 2 + 1;
  };
  return paredes.some((w) => dentro(t.a, t.cotaAMm, w) && dentro(t.b, t.cotaBMm, w));
}

/**
 * `paredesOpacas`: as paredes que ESCONDEM o que corre dentro delas (estilo
 * sombreado, parede à vista). O tubo embutido nelas não leva rótulo: o sprite é
 * mais largo que a parede e saía dela como um papelzinho branco sem o tubo que
 * descreve (visto no harness). No estilo transparente, ou sem a parede, volta.
 */
export function rotulosDaRede3D(model: BlueprintModel, idsVisiveis?: ReadonlySet<ObjectId>, paredesOpacas: readonly Wall[] = []): RotuloDaRede3D[] {
  return (model.trechos ?? [])
    .filter((t) => HIDRAULICAS.includes(t.disciplina) && (!idsVisiveis || idsVisiveis.has(t.levelId)))
    .filter((t) => paredesOpacas.length === 0 || !embutidoEmParede(t, paredesOpacas))
    .filter((t) => !!t.rotulo || Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y, t.cotaBMm - t.cotaAMm) >= COMPRIMENTO_MINIMO_DO_ROTULO_MM)
    .map((t) => {
      const elev = elevacaoDe(model, t.levelId);
      const meio = para3D((t.a.x + t.b.x) / 2, (t.a.y + t.b.y) / 2, elev + (t.cotaAMm + t.cotaBMm) / 2);
      // Acima do tubo, afastado do raio: o texto não pode nascer dentro do cano.
      const folga = (t.bitolaMm / 2) * ESCALA_3D + 0.06;
      return { chave: t.id, texto: textoDoRotulo(t), posicao: [meio[0], meio[1] + folga, meio[2]] as V3, cor: COR_DA_DISCIPLINA[t.disciplina] };
    });
}

// ─── A planta 2D ─────────────────────────────────────────────────────────────

export interface SimboloDaConexao2D {
  chave: string;
  tipo: ConexaoDerivada['tipo'];
  cor: string;
  no: { x: number; y: number };
  /** As bocas com componente em planta: segmento do nó para fora, em mm do modelo. */
  bolsas: { de: { x: number; y: number }; para: { x: number; y: number }; larguraMm: number }[];
  /** As bocas VERTICAIS (prumada): anel em volta do nó, raio em mm. */
  aneis: number[];
  /** Raio do corpo no nó (joelho, tê, junção, cruzeta), mm; `null` na luva e na redução. */
  raioDoCorpoMm: number | null;
  /** Os trechos que se encontram no nó — a conexão some quando todos estão ocultos (camadas, 04/10/2026). */
  trechoIds: ObjectId[];
}

/**
 * As conexões na PLANTA do pavimento (27/09/2026): a mesma bolsa do 3D,
 * projetada — segmento grosso do nó para fora em cada boca que anda em planta,
 * anel na boca que sobe ou desce. O pavimento é o dos TRECHOS da peça, e não o
 * da chave do nó: o ramal sob o piso do andar de cima tem a chave no teto do
 * térreo, mas é desenhado (e lido) na planta do andar de cima.
 */
export function simbolosDasConexoes2D(model: BlueprintModel, levelId: ObjectId | null): SimboloDaConexao2D[] {
  const nivelDoTrecho = new Map((model.trechos ?? []).map((t) => [t.id, t.levelId]));
  return conexoesDerivadas(model)
    .conexoes.filter((c) => c.ramais && c.ramais.length > 0)
    .filter((c) => !levelId || c.trechoIds.some((id) => nivelDoTrecho.get(id) === levelId))
    .map((c) => {
      const bolsas: SimboloDaConexao2D['bolsas'] = [];
      const aneis: number[] = [];
      for (const r of c.ramais!) {
        const larguraMm = r.bitolaMm * FATOR_DA_BOLSA;
        const emPlanta = Math.hypot(r.u[0], r.u[1]);
        if (emPlanta < 0.2) {
          aneis.push(larguraMm / 2);
          continue;
        }
        const comp = Math.max(r.bitolaMm, BOLSA_MINIMA_MM);
        bolsas.push({ de: { ...c.no }, para: { x: c.no.x + r.u[0] * comp, y: c.no.y + r.u[1] * comp }, larguraMm });
      }
      const temCorpo = c.tipo !== 'LUVA' && c.tipo !== 'REDUCAO';
      return {
        chave: `${c.disciplina}|${c.levelId}|${c.no.x},${c.no.y}|${c.cotaMm}`,
        tipo: c.tipo,
        cor: corDaConexao(c.disciplina),
        no: { ...c.no },
        trechoIds: [...c.trechoIds],
        bolsas,
        aneis,
        raioDoCorpoMm: temCorpo ? (Math.max(...c.ramais!.map((r) => r.bitolaMm)) * FATOR_DA_BOLSA) / 2 : null,
      };
    });
}

// ─── A planta 2D DETALHADA (27/09/2026, "detalhado também no 2d") ────────────

/**
 * Abaixo desta largura em TELA o tubo continua traço simples: uma faixa de duas
 * bordas com 2 px vira um borrão, e no zoom de conjunto o traço lê melhor.
 */
export const LARGURA_MINIMA_DO_DETALHE_PX = 4;
/** O contorno das peças (conexões e caixas) na planta detalhada. */
export const COR_DO_CONTORNO_DA_PECA = '#3f3f46';

type P2 = { x: number; y: number };

/**
 * As duas BORDAS do tubo desenhado com a largura real: paralelas ao eixo p→q,
 * a meia largura de cada lado. `null` na prumada (p = q), que é círculo.
 */
export function faixaDoTubo2D(p: P2, q: P2, larguraPx: number): { bordaA: [P2, P2]; bordaB: [P2, P2] } | null {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const n = Math.hypot(dx, dy);
  if (n === 0) return null;
  const ox = (-dy / n) * (larguraPx / 2);
  const oy = (dx / n) * (larguraPx / 2);
  return {
    bordaA: [{ x: p.x + ox, y: p.y + oy }, { x: q.x + ox, y: q.y + oy }],
    bordaB: [{ x: p.x - ox, y: p.y - oy }, { x: q.x - ox, y: q.y - oy }],
  };
}

/** O ângulo de p→q virado para o texto ler da esquerda para a direita: (−π/2, π/2]. */
export function anguloDeLeitura(p: P2, q: P2): number {
  let a = Math.atan2(q.y - p.y, q.x - p.x);
  if (a > Math.PI / 2) a -= Math.PI;
  if (a <= -Math.PI / 2) a += Math.PI;
  return a;
}

/** "ø100 mm · i 1 %" (esgoto com caimento), "ø25 mm", "TQ ø100 mm" — o mesmo ø do 3D. */
export function rotuloDoTrecho2D(t: Pick<Trecho, 'bitolaMm' | 'rotulo' | 'disciplina' | 'a' | 'b' | 'cotaAMm' | 'cotaBMm'>): string {
  const compMm = Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y);
  const desnivel = Math.abs(t.cotaBMm - t.cotaAMm);
  const caimento =
    t.disciplina === 'ESGOTO' && compMm > 0 && desnivel > 0
      ? ` · i ${((desnivel / compMm) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} %`
      : '';
  return `${textoDoRotulo(t)}${caimento}`;
}

/** A pegada em planta da caixa de esgoto (medida declarada, senão a da ficha); `null` se não é caixa. */
export function pegadaDaCaixa2D(t: Terminal): { forma: 'PRISMA' | 'CILINDRO'; larguraMm: number; profundidadeMm: number } | null {
  const ficha = t.tipoHidraulico ? CAIXAS_DE_ESGOTO[t.tipoHidraulico] : undefined;
  if (!ficha || t.disciplina !== 'ESGOTO') return null;
  // O filtro anaeróbio e o sumidouro (E7.1) são anéis de concreto — cilindros, como a caixa sifonada.
  const cilindro = t.tipoHidraulico === 'CAIXA_SIFONADA' || t.tipoHidraulico === 'RALO_SIFONADO' || t.tipoHidraulico === 'FILTRO_ANAEROBIO' || t.tipoHidraulico === 'SUMIDOURO';
  const largura = t.larguraMm ?? ficha.larguraPadraoMm;
  return { forma: cilindro ? 'CILINDRO' : 'PRISMA', larguraMm: largura, profundidadeMm: cilindro ? largura : (t.profundidadeMm ?? largura) };
}

/**
 * A pegada em planta do RESERVATÓRIO (E4.2, 29/09/2026): prisma pelas medidas
 * (largura × profundidade), cilindro pelo diâmetro (= largura). `null` se não é
 * reservatório ou não tem medida.
 */
export function pegadaDoReservatorio2D(t: Terminal): { forma: 'PRISMA' | 'CILINDRO'; larguraMm: number; profundidadeMm: number } | null {
  if (t.tipoHidraulico !== 'RESERVATORIO' || !t.larguraMm) return null;
  const cilindro = t.formaReservatorio === 'CILINDRO';
  return { forma: cilindro ? 'CILINDRO' : 'PRISMA', larguraMm: t.larguraMm, profundidadeMm: cilindro ? t.larguraMm : (t.profundidadeMm ?? t.larguraMm) };
}

// ─── A caixa d'água sobre a laje ─────────────────────────────────────────────

/**
 * O CENTRO 3D de um terminal (27/09/2026, print: *"a caixa dgua esta dentro da
 * parede. deve estar sobre a laje"*). A convenção geral do viewer é a cota no
 * CENTRO da peça (`blueprintRede.caixaDaPeca`, a mesma do IFC). A caixa d'água
 * é a exceção que a própria ficha declara — "a cota é a do FUNDO: é de onde a
 * rede sai" —, e com a cota no centro ela nascia com meia altura enfiada na
 * parede. Aqui ela APOIA na cota. As caixas de esgoto têm `corpoDaCaixa3D`.
 */
export function centroDoTerminal3D(
  t: Pick<Terminal, 'at' | 'cotaMm' | 'tipoHidraulico'>,
  elevacaoDoNivelMm: number,
  alturaMm: number,
  /** Onde a caixa d'água apoia — ver `apoioDaCaixaDagua`. Ausente = a cota. */
  apoioMm?: number,
): V3 {
  const z = t.tipoHidraulico === 'RESERVATORIO' ? (apoioMm ?? t.cotaMm) + alturaMm / 2 : t.cotaMm;
  return para3D(t.at.x, t.at.y, elevacaoDoNivelMm + z);
}

/**
 * Onde a caixa d'água APOIA (27/09/2026, print: *"parece que caixa dgua esta
 * parte dentro da laje"*): a cota dela (o fundo), ou o TOPO da laje estrutural
 * que está debaixo dela e que a cota atravessa. Na planta do usuário a laje L1
 * vai de 2800 a 2900 e a caixa tem o fundo a 2800: os 10 cm de baixo ficavam
 * dentro do concreto.
 */
export function apoioDaCaixaDagua(model: BlueprintModel, t: Pick<Terminal, 'at' | 'cotaMm' | 'levelId'>): number {
  let apoio = t.cotaMm;
  for (const s of model.structures ?? []) {
    if (s.kind !== 'LAJE' || s.levelId !== t.levelId || s.pontos.length < 3) continue;
    const topo = s.baseMm + s.alturaMm;
    if (t.cotaMm < s.baseMm - 1 || t.cotaMm >= topo) continue;
    if (!pointInPolygon(s.pontos, t.at)) continue;
    apoio = Math.max(apoio, topo);
  }
  return apoio;
}
