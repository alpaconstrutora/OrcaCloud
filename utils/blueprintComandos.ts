/**
 * OS COMANDOS — a relação interruptor ↔ luz, DERIVADA das letras (E2.1 do
 * roadmap elétrico, 29/09/2026).
 *
 * O modelo guarda uma LETRA por ponto (`Terminal.comando`), por pavimento; o
 * AltoQi tem um objeto de comando. Aqui o objeto é derivado: os pontos de um
 * pavimento com a mesma letra são UM comando, e os pontos marcados
 * `comandoGlobal` com a mesma letra são um comando que atravessa pavimentos
 * (a escada). Nada é gravado além da letra e da marca — o índice se refaz a
 * cada mudança e nunca envelhece.
 *
 * É o que a aba "Comandos" lista e o que a E2.2 (esquemas de ligação) lê para
 * saber quantos retornos passam em cada trecho.
 */
import type { BlueprintModel, ObjectId, Terminal, TipoDeInterruptor } from './blueprintKernel';

export interface Comando {
  /** `${levelId}:${letra}` ou `global:${letra}`. */
  chave: string;
  letra: string;
  /** Vale no desenho inteiro (escada). */
  global: boolean;
  /** Os pavimentos onde há pontos deste comando (um, salvo global). */
  levelIds: ObjectId[];
  interruptorIds: ObjectId[];
  luzIds: ObjectId[];
  /** As variantes dos interruptores (uma seção, paralelo…), sem repetição. */
  variantes: TipoDeInterruptor[];
}

const letrasDe = (t: Terminal): string[] =>
  (t.comando ?? '').trim().toLowerCase().split('').filter((c) => c !== ' ');

const ehLuz = (t: Terminal) => t.tipoEletrico?.startsWith('ILUMINACAO') ?? false;

/** Todos os comandos do desenho, ordenados por pavimento (globais primeiro) e letra. */
export function comandosDoModelo(model: BlueprintModel): Comando[] {
  const mapa = new Map<string, Comando>();
  const ordem = new Map(model.levels.map((l, i) => [l.id, i]));
  for (const t of model.terminais ?? []) {
    if (t.disciplina !== 'ELETRICA') continue;
    const interruptor = t.tipoEletrico === 'INTERRUPTOR';
    if (!interruptor && !ehLuz(t)) continue;
    for (const letra of letrasDe(t)) {
      const global = t.comandoGlobal === true;
      const chave = global ? `global:${letra}` : `${t.levelId}:${letra}`;
      const c = mapa.get(chave) ?? { chave, letra, global, levelIds: [], interruptorIds: [], luzIds: [], variantes: [] };
      if (!c.levelIds.includes(t.levelId)) c.levelIds.push(t.levelId);
      if (interruptor) {
        c.interruptorIds.push(t.id);
        const v = t.interruptor ?? 'UMA_SECAO';
        if (!c.variantes.includes(v)) c.variantes.push(v);
      } else c.luzIds.push(t.id);
      mapa.set(chave, c);
    }
  }
  return [...mapa.values()].sort((a, b) => {
    if (a.global !== b.global) return a.global ? -1 : 1;
    const la = Math.min(...a.levelIds.map((id) => ordem.get(id) ?? 0));
    const lb = Math.min(...b.levelIds.map((id) => ordem.get(id) ?? 0));
    return la - lb || a.letra.localeCompare(b.letra);
  });
}

/** O que falta no comando, em texto curto — vazio = completo. */
export function pendenciasDoComando(c: Comando): string[] {
  const p: string[] = [];
  if (c.interruptorIds.length === 0) p.push('sem interruptor');
  if (c.luzIds.length === 0) p.push('sem luz');
  const paralelos = c.variantes.includes('PARALELO');
  if (paralelos && c.interruptorIds.length < 2) p.push('paralelo sem o par');
  if (c.variantes.includes('INTERMEDIARIO') && !paralelos) p.push('intermediário sem paralelos');
  return p;
}
