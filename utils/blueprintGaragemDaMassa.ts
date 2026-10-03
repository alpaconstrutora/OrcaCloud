/**
 * ESTUDO DE MASSA — AS VAGAS REAIS DA GARAGEM (pendências de 03/10/2026, lacuna da M6 do plano
 * `2026-10-01-estudo-de-massa.md`: "vagas reais via `planejarVagas` no bloco garagem").
 *
 * Até aqui o estudo só CONTAVA as vagas que cabem (M2, `vagasQueCabem`, num modelo provisório). Aqui o bloco de
 * GARAGEM vira pavimentos de verdade — um por pavimento do bloco (subsolos, térreo, edifício-garagem), com as
 * paredes do contorno — e cada um recebe as vagas do lançador da E2.5 (fileiras + circulação, PCD e idoso nos
 * mínimos), como peças confirmadas. Daí quantitativo, IFC e o resumo de vagas leem o desenho.
 *
 * ─── O BLOCO GIRADO ─────────────────────────────────────────────────────────
 *
 * O lançador corre as fileiras nos eixos do desenho. A garagem girada (o gerador de massa orienta pela frente do
 * lote) perderia vagas: o plano é feito num modelo PROVISÓRIO com o contorno alinhado ao lado mais longo — o mesmo
 * da contagem da M2, então o número lançado é o número contado — e cada vaga volta ao desenho por rotação rígida
 * (centro girado, giro somado). Alinhado ao desenho, a rotação é zero e nada muda.
 *
 * ─── O QUE FICA DE FORA, DITO ───────────────────────────────────────────────
 *
 * Rampa e acesso de veículos (o projetista decide onde), pilares (a massa não tem estrutura: o número é o TETO, e
 * os pilares lançados depois tomam vagas — o lançador da E2.5 refaz contornando-os) e o núcleo da torre descendo
 * até o subsolo.
 */
import { applyBatch, emptyModel, uidDeterministico, type BlueprintModel, type Bloco, type Command, type Level, type Point, type TipoDeVaga } from './blueprintKernel';
import { HIPOTESES_VAGAS_PADRAO, planejarVagas, type ArranjoDasVagas, type VagaPrevista } from './blueprintVagasAutomaticas';

export interface PisoDaGaragem {
  nome: string;
  elevacaoMm: number;
  vagas: number;
  porTipo: Record<TipoDeVaga, number>;
}

export interface GaragemLancada {
  comandos: Command[];
  model: BlueprintModel;
  pisos: PisoDaGaragem[];
  total: number;
  avisos: string[];
}

/** A identidade do pavimento `i` (0 = o mais baixo) da garagem de um bloco: impede lançar duas vezes. */
export function uidDoPisoDaGaragem(b: Pick<Bloco, 'uid'>, i: number): string {
  return uidDeterministico(`massa:garagem:${b.uid}:${i + 1}`);
}

/** Os pavimentos da garagem deste bloco já lançados. */
export function garagemLancada(model: BlueprintModel, b: Pick<Bloco, 'uid' | 'pavimentos'>): Level[] {
  const uids = new Set(Array.from({ length: b.pavimentos }, (_, i) => uidDoPisoDaGaragem(b, i)));
  return model.levels.filter((l) => uids.has(l.uid));
}

/** "1º subsolo" (o mais perto do solo é o 1º), "térreo", "2º pav". */
function nomeDoPiso(b: Bloco, i: number): { nome: string; prefixo: string } {
  const cota = b.cotaBaseMm + i * b.peDireitoMm;
  if (cota < 0) {
    // Subsolos contados de cima para baixo: o pavimento cujo piso está em −1 pé-direito é o 1º.
    const k = Math.round(-cota / b.peDireitoMm);
    return { nome: `${b.nome} · ${Math.max(1, k)}º subsolo`, prefixo: `S${Math.max(1, k)}-` };
  }
  if (cota === 0) return { nome: `${b.nome} · térreo (garagem)`, prefixo: 'T-' };
  const k = Math.round(cota / b.peDireitoMm) + 1;
  return { nome: `${b.nome} · ${k}º pav (garagem)`, prefixo: `G${k}-` };
}

/** O ângulo do lado mais longo do contorno (rad) — o quadro em que o lançador vê a garagem alinhada. */
function anguloDoLadoMaisLongo(anel: readonly Point[]): number {
  let ang = 0;
  let maior = -1;
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i];
    const b = anel[(i + 1) % anel.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > maior + 1e-6) {
      maior = len;
      ang = Math.atan2(b.y - a.y, b.x - a.x);
    }
  }
  // Já alinhado a menos de 0,01° (a um múltiplo de 90°): sem rotação — o arredondamento mudaria um anel exato.
  const resto = Math.abs(((ang % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2));
  return resto < 1.75e-4 || Math.PI / 2 - resto < 1.75e-4 ? 0 : ang;
}

const girar = (p: Point, ang: number): Point => ({
  x: Math.round(p.x * Math.cos(ang) - p.y * Math.sin(ang)),
  y: Math.round(p.x * Math.sin(ang) + p.y * Math.cos(ang)),
});

/** As vagas que o lançador da E2.5 põe neste contorno, já no quadro do desenho. */
export function vagasDoContorno(anel: readonly Point[], arranjo: ArranjoDasVagas = 'PERPENDICULAR'): VagaPrevista[] {
  if (anel.length < 3) return [];
  const ang = anguloDoLadoMaisLongo(anel);
  const alinhado = ang === 0 ? [...anel] : anel.map((p) => girar(p, -ang));
  let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Garagem', elevationMm: 0, defaultHeightMm: 3000 }]).model;
  const lv = m.levels[0].id;
  try {
    m = applyBatch(m, alinhado.map((a, i) => ({ type: 'AddWall', levelId: lv, a, b: alinhado[(i + 1) % alinhado.length], thicknessMm: 200, heightMm: 3000 }) as Command)).model;
  } catch {
    return [];
  }
  const plano = planejarVagas(m, lv, { ...HIPOTESES_VAGAS_PADRAO, arranjo, pcdPct: 2, idosoPct: 5, motoPct: 0, exigenciaManual: null, vagasPorUnidade: null }, { tipo: 'PAVIMENTO' });
  if (ang === 0) return plano.vagas;
  const graus = (ang * 180) / Math.PI;
  return plano.vagas.map((v) => ({ ...v, at: girar(v.at, ang), rotacaoGraus: ((Math.round(v.rotacaoGraus + graus) % 360) + 360) % 360 }));
}

/**
 * Lança a garagem do bloco: um pavimento por pavimento do bloco, paredes no contorno e as vagas confirmadas.
 * Recusa (com o motivo) bloco que não é de garagem e garagem já lançada.
 */
export function lancarGaragem(model: BlueprintModel, b: Bloco, arranjo: ArranjoDasVagas = 'PERPENDICULAR'): GaragemLancada {
  if (b.uso !== 'GARAGEM') throw new Error(`"${b.nome}" não é de garagem (uso: ${b.uso.toLowerCase()}). Mude o uso do bloco para Garagem para lançar as vagas.`);
  const ja = garagemLancada(model, b);
  if (ja.length > 0) throw new Error(`As vagas de "${b.nome}" já estão lançadas ("${ja[0].name}"). Para refazer, remova esses pavimentos e lance de novo.`);
  const elevRef = model.levels.find((l) => l.id === b.levelId)?.elevationMm ?? 0;
  const avisos: string[] = [];
  const comandos: Command[] = [];
  let m = model;
  const aplicar = (cs: Command[]) => {
    if (cs.length === 0) return;
    m = applyBatch(m, cs).model;
    comandos.push(...cs);
  };
  // As vagas do contorno são as mesmas em todos os pavimentos (mesmo contorno, sem obstáculo ainda): planeja uma vez.
  const previstas = vagasDoContorno(b.pontos, arranjo);
  if (previstas.length === 0) avisos.push(`Nenhuma vaga coube no contorno de "${b.nome}": estreito demais para fileira + circulação.`);
  const pisos: PisoDaGaragem[] = [];
  for (let i = 0; i < b.pavimentos; i++) {
    const { nome, prefixo } = nomeDoPiso(b, i);
    const elevacaoMm = elevRef + b.cotaBaseMm + i * b.peDireitoMm;
    const uid = uidDoPisoDaGaragem(b, i);
    aplicar([{ type: 'AddLevel', name: nome.slice(0, 60), elevationMm: elevacaoMm, defaultHeightMm: b.peDireitoMm, uid }]);
    const levelId = m.levels.find((l) => l.uid === uid)!.id;
    const paredes: Command[] = b.pontos.map((a, k) => ({ type: 'AddWall', levelId, a, b: b.pontos[(k + 1) % b.pontos.length], thicknessMm: 200, heightMm: b.peDireitoMm }));
    const vagas: Command[] = previstas.map((v, k) => ({
      type: 'AddVaga',
      levelId,
      at: v.at,
      tipo: v.tipo,
      larguraMm: v.larguraMm,
      comprimentoMm: v.comprimentoMm,
      rotacaoGraus: v.rotacaoGraus,
      numero: `${prefixo}${k + 1}`,
      sugerida: false,
    }));
    aplicar([...paredes, ...vagas]);
    const porTipo: Record<TipoDeVaga, number> = { COMUM: 0, PCD: 0, IDOSO: 0, MOTO: 0 };
    for (const v of previstas) porTipo[v.tipo]++;
    pisos.push({ nome, elevacaoMm, vagas: previstas.length, porTipo });
  }
  if (previstas.length > 0) avisos.push('Sem pilares, rampa e acesso: o número é o teto — lance os pilares e refaça as vagas pela gaveta de Vagas (E2.5), que contorna os obstáculos.');
  return { comandos, model: m, pisos, total: pisos.reduce((s, p) => s + p.vagas, 0), avisos };
}
