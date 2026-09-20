/**
 * VAGAS AUTOMÁTICAS (19/09/2026, roadmap E2.5). Molde: `blueprintPilaresAutomaticos`
 * — hipóteses editáveis, plano puro (comandos para um lote), idempotência por
 * `sugerida`, resumo que ACUSA o que falta e nunca trava.
 *
 * ─── O DESENHO ──────────────────────────────────────────────────────────────
 *
 * Dentro de uma REGIÃO (o ambiente escolhido — "Garagem" por padrão — ou o
 * contorno externo do pavimento), fileiras de vagas separadas por faixas de
 * circulação, no módulo clássico da garagem: `vaga | circulação | vaga vaga |
 * circulação | vaga vaga | …` — toda fileira encosta numa circulação. As
 * fileiras correm no eixo mais comprido da caixa da região (ou no que a
 * hipótese mandar); a vaga fica com o comprimento perpendicular à fileira
 * ("de ré", 90°) — o ARRANJO padrão. Desde 20/09/2026 (backlog P2 — P2.7) há
 * mais dois: ESPINHA DE PEIXE (45°: a vaga girada 45° em relação à fileira,
 * banda de (l + c)·sen 45° ≈ 5,30 m, passo l/sen 45° ≈ 3,54 m, circulação
 * pode ser mais estreita — 3,50 m é o usual de mão única) e EM FILA (paralela
 * à circulação: banda = largura, passo = comprimento + 1,00 m de manobra). As
 * bandas alternam o lado da circulação como antes; na espinha o giro alterna
 * também (45°/135°), para o carro sempre entrar de frente vindo da circulação.
 *
 * Dentro da fileira as vagas se encostam lado a lado; o que estiver no caminho
 * — pilar, parede, núcleo vertical, escada, vaga já confirmada — é OBSTÁCULO:
 * a vaga que o toca não nasce, e a próxima tenta 250 mm adiante (é assim que
 * as vagas se acomodam entre os pilares em vez de perder o módulo inteiro).
 *
 * ─── TIPOS E MÍNIMOS ────────────────────────────────────────────────────────
 *
 * PCD: 2 % do total e no mínimo 1 (Lei 10.098 / NBR 9050), com a faixa de
 * 1,20 m — a vaga PCD tem 3,70 m e nasce no COMEÇO da primeira fileira, que é
 * onde costuma estar mais perto do acesso. IDOSO: 5 % e no mínimo 1 (Lei
 * 10.741), medidas comuns. MOTO: só se a hipótese pedir (1,00 × 2,00 m, no fim).
 * Os percentuais são hipótese (o município pode pedir mais); o resumo confere.
 *
 * ─── EXIGÊNCIA ──────────────────────────────────────────────────────────────
 *
 * Quantas vagas a zona pede: número manual ou `vagasPorUnidade × unidades`
 * (as unidades da E2.2). A E3 (motor de regras) vai alimentar isto pela zona;
 * até lá é hipótese, dita como tal.
 */
import {
  contornoDaVaga,
  contornoDaEscada,
  contornoExternoDoNivel,
  DIMENSAO_DA_VAGA,
  pegadaEmPlanta,
  pointInPolygon,
  recorteComum,
  polygonArea,
  type BlueprintModel,
  type Command,
  type ObjectId,
  type Point,
  type TipoDeVaga,
  type Vaga,
} from './blueprintKernel';
import { nucleosDoNivel } from './blueprintNucleoVertical';

export type OrientacaoDasFileiras = 'AUTO' | 'FILEIRAS_EM_X' | 'FILEIRAS_EM_Y';
/** O arranjo da vaga na fileira (P2.7): de ré a 90°, espinha de peixe a 45°, ou em fila (paralela). */
export type ArranjoDasVagas = 'PERPENDICULAR' | 'ESPINHA_45' | 'PARALELA';
export const ROTULO_DO_ARRANJO: Record<ArranjoDasVagas, string> = { PERPENDICULAR: 'De ré (90°)', ESPINHA_45: 'Espinha de peixe (45°)', PARALELA: 'Em fila (paralela)' };
/** Folga de manobra entre vagas em fila, mm. */
export const FOLGA_DA_FILA_MM = 1000;

export interface HipotesesDeVagas {
  larguraMm: number;
  comprimentoMm: number;
  circulacaoMm: number;
  /** Afastamento do contorno da região, mm. */
  recuoMm: number;
  orientacao: OrientacaoDasFileiras;
  /** P2.7. Ausente (estado persistido antigo) = PERPENDICULAR. */
  arranjo?: ArranjoDasVagas;
  /** Percentuais mínimos por tipo (0–100). PCD e idoso têm piso de 1 quando > 0. */
  pcdPct: number;
  idosoPct: number;
  motoPct: number;
  /** Exigência da zona: número manual, ou por unidade (E2.2). `null` = sem exigência declarada. */
  exigenciaManual: number | null;
  vagasPorUnidade: number | null;
}

export const HIPOTESES_VAGAS_PADRAO: HipotesesDeVagas = {
  larguraMm: 2500,
  comprimentoMm: 5000,
  circulacaoMm: 5000,
  // O anel do ambiente corre no EIXO das paredes; 200 mm afastam a vaga da meia
  // espessura (até 400 mm de parede) sem que a primeira fileira nasça encostada.
  recuoMm: 200,
  orientacao: 'AUTO',
  arranjo: 'PERPENDICULAR',
  pcdPct: 2,
  idosoPct: 5,
  motoPct: 0,
  exigenciaManual: null,
  vagasPorUnidade: 1,
};

export type RegiaoDeVagas = { tipo: 'AMBIENTE'; spaceId: ObjectId } | { tipo: 'PAVIMENTO' };

export interface VagaPrevista {
  at: Point;
  larguraMm: number;
  comprimentoMm: number;
  rotacaoGraus: number;
  tipo: TipoDeVaga;
  numero: string;
}

export interface ResumoDeVagas {
  /** Confirmadas que já existem no pavimento + previstas. */
  total: number;
  porTipo: Record<TipoDeVaga, number>;
  pcdMinimo: number;
  idosoMinimo: number;
  exigencia: number | null;
  /** O que falta para a exigência (0 = atende). `null` sem exigência. */
  faltam: number | null;
}

export interface PlanoDeVagas {
  vagas: VagaPrevista[];
  /** Sugeridas antigas do pavimento que o lote substitui. */
  substituidas: ObjectId[];
  comandos: Command[];
  resumo: ResumoDeVagas;
  /** Por que não há vaga nenhuma (região sem tamanho, sem pavimento…). */
  motivo: string | null;
  regiao: { anel: Point[]; nome: string } | null;
}

/** A região onde lançar: o ambiente pedido, o "Garagem" por nome, ou o contorno externo do pavimento. */
export function regiaoDeVagas(model: BlueprintModel, levelId: ObjectId, pedida: RegiaoDeVagas | null): { anel: Point[]; furos: Point[][]; nome: string } | null {
  const nivel = model.levels.find((l) => l.id === levelId);
  if (!nivel) return null;
  if (pedida?.tipo === 'AMBIENTE') {
    const s = model.spaces.find((x) => x.id === pedida.spaceId && x.levelId === levelId);
    if (s) return { anel: s.ring, furos: s.holes, nome: s.name ?? 'Ambiente' };
  }
  if (!pedida) {
    const garagem = model.spaces.find((s) => s.levelId === levelId && /garag|estacion/i.test(s.name ?? ''));
    if (garagem) return { anel: garagem.ring, furos: garagem.holes, nome: garagem.name ?? 'Garagem' };
  }
  const contornos = contornoExternoDoNivel(model, nivel);
  if (contornos.length === 0) return null;
  const maior = [...contornos].sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)))[0];
  return { anel: maior, furos: [], nome: `Contorno de ${nivel.name}` };
}

/** Os ambientes do pavimento que servem de região (para a gaveta oferecer). */
export function ambientesCandidatos(model: BlueprintModel, levelId: ObjectId): { spaceId: ObjectId; nome: string; areaM2: number }[] {
  return model.spaces
    .filter((s) => s.levelId === levelId)
    .map((s, i) => ({ spaceId: s.id, nome: s.name ?? `Ambiente ${i + 1}`, areaM2: Math.round(s.areaMm2 / 10_000) / 100 }))
    .sort((a, b) => b.areaM2 - a.areaM2);
}

export function exigenciaDeVagas(model: BlueprintModel, hip: HipotesesDeVagas): number | null {
  if (hip.exigenciaManual != null && hip.exigenciaManual >= 0) return Math.round(hip.exigenciaManual);
  if (hip.vagasPorUnidade != null && hip.vagasPorUnidade > 0) {
    const n = (model.unidades ?? []).length;
    return n > 0 ? Math.ceil(n * hip.vagasPorUnidade) : null;
  }
  return null;
}

const minimo = (total: number, pct: number) => (pct > 0 && total > 0 ? Math.max(1, Math.ceil((total * pct) / 100)) : 0);

function anelDentroDaRegiao(anel: Point[], regiao: Point[], furos: Point[][]): boolean {
  const pontos = [...anel];
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i];
    const b = anel[(i + 1) % anel.length];
    pontos.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  return pontos.every((p) => pointInPolygon(regiao, p) && !furos.some((f) => pointInPolygon(f, p)));
}

export function planejarVagas(model: BlueprintModel, levelId: ObjectId, hip: HipotesesDeVagas = HIPOTESES_VAGAS_PADRAO, pedida: RegiaoDeVagas | null = null): PlanoDeVagas {
  const vazio = (motivo: string, regiao: PlanoDeVagas['regiao'] = null): PlanoDeVagas => ({
    vagas: [],
    substituidas: [],
    comandos: [],
    resumo: resumoDe(model, levelId, [], hip),
    motivo,
    regiao,
  });
  const nivel = model.levels.find((l) => l.id === levelId);
  if (!nivel) return vazio('Escolha um pavimento.');
  const regiao = regiaoDeVagas(model, levelId, pedida);
  if (!regiao) return vazio('Sem região: desenhe as paredes da garagem (ou o contorno do pavimento) antes de lançar.');
  const xs = regiao.anel.map((p) => p.x);
  const ys = regiao.anel.map((p) => p.y);
  const caixa = { minX: Math.min(...xs) + hip.recuoMm, maxX: Math.max(...xs) - hip.recuoMm, minY: Math.min(...ys) + hip.recuoMm, maxY: Math.max(...ys) - hip.recuoMm };
  const largX = caixa.maxX - caixa.minX;
  const largY = caixa.maxY - caixa.minY;
  const fileirasEmX = hip.orientacao === 'FILEIRAS_EM_X' ? true : hip.orientacao === 'FILEIRAS_EM_Y' ? false : largX >= largY;
  // Em fileiras ao longo de X o carro fica "de pé" (comprimento em Y, giro 0);
  // em fileiras ao longo de Y, deitado (giro 90).
  const arranjo = geometriaDoArranjo(hip);
  const rotacaoBase = fileirasEmX ? 0 : 90;
  const aoLongo = fileirasEmX ? largX : largY; // extensão da fileira
  const transversal = fileirasEmX ? largY : largX; // profundidade disponível para bandas
  if (aoLongo < arranjo.passoMm(hip.larguraMm, hip.comprimentoMm) || transversal < arranjo.profundidadeMm(hip.larguraMm, hip.comprimentoMm) + hip.circulacaoMm) {
    const m1 = (mm: number) => (mm / 1000).toFixed(1).replace('.', ',');
    return vazio(`A região "${regiao.nome}" (${m1(largX)} × ${m1(largY)} m) não cabe uma fileira com circulação (${m1(arranjo.profundidadeMm(hip.larguraMm, hip.comprimentoMm) + hip.circulacaoMm)} m).`, { anel: regiao.anel, nome: regiao.nome });
  }

  // ── Obstáculos em planta: paredes, estrutura (menos laje), núcleos, escadas, vagas confirmadas ──
  const obstaculos: Point[][] = [
    ...model.walls.filter((w) => w.levelId === levelId).map((w) => pegadaEmPlanta(w)),
    ...model.structures.filter((s) => s.levelId === levelId && s.kind !== 'LAJE').map((s) => pegadaEmPlanta(s)),
    ...nucleosDoNivel(model, levelId).map((n) => n.ring),
    ...(model.stairs ?? []).filter((e) => e.levelId === levelId).map((e) => contornoDaEscada(e)),
    ...(model.vagas ?? []).filter((v) => v.levelId === levelId && !v.sugerida).map((v) => contornoDaVaga(v)),
  ].filter((a) => a.length >= 3);
  const livre = (anel: Point[]) => anelDentroDaRegiao(anel, regiao.anel, regiao.furos) && !obstaculos.some((o) => Math.abs(polygonArea(recorteComum(anel, o))) > 1);

  // ── Bandas: vaga | circulação | vaga vaga | circulação | … ──
  const bandas: { inicio: number; fim: number; ladoDaCirculacao: 1 | -1 }[] = [];
  {
    let cursor = 0;
    // A profundidade da banda depende do arranjo: c (de ré), (l + c)·sen 45° (espinha), l (fila).
    const c = arranjo.profundidadeMm(hip.larguraMm, hip.comprimentoMm);
    const a = hip.circulacaoMm;
    // primeira fileira + circulação obrigatória
    if (cursor + c + a <= transversal) {
      bandas.push({ inicio: cursor, fim: cursor + c, ladoDaCirculacao: 1 });
      cursor += c + a;
      // depois: pares de fileiras separados por circulação
      while (cursor + c <= transversal) {
        bandas.push({ inicio: cursor, fim: cursor + c, ladoDaCirculacao: -1 });
        cursor += c;
        // A segunda fileira do par só nasce se a circulação seguinte couber:
        // sem ela, a fileira ficaria sem acesso.
        if (cursor + c + a <= transversal) {
          bandas.push({ inicio: cursor, fim: cursor + c, ladoDaCirculacao: 1 });
          cursor += c + a;
        } else break;
      }
    }
  }

  // ── Uma passada para estimar o total (só comuns); a segunda com os tipos ──
  const posicoesDaBanda = (banda: { inicio: number; fim: number; ladoDaCirculacao: 1 | -1 }, larguras: number[], comprimentos: number[]): { at: Point; larguraMm: number; comprimentoMm: number; rotacaoGraus: number; k: number }[] => {
    const saida: { at: Point; larguraMm: number; comprimentoMm: number; rotacaoGraus: number; k: number }[] = [];
    let pos = 0;
    let k = 0;
    const ladoCirc = banda.ladoDaCirculacao;
    // O giro da vaga: de ré = eixo da fileira; espinha = 45°/135° conforme o lado
    // da circulação (o carro entra de frente vindo dela); fila = deitada na fileira.
    const rotacaoGraus = (rotacaoBase + arranjo.giroGraus(ladoCirc)) % 360;
    while (k < larguras.length && pos + arranjo.passoMm(larguras[k], comprimentos[k]) <= aoLongo + 0.5) {
      const w = larguras[k];
      const comp = comprimentos[k];
      const passo = arranjo.passoMm(w, comp);
      const prof = arranjo.profundidadeMm(w, comp);
      // A vaga se ancora no lado OPOSTO à circulação: a profundidade normal
      // preenche a banda exata (encosta na circulação); a vaga mais funda que a
      // banda (PCD na espinha e na fila, com a faixa de 1,20 m) cresce PARA a
      // circulação — que é onde a faixa de embarque fica — e nunca para fora da
      // região nem para dentro da banda vizinha.
      const centroT = ladoCirc === 1 ? banda.inicio + prof / 2 : banda.fim - prof / 2;
      const centroL = pos + arranjo.centroAoLongoMm(w, comp);
      const at = fileirasEmX ? { x: Math.round(caixa.minX + centroL), y: Math.round(caixa.minY + centroT) } : { x: Math.round(caixa.minX + centroT), y: Math.round(caixa.minY + centroL) };
      const anel = contornoDaVaga({ at, larguraMm: w, comprimentoMm: comp, rotacaoGraus });
      if (livre(anel)) {
        saida.push({ at, larguraMm: w, comprimentoMm: comp, rotacaoGraus, k });
        pos += passo;
        k++;
      } else {
        pos += 250;
      }
    }
    return saida;
  };
  const estimativa = bandas.reduce((s, b) => s + posicoesDaBanda(b, Array(400).fill(hip.larguraMm), Array(400).fill(hip.comprimentoMm)).length, 0);
  const confirmadas = (model.vagas ?? []).filter((v) => v.levelId === levelId && !v.sugerida);
  const totalEstimado = estimativa + confirmadas.length;
  const nPcd = Math.max(0, minimo(totalEstimado, hip.pcdPct) - confirmadas.filter((v) => v.tipo === 'PCD').length);
  const nIdoso = Math.max(0, minimo(totalEstimado, hip.idosoPct) - confirmadas.filter((v) => v.tipo === 'IDOSO').length);
  const nMoto = Math.max(0, minimo(totalEstimado, hip.motoPct) - confirmadas.filter((v) => v.tipo === 'MOTO').length);
  const fila: { tipo: TipoDeVaga; larguraMm: number; comprimentoMm: number }[] = [
    ...Array(nPcd).fill({ tipo: 'PCD', larguraMm: DIMENSAO_DA_VAGA.PCD.larguraMm - 2500 + hip.larguraMm, comprimentoMm: hip.comprimentoMm }),
    ...Array(nIdoso).fill({ tipo: 'IDOSO', larguraMm: hip.larguraMm, comprimentoMm: hip.comprimentoMm }),
    ...Array(Math.max(0, estimativa - nPcd - nIdoso - nMoto)).fill({ tipo: 'COMUM', larguraMm: hip.larguraMm, comprimentoMm: hip.comprimentoMm }),
    ...Array(nMoto).fill({ tipo: 'MOTO', larguraMm: DIMENSAO_DA_VAGA.MOTO.larguraMm, comprimentoMm: DIMENSAO_DA_VAGA.MOTO.comprimentoMm }),
  ];
  const vagas: VagaPrevista[] = [];
  let restante = fila;
  for (const banda of bandas) {
    if (restante.length === 0) break;
    const colocadas = posicoesDaBanda(banda, restante.map((f) => f.larguraMm), restante.map((f) => f.comprimentoMm));
    for (const c of colocadas) vagas.push({ at: c.at, larguraMm: c.larguraMm, comprimentoMm: c.comprimentoMm, rotacaoGraus: c.rotacaoGraus, tipo: restante[c.k].tipo, numero: '' });
    restante = restante.slice(colocadas.length);
  }
  // Numeração: contínua depois das confirmadas.
  let n = confirmadas.length;
  for (const v of vagas) v.numero = String(++n);

  const substituidas = (model.vagas ?? []).filter((v) => v.levelId === levelId && v.sugerida).map((v) => v.id);
  const comandos: Command[] = [
    ...substituidas.map((vagaId) => ({ type: 'DeleteVaga', vagaId }) as const),
    ...vagas.map((v) => ({ type: 'AddVaga', levelId, at: v.at, tipo: v.tipo, larguraMm: v.larguraMm, comprimentoMm: v.comprimentoMm, rotacaoGraus: v.rotacaoGraus, numero: v.numero, sugerida: true }) as const),
  ];
  return {
    vagas,
    substituidas,
    comandos,
    resumo: resumoDe(model, levelId, vagas, hip),
    motivo: vagas.length === 0 ? `Nenhuma vaga coube em "${regiao.nome}": pilares e paredes tomam o espaço, ou a região é estreita.` : null,
    regiao: { anel: regiao.anel, nome: regiao.nome },
  };
}

/**
 * A geometria de cada ARRANJO (P2.7), em função da largura `l` e do comprimento
 * `c` da vaga: profundidade da banda, passo ao longo da fileira, onde fica o
 * centro da vaga dentro do passo e o giro relativo ao eixo da fileira.
 */
export function geometriaDoArranjo(hip: Pick<HipotesesDeVagas, 'arranjo'>): {
  arranjo: ArranjoDasVagas;
  profundidadeMm: (l: number, c: number) => number;
  passoMm: (l: number, c: number) => number;
  centroAoLongoMm: (l: number, c: number) => number;
  giroGraus: (ladoDaCirculacao: 1 | -1) => number;
} {
  const arranjo = hip.arranjo ?? 'PERPENDICULAR';
  const s45 = Math.SQRT1_2;
  if (arranjo === 'ESPINHA_45') {
    // Retângulo l × c girado 45°: a caixa envolvente é (l + c)·sen 45° de lado;
    // vagas vizinhas a l/sen 45° de passo encostam pelas laterais sem se cruzar.
    return {
      arranjo,
      profundidadeMm: (l, c) => Math.round((l + c) * s45),
      passoMm: (l) => Math.round(l / s45),
      centroAoLongoMm: (l, c) => Math.round(((l + c) * s45) / 2),
      giroGraus: (lado) => (lado === 1 ? 45 : 135),
    };
  }
  if (arranjo === 'PARALELA') {
    return {
      arranjo,
      profundidadeMm: (l) => l,
      passoMm: (_l, c) => c + FOLGA_DA_FILA_MM,
      centroAoLongoMm: (_l, c) => Math.round(c / 2),
      giroGraus: () => 90,
    };
  }
  return { arranjo, profundidadeMm: (_l, c) => c, passoMm: (l) => l, centroAoLongoMm: (l) => Math.round(l / 2), giroGraus: () => 0 };
}

/** Resumo do pavimento: confirmadas + previstas (ou + sugeridas atuais quando `previstas` está vazio). */
export function resumoDe(model: BlueprintModel, levelId: ObjectId, previstas: readonly Pick<Vaga, 'tipo'>[], hip: HipotesesDeVagas): ResumoDeVagas {
  const doNivel = (model.vagas ?? []).filter((v) => v.levelId === levelId);
  const base = previstas.length > 0 ? [...doNivel.filter((v) => !v.sugerida), ...previstas] : doNivel;
  const porTipo: Record<TipoDeVaga, number> = { COMUM: 0, PCD: 0, IDOSO: 0, MOTO: 0 };
  for (const v of base) porTipo[v.tipo]++;
  const total = base.length;
  const exigencia = exigenciaDeVagas(model, hip);
  return {
    total,
    porTipo,
    pcdMinimo: minimo(total, hip.pcdPct),
    idosoMinimo: minimo(total, hip.idosoPct),
    exigencia,
    faltam: exigencia == null ? null : Math.max(0, exigencia - total),
  };
}

/** Aceita as sugeridas do pavimento (ou todas). */
export function comandosDeAceite(model: BlueprintModel, levelId: ObjectId | null): Command[] {
  return (model.vagas ?? []).filter((v) => v.sugerida && (!levelId || v.levelId === levelId)).map((v) => ({ type: 'SetVagaProps', vagaId: v.id, sugerida: false }) as const);
}

/** Apaga as sugeridas do pavimento (ou todas). */
export function comandosDeLimpeza(model: BlueprintModel, levelId: ObjectId | null): Command[] {
  return (model.vagas ?? []).filter((v) => v.sugerida && (!levelId || v.levelId === levelId)).map((v) => ({ type: 'DeleteVaga', vagaId: v.id }) as const);
}
