// services/sync/massaAdapter.ts
//
// Normaliza o ESTUDO DE MASSA (Planta Inteligente, fase M3) para o lado
// canônico do motor de sync — a quarta aresta do Empreendimento.
//
// Cardinalidade: 1 BLOCO com unidades = 1 torre; cada unidade do produto
// distribuído (bloco × pavimento × posição) = 1 unidade. Bloco de garagem não
// vira torre (não tem unidade; as vagas vão como hipótese do produto).
//
// ⚠️ Fontes, e por que estas:
//   - os BLOCOS vêm do SNAPSHOT PUBLICADO, como no loteamento: o rascunho muda a
//     cada gesto, e o espelho de vendas não pode mudar debaixo do corretor.
//   - o PRODUTO vem de `blueprint_study_produto` (a linha atual): é intenção do
//     estudo, fora do payload. A M4 o congela junto da versão publicada.
//   - o CUB, de `cub_parametric_data` (mês mais recente da UF do produto).
//
// ⚠️ A unidade da massa NÃO existe no desenho: a chave é texto determinístico
// "<uid do bloco>:<ordinal do pavimento>:<posição>". Mudar o mix renumera — o
// motor reporta as que sumiram como órfãs e NUNCA apaga (regra do motor).

import { supabase } from '../../lib/supabase';
import { getSnapshot, listSnapshots } from '../blueprintService';
import { blueprintProdutoService } from '../blueprintProdutoService';
import { cubDoPadrao, type CubDoPadrao } from '../cubService';
import { Empreendimento, EmpreendimentoUnitInsert, FloorTipo, UnitStatus } from '../../types/empreendimento';
import { modelFromCanonicalPayload, parseCanonicalPayload, type BlueprintModel } from '../../utils/blueprintKernel';
import { divisasDoLote, medirTerreno, RECUOS_ZERO } from '../../utils/blueprintTerreno';
import { medirMassa, ZONA_DA_MASSA_VAZIA } from '../../utils/blueprintMassa';
import { distribuirProduto, produtoDaColuna, type Produto } from '../../utils/blueprintProduto';
import { financeiroDaMassa } from '../../utils/blueprintFinanceiroMassa';
import { CanonicalSide, CanonicalTower, CanonicalUnit } from './types';

const r2 = (v: number): number => Math.round(v * 100) / 100;

/** "301", "1202"; o 1º pavimento acima do solo é o térreo: "T01". */
export function nomeDaUnidadeDaMassa(ordinal: number, posicao: number): string {
  const andar = ordinal - 1;
  const pos = String(posicao).padStart(2, '0');
  return andar <= 0 ? `T${pos}` : `${andar}${pos}`;
}

/**
 * O lado canônico a partir do modelo e do produto — PURO (o que o teste exercita).
 * `cub` só alimenta o custo/m² da torre; sem ele o campo vai nulo e não entra no diff.
 */
export function ladoDaMassa(empreendimento: Empreendimento, model: BlueprintModel, produto: Produto, cub: CubDoPadrao | null): CanonicalSide {
  const warnings: string[] = [];
  const terreno = medirTerreno(divisasDoLote(model.boundaries));
  // Zona vazia de propósito: o que o cadastro recebe é a ESTRUTURA (pavimentos e
  // unidades), e ela não depende da lei — a conferência legal é da tela da massa.
  const massa = medirMassa(model, { terreno, limites: model.boundaries, recuosBase: RECUOS_ZERO, zona: ZONA_DA_MASSA_VAZIA });
  const dist = distribuirProduto(model, massa, produto, null);
  const fin = financeiroDaMassa(massa, produto, dist, cub);
  const tipologias = new Map(produto.tipologias.map((t) => [t.id, t]));

  if ((model.blocos ?? []).length === 0) warnings.push('A versão publicada não tem bloco de massa. Desenhe os blocos (Terreno › Massa) e publique.');
  if (produto.tipologias.length === 0) warnings.push('O estudo não tem produto: defina as tipologias na gaveta Produto antes de enviar.');

  const towers: CanonicalTower[] = [];
  const liveUnitSourceIds = new Set<string>();
  const liveTowerSourceIds = new Set<string>();

  for (const pb of dist.blocos) {
    const b = (model.blocos ?? []).find((x) => x.id === pb.blocoId);
    if (!b || pb.unidades === 0) continue;
    liveTowerSourceIds.add(b.uid);
    const medida = massa.blocos.find((m) => m.blocoId === b.id)!;
    const construidaAcima = medida.projecaoM2 * pb.pisos.length;
    const comumDoBloco = Math.max(0, construidaAcima - pb.privativaM2);
    const vgvDoBloco = pb.pisos.reduce((s, p) => s + Object.entries(p.porTipologia).reduce((ss, [id, q]) => ss + q * (tipologias.get(id)?.areaPrivativaM2 ?? 0) * (tipologias.get(id)?.precoM2 ?? 0), 0), 0);

    const units: CanonicalUnit[] = [];
    for (const p of pb.pisos) {
      const ordinal = p.ordinal ?? p.indice;
      let posicao = 0;
      for (const t of produto.tipologias) {
        const q = p.porTipologia[t.id] ?? 0;
        for (let k = 0; k < q; k++) {
          posicao++;
          const sourceId = `${b.uid}:${ordinal}:${posicao}`;
          liveUnitSourceIds.add(sourceId);
          const privativa = r2(t.areaPrivativaM2);
          // Rateio da área comum do bloco pela privativa — estimativa de massa;
          // o motor NBR 12721 do Empreendimento recalcula quando houver projeto.
          const comum = pb.privativaM2 > 0 ? r2((comumDoBloco * t.areaPrivativaM2) / pb.privativaM2) : 0;
          units.push({
            sourceId,
            fields: {
              name: nomeDaUnidadeDaMassa(ordinal, posicao),
              floor: ordinal - 1,
              typology: t.nome,
              private_area: privativa,
              common_area: comum,
              total_area: r2(privativa + comum),
              bedrooms: t.dormitorios,
            },
            createOnly: {
              blueprint_massa_chave: sourceId,
              floor_tipo: (ordinal <= 1 ? 'TERREO' : 'TIPO') as FloorTipo,
              is_vendavel: true,
              status: 'DISPONIVEL' as UnitStatus,
              // Preço-semente: área × preço/m² da tipologia. Depois é do Empreendimento.
              ...(t.precoM2 > 0 ? { price: r2(privativa * t.precoM2) } : {}),
            } satisfies Partial<EmpreendimentoUnitInsert> as Record<string, unknown>,
          });
        }
      }
    }

    towers.push({
      sourceId: b.uid,
      // O bloco TEM nome que o usuário reconhece ("Torre A"): adoção por nome
      // evita a torre-fantasma quando ela já foi criada à mão no cadastro.
      matchName: b.nome,
      fields: {
        floors_count: pb.pisos.length,
        units_per_floor: pb.unidadesPorPavimento,
        ...(fin.custoM2Base != null ? { construction_cost_sqm: fin.custoM2Base } : {}),
        ...(pb.privativaM2 > 0 && vgvDoBloco > 0 ? { sales_price_sqm: r2(vgvDoBloco / pb.privativaM2) } : {}),
      },
      createOnly: { blueprint_bloco_uid: b.uid, name: b.nome },
      units,
    });
  }
  for (const b of dist.blocos.filter((x) => x.uso === 'GARAGEM')) {
    warnings.push(`"${b.nome}" é garagem: não vira torre (${b.vagas} vaga(s) entram como hipótese do produto).`);
  }

  return { origin: 'massa', empreendimento, towers, commonAreaCandidates: [], liveTowerSourceIds, liveUnitSourceIds, warnings: warnings.concat(fin.avisos.filter((a) => /CUB|custo de obra/i.test(a))) };
}

export async function loadMassaSide(empreendimento: Empreendimento): Promise<CanonicalSide> {
  if (!empreendimento.blueprint_study_id) throw new Error('Este empreendimento não está vinculado a um estudo da Planta Inteligente.');
  const { data: study, error } = await supabase.from('blueprint_studies').select('id, organization_id').eq('id', empreendimento.blueprint_study_id).maybeSingle();
  if (error) throw new Error(`Falha ao carregar o estudo da Planta Inteligente: ${error.message}`);
  if (!study) throw new Error('Estudo da Planta Inteligente vinculado não foi encontrado.');
  // Blindagem multi-tenant, como nas outras arestas.
  if (study.organization_id !== empreendimento.organization_id) throw new Error('O estudo vinculado pertence a outra organização. Sincronização bloqueada.');

  const snapshots = await listSnapshots(empreendimento.blueprint_study_id);
  if (snapshots.length === 0) {
    return { origin: 'massa', empreendimento, towers: [], commonAreaCandidates: [], liveTowerSourceIds: new Set(), liveUnitSourceIds: new Set(), warnings: ['O estudo ainda não tem versão publicada. Publique na Planta Inteligente — o rascunho não é enviado de propósito.'] };
  }
  const maisRecente = snapshots.reduce((a, b) => (b.revision > a.revision ? b : a));
  const snapshot = await getSnapshot(maisRecente.id);
  if (!snapshot) throw new Error('A versão publicada do estudo não pôde ser carregada.');
  let model: BlueprintModel;
  try {
    model = modelFromCanonicalPayload(parseCanonicalPayload(snapshot.payload as string));
  } catch (e) {
    throw new Error(`A versão publicada não pôde ser lida: ${e instanceof Error ? e.message : String(e)}`);
  }
  const row = await blueprintProdutoService.get(empreendimento.blueprint_study_id);
  const produto = produtoDaColuna(row?.produto ?? null);
  const cub = produto.financeiro.custoM2Manual ? null : await cubDoPadrao(produto.financeiro.uf, produto.padrao).catch(() => null);
  return ladoDaMassa(empreendimento, model, produto, cub);
}
