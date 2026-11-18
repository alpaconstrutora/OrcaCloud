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
//   - o PRODUTO vem do congelado NA VERSÃO publicada (`blueprint_snapshot_produto`,
//     M4); versão anterior à M4 cai na linha viva `blueprint_study_produto`, avisando.
//   - o CUB, de `cub_parametric_data` (mês mais recente da UF do produto).
//
// ⚠️ A unidade da massa NÃO existe no desenho: a chave é texto determinístico
// "<uid do bloco>:<ordinal do pavimento>:<posição>". Mudar o mix renumera — o
// motor reporta as que sumiram como órfãs e NUNCA apaga (regra do motor).
//
// PA10c do prédio automático (16/11/2026, decisão do usuário: "unidades do prédio"):
// quando o bloco tem o pavimento tipo MONTADO com unidades (o prédio automático
// lançado, ou o tipo montado à mão com as plantas), o envio manda as unidades DA
// PLANTA — os andares que têm unidade, o número (101, 201…), a tipologia e a área
// privativa medida — em vez da estimativa pela área. A estimativa punha unidade no
// térreo de uso comum e contava 6 por andar onde a divisão real coube 5 (R8: 47 ×
// 35). A chave segue "<bloco>:<ordinal>:<posição>" (a posição sai do número), então
// a unidade que existe nos dois casa com a já enviada; a que só a estimativa tinha
// vira órfã.

import { supabase } from '../../lib/supabase';
import { getSnapshot, listSnapshots } from '../blueprintService';
import { blueprintProdutoService } from '../blueprintProdutoService';
import { blueprintSnapshotProdutoService } from '../blueprintSnapshotProdutoService';
import { cubDoPadrao, type CubDoPadrao } from '../cubService';
import { Empreendimento, EmpreendimentoUnitInsert, FloorTipo, UnitStatus } from '../../types/empreendimento';
import type { BlueprintModel } from '../../utils/blueprintKernel';
import { divisasDoLote, medirTerreno, RECUOS_ZERO } from '../../utils/blueprintTerreno';
import { medirMassa, ZONA_DA_MASSA_VAZIA } from '../../utils/blueprintMassa';
import { distribuirProduto, produtoDaColuna, type Produto } from '../../utils/blueprintProduto';
import { financeiroDaMassa } from '../../utils/blueprintFinanceiroMassa';
import { modeloDoPayloadPublicado } from './modeloPublicado';
import { direcaoDaRua, nomeDaUnidadeDaMassa as nomeDaUnidade, ordinalDoTipo, pavimentoTipoMontado, pavimentosDoPredioDoBloco, type UnidadeDoPavimento } from '../../utils/blueprintPavimentoTipoDaMassa';
import { andarDoPavimento, prefixoPeloAndar, unidadesDoPredio, type UnidadeDoPredio } from '../../utils/blueprintUnidadesDoPredio';
import { garagemLancada } from '../../utils/blueprintGaragemDaMassa';
import { dividirPavimentoDoBloco } from '../../utils/blueprintPavimentoOrtogonal';
import { CanonicalSide, CanonicalTower, CanonicalUnit } from './types';

const r2 = (v: number): number => Math.round(v * 100) / 100;

/** "301", "1202"; o 1º pavimento acima do solo é o térreo: "T01". A regra mora no pavimento tipo (M6a). */
export const nomeDaUnidadeDaMassa = nomeDaUnidade;

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
  if (produto.tipologias.length === 0) warnings.push('O estudo não tem produto: defina as tipologias na tela Produto (Terreno › Massa › Produto) antes de enviar.');

  const towers: CanonicalTower[] = [];
  // As unidades do prédio (origens e as dos andares copiados), lidas uma vez e só se algum bloco tem o tipo montado.
  let predio: ReturnType<typeof unidadesDoPredio> | undefined;
  const liveUnitSourceIds = new Set<string>();
  const liveTowerSourceIds = new Set<string>();

  for (const pb of dist.blocos) {
    const b = (model.blocos ?? []).find((x) => x.id === pb.blocoId);
    if (!b || pb.unidades === 0) continue;
    liveTowerSourceIds.add(b.uid);
    const medida = massa.blocos.find((m) => m.blocoId === b.id)!;
    // PA10c: o bloco com o tipo montado e unidades desenhadas manda as unidades da planta.
    const doPredio = unidadesDoBlocoLancado(model, b, () => (predio ??= unidadesDoPredio(model)));
    // Revisão do PR #584 (achado 1): a torre que começa abaixo da rua (a Torre B do Garden, do −2) tem mais pavimentos de
    // apartamento que os acima do solo — conta os pavimentos do prédio do bloco (o tipo, as cópias, o 0 desvinculado).
    const pisosDaTorre = doPredio.length ? Math.max(pb.pisos.length, pavimentosDoPredioDoBloco(model, b).size) : pb.pisos.length;
    const construidaAcima = medida.projecaoM2 * pisosDaTorre;
    const comumDoBloco = Math.max(0, construidaAcima - pb.privativaM2);
    // M6a: a divisão do pavimento tipo dá a POSIÇÃO e a ORIENTAÇÃO de cada unidade
    // (a de canto, a que olha para a rua, o sol da fachada). Vai como SEMENTE
    // (createOnly): o cadastro do Empreendimento pode corrigir depois.
    const ordTipo = ordinalDoTipo(model, b);
    const pisoTipo = pb.pisos.find((p) => (p.ordinal ?? p.indice) === ordTipo) ?? pb.pisos.find((p) => p.unidades === pb.unidadesPorPavimento);
    const divisao = pisoTipo
      ? dividirPavimentoDoBloco({ bloco: b, produto, porTipologia: pisoTipo.porTipologia, nucleoM2: pb.nucleo.m2, elevadores: pb.nucleo.elevadores, ordinalDoTipo: ordTipo, rotacaoNorteDeg: model.georreferencia?.rotacaoNorteDeg ?? null, direcaoDaRua: direcaoDaRua(model) })
      : null;
    const naPosicao = (posicao: number, tipologiaId: string): UnidadeDoPavimento | null => {
      if (!divisao?.ok) return null;
      const u = divisao.divisao.unidades.find((x) => x.posicao === posicao);
      return u && u.tipologiaId === tipologiaId ? u : null;
    };
    if (doPredio.length) {
      const torre = torreDoPredio(b, pisosDaTorre, construidaAcima, doPredio, produto, model, naPosicao, fin.custoM2Base);
      for (const u of torre.units) liveUnitSourceIds.add(u.sourceId);
      towers.push(torre);
      const estimadas = pb.pisos.reduce((s, p) => s + p.unidades, 0);
      if (estimadas !== doPredio.length) warnings.push(`"${b.nome}": vão as ${doPredio.length} unidade(s) desenhadas no prédio (a estimativa da massa daria ${estimadas}).`);
      continue;
    }

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
          const lugar = naPosicao(posicao, t.id);
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
              ...(lugar ? { sun_orientation: lugar.solCardinal } : {}),
              ...(lugar?.posicaoNoLote ? { position_type: lugar.posicaoNoLote } : {}),
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
    // PA10c: a garagem lançada (o subsolo do prédio automático) diz as vagas desenhadas, não a estimativa.
    const bloco = (model.blocos ?? []).find((x) => x.id === b.blocoId);
    const pisos = new Set(bloco ? garagemLancada(model, bloco).map((l) => l.id) : []);
    const desenhadas = (model.vagas ?? []).filter((v) => pisos.has(v.levelId)).length;
    warnings.push(
      pisos.size
        ? `"${b.nome}" é garagem: não vira torre (${desenhadas} vaga(s) desenhadas na garagem lançada; a estimativa da massa daria ${b.vagas}).`
        : `"${b.nome}" é garagem: não vira torre (${b.vagas} vaga(s) entram como hipótese do produto).`,
    );
  }

  return { origin: 'massa', empreendimento, towers, commonAreaCandidates: [], liveTowerSourceIds, liveUnitSourceIds, warnings: warnings.concat(fin.avisos.filter((a) => /CUB|custo de obra/i.test(a))) };
}

/** As unidades desenhadas do bloco: as do pavimento tipo montado dele e as dos andares copiados desse tipo. */
function unidadesDoBlocoLancado(model: BlueprintModel, b: { uid: string }, todas: () => ReturnType<typeof unidadesDoPredio>): UnidadeDoPredio[] {
  const tipo = pavimentoTipoMontado(model, b);
  if (!tipo || !(model.unidades ?? []).some((u) => u.etiquetaUids.length)) return [];
  // PE6d: também as do andar 0 desvinculado (o 002/004 da Torre A, o TR05… da Torre B do Garden).
  const doBloco = pavimentosDoPredioDoBloco(model, b);
  return todas().unidades.filter((u) => (u.levelId ? doBloco.has(u.levelId) : u.medida.levelIds.some((id) => doBloco.has(id))));
}

/**
 * A torre com as unidades da planta (PA10c). O pavimento da unidade dá o andar (`floor` = ordinal − 1); a posição sai do
 * número ("101" no 2º pavimento = posição 1), e a chave é a mesma da estimativa — "<bloco>:<ordinal>:<posição>". A área
 * comum do bloco (a construída acima do solo menos as privativas medidas) é rateada pela privativa, como na estimativa.
 */
function torreDoPredio(
  b: { uid: string; nome: string },
  pisos: number,
  construidaAcimaM2: number,
  unidades: UnidadeDoPredio[],
  produto: Produto,
  model: BlueprintModel,
  naPosicao: (posicao: number, tipologiaId: string) => UnidadeDoPavimento | null,
  custoM2Base: number | null,
): CanonicalTower {
  const porNome = new Map(produto.tipologias.map((t) => [t.nome, t]));
  const tipoId = pavimentoTipoMontado(model, b)?.id ?? null;
  const linhas = unidades.map((u) => {
    const levelId = u.levelId ?? u.medida.levelIds[0] ?? null;
    // PE6d: o andar abaixo do solo é −1, −2… (a Torre B do Garden: "SS205" no −2); acima, o ordinal − 1, como sempre.
    const andar = andarDoPavimento(model.levels, levelId);
    const ordinal = andar + 1;
    const prefixo = andar < 0 ? prefixoPeloAndar(andar) : ordinal - 1 <= 0 ? 'T' : String(ordinal - 1);
    const resto = u.numero.startsWith(prefixo) ? u.numero.slice(prefixo.length) : '';
    const pos = /^\d{2,}$/.test(resto) ? Number(resto) : null;
    // Revisão do PR #584 (achado 2): a unidade do kernel num pavimento do prédio que não é o tipo (o 002/004 da Torre A e o
    // TR05… da Torre B, no 0 desvinculado) tem uid aleatório — refazer o prédio mudaria a chave e duplicaria no
    // Empreendimento. A chave dela é pelo andar e pelo NOME (o da ficha). Só elas: entram no envio desde a PE6d.
    const doProprioAndar = !u.derivada && pos == null && !!levelId && levelId !== tipoId;
    return { u, ordinal, pos, doProprioAndar, t: u.tipologia ? (porNome.get(u.tipologia) ?? null) : null, privativa: r2(u.medida.areaPrivativaMm2 / 1e6) };
  });
  const privativaTotal = linhas.reduce((s, l) => s + l.privativa, 0);
  const comumDoBloco = Math.max(0, construidaAcimaM2 - privativaTotal);
  const vgv = linhas.reduce((s, l) => s + l.privativa * (l.t?.precoM2 ?? 0), 0);
  const ordinais = [...new Set(linhas.map((l) => l.ordinal))];
  const porAndar = Math.max(0, ...ordinais.map((o) => linhas.filter((l) => l.ordinal === o).length));
  const units: CanonicalUnit[] = linhas.map(({ u, ordinal, pos, doProprioAndar, t, privativa }) => {
    const sourceId = pos != null ? `${b.uid}:${ordinal}:${pos}` : doProprioAndar ? `${b.uid}:${ordinal}:ficha:${u.numero.trim().toUpperCase()}` : `${b.uid}:unidade:${u.chave}`;
    const comum = privativaTotal > 0 ? r2((comumDoBloco * privativa) / privativaTotal) : 0;
    const lugar = pos != null && t ? naPosicao(pos, t.id) : null;
    return {
      sourceId,
      fields: {
        name: u.numero,
        floor: ordinal - 1,
        ...(u.tipologia ? { typology: u.tipologia } : {}),
        private_area: privativa,
        common_area: comum,
        total_area: r2(privativa + comum),
        ...(t ? { bedrooms: t.dormitorios } : {}),
      },
      createOnly: {
        blueprint_massa_chave: sourceId,
        floor_tipo: (ordinal <= 1 ? 'TERREO' : 'TIPO') as FloorTipo,
        is_vendavel: true,
        status: 'DISPONIVEL' as UnitStatus,
        ...(t && t.precoM2 > 0 ? { price: r2(privativa * t.precoM2) } : {}),
        ...(lugar ? { sun_orientation: lugar.solCardinal } : {}),
        ...(lugar?.posicaoNoLote ? { position_type: lugar.posicaoNoLote } : {}),
      } satisfies Partial<EmpreendimentoUnitInsert> as Record<string, unknown>,
    };
  });
  return {
    sourceId: b.uid,
    matchName: b.nome,
    fields: {
      floors_count: pisos,
      units_per_floor: porAndar,
      ...(custoM2Base != null ? { construction_cost_sqm: custoM2Base } : {}),
      ...(privativaTotal > 0 && vgv > 0 ? { sales_price_sqm: r2(vgv / privativaTotal) } : {}),
    },
    createOnly: { blueprint_bloco_uid: b.uid, name: b.nome },
    units,
  };
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
    return { origin: 'massa', empreendimento, towers: [], commonAreaCandidates: [], liveTowerSourceIds: new Set(), liveUnitSourceIds: new Set(), warnings: ['O estudo ainda não tem versão publicada. Publique na Planta Inteligente — o rascunho não é enviado de propósito.'], semVersaoPublicada: true };
  }
  const maisRecente = snapshots.reduce((a, b) => (b.revision > a.revision ? b : a));
  const snapshot = await getSnapshot(maisRecente.id);
  if (!snapshot) throw new Error('A versão publicada do estudo não pôde ser carregada.');
  // Objeto (jsonb) ou texto: a função comum trata os dois — ver modeloPublicado.ts.
  const model: BlueprintModel = modeloDoPayloadPublicado(snapshot.payload);

  // M4: o produto CONGELADO na versão publicada vence a linha viva — o envio tem
  // de refletir a versão que alguém publicou, não o mix digitado depois. Versão
  // publicada antes da M4 não tem cópia: cai no produto vivo, e diz.
  const congelado = await blueprintSnapshotProdutoService.daVersao(maisRecente.id).catch(() => null);
  let produto;
  const avisoDoProduto: string[] = [];
  if (congelado) {
    produto = produtoDaColuna(congelado);
  } else {
    const row = await blueprintProdutoService.get(empreendimento.blueprint_study_id);
    produto = produtoDaColuna(row?.produto ?? null);
    if (row) avisoDoProduto.push('A versão publicada não tem o produto congelado (publicada antes desta função): usei o produto atual do estudo. Publique de novo para fixar.');
  }
  const cub = produto.financeiro.custoM2Manual ? null : await cubDoPadrao(produto.financeiro.uf, produto.padrao).catch(() => null);
  const lado = ladoDaMassa(empreendimento, model, produto, cub);
  return { ...lado, warnings: [...avisoDoProduto, ...lado.warnings] };
}
