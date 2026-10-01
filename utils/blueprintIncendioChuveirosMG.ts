/**
 * D1.2 (plano `2026-10-01-incendio-backlog-pos-roadmap.md`) — CHUVEIROS AUTOMÁTICOS PELA IT 18 DO CBMMG.
 *
 * A IT 18 (1ª ed.) ADOTA a NBR 10897 para a classificação do risco, a área de operação, as tabelas
 * e os demais parâmetros técnicos (2.2 e 5.2) — esses seguem a NBR (que não está entre os textos
 * fornecidos: continuam CONFERIR NA NBR 10897). O que a IT 18 acrescenta e o desenho avalia:
 *  - 5.11: hidrantes junto com chuveiros — as reservas SE SOMAM (`calculoDeIncendio`);
 *  - 5.13: hidrantes e mangotinhos ligados ANTES da válvula de governo e alarme, para operarem
 *    com os chuveiros em manutenção (mangotinho depois dela só se proteger outra área);
 *  - 5.12: o recalque dos chuveiros com duas entradas de 63 mm, na fachada a 0,60–1,00 m do piso
 *    (5.12.1) ou, se tecnicamente impossível, numa caixa de alvenaria (5.12.2);
 *  - 5.9: com estoque, 456 mm livres do defletor ao topo (916 mm nos chuveiros especiais).
 * Transcrição dos itens usados: `docs/normas/incendio-mg/it18-itens.txt`.
 */
import type { BlueprintModel, ObjectId } from './blueprintKernel';
import { redeDeIncendio } from './blueprintCalculoIncendio';
import type { ItemDaConferencia } from './blueprintConferenciaIncendio';

export const FONTE_IT18_MG = 'IT 18 do CBMMG (1ª ed.)';
/** 5.9: distância livre mínima do defletor ao topo do estoque, mm. */
export const DEFLETOR_AO_ESTOQUE_MM = { standard: 456, especial: 916 } as const;
/** 5.12.1: a tomada de recalque dos chuveiros na fachada ou no muro, entre 0,60 e 1,00 m do piso. */
export const ALTURA_DO_RECALQUE_DOS_CHUVEIROS_MM = { min: 600, max: 1000 } as const;

const COMBATE = new Set(['HIDRANTE_SIMPLES', 'HIDRANTE_DUPLO', 'MANGOTINHO']);

/**
 * 5.13: os hidrantes e mangotinhos que a água só alcança PASSANDO por uma VGA — a busca parte da
 * fonte e não atravessa o nó de nenhuma VGA. `null` = sem VGA ou sem fonte (nada a avaliar).
 */
export function combateDepoisDaVga(model: BlueprintModel): { hidrantes: ObjectId[]; mangotinhos: ObjectId[] } | null {
  const rede = redeDeIncendio(model);
  const terminais = model.terminais ?? [];
  const nosDaVga = new Set(terminais.filter((t) => t.tipoHidraulico === 'VGA' && rede.noDoTerminal.has(t.id)).map((t) => rede.noDoTerminal.get(t.id)!));
  if (!nosDaVga.size || !rede.noDaFonte) return null;
  const vizinhos = new Map<string, string[]>();
  for (const t of rede.tubos) {
    vizinhos.set(t.de, [...(vizinhos.get(t.de) ?? []), t.para]);
    vizinhos.set(t.para, [...(vizinhos.get(t.para) ?? []), t.de]);
  }
  const alcancados = new Set([rede.noDaFonte]);
  const fila = [rede.noDaFonte];
  while (fila.length) {
    const u = fila.shift()!;
    for (const v of vizinhos.get(u) ?? []) {
      if (alcancados.has(v) || nosDaVga.has(v)) continue;
      alcancados.add(v);
      fila.push(v);
    }
  }
  const depois = terminais.filter((t) => t.tipoHidraulico && COMBATE.has(t.tipoHidraulico) && rede.noDoTerminal.has(t.id) && !alcancados.has(rede.noDoTerminal.get(t.id)!));
  return { hidrantes: depois.filter((t) => t.tipoHidraulico !== 'MANGOTINHO').map((t) => t.id), mangotinhos: depois.filter((t) => t.tipoHidraulico === 'MANGOTINHO').map((t) => t.id) };
}

/** Os itens da IT 18 para a conferência da rede — só quando há chuveiros no desenho. */
export function itensDaIT18(model: BlueprintModel): ItemDaConferencia[] {
  const ts = model.terminais ?? [];
  if (!ts.some((t) => t.tipoHidraulico === 'SPRINKLER')) return [];
  const itens: ItemDaConferencia[] = [];
  const d = combateDepoisDaVga(model);
  if (d) {
    itens.push({
      grupo: 'CBMMG',
      item: 'Hidrantes ligados antes da válvula de governo e alarme',
      exigido: `${FONTE_IT18_MG}, 5.13 — operam com os chuveiros em manutenção`,
      obtido: d.hidrantes.length
        ? `${d.hidrantes.length} hidrante(s) depois da VGA`
        : d.mangotinhos.length
          ? `${d.mangotinhos.length} mangotinho(s) depois da VGA — admitido se protegem área diferente da dos chuveiros`
          : 'todos antes da VGA',
      estado: d.hidrantes.length ? 'FALTA' : d.mangotinhos.length ? 'NAO_AVALIADO' : 'ATENDE',
      alvos: d.hidrantes.length ? d.hidrantes : d.mangotinhos,
    });
  }
  const recalques = ts.filter((t) => t.tipoHidraulico === 'HIDRANTE_RECALQUE');
  if (recalques.length) {
    const naFachada = recalques.filter((t) => t.cotaMm >= ALTURA_DO_RECALQUE_DOS_CHUVEIROS_MM.min && t.cotaMm <= ALTURA_DO_RECALQUE_DOS_CHUVEIROS_MM.max);
    const naCaixa = recalques.filter((t) => t.cotaMm < 0);
    itens.push({
      grupo: 'CBMMG',
      item: 'Recalque dos chuveiros (duas entradas de 63 mm)',
      exigido: `${FONTE_IT18_MG}, 5.12 — na fachada ou muro a 0,60–1,00 m do piso; em caixa de alvenaria se a fachada for tecnicamente impossível`,
      obtido: naFachada.length
        ? 'na fachada, na altura'
        : naCaixa.length
          ? 'em caixa no passeio — vale se a fachada for impossível (5.12.2); hidrantes externos de fácil acesso na rede comum podem substituí-lo (5.12.4)'
          : `a ${recalques.map((t) => (t.cotaMm / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })).join(', ')} m do piso`,
      estado: naFachada.length ? 'ATENDE' : naCaixa.length ? 'NAO_AVALIADO' : 'FALTA',
      alvos: naFachada.length ? [] : recalques.map((t) => t.id),
    });
  }
  return itens;
}
