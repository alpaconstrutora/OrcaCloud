/**
 * GUARDA-CORPO E CORRIMÃO (19/09/2026, roadmap E7.3) — a parte PURA: a
 * conferência normativa, a sugestão automática sobre borda de laje e ao longo
 * da escada, e o resumo da gaveta.
 *
 * ─── O QUE SE CONFERE ───────────────────────────────────────────────────────
 *
 * NBR 14718 (guarda-corpos para edificação): altura mínima de 1,10 m do piso
 * acabado — 1,30 m acima de 12 pavimentos ficam fora daqui: o desenho não sabe
 * a altura total da edificação com certeza suficiente para acusar. NBR 9050
 * 6.9.4: corrimão entre 0,80 e 0,92 m (duas alturas para acessibilidade). A
 * conferência é AVISO, não trava: o kernel aceita qualquer altura positiva.
 *
 * ─── O QUE SE SUGERE ────────────────────────────────────────────────────────
 *
 * 1. Borda LIVRE de laje em pavimento elevado: aresta do contorno da laje
 *    (estrutura LAJE) sem parede em cima — varanda, sacada, mezanino, laje de
 *    cobertura acessível. "Sem parede" = nenhum eixo de parede do pavimento
 *    passa a menos de meia espessura + folga dos pontos de amostra da aresta.
 *    Pavimento no chão (o mais baixo) não sugere: não há de onde cair.
 * 2. Escada/rampa: corrimão dos DOIS lados do eixo (NBR 9050 6.9.2), a
 *    meia largura, a 0,92 m — um por segmento do eixo.
 *
 * Idempotente: não repete peça sugerida ou confirmada que já cobre o mesmo
 * trecho (mesmo tipo, extremos a até `TOLERANCIA_MM`).
 */
import {
  ALTURA_MINIMA_DO_GUARDA_CORPO_MM,
  FAIXA_DO_CORRIMAO_MM,
  FORMA_ESTRUTURAL,
  comprimentoDoGuardaCorpo,
  projecaoNoSegmento,
  type BlueprintModel,
  type Command,
  type GuardaCorpo,
  type ObjectId,
  type Point,
  type Wall,
} from './blueprintKernel';

export interface HipotesesDeGuardaCorpo {
  /** Folga além de meia espessura para considerar "há parede" sobre a borda. */
  folgaDaParedeMm: number;
  /** Comprimento mínimo de borda livre para valer uma sugestão. */
  bordaMinimaMm: number;
  /** Altura sugerida para guarda-corpo e corrimão. */
  alturaGuardaCorpoMm: number;
  alturaCorrimaoMm: number;
  /** Corrimão dos dois lados da escada (NBR 9050) ou só de um. */
  corrimaoNosDoisLados: boolean;
}

export const HIPOTESES_DE_GUARDA_CORPO_PADRAO: HipotesesDeGuardaCorpo = {
  folgaDaParedeMm: 100,
  bordaMinimaMm: 600,
  alturaGuardaCorpoMm: 1100,
  alturaCorrimaoMm: 920,
  corrimaoNosDoisLados: true,
};

const TOLERANCIA_MM = 300;

export interface AvisoDeGuardaCorpo {
  guardaCorpoId: ObjectId;
  gravidade: 'ERRO' | 'AVISO';
  norma: string;
  texto: string;
}

/** Conferência normativa de UMA peça. Vazio = conforme. */
export function conferirGuardaCorpo(g: GuardaCorpo): AvisoDeGuardaCorpo[] {
  const out: AvisoDeGuardaCorpo[] = [];
  if (g.tipo === 'GUARDA_CORPO' && g.alturaMm < ALTURA_MINIMA_DO_GUARDA_CORPO_MM) {
    out.push({ guardaCorpoId: g.id, gravidade: 'ERRO', norma: 'NBR 14718', texto: `altura ${(g.alturaMm / 1000).toFixed(2).replace('.', ',')} m abaixo do mínimo de 1,10 m` });
  }
  if (g.tipo === 'CORRIMAO' && (g.alturaMm < FAIXA_DO_CORRIMAO_MM[0] || g.alturaMm > FAIXA_DO_CORRIMAO_MM[1])) {
    out.push({ guardaCorpoId: g.id, gravidade: 'AVISO', norma: 'NBR 9050 6.9.4', texto: `altura ${(g.alturaMm / 1000).toFixed(2).replace('.', ',')} m fora da faixa 0,80–0,92 m` });
  }
  if (g.material === 'VIDRO' && g.tipo === 'GUARDA_CORPO' && !g.itemCode) {
    out.push({ guardaCorpoId: g.id, gravidade: 'AVISO', norma: 'NBR 7199', texto: 'vidro de guarda-corpo tem de ser laminado ou temperado-laminado — escolha o item para o orçamento saber qual' });
  }
  return out;
}

export function conferirGuardaCorpos(model: BlueprintModel, levelId?: ObjectId | null): AvisoDeGuardaCorpo[] {
  return (model.guardaCorpos ?? []).filter((g) => !levelId || g.levelId === levelId).flatMap(conferirGuardaCorpo);
}

// ─── Sugestão ────────────────────────────────────────────────────────────────

export interface SugestaoDeGuardaCorpo {
  origem: 'LAJE' | 'ESCADA';
  origemId: ObjectId;
  rotulo: string;
  comando: Extract<Command, { type: 'AddGuardaCorpo' }>;
  comprimentoMm: number;
}

export interface ResultadoDaSugestao {
  sugestoes: SugestaoDeGuardaCorpo[];
  /** Por que nada (ou pouco) saiu — para a gaveta dizer em vez de ficar vazia. */
  motivos: string[];
  jaExistentes: number;
}

function temParedeSobre(p: Point, paredes: Wall[], folgaMm: number): boolean {
  for (const w of paredes) {
    const pr = projecaoNoSegmento(p, w.a, w.b);
    if (pr && pr.u >= -0.02 && pr.u <= 1.02 && pr.distanciaMm <= w.thicknessMm / 2 + folgaMm) return true;
  }
  return false;
}

function jaCoberto(existentes: GuardaCorpo[], tipo: GuardaCorpo['tipo'], a: Point, b: Point): boolean {
  const perto = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y) <= TOLERANCIA_MM;
  return existentes.some((g) => {
    if (g.tipo !== tipo) return false;
    const ini = g.pontos[0];
    const fim = g.pontos[g.pontos.length - 1];
    return (perto(ini, a) && perto(fim, b)) || (perto(ini, b) && perto(fim, a));
  });
}

/**
 * Sugere guarda-corpos e corrimãos do pavimento. Puro: devolve comandos
 * `AddGuardaCorpo sugerido:true`; quem grava é o editor, num lote.
 */
export function sugerirGuardaCorpos(model: BlueprintModel, levelId: ObjectId, hip: HipotesesDeGuardaCorpo = HIPOTESES_DE_GUARDA_CORPO_PADRAO): ResultadoDaSugestao {
  const nivel = model.levels.find((l) => l.id === levelId);
  const sugestoes: SugestaoDeGuardaCorpo[] = [];
  const motivos: string[] = [];
  let jaExistentes = 0;
  if (!nivel) return { sugestoes, motivos: ['pavimento inexistente'], jaExistentes };
  const existentes = (model.guardaCorpos ?? []).filter((g) => g.levelId === levelId);
  const paredes = model.walls.filter((w) => w.levelId === levelId);
  const maisBaixo = Math.min(...model.levels.map((l) => l.elevationMm));

  // 1. Bordas livres de laje (só em pavimento elevado).
  const lajes = (model.structures ?? []).filter((s) => s.levelId === levelId && FORMA_ESTRUTURAL[s.kind] === 'AREA');
  if (nivel.elevationMm <= maisBaixo) {
    if (lajes.length) motivos.push(`${nivel.name} é o pavimento mais baixo — borda de laje no chão não pede guarda-corpo`);
  } else if (lajes.length === 0) {
    motivos.push(`sem laje em ${nivel.name} — desenhe a laje (Estrutural) para a borda livre ser reconhecida`);
  } else {
    for (const laje of lajes) {
      const anel = laje.pontos;
      for (let i = 0; i < anel.length; i++) {
        const a = anel[i];
        const b = anel[(i + 1) % anel.length];
        const compMm = Math.hypot(b.x - a.x, b.y - a.y);
        if (compMm < hip.bordaMinimaMm) continue;
        // Amostras ao longo da aresta: a borda é livre quando NENHUMA amostra tem parede em cima.
        const n = Math.max(3, Math.ceil(compMm / 500));
        let livres = 0;
        for (let k = 1; k < n; k++) {
          const t = k / n;
          const p = { x: Math.round(a.x + (b.x - a.x) * t), y: Math.round(a.y + (b.y - a.y) * t) };
          if (!temParedeSobre(p, paredes, hip.folgaDaParedeMm)) livres++;
        }
        if (livres < n - 1) continue;
        if (jaCoberto(existentes, 'GUARDA_CORPO', a, b)) {
          jaExistentes++;
          continue;
        }
        const rotulo = `${laje.rotulo || 'Laje'} · borda ${i + 1}`;
        sugestoes.push({
          origem: 'LAJE',
          origemId: laje.id,
          rotulo,
          comprimentoMm: compMm,
          comando: { type: 'AddGuardaCorpo', levelId, tipo: 'GUARDA_CORPO', pontos: [{ ...a }, { ...b }], alturaMm: hip.alturaGuardaCorpoMm, material: 'METALICO', rotulo, sugerido: true },
        });
      }
    }
    if (sugestoes.length === 0 && jaExistentes === 0) motivos.push(`toda borda de laje em ${nivel.name} tem parede em cima — nenhuma borda livre`);
  }

  // 2. Escadas e rampas: corrimão a meia largura, dos dois lados, por segmento do eixo.
  const escadas = (model.stairs ?? []).filter((e) => e.levelId === levelId);
  for (const e of escadas) {
    for (let i = 1; i < e.pontos.length; i++) {
      const a = e.pontos[i - 1];
      const b = e.pontos[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const L = Math.hypot(dx, dy);
      if (L < 1) continue;
      const nx = (-dy / L) * (e.larguraMm / 2);
      const ny = (dx / L) * (e.larguraMm / 2);
      const lados: [number, string][] = hip.corrimaoNosDoisLados ? [[1, 'esquerdo'], [-1, 'direito']] : [[1, 'esquerdo']];
      for (const [s, nome] of lados) {
        const p1 = { x: Math.round(a.x + nx * s), y: Math.round(a.y + ny * s) };
        const p2 = { x: Math.round(b.x + nx * s), y: Math.round(b.y + ny * s) };
        if (jaCoberto(existentes, 'CORRIMAO', p1, p2)) {
          jaExistentes++;
          continue;
        }
        const rotulo = `${e.rotulo || (e.tipo === 'RAMPA' ? 'Rampa' : 'Escada')} · corrimão ${nome}${e.pontos.length > 2 ? ` · lance ${i}` : ''}`;
        sugestoes.push({
          origem: 'ESCADA',
          origemId: e.id,
          rotulo,
          comprimentoMm: L,
          comando: { type: 'AddGuardaCorpo', levelId, tipo: 'CORRIMAO', pontos: [p1, p2], alturaMm: hip.alturaCorrimaoMm, material: 'METALICO', rotulo, sugerido: true },
        });
      }
    }
  }
  if (escadas.length === 0) motivos.push(`sem escada ou rampa partindo de ${nivel.name}`);

  return { sugestoes, motivos, jaExistentes };
}

export interface ResumoDosGuardaCorpos {
  pecas: number;
  guardaCorpoM: number;
  corrimaoM: number;
  sugeridos: number;
  semMaterial: number;
  avisos: number;
  erros: number;
}

export function resumirGuardaCorpos(model: BlueprintModel, levelId?: ObjectId | null): ResumoDosGuardaCorpos {
  const lista = (model.guardaCorpos ?? []).filter((g) => !levelId || g.levelId === levelId);
  const avisos = lista.flatMap(conferirGuardaCorpo);
  return {
    pecas: lista.length,
    guardaCorpoM: lista.filter((g) => g.tipo === 'GUARDA_CORPO').reduce((s, g) => s + comprimentoDoGuardaCorpo(g), 0) / 1000,
    corrimaoM: lista.filter((g) => g.tipo === 'CORRIMAO').reduce((s, g) => s + comprimentoDoGuardaCorpo(g), 0) / 1000,
    sugeridos: lista.filter((g) => g.sugerido).length,
    semMaterial: lista.filter((g) => !g.itemCode).length,
    avisos: avisos.filter((a) => a.gravidade === 'AVISO').length,
    erros: avisos.filter((a) => a.gravidade === 'ERRO').length,
  };
}
