/**
 * A VISTA DA TORRE (PE7a do prédio pelo Empreendimento, 18/11/2026): o desenho sem os pavimentos que vieram de FORA — os
 * da outra torre já lançada no mesmo estudo (a Torre A do Garden, quando o motor gera a Torre B). O pavimento do lote
 * fica (divisas, blocos, o que corre no terreno).
 *
 * O motor da torre gerada roda nela: cada torre se confere sozinha (a rota, a pressão, o PPCI, a compatibilização não
 * acusam a vizinha) e o kernel aplica cada lote num desenho de uma torre só. Os contadores de id (`seq`) ficam — os
 * comandos valem no desenho inteiro, e a junção (`juntarComOsPavimentos`) devolve o que ficou de fora.
 *
 * O que não tem pavimento (revisão do PR #587):
 *  - as UNIDADES de fora ficam, sem etiquetas — o número delas segue reservado (o segundo prédio pelo produto não
 *    recria o "101" da outra torre);
 *  - o que aponta para peças de fora (restrições, laços, placas, bombas, origens de grupo, referências da NBR 12721)
 *    sai pelas limpezas do próprio kernel, numa cópia — a vista nasce válida;
 *  - na junção, essas famílias voltam como estavam no desenho, mais o que a torre gerada criou.
 */
import {
  limparCondensadorasOrfas,
  limparEtiquetasOrfasDasUnidades,
  limparLacosOrfos,
  limparOrigensOrfasDosGrupos,
  limparPlacasOrfas,
  limparReferenciasNbr12721,
  limparRestricoesOrfas,
  type BlueprintModel,
  type ObjectId,
} from '../blueprintKernel';
import { limparBombasOrfas } from '../blueprintKernel/model';

/** As famílias com pavimento (cada peça tem `levelId`) — as outras são as "sem pavimento". */
const temPavimento = (v: unknown[]) => v.some((x) => x && typeof x === 'object' && 'levelId' in (x as object));
/** Tratadas à parte: os pavimentos, as aberturas (pela parede) e os circuitos (pelo quadro). */
const A_PARTE = new Set(['levels', 'openings', 'circuitos']);

export function semOsPavimentos(m: BlueprintModel, deFora: ReadonlySet<ObjectId>): BlueprintModel {
  if (!deFora.size) return m;
  const saida: Record<string, unknown> = { ...m };
  for (const [k, v] of Object.entries(m)) {
    if (A_PARTE.has(k) || !Array.isArray(v) || !v.length) continue;
    if (temPavimento(v)) saida[k] = v.filter((x) => !deFora.has((x as { levelId?: ObjectId }).levelId ?? ''));
    // Sem pavimento: cópias rasas — as limpezas do kernel mexem nas peças.
    else saida[k] = v.map((x) => (x && typeof x === 'object' ? { ...(x as object) } : x));
  }
  const paredes = new Set((saida.walls as BlueprintModel['walls']).map((w) => w.id));
  saida.openings = m.openings.filter((o) => paredes.has(o.wallId));
  const quadros = new Set(((saida.quadros as BlueprintModel['quadros']) ?? []).map((q) => q.id));
  saida.circuitos = (m.circuitos ?? []).filter((c) => quadros.has(c.quadroId));
  saida.unidades = (m.unidades ?? []).map((u) => ({ ...u, etiquetaUids: [...u.etiquetaUids], ...(u.acessorios ? { acessorios: u.acessorios.map((a) => ({ ...a })) } : {}) }));
  saida.levels = m.levels.filter((l) => !deFora.has(l.id));
  const v = saida as unknown as BlueprintModel;
  limparEtiquetasOrfasDasUnidades(v);
  limparReferenciasNbr12721(v);
  limparRestricoesOrfas(v);
  limparLacosOrfos(v);
  limparPlacasOrfas(v);
  limparBombasOrfas(v);
  limparCondensadorasOrfas(v);
  limparOrigensOrfasDosGrupos(v);
  return v;
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
  const chaves = new Set([...Object.keys(desenho), ...Object.keys(daVista)]);
  for (const k of chaves) {
    if (A_PARTE.has(k)) continue;
    const doDesenho = (desenho as unknown as Record<string, unknown>)[k];
    const daV = (daVista as unknown as Record<string, unknown>)[k];
    if (!Array.isArray(doDesenho) || !doDesenho.length) continue;
    if (temPavimento(doDesenho)) saida[k] = [...((daV as unknown[]) ?? []), ...doDesenho.filter(fora)];
    else {
      // Sem pavimento: como estava no desenho (a limpeza da vista não vale para o desenho inteiro), mais o que a torre
      // gerada criou. Pelo id; sem id, o do desenho.
      const ids = new Set(doDesenho.map((x) => (x as { id?: string }).id).filter(Boolean));
      const novos = ((daV as unknown[]) ?? []).filter((x) => { const id = (x as { id?: string }).id; return id !== undefined && !ids.has(id); });
      saida[k] = [...doDesenho, ...novos];
    }
  }
  const paredesDeFora = new Set(desenho.walls.filter(fora).map((w) => w.id));
  saida.openings = [...daVista.openings, ...desenho.openings.filter((o) => paredesDeFora.has(o.wallId))];
  const quadrosDeFora = new Set((desenho.quadros ?? []).filter(fora).map((q) => q.id));
  saida.circuitos = [...(daVista.circuitos ?? []), ...(desenho.circuitos ?? []).filter((c) => quadrosDeFora.has(c.quadroId))];
  saida.levels = [...daVista.levels, ...desenho.levels.filter((l) => deFora.has(l.id))];
  return saida as unknown as BlueprintModel;
}
