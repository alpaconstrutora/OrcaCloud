/**
 * UNIDADES DO PRÉDIO (13/10/2026, Fase 3 do plano
 * `docs/planos/2026-10-13-areas-nbr12721-na-planta.md`).
 *
 * ─── O BURACO QUE ISTO FECHA ────────────────────────────────────────────────
 *
 * Só o pavimento TIPO tem `Unidade` no kernel. Os outros andares são cópias
 * vivas (`Level.tipoDeId`): paredes e etiquetas copiadas, nenhuma unidade. O
 * Quadro IV-B da NBR 12721 é por unidade do PRÉDIO — sem as unidades dos
 * andares copiados ele sai com um andar só.
 *
 * Aqui elas são DERIVADAS, nunca gravadas: uma unidade por cópia viva, com a
 * chave `"<uid da Unidade>:<uid do pavimento>"`. Gravar 44 unidades para um
 * prédio de 11 andares criaria 40 cópias que o usuário teria de manter em dia
 * a cada mudança no tipo — é exatamente o trabalho que a cópia viva existe
 * para não dar. Renomear a origem propaga; apagar a cópia some com as dela.
 *
 * ─── A MEDIDA É DA CÓPIA, NÃO DA ORIGEM ─────────────────────────────────────
 *
 * A cópia tem paredes e etiquetas próprias (`uidDaCopia`), então a unidade
 * derivada é MEDIDA no andar dela, com as derivadas vizinhas presentes — a
 * geminada sai geminada, não "comum". Por construção dá a mesma área da
 * origem; se não der, a cópia está fora de sincronia, e é melhor o número
 * mostrar isso do que esconder.
 */
import { uidDaCopia, type BlueprintModel, type ElementUid, type Level, type ObjectId, type Unidade } from './blueprintKernel';
import { compararNumeros, medirUnidade, type MedidaDaUnidade } from './blueprintUnidades';
import { ordinalDoPavimento } from './blueprintZonaUrbanistica';

/**
 * Como numerar a unidade do andar copiado:
 * - `ANDAR_E_POSICAO` (padrão, a mesma regra do envio ao Empreendimento):
 *   "101" no 1º andar vira "501" no 5º; "T01" é o térreo. Número que não segue
 *   o padrão cai em `PAVIMENTO_E_NUMERO`, com aviso.
 * - `PAVIMENTO_E_NUMERO`: "5º pavimento · Apto A".
 */
export type RegraDeNumeracao = 'ANDAR_E_POSICAO' | 'PAVIMENTO_E_NUMERO';

export interface HipotesesDeNumeracao {
  regra: RegraDeNumeracao;
}

export const HIPOTESES_DE_NUMERACAO_PADRAO: HipotesesDeNumeracao = { regra: 'ANDAR_E_POSICAO' };

export interface UnidadeDoPredio {
  /** Identidade estável: o uid da Unidade (origem) ou `"<uid da origem>:<uid do pavimento>"` (derivada). */
  chave: string;
  /** A `Unidade` do kernel de onde vem. */
  origem: Unidade;
  derivada: boolean;
  /** O pavimento da cópia (derivada) — `null` na origem, que pode atravessar pavimentos. */
  levelId: ObjectId | null;
  numero: string;
  tipologia: string | null;
  pcd: boolean;
  /** Etiquetas DESTE andar (na derivada, as cópias das etiquetas da origem). */
  etiquetaUids: ElementUid[];
  /** Ambientes declarados da unidade — os da origem (declarado não tem cópia). */
  declaradoUids: ElementUid[];
  medida: MedidaDaUnidade;
}

export interface UnidadesDoPredio {
  unidades: UnidadeDoPredio[];
  avisos: string[];
}

/** "T" no térreo e abaixo; senão o número do andar (ordinal − 1). */
const prefixoDoAndar = (ordinal: number) => (ordinal - 1 <= 0 ? 'T' : String(ordinal - 1));

/**
 * O número da unidade no andar copiado. `null` quando o número da origem não
 * segue "andar + posição" (o chamador cai na regra do pavimento, com aviso).
 */
export function numeroNoAndar(numeroDaOrigem: string, ordinalDaOrigem: number, ordinalDaCopia: number): string | null {
  const p = prefixoDoAndar(ordinalDaOrigem);
  if (!numeroDaOrigem.startsWith(p)) return null;
  const posicao = numeroDaOrigem.slice(p.length);
  if (!/^\d{2,}$/.test(posicao)) return null;
  return `${prefixoDoAndar(ordinalDaCopia)}${posicao}`;
}

/** Os pavimentos em que a unidade tem ambiente (desenhado ou declarado). */
function pavimentosDaUnidade(model: BlueprintModel, u: Unidade): Set<ObjectId> {
  const etiquetas = new Set(u.etiquetaUids);
  const niveis = new Set<ObjectId>();
  for (const l of model.labels ?? []) if (etiquetas.has(l.uid)) niveis.add(l.levelId);
  for (const a of model.ambientesDeclarados ?? []) if (a.unidadeUid === u.uid) niveis.add(a.levelId);
  return niveis;
}

export function unidadesDoPredio(model: BlueprintModel, hip: HipotesesDeNumeracao = HIPOTESES_DE_NUMERACAO_PADRAO): UnidadesDoPredio {
  const avisos: string[] = [];
  const unidades = model.unidades ?? [];
  const declaradosDe = (u: Unidade) => (model.ambientesDeclarados ?? []).filter((a) => a.unidadeUid === u.uid).map((a) => a.uid);
  const etiquetaPorUid = new Set((model.labels ?? []).map((l) => l.uid));

  const origens: UnidadeDoPredio[] = unidades.map((u) => ({
    chave: u.uid,
    origem: u,
    derivada: false,
    levelId: null,
    numero: u.numero,
    tipologia: u.tipologia ?? null,
    pcd: u.pcd,
    etiquetaUids: [...u.etiquetaUids],
    declaradoUids: declaradosDe(u),
    medida: medirUnidade(model, u),
  }));

  // As cópias de cada pavimento tipo, de baixo para cima.
  const copiasDe = new Map<ObjectId, Level[]>();
  for (const l of model.levels) {
    if (l.tipoDeId === undefined) continue;
    copiasDe.set(l.tipoDeId, [...(copiasDe.get(l.tipoDeId) ?? []), l]);
  }
  for (const lista of copiasDe.values()) lista.sort((a, b) => a.elevationMm - b.elevationMm);

  // Quem vira derivada: a unidade INTEIRA num pavimento que tem cópia.
  const porCopia = new Map<ObjectId, { origem: Unidade; tipo: Level }[]>();
  for (const u of unidades) {
    const niveis = pavimentosDaUnidade(model, u);
    const comCopia = [...niveis].filter((id) => copiasDe.has(id));
    if (comCopia.length === 0) continue;
    if (niveis.size > 1) {
      avisos.push(`Unidade ${u.numero} atravessa pavimentos e um deles é tipo com cópias: não foi replicada nos andares copiados — desenhe-a no andar ou mantenha-a num pavimento só.`);
      continue;
    }
    const tipo = model.levels.find((l) => l.id === comCopia[0])!;
    for (const copia of copiasDe.get(tipo.id)!) porCopia.set(copia.id, [...(porCopia.get(copia.id) ?? []), { origem: u, tipo }]);
  }

  const derivadas: UnidadeDoPredio[] = [];
  for (const copia of model.levels.filter((l) => porCopia.has(l.id))) {
    const daCopia = porCopia.get(copia.id)!.map(({ origem, tipo }) => {
      const etiquetaUids = origem.etiquetaUids.map((uid) => uidDaCopia(copia.uid, uid));
      const faltando = etiquetaUids.filter((uid) => !etiquetaPorUid.has(uid)).length;
      if (faltando) avisos.push(`${copia.name}: ${faltando} ambiente(s) da unidade ${origem.numero} não têm cópia — o andar está fora de sincronia com o tipo.`);
      let numero = hip.regra === 'ANDAR_E_POSICAO'
        ? numeroNoAndar(origem.numero, ordinalDoPavimento(model.levels, tipo.id), ordinalDoPavimento(model.levels, copia.id))
        : null;
      if (numero === null) {
        if (hip.regra === 'ANDAR_E_POSICAO') avisos.push(`Unidade ${origem.numero}: o número não segue "andar + posição" (como 101, T01); no ${copia.name} ela foi numerada pelo pavimento.`);
        numero = `${copia.name} · ${origem.numero}`;
      }
      const virtual: Unidade = { id: `${origem.id}@${copia.id}`, uid: `${origem.uid}:${copia.uid}`, numero, tipologia: origem.tipologia ?? null, pcd: origem.pcd, etiquetaUids };
      return { origem, virtual };
    });
    // Mede com as derivadas DESTE andar presentes: a geminada sai geminada.
    const comVizinhas: BlueprintModel = { ...model, unidades: [...unidades, ...daCopia.map((d) => d.virtual)] };
    for (const { origem, virtual } of daCopia) {
      derivadas.push({
        chave: virtual.uid,
        origem,
        derivada: true,
        levelId: copia.id,
        numero: virtual.numero,
        tipologia: virtual.tipologia ?? null,
        pcd: virtual.pcd,
        etiquetaUids: virtual.etiquetaUids,
        declaradoUids: declaradosDe(origem),
        medida: medirUnidade(comVizinhas, virtual),
      });
    }
  }

  const todas = [...origens, ...derivadas].sort((a, b) => compararNumeros(a.numero, b.numero));
  const vistos = new Map<string, number>();
  for (const u of todas) vistos.set(u.numero, (vistos.get(u.numero) ?? 0) + 1);
  const repetidos = [...vistos].filter(([, n]) => n > 1).map(([numero]) => numero);
  if (repetidos.length) avisos.push(`Número repetido entre as unidades do prédio: ${repetidos.join(', ')} — renumere a origem ou troque a regra de numeração.`);
  return { unidades: todas, avisos };
}
