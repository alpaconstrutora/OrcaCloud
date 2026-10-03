/**
 * ESTUDO DE MASSA — A PLANTA INTERNA DE CADA UNIDADE (fase M6b do plano
 * `2026-10-01-estudo-de-massa.md`, §19 e §20 do pedido).
 *
 * Depois do pavimento tipo montado (M6a), cada unidade é um ambiente só. Aqui
 * o GERADOR DE PLANTAS da E6.2 roda DENTRO de cada uma — o programa da
 * tipologia (2 quartos, 3 quartos com suíte…), o retângulo da unidade como
 * envelope, a ENTRADA voltada para o corredor — e as paredes internas, as
 * portas internas e as janelas da fachada entram no pavimento tipo, com cada
 * cômodo como parte da unidade (E2.2). As cópias vivas (E2.1) levam tudo para
 * os outros andares.
 *
 * ─── NO QUADRO DO BLOCO ─────────────────────────────────────────────────────
 *
 * O gerador trabalha num retângulo de eixos alinhados. O bloco pode estar
 * girado (o gerador de massa orienta pela frente do lote): rodar o gerador no
 * desenho perderia área no retângulo inscrito. Por isso ele roda no quadro do
 * bloco — o retângulo exato da unidade, na origem — e o resultado volta ao
 * desenho por transformação rígida (offsets de abertura não mudam).
 *
 * ─── O QUE ENTRA, E O QUE NÃO ───────────────────────────────────────────────
 *
 *  - Entram as paredes INTERNAS do gerador e as portas nelas.
 *  - As paredes EXTERNAS dele não entram: a unidade já tem as dela (fachada,
 *    corredor, divisa com o vizinho). As janelas que ele pôs nelas entram só
 *    se caem numa parede de FACHADA (o perímetro do bloco) — janela para o
 *    corredor ou para o apartamento vizinho não existe.
 *  - A porta de entrada do gerador não entra: a M6a já abriu a da unidade no
 *    corredor.
 *  - O zoneamento do gerador (faixa social na frente, íntima no fundo) foi
 *    feito para casa; numa unidade rasa e larga, com a "frente" no corredor, a
 *    sala cai longe da fachada e perde a janela. Por isso cada unidade testa a
 *    frente pelo corredor e pelas duas pontas, com duas sementes, e fica com o
 *    arranjo em que MAIS cômodos que pedem luz tocam a fachada (empate: o do
 *    corredor, que põe a entrada certa). Medido na exploração: só com a frente
 *    no corredor, 12 janelas caíam no corredor ou no vizinho.
 *  - Unidade comercial (sala, loja) fica aberta: o gerador é de residência.
 *
 * ─── UNIDADES IGUAIS VIRAM GRUPO (E2.3) ─────────────────────────────────────
 *
 * IGUAIS = mesma tipologia, mesmas medidas e a mesma situação de fachada a
 * menos de um espelho: a unidade de canto à esquerda é a da direita espelhada
 * ao longo do bloco; a do lado da rua é a dos fundos espelhada através do
 * corredor; as duas coisas juntas são o giro de 180°. A planta é gerada UMA
 * vez, na primeira da classe (a ORIGEM), e cada igual vira uma INSTÂNCIA do
 * grupo — editar a planta da origem (mover uma parede, trocar uma porta,
 * renomear um cômodo) propaga para as iguais; editar a cópia é recusado pelo
 * kernel (`GROUP_INSTANCE`), que manda editar a origem. Os cômodos copiados
 * passam a ser a unidade da M6a (o mesmo número, a mesma unidade).
 *
 * Espelhar num eixo só exige o bloco alinhado ao desenho (o kernel espelha nos
 * eixos do mundo); girado, só repetição e giro de 180° — a canto espelhada
 * fica com a planta própria. Unidade de canto e unidade do meio NÃO são
 * iguais: a de canto tem a fachada da ponta, e a planta dela foi escolhida
 * por isso.
 *
 * O que fica fora do grupo, dito: as JANELAS da fachada. A fachada é uma
 * parede só para o andar inteiro (o contorno do bloco), e a janela é da
 * parede que a hospeda — cada unidade continua com as suas, na posição
 * espelhada. Se o grupo não fechar (o kernel recusar, ou uma igual não sair
 * com os mesmos cômodos), tudo volta para a cópia do desenho, com aviso.
 */
import {
  applyBatch,
  pointInPolygon,
  transformarPontoDoGrupo,
  uidDeterministico,
  type BlueprintModel,
  type Bloco,
  type Command,
  type EspelhoDoGrupo,
  type ObjectId,
  type Point,
  type RotacaoDoGrupo,
  type Wall,
} from './blueprintKernel';
import { gerar, type ResultadoDoGerador } from './blueprintGerador';
import { atualizarItem, programaSemente, removerItem, type Programa } from './blueprintPrograma';
import { FICHA_DO_USO } from './blueprintPrograma';
import type { Produto, TipologiaDoProduto } from './blueprintProduto';
import { ALEM_MM, HIPOTESES_DO_PAVIMENTO_TIPO_PADRAO, pavimentoTipoMontado, quadroDoBloco, type QuadroDoBloco } from './blueprintPavimentoTipoDaMassa';

/** O programa de necessidades de uma tipologia do produto (sementes da E4.1 ajustadas aos dormitórios). */
export function programaDaTipologia(t: Pick<TipologiaDoProduto, 'uso' | 'dormitorios' | 'nome'>): Programa | null {
  if (t.uso !== 'RESIDENCIAL') return null;
  if (t.dormitorios >= 3) {
    let p = programaSemente('APTO_3Q_SUITE');
    p = atualizarItem(p, 'dorm', { quantidade: t.dormitorios - 1 });
    return { ...p, nome: t.nome };
  }
  let p = programaSemente('APTO_2Q');
  if (t.dormitorios <= 0) p = removerItem(p, 'dorm');
  else p = atualizarItem(p, 'dorm', { quantidade: t.dormitorios });
  return { ...p, nome: t.nome };
}

export interface PlantaDeUmaUnidade {
  numero: string;
  tipologia: string;
  /** Os cômodos que nasceram (nome e área do gerador). */
  ambientes: { nome: string; areaM2: number }[];
  /** "gerada" | "instância da 101 (espelhada)" | o motivo de não ter. */
  origem: string;
  janelas: number;
  portas: number;
  /** Cômodos que pedem luz/fachada e ficaram SEM fachada (não há onde pôr janela) — para o projetista ajustar. */
  semFachada: string[];
}

/** Um grupo da E2.3 criado aqui: a unidade de origem e as iguais (instâncias). */
export interface GrupoDeUnidadesIguais {
  nome: string;
  origem: string;
  iguais: { numero: string; repeticao: string }[];
}

export interface PlantasDasUnidades {
  comandos: Command[];
  model: BlueprintModel;
  unidades: PlantaDeUmaUnidade[];
  geracoes: number;
  grupos: GrupoDeUnidadesIguais[];
  avisos: string[];
}

/** Retângulo de uma unidade no quadro do bloco (`a` ao longo do bloco, `b` através). */
export interface RetLocal {
  a0: number;
  b0: number;
  a1: number;
  b1: number;
}

/**
 * Como uma unidade igual repete a planta de outra: espelhada ao longo do bloco (`espelhaA`: troca as pontas),
 * através do corredor (`espelhaB`: troca o lado da rua pelo dos fundos), ou as duas (= giro de 180°).
 */
export interface Repeticao {
  espelhaA: boolean;
  espelhaB: boolean;
}

const paraLocal = (q: QuadroDoBloco, p: Point) => {
  const dx = p.x - q.o.x;
  const dy = p.y - q.o.y;
  return { a: dx * q.u.x + dy * q.u.y, b: dx * q.v.x + dy * q.v.y };
};
const noMundo = (q: QuadroDoBloco, a: number, b: number): Point => ({ x: Math.round(q.o.x + q.u.x * a + q.v.x * b), y: Math.round(q.o.y + q.u.y * a + q.v.y * b) });
const r2 = (v: number) => Math.round(v * 100) / 100;
const girado = (q: QuadroDoBloco) => Math.abs(q.u.x * q.u.y) > 1e-9;

export function rotuloDaRepeticao(rep: Repeticao): string {
  if (rep.espelhaA && rep.espelhaB) return 'girada 180°';
  if (rep.espelhaA || rep.espelhaB) return 'espelhada';
  return 'repetida';
}

/**
 * A instância de grupo (E2.3) que leva a planta da unidade `rO` para a `rT` (retângulos no quadro do bloco, mesmas
 * medidas) com a repetição dada: espelho e giro em torno do CENTRO da origem, depois a translação até o centro da
 * outra. Espelhar num eixo só exige o eixo do bloco alinhado ao desenho; `null` = não dá.
 */
export function instanciaDaUnidadeIgual(
  q: QuadroDoBloco,
  rO: RetLocal,
  rT: RetLocal,
  rep: Repeticao,
): { pivo: Point; translacao: Point; rotacaoGraus: RotacaoDoGrupo; espelho: EspelhoDoGrupo } | null {
  let espelho: EspelhoDoGrupo = 'NENHUM';
  let rotacaoGraus: RotacaoDoGrupo = 0;
  if (rep.espelhaA && rep.espelhaB) rotacaoGraus = 180;
  else if (rep.espelhaA || rep.espelhaB) {
    // Espelhar ao longo de `u` = refletir na reta pelo pivô perpendicular a `u`: `X` se `u` é horizontal.
    const eixo = rep.espelhaA ? q.u : q.v;
    if (Math.abs(eixo.y) < 1e-9) espelho = 'X';
    else if (Math.abs(eixo.x) < 1e-9) espelho = 'Y';
    else return null;
  }
  const centro = (r: RetLocal) => ({
    x: q.o.x + (q.u.x * (r.a0 + r.a1)) / 2 + (q.v.x * (r.b0 + r.b1)) / 2,
    y: q.o.y + (q.u.y * (r.a0 + r.a1)) / 2 + (q.v.y * (r.b0 + r.b1)) / 2,
  });
  const cO = centro(rO);
  const pivo = { x: Math.round(cO.x), y: Math.round(cO.y) };
  // Sem translação, o centro da origem vai para `semT`; a translação o leva ao centro da igual.
  const semT = transformarPontoDoGrupo({ pivo }, { translacao: { x: 0, y: 0 }, rotacaoGraus, espelho }, cO);
  const cT = centro(rT);
  return { pivo, translacao: { x: Math.round(cT.x - semT.x), y: Math.round(cT.y - semT.y) }, rotacaoGraus, espelho };
}

/** A unidade já tem planta interna? (mais de um ambiente no pavimento.) */
export function unidadeTemPlanta(model: BlueprintModel, numero: string, levelId: ObjectId): boolean {
  const u = (model.unidades ?? []).find((x) => x.numero === numero);
  if (!u) return false;
  return model.labels.filter((l) => l.levelId === levelId && u.etiquetaUids.includes(l.uid)).length > 1;
}

/** A parede (do pavimento) cujo eixo contém o ponto. */
function paredeNoPonto(paredes: readonly Wall[], p: Point): { w: Wall; off: number } | null {
  for (const w of paredes) {
    const dx = w.b.x - w.a.x;
    const dy = w.b.y - w.a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    const t = ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / len;
    const dist = Math.abs((p.x - w.a.x) * dy - (p.y - w.a.y) * dx) / len;
    if (dist <= 5 && t >= 0 && t <= len) return { w, off: t };
  }
  return null;
}

/** O grupo não fechou: volta tudo para a cópia do desenho. */
class FalhaDoGrupo extends Error {}

/**
 * Gera a planta das unidades do pavimento tipo do bloco. `agrupar: false` (o caminho de volta quando o grupo
 * não fecha) desenha as iguais como cópia do desenho, sem grupo.
 */
export function plantasDasUnidades(model: BlueprintModel, b: Bloco, produto: Produto, semente = 1, opcoes: { agrupar?: boolean } = {}): PlantasDasUnidades {
  if (opcoes.agrupar === false) return gerarPlantas(model, b, produto, semente, false);
  try {
    return gerarPlantas(model, b, produto, semente, true);
  } catch (e) {
    if (!(e instanceof FalhaDoGrupo)) throw e;
    const r = gerarPlantas(model, b, produto, semente, false);
    return { ...r, avisos: [`O grupo das unidades iguais não fechou (${e.message}): as iguais ficaram como cópia do desenho — editar uma não muda as outras.`, ...r.avisos] };
  }
}

function gerarPlantas(model: BlueprintModel, b: Bloco, produto: Produto, semente: number, agrupar: boolean): PlantasDasUnidades {
  const avisos: string[] = [];
  const tipo = pavimentoTipoMontado(model, b);
  const q = quadroDoBloco(b);
  if (!tipo || !q) return { comandos: [], model, unidades: [], geracoes: 0, grupos: [], avisos: [!tipo ? `Monte o pavimento tipo de "${b.nome}" primeiro (painel do bloco).` : `"${b.nome}" não é retangular.`] };
  const hipT = HIPOTESES_DO_PAVIMENTO_TIPO_PADRAO;
  const blocoGirado = girado(q);
  const perimetro = (w: Wall) => {
    // As 4 paredes do contorno do bloco: eixo sobre a borda do retângulo do bloco.
    const pa = paraLocal(q, w.a);
    const pb = paraLocal(q, w.b);
    const naBorda = (v: number, alvo: number) => Math.abs(v - alvo) < 5;
    return (naBorda(pa.b, 0) && naBorda(pb.b, 0)) || (naBorda(pa.b, q.D) && naBorda(pb.b, q.D)) || (naBorda(pa.a, 0) && naBorda(pb.a, 0)) || (naBorda(pa.a, q.W) && naBorda(pb.a, q.W));
  };

  // As unidades do pavimento tipo, com o ambiente e a tipologia do produto.
  // `e`/`d`: a unidade está na ponta esquerda/direita do bloco (tem a fachada da ponta, além da do lado dela).
  type Alvo = { numero: string; unidadeId: ObjectId; t: TipologiaDoProduto | null; tipologiaNome: string; r: RetLocal; ladoA: boolean; e: boolean; d: boolean; W: number; D: number };
  const alvos: Alvo[] = [];
  for (const u of model.unidades ?? []) {
    const etiquetas = model.labels.filter((l) => l.levelId === tipo.id && u.etiquetaUids.includes(l.uid));
    if (etiquetas.length === 0) continue;
    if (etiquetas.length > 1) {
      avisos.push(`Unidade ${u.numero}: já tem planta interna (${etiquetas.length} ambientes) — não foi refeita.`);
      continue;
    }
    const s = model.spaces.find((x) => x.levelId === tipo.id && x.labelUid === etiquetas[0].uid);
    if (!s) continue;
    const pts = s.ring.map((p) => paraLocal(q, p));
    const as = pts.map((p) => p.a);
    const bs = pts.map((p) => p.b);
    // O anel do ambiente JÁ está nos EIXOS das paredes (o arranjo do kernel é pelas linhas de centro): o
    // retângulo da unidade é a caixa dele. (Expandir pela meia espessura — a primeira versão — empurrava a
    // unidade 75–100 mm para fora: janela fora do perímetro e parede interna entrando no vizinho.)
    const r: RetLocal = { a0: Math.min(...as), a1: Math.max(...as), b0: Math.min(...bs), b1: Math.max(...bs) };
    const t = produto.tipologias.find((x) => x.nome === u.tipologia) ?? null;
    alvos.push({
      numero: u.numero,
      unidadeId: u.id,
      t,
      tipologiaNome: u.tipologia ?? '—',
      r,
      ladoA: r.b0 < hipT.paredeExternaMm,
      e: r.a0 < hipT.paredeExternaMm,
      d: r.a1 > q.W - hipT.paredeExternaMm,
      W: Math.round(r.a1 - r.a0),
      D: Math.round(r.b1 - r.b0),
    });
  }
  if (alvos.length === 0) return { comandos: [], model, unidades: [], geracoes: 0, grupos: [], avisos: avisos.length ? avisos : ['O pavimento tipo não tem unidade sem planta.'] };

  // As classes de unidades IGUAIS (ver o cabeçalho): a primeira de cada uma é a origem.
  // Tolerância das medidas: alinhado, o anel sai em mm inteiro; girado, o arredondamento e o `ALEM_MM` mexem uns mm.
  const tolMm = blocoGirado ? 5 : 2;
  const REPETICOES: Repeticao[] = [
    { espelhaA: false, espelhaB: false },
    { espelhaA: true, espelhaB: true },
    { espelhaA: true, espelhaB: false },
    { espelhaA: false, espelhaB: true },
  ];
  const repeticaoEntre = (o: Alvo, x: Alvo): Repeticao | null => {
    if (!o.t || o.t.id !== x.t?.id || Math.abs(o.W - x.W) > tolMm || Math.abs(o.D - x.D) > tolMm) return null;
    for (const rep of REPETICOES) {
      if (blocoGirado && rep.espelhaA !== rep.espelhaB) continue;
      const lado = rep.espelhaB ? !o.ladoA : o.ladoA;
      const [e, d] = rep.espelhaA ? [o.d, o.e] : [o.e, o.d];
      if (lado === x.ladoA && e === x.e && d === x.d) return rep;
    }
    return null;
  };
  type Classe = { origem: Alvo; membros: { a: Alvo; rep: Repeticao }[] };
  const classes: Classe[] = [];
  const membroDe = new Map<string, { classe: Classe; rep: Repeticao }>();
  for (const a of alvos) {
    if (!a.t || a.t.uso !== 'RESIDENCIAL') continue;
    let achou = false;
    for (const c of classes) {
      const rep = repeticaoEntre(c.origem, a);
      if (!rep) continue;
      c.membros.push({ a, rep });
      membroDe.set(a.numero, { classe: c, rep });
      achou = true;
      break;
    }
    if (!achou) classes.push({ origem: a, membros: [] });
  }

  let geracoes = 0;
  const comandos: Command[] = [];
  let m = model;
  const aplicar = (cs: Command[]) => {
    if (!cs.length) return;
    m = applyBatch(m, cs).model;
    comandos.push(...cs);
  };
  /** O melhor arranjo do gerador para a ORIGEM de uma classe (a situação de fachada dela). */
  const gerada = new Map<string, { res: ResultadoDoGerador; semFachada: string[] } | null>();
  const resultadoDe = (a: Alvo): { res: ResultadoDoGerador; semFachada: string[] } | null => {
    if (gerada.has(a.numero)) return gerada.get(a.numero)!;
    const { W, D } = a;
    const programa = a.t ? programaDaTipologia(a.t) : null;
    let melhor: { res: ResultadoDoGerador; nota: number; corredor: boolean } | null = null;
    const yFachada = a.ladoA ? 0 : D;
    const pedeLuz = (amb: ResultadoDoGerador['ambientes'][number]) => {
      const f = FICHA_DO_USO[amb.item.uso];
      return f.exigeFachada || f.exigeIluminacao;
    };
    const tocaFachada = (amb: ResultadoDoGerador['ambientes'][number]) => {
      const r = amb.ret;
      return Math.abs((a.ladoA ? r.y0 : r.y1) - yFachada) < 60 || (a.e && r.x0 < 60) || (a.d && r.x1 > W - 60);
    };
    if (programa) {
      const nota = (res: ResultadoDoGerador) => res.ambientes.filter((amb) => pedeLuz(amb) && tocaFachada(amb)).length;
      // Frente pelo corredor (a entrada certa) e pelas duas pontas; duas sementes cada.
      const frentes: { dir: Point; corredor: boolean }[] = [
        { dir: { x: 0, y: a.ladoA ? 1 : -1 }, corredor: true },
        { dir: { x: -1, y: 0 }, corredor: false },
        { dir: { x: 1, y: 0 }, corredor: false },
      ];
      let erro: string | null = null;
      for (const f of frentes) {
        for (const sem of [semente, semente + 1]) {
          try {
            const res = gerar({ programa, envelope: [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: D }, { x: 0, y: D }], direcaoDaFrente: f.dir, rotacaoNorteDeg: null, latitudeGraus: -15.79 }, sem, { automaticos: false });
            geracoes++;
            const n = nota(res);
            if (!melhor || n > melhor.nota || (n === melhor.nota && f.corredor && !melhor.corredor)) melhor = { res, nota: n, corredor: f.corredor };
          } catch (e) {
            erro = e instanceof Error ? e.message : String(e);
          }
        }
      }
      if (!melhor && erro) avisos.push(`Unidade ${a.numero}: o gerador não fechou a planta (${erro}).`);
    }
    const res = melhor ? (melhor as { res: ResultadoDoGerador }).res : null;
    const saida = res ? { res, semFachada: res.ambientes.filter((amb) => pedeLuz(amb) && !tocaFachada(amb)).map((amb) => amb.nome) } : null;
    gerada.set(a.numero, saida);
    return saida;
  };

  const resumo: PlantaDeUmaUnidade[] = [];
  /** Por unidade desenhada: o arranjo e como ele é lido no quadro dela (espelhos). */
  const nomesPorUnidade: { a: Alvo; res: ResultadoDoGerador; plano: (p: Point) => Point }[] = [];
  const paredesDaUnidade: Command[] = [];
  const uidsDasParedesDe = new Map<string, string[]>();
  /** Aberturas: a de parede interna já vira comando (pela identidade da parede); a de fachada espera achar a parede do perímetro. */
  type Pendente = { tipo: 'interna'; cmd: Command } | { tipo: 'fachada'; centro: Point; widthMm: number; heightMm: number; sillMm: number };
  const aberturasPendentes: Pendente[] = [];
  /** As iguais que viram instância (desenhadas pelo grupo, não aqui). */
  const instancias = new Set<string>();
  for (const a of alvos) {
    if (!a.t || a.t.uso !== 'RESIDENCIAL') {
      resumo.push({ numero: a.numero, tipologia: a.tipologiaNome, ambientes: [], origem: !a.t ? `tipologia "${a.tipologiaNome}" não está no produto` : 'unidade comercial: fica aberta', janelas: 0, portas: 0, semFachada: [] });
      continue;
    }
    const membro = membroDe.get(a.numero);
    const fonte = membro ? membro.classe.origem : a;
    const rep = membro?.rep ?? { espelhaA: false, espelhaB: false };
    const g = resultadoDe(fonte);
    if (!g) {
      resumo.push({ numero: a.numero, tipologia: a.tipologiaNome, ambientes: [], origem: 'o gerador não fechou a planta', janelas: 0, portas: 0, semFachada: [] });
      continue;
    }
    const { res } = g;
    const viraInstancia = agrupar && !!membro;
    if (viraInstancia) instancias.add(a.numero);
    const { W, D } = a;
    // O arranjo foi gerado no quadro da ORIGEM; a igual o lê espelhado (ver `Repeticao`).
    const plano = (p: Point): Point => ({ x: rep.espelhaA ? W - p.x : p.x, y: rep.espelhaB ? D - p.y : p.y });
    // ⚠️ O gerador encaixa o retângulo na malha de 50 mm: a borda dele pode ficar até 25 mm DENTRO da unidade.
    // As paredes de borda são reconhecidas pelo retângulo DELE; as pontas das internas que chegam nessa borda
    // são esticadas até a borda da unidade (o eixo das paredes dela) — senão nasciam paredes duplicadas coladas
    // na divisória, e as internas não encostavam nas paredes da unidade.
    const rg = res.retangulo;
    const esticar = (p: Point): Point => ({
      x: Math.abs(p.x - rg.x0) < 60 ? 0 : Math.abs(p.x - rg.x1) < 60 ? W : p.x,
      y: Math.abs(p.y - rg.y0) < 60 ? 0 : Math.abs(p.y - rg.y1) < 60 ? D : p.y,
    });
    const paraDesenho = (p: Point) => {
      const l = plano(p);
      return noMundo(q, a.r.a0 + l.x, a.r.b0 + l.y);
    };
    // Bloco GIRADO: a parede passa ALEM_MM de cada ponta para a junção em T existir depois do arredondamento
    // (o kernel só corta em interseção exata) — ver `montarPavimentoTipo`.
    const pontas = (w: Wall): [Point, Point] => {
      const ea = esticar(w.a);
      const eb = esticar(w.b);
      if (!blocoGirado) return [ea, eb];
      const l = Math.hypot(eb.x - ea.x, eb.y - ea.y) || 1;
      const dx = ((eb.x - ea.x) / l) * ALEM_MM;
      const dy = ((eb.y - ea.y) / l) * ALEM_MM;
      return [{ x: ea.x - dx, y: ea.y - dy }, { x: eb.x + dx, y: eb.y + dy }];
    };
    const naBorda = (w: Wall) => {
      const on = (p: Point) => Math.abs(p.x - rg.x0) < 2 || Math.abs(p.x - rg.x1) < 2 || Math.abs(p.y - rg.y0) < 2 || Math.abs(p.y - rg.y1) < 2;
      const mesmaLinha = Math.abs(w.a.x - w.b.x) < 2 ? Math.abs(w.a.x - rg.x0) < 2 || Math.abs(w.a.x - rg.x1) < 2 : Math.abs(w.a.y - rg.y0) < 2 || Math.abs(w.a.y - rg.y1) < 2;
      return on(w.a) && on(w.b) && mesmaLinha;
    };
    const paredesGer = res.model.walls.filter((w) => w.levelId === res.levelId);
    const uidDe = new Map<ObjectId, string>();
    let janelas = 0;
    let portas = 0;
    paredesGer.forEach((w, k) => {
      if (naBorda(w)) return;
      const uid = uidDeterministico(`massa:planta:${tipo.uid}:${a.numero}:parede:${k}`);
      uidDe.set(w.id, uid);
      if (viraInstancia) return; // a parede vem como cópia do grupo
      uidsDasParedesDe.set(a.numero, [...(uidsDasParedesDe.get(a.numero) ?? []), uid]);
      const [pa, pb] = pontas(w);
      paredesDaUnidade.push({ type: 'AddWall', levelId: tipo.id, a: paraDesenho(pa), b: paraDesenho(pb), thicknessMm: w.thicknessMm, heightMm: w.heightMm, uid });
    });
    for (const o of res.model.openings) {
      const w = paredesGer.find((x) => x.id === o.wallId);
      if (!w) continue;
      const uid = uidDe.get(w.id);
      if (uid) {
        if (o.kind === 'door') portas++;
        if (viraInstancia) continue; // a porta vem com a parede copiada
        // `a` esticado (e, girado, passado do encontro) anda para trás ao longo da parede: o offset cresce o mesmo tanto.
        const ea = pontas(w)[0];
        const len0 = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
        const anda = ((w.a.x - ea.x) * (w.b.x - w.a.x) + (w.a.y - ea.y) * (w.b.y - w.a.y)) / len0;
        aberturasPendentes.push({ tipo: 'interna', cmd: { type: 'AddOpening', wallId: '', wallUid: uid, kind: o.kind, offsetMm: Math.round(o.offsetMm + anda), widthMm: o.widthMm, heightMm: o.heightMm, sillMm: o.sillMm } });
        continue;
      }
      // Abertura numa parede EXTERNA do gerador: só janela, e só se cai na fachada do bloco. A fachada é uma parede
      // só para o andar — a janela é dela, não do grupo: a igual também põe as suas (na posição espelhada).
      if (o.kind !== 'window') continue;
      const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
      const t = (o.offsetMm + o.widthMm / 2) / len;
      // O centro na borda DO GERADOR (até 25 mm para dentro): esticado até a borda da unidade, onde está a parede.
      const centro = paraDesenho(esticar({ x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t }));
      aberturasPendentes.push({ tipo: 'fachada', centro, widthMm: o.widthMm, heightMm: o.heightMm, sillMm: o.sillMm });
      janelas++;
    }
    if (!viraInstancia) nomesPorUnidade.push({ a, res, plano });
    resumo.push({
      numero: a.numero,
      tipologia: a.tipologiaNome,
      ambientes: res.ambientes.map((x) => ({ nome: x.nome, areaM2: r2(x.areaM2) })),
      origem: membro ? `${agrupar ? 'instância' : 'a mesma planta'} da ${fonte.numero} (${rotuloDaRepeticao(rep)})` : 'gerada',
      janelas,
      portas,
      semFachada: g.semFachada,
    });
  }

  // 1. Paredes internas das unidades desenhadas (um lote).
  aplicar(paredesDaUnidade);

  // 2. Aberturas: as das paredes internas por uid; as da fachada resolvidas na parede do perímetro.
  const paredesTipo = m.walls.filter((w) => w.levelId === tipo.id);
  const fachada = paredesTipo.filter(perimetro);
  const aberturas: Command[] = [];
  let janelasDescartadas = 0;
  for (const p of aberturasPendentes) {
    if (p.tipo === 'interna') {
      aberturas.push(p.cmd);
      continue;
    }
    // Janela: só na parede do PERÍMETRO (fachada). No corredor ou na divisa com o vizinho, não existe.
    const hit = paredeNoPonto(fachada, p.centro);
    if (!hit) {
      janelasDescartadas++;
      continue;
    }
    aberturas.push({ type: 'AddOpening', wallId: hit.w.id, kind: 'window', offsetMm: Math.max(0, Math.round(hit.off - p.widthMm / 2)), widthMm: p.widthMm, heightMm: p.heightMm, sillMm: p.sillMm });
  }
  // O kernel recusa vão sobreposto: confere ANTES (por parede, com folga) e aplica num lote só — aplicar um a um
  // re-sincroniza as cópias vivas a cada comando (medido: 3 s para 5 unidades).
  const ocupado = new Map<string, { ini: number; fim: number }[]>();
  for (const o of m.openings) {
    const w = m.walls.find((x) => x.id === o.wallId);
    if (w) ocupado.set(w.uid, [...(ocupado.get(w.uid) ?? []), { ini: o.offsetMm, fim: o.offsetMm + o.widthMm }]);
  }
  const aceitas: Command[] = [];
  for (const o of aberturas) {
    if (o.type !== 'AddOpening') continue;
    const uid = o.wallUid ?? m.walls.find((x) => x.id === o.wallId)?.uid;
    if (!uid) continue;
    const lista = ocupado.get(uid) ?? [];
    if (lista.some((x) => o.offsetMm < x.fim + 100 && o.offsetMm + o.widthMm > x.ini - 100)) {
      janelasDescartadas++;
      continue;
    }
    ocupado.set(uid, [...lista, { ini: o.offsetMm, fim: o.offsetMm + o.widthMm }]);
    aceitas.push(o);
  }
  try {
    aplicar(aceitas);
  } catch {
    // Algum vão que a conferência não pegou (fim de parede, por exemplo): cai para um a um.
    for (const o of aceitas) {
      try {
        aplicar([o]);
      } catch {
        janelasDescartadas++;
      }
    }
  }
  if (janelasDescartadas > 0) avisos.push(`${janelasDescartadas} abertura(s) do gerador ficaram de fora (janela que daria para o corredor ou para o vizinho, ou vão sobreposto).`);

  // 3. Os cômodos: nome do gerador e a unidade (E2.2).
  const nomes: Command[] = [];
  for (const { a, res, plano } of nomesPorUnidade) {
    for (const amb of res.ambientes) {
      const l = plano({ x: (amb.ret.x0 + amb.ret.x1) / 2, y: (amb.ret.y0 + amb.ret.y1) / 2 });
      const c = noMundo(q, a.r.a0 + l.x, a.r.b0 + l.y);
      const s = m.spaces.find((x) => x.levelId === tipo.id && pointInPolygon(x.ring, c));
      if (!s) continue;
      if (s.labelUid) nomes.push({ type: 'NameSpace', spaceId: s.id, name: amb.nome, tipoDeAmbiente: FICHA_DO_USO[amb.item.uso].tipoNbr5410 });
      nomes.push({ type: 'SetUnidadeDoAmbiente', spaceId: s.id, unidadeId: a.unidadeId, nome: amb.nome });
    }
  }
  aplicar(nomes);

  // 4. As iguais: um GRUPO por classe (a planta da origem) com uma instância por igual (E2.3).
  const grupos: GrupoDeUnidadesIguais[] = [];
  const etiquetasDaUnidade = (unidadeId: ObjectId) => {
    const u = (m.unidades ?? []).find((x) => x.id === unidadeId);
    return u ? m.labels.filter((l) => l.levelId === tipo.id && u.etiquetaUids.includes(l.uid)) : [];
  };
  for (const c of classes) {
    const iguais = c.membros.filter((x) => instancias.has(x.a.numero));
    if (iguais.length === 0) continue;
    const etiquetasDaOrigem = etiquetasDaUnidade(c.origem.unidadeId);
    const paredesDaOrigem = (uidsDasParedesDe.get(c.origem.numero) ?? []).map((uid) => m.walls.find((w) => w.uid === uid)?.id).filter((id): id is ObjectId => !!id);
    if (etiquetasDaOrigem.length < 2 || paredesDaOrigem.length === 0) throw new FalhaDoGrupo(`a planta da ${c.origem.numero} não fechou`);
    const especs = iguais.map((x) => instanciaDaUnidadeIgual(q, c.origem.r, x.a.r, x.rep));
    if (especs.some((x) => !x)) throw new FalhaDoGrupo(`a ${c.origem.numero} não espelha neste bloco girado`);
    // A etiqueta única que a M6a pôs em cada igual sai: a instância traz os cômodos copiados, e duas etiquetas
    // no mesmo ambiente seriam duas identidades. (Um a um: tirar uma rederiva os ambientes.)
    for (const x of iguais) {
      for (const l of etiquetasDaUnidade(x.a.unidadeId)) {
        const s = m.spaces.find((sp) => sp.levelId === tipo.id && sp.labelUid === l.uid);
        if (s) aplicar([{ type: 'NameSpace', spaceId: s.id, name: '' }]);
      }
    }
    const nome = `Planta ${c.origem.tipologiaNome}`.slice(0, 32) + ` (${c.origem.numero})`;
    try {
      aplicar([
        {
          type: 'AddGrupo',
          nome: nome.slice(0, 40),
          wallIds: paredesDaOrigem,
          labelIds: etiquetasDaOrigem.map((l) => l.id),
          pivo: especs[0]!.pivo,
          instancias: especs.map((x) => ({ translacao: x!.translacao, rotacaoGraus: x!.rotacaoGraus, espelho: x!.espelho })),
        },
      ]);
    } catch (e) {
      throw new FalhaDoGrupo(e instanceof Error ? e.message : String(e));
    }
    // Os cômodos copiados passam a ser a unidade da M6a (o mesmo número).
    const dentro = (r: RetLocal, p: Point) => {
      const l = paraLocal(q, p);
      return l.a > r.a0 && l.a < r.a1 && l.b > r.b0 && l.b < r.b1;
    };
    aplicar(
      iguais.map((x) => ({
        type: 'SetUnidadeProps' as const,
        unidadeId: x.a.unidadeId,
        labelIds: m.labels.filter((l) => l.levelId === tipo.id && dentro(x.a.r, l.at)).map((l) => l.id),
      })),
    );
    // Conferência: cada igual com os mesmos cômodos da origem, todos fechados.
    for (const x of iguais) {
      const ets = etiquetasDaUnidade(x.a.unidadeId);
      const fechados = ets.filter((l) => m.spaces.some((s) => s.levelId === tipo.id && s.labelUid === l.uid)).length;
      if (ets.length !== etiquetasDaOrigem.length || fechados !== ets.length) throw new FalhaDoGrupo(`a ${x.a.numero} saiu com ${fechados} de ${etiquetasDaOrigem.length} cômodos`);
    }
    grupos.push({ nome: nome.slice(0, 40), origem: c.origem.numero, iguais: iguais.map((x) => ({ numero: x.a.numero, repeticao: rotuloDaRepeticao(x.rep) })) });
  }

  const semLuz = resumo.reduce((n, u) => n + u.semFachada.length, 0);
  if (semLuz > 0) avisos.push(`${semLuz} cômodo(s) que pedem luz ficaram sem fachada (sem onde pôr janela): o gerador é de casa, e a unidade rasa e larga não cabe no zoneamento dele — ajuste à mão (a lista está por unidade).`);
  return { comandos, model: m, unidades: resumo, geracoes, grupos, avisos };
}
