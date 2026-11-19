/**
 * A VISTA DA TORRE (PE7a do prédio pelo Empreendimento, 18/11/2026): o desenho sem os pavimentos que vieram de FORA — os
 * da outra torre já lançada no mesmo estudo (a Torre A do Garden, quando o motor gera a Torre B). O pavimento do lote
 * fica (divisas, blocos, o que corre no terreno).
 *
 * Só para LER: a classificação do PPCI, a rota de fuga, a pressão da água, a conferência elétrica e a compatibilização
 * de uma torre olham para ela, e não para a vizinha. Os circuitos dos quadros que saem, as aberturas das paredes que saem
 * e as unidades sem nenhuma etiqueta na vista saem junto; os contadores de id (`seq`) ficam.
 */
import type { BlueprintModel, ObjectId } from '../blueprintKernel';

export function semOsPavimentos(m: BlueprintModel, deFora: ReadonlySet<ObjectId>): BlueprintModel {
  if (!deFora.size) return m;
  const saida: Record<string, unknown> = { ...m };
  for (const [k, v] of Object.entries(m)) {
    if (k === 'levels' || !Array.isArray(v) || !v.length) continue;
    if (!v.some((x) => x && typeof x === 'object' && 'levelId' in (x as object))) continue;
    saida[k] = v.filter((x) => !deFora.has((x as { levelId?: ObjectId }).levelId ?? ''));
  }
  const paredes = new Set((saida.walls as BlueprintModel['walls']).map((w) => w.id));
  saida.openings = m.openings.filter((o) => paredes.has(o.wallId));
  const quadros = new Set(((saida.quadros as BlueprintModel['quadros']) ?? []).map((q) => q.id));
  saida.circuitos = (m.circuitos ?? []).filter((c) => quadros.has(c.quadroId));
  const etiquetas = new Set(((saida.labels as BlueprintModel['labels']) ?? []).map((l) => l.uid));
  saida.unidades = (m.unidades ?? []).filter((u) => u.etiquetaUids.length === 0 || u.etiquetaUids.some((e) => etiquetas.has(e)));
  saida.levels = m.levels.filter((l) => !deFora.has(l.id));
  return saida as unknown as BlueprintModel;
}

/**
 * O resultado no DESENHO INTEIRO sem reaplicar os comandos: o que o motor fez na vista mais o que ficou de fora (os
 * pavimentos da outra torre e tudo neles — nenhum comando da torre gerada os toca, porque não os viu). Aplicar os ~3 mil
 * comandos da Torre B de novo sobre o desenho com a Torre A custava ~114 s (as invariantes rodam a cada comando).
 */
export function juntarComOsPavimentos(daVista: BlueprintModel, desenho: BlueprintModel, deFora: ReadonlySet<ObjectId>): BlueprintModel {
  if (!deFora.size) return daVista;
  const fora = (x: unknown) => deFora.has((x as { levelId?: ObjectId }).levelId ?? '');
  const saida: Record<string, unknown> = { ...daVista };
  for (const [k, v] of Object.entries(desenho)) {
    if (k === 'levels' || !Array.isArray(v) || !v.length) continue;
    if (!v.some((x) => x && typeof x === 'object' && 'levelId' in (x as object))) continue;
    saida[k] = [...(((daVista as unknown as Record<string, unknown[]>)[k]) ?? []), ...v.filter(fora)];
  }
  const paredesDeFora = new Set(desenho.walls.filter(fora).map((w) => w.id));
  saida.openings = [...daVista.openings, ...desenho.openings.filter((o) => paredesDeFora.has(o.wallId))];
  const quadrosDeFora = new Set((desenho.quadros ?? []).filter(fora).map((q) => q.id));
  saida.circuitos = [...(daVista.circuitos ?? []), ...(desenho.circuitos ?? []).filter((c) => quadrosDeFora.has(c.quadroId))];
  const naVista = new Set((daVista.unidades ?? []).map((u) => u.id));
  saida.unidades = [...(daVista.unidades ?? []), ...(desenho.unidades ?? []).filter((u) => !naVista.has(u.id))];
  saida.levels = [...daVista.levels, ...desenho.levels.filter((l) => deFora.has(l.id))];
  return saida as unknown as BlueprintModel;
}
