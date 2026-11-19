/**
 * O RELATÓRIO DO LOTE (PE8d do prédio pelo Empreendimento, decisão do usuário de 19/11/2026: "numa tela do lote"). As
 * prévias de cada torre têm o relatório delas, mas ele some no Lançar; este é calculado do DESENHO — vale com as torres
 * já lançadas no estudo, e junta o que é do lote:
 *  - por torre: os pavimentos, as unidades, o quadro geral (a demanda e de onde ele é alimentado) e a compatibilização
 *    (na vista da torre, sem a vizinha);
 *  - do lote: as entradas de cada rede (uma ligação de esgoto, uma pluvial, um cavalete, uma entrada de serviço), a
 *    demanda da entrada, as janelas que sobraram em parede comum, as pontas abertas das redes.
 */
import { conexoesDerivadas, type Bloco, type BlueprintModel, type ObjectId } from '../blueprintKernel';
import { garagemLancada } from '../blueprintGaragemDaMassa';
import { pavimentoTipoMontado, pavimentosDoPredioDoBloco } from '../blueprintPavimentoTipoDaMassa';
import { unidadesDoPredio } from '../blueprintUnidadesDoPredio';
import { compatibilizarPredio } from './compatibilizacao';
import { HIPOTESES_PADRAO as HIPOTESES_ELETRICAS_PADRAO, preDimensionarQuadroCompleto } from '../blueprintEletricaDimensionamento';
import { entradaConjunta } from './eletrica';
import { subsoloDaTorre } from './garagem';
import { uidDaCobertura } from './terreoECobertura';
import { semOsPavimentos } from './vistaDaTorre';

export interface TorreDoRelatorio {
  nome: string;
  pavimentos: number;
  unidades: number;
  /** O QGBT da torre: a demanda na entrada dele (com os filhos) e a torre de onde ele é alimentado (`null` = a entrada). */
  quadroGeral: { demandaKva: number | null; alimentadoDe: string | null } | null;
  conflitos: number;
  encostos: number;
}

export interface RelatorioDoLote {
  torres: TorreDoRelatorio[];
  entradas: { esgoto: number; pluvial: number; agua: number; energia: number };
  /** A demanda da entrada do lote (o QGBT que não é alimentado por outro). */
  demandaDoLoteKva: number | null;
  janelasNaParedeComum: number;
  pontasAbertas: number;
  avisos: string[];
}

const dSeg = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) => {
  const L2 = (r.x - q.x) ** 2 + (r.y - q.y) ** 2;
  const t = L2 ? Math.max(0, Math.min(1, ((p.x - q.x) * (r.x - q.x) + (p.y - q.y) * (r.y - q.y)) / L2)) : 0;
  return Math.hypot(p.x - (q.x + (r.x - q.x) * t), p.y - (q.y + (r.y - q.y) * t));
};

/** Os pavimentos do prédio do bloco: o tipo, as cópias, o térreo, a cobertura e a garagem lançada embaixo dele. */
function pavimentosDaTorre(m: BlueprintModel, b: Bloco): Set<ObjectId> {
  const ids = new Set(pavimentosDoPredioDoBloco(m, b));
  const cob = m.levels.find((l) => l.uid === uidDaCobertura(b));
  if (cob) ids.add(cob.id);
  const g = subsoloDaTorre(m, b);
  if (g) for (const l of garagemLancada(m, g)) ids.add(l.id);
  return ids;
}

function demandaDoQuadroKva(m: BlueprintModel, quadroId: ObjectId): number | null {
  const r = preDimensionarQuadroCompleto(m, quadroId, HIPOTESES_ELETRICAS_PADRAO) as { sDemandadaVA?: number } | null;
  return r?.sDemandadaVA != null ? Math.round(r.sDemandadaVA / 100) / 10 : null;
}

export function relatorioDoLote(m: BlueprintModel): RelatorioDoLote {
  const torresDoDesenho = (m.blocos ?? []).filter((b) => b.uso !== 'GARAGEM' && pavimentoTipoMontado(m, b));
  const daTorre = new Map(torresDoDesenho.map((b) => [b.id, pavimentosDaTorre(m, b)]));
  const torreDoPavimento = (levelId: ObjectId) => torresDoDesenho.find((b) => daTorre.get(b.id)!.has(levelId))?.nome ?? null;
  const todos = new Set([...daTorre.values()].flatMap((s) => [...s]));
  const unidades = unidadesDoPredio(m).unidades;
  const qgbts = (m.quadros ?? []).filter((q) => q.tipo === 'QGBT');

  const torres: TorreDoRelatorio[] = torresDoDesenho.map((b) => {
    const meus = daTorre.get(b.id)!;
    const deFora = new Set([...todos].filter((id) => !meus.has(id)));
    const compat = compatibilizarPredio(semOsPavimentos(m, deFora));
    const q = qgbts.find((x) => meus.has(x.levelId));
    const pai = q?.quadroPaiId ? (m.quadros ?? []).find((x) => x.id === q.quadroPaiId) : null;
    return {
      nome: b.nome,
      pavimentos: [...meus].length,
      unidades: unidades.filter((u) => (u.levelId ? meus.has(u.levelId) : u.medida.levelIds.some((id) => meus.has(id)))).length,
      // Sem a entrada de serviço (a torre alimentada de outra), a demanda do pré-dimensionamento do quadro.
      quadroGeral: q ? { demandaKva: entradaConjunta(m, q.id)?.demandaKva ?? demandaDoQuadroKva(m, q.id), alimentadoDe: pai ? torreDoPavimento(pai.levelId) : null } : null,
      conflitos: Object.values(compat.conflitos).reduce((s, n) => s + n, 0),
      encostos: compat.encostos,
    };
  });

  const t = m.terminais ?? [];
  const entradas = {
    esgoto: t.filter((x) => x.tipoHidraulico === 'LIGACAO_ESGOTO').length,
    pluvial: t.filter((x) => x.tipoHidraulico === 'LIGACAO_PLUVIAL').length,
    agua: t.filter((x) => x.tipoHidraulico === 'HIDROMETRO' && x.disciplina === 'AGUA_FRIA' && !x.unidadeId).length,
    energia: t.filter((x) => x.tipoEletrico === 'ENTRADA_SERVICO').length,
  };
  const raiz = qgbts.find((q) => !q.quadroPaiId);
  const demandaDoLoteKva = raiz ? entradaConjunta(m, raiz.id)?.demandaKva ?? null : null;

  // As janelas em parede comum: o centro dela a menos de 40 cm do contorno de OUTRA torre, num andar que ela cobre.
  let janelasNaParedeComum = 0;
  for (const o of m.openings) {
    if (o.kind === 'door') continue;
    const w = m.walls.find((x) => x.id === o.wallId);
    const minha = w ? torresDoDesenho.find((b) => daTorre.get(b.id)!.has(w.levelId)) : undefined;
    if (!w || !minha) continue;
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
    const k = (o.offsetMm + o.widthMm / 2) / L;
    const c = { x: w.a.x + (w.b.x - w.a.x) * k, y: w.a.y + (w.b.y - w.a.y) * k };
    const z = m.levels.find((l) => l.id === w.levelId)?.elevationMm ?? 0;
    const outra = torresDoDesenho.find((b) => {
      if (b.id === minha.id || !b.pontos.some((q, i) => dSeg(c, q, b.pontos[(i + 1) % b.pontos.length]) < 400)) return false;
      const zs = [...daTorre.get(b.id)!].map((id) => m.levels.find((l) => l.id === id)!);
      return zs.some((l) => l.elevationMm <= z && z < l.elevationMm + l.defaultHeightMm);
    });
    if (outra) janelasNaParedeComum++;
  }

  const pontasAbertas = conexoesDerivadas(m).pontasAbertas.filter((p) => ['ESGOTO', 'PLUVIAL', 'AGUA_FRIA'].includes(p.disciplina)).length;

  const avisos: string[] = [];
  const nomes = { esgoto: 'ligações de esgoto', pluvial: 'ligações pluviais', agua: 'cavaletes de água', energia: 'entradas de serviço de energia' } as const;
  for (const [k, n] of Object.entries(entradas) as [keyof typeof entradas, number][]) if (torresDoDesenho.length > 1 && n > 1) avisos.push(`${n} ${nomes[k]} no lote — o lote deve ter uma; gere de novo a torre mais recente para ela usar a da outra.`);
  if (janelasNaParedeComum) avisos.push(`${janelasNaParedeComum} janela(s) em parede comum entre torres — feche-as ou confira a ventilação e a luz.`);
  return { torres, entradas, demandaDoLoteKva, janelasNaParedeComum, pontasAbertas, avisos };
}
