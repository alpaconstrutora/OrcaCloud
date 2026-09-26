// services/sync/blueprintAdapter.ts
//
// Normaliza o LOTEAMENTO desenhado na Planta Inteligente para o lado canônico.
//
// Cardinalidade: 1 quadra = 1 torre, 1 lote = 1 unidade. Diferente da aresta do
// Planta IA (onde 1 estudo rende no máximo UMA torre, porque só o cenário
// escolhido é materializado), aqui a cardinalidade é natural: um loteamento tem
// N quadras e cada uma tem N lotes, e todas interessam.
//
// ⚠️ A fonte é o SNAPSHOT PUBLICADO, nunca o rascunho. O rascunho muda a cada
// gesto do desenhista (autosave a cada 1,5 s); sincronizar a partir dele faria o
// espelho de vendas mudar debaixo do corretor enquanto alguém arrasta um vértice.
// Publicar é o ato que diz "este desenho vale".
//
// ⚠️ A chave de proveniência é o `uid` do payload canônico, NUNCA o `id` do
// kernel: `modelFromCanonicalPayload` reatribui os ids a cada carregamento, e um
// vínculo por id trocaria o lote 12 pelo lote 3 sem erro nenhum.

import { supabase } from '../../lib/supabase';
import { getSnapshot, listSnapshots } from '../blueprintService';
import { Empreendimento, EmpreendimentoUnitInsert, UnitStatus } from '../../types/empreendimento';
import { modelFromCanonicalPayload, parseCanonicalPayload, type BlueprintModel } from '../../utils/blueprintKernel';
import { medirLote, rotuloDoLote } from '../../utils/blueprintLoteamento';
import { CanonicalSide, CanonicalTower, CanonicalUnit } from './types';

/** Área em m² com 2 casas — a mesma régua das outras arestas. */
const m2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * A posição do lote pela testada, no vocabulário que `empreendimento_units`
 * já tem (`FRENTE`/`LATERAL`/`FUNDOS`). Lote de esquina — duas frentes — conta
 * como FRENTE: é o que o corretor anuncia, e é o que vale mais.
 */
function posicaoPelaTestada(frentes: number): 'FRENTE' | 'LATERAL' | null {
  if (frentes >= 1) return 'FRENTE';
  return null;
}

export async function loadBlueprintSide(empreendimento: Empreendimento): Promise<CanonicalSide> {
  if (!empreendimento.blueprint_study_id) {
    throw new Error('Este empreendimento não está vinculado a um estudo da Planta Inteligente.');
  }

  const { data: study, error: studyErr } = await supabase
    .from('blueprint_studies')
    .select('id, organization_id, name')
    .eq('id', empreendimento.blueprint_study_id)
    .maybeSingle();
  if (studyErr) throw new Error(`Falha ao carregar o estudo da Planta Inteligente: ${studyErr.message}`);
  if (!study) throw new Error('Estudo da Planta Inteligente vinculado não foi encontrado.');
  // Blindagem multi-tenant, como na aresta do Planta IA: um estudo de outra
  // organização não espelha, mesmo que alguém tenha gravado o vínculo à mão.
  if (study.organization_id !== empreendimento.organization_id) {
    throw new Error('O estudo vinculado pertence a outra organização. Sincronização bloqueada.');
  }

  const snapshots = await listSnapshots(empreendimento.blueprint_study_id);
  const warnings: string[] = [];
  if (snapshots.length === 0) {
    return {
      origin: 'blueprint',
      empreendimento,
      towers: [],
      commonAreaCandidates: [],
      liveTowerSourceIds: new Set(),
      liveUnitSourceIds: new Set(),
      warnings: ['O estudo ainda não tem versão publicada. Abra a Planta Inteligente e publique — o rascunho não é sincronizado de propósito.'],
    };
  }

  // A mais recente por revisão. `listSnapshots` já ordena, mas depender da
  // ordem de uma função de outro módulo é acoplamento invisível.
  const maisRecente = snapshots.reduce((a, b) => (b.revision > a.revision ? b : a));
  const snapshot = await getSnapshot(maisRecente.id);
  if (!snapshot) throw new Error('A versão publicada do estudo não pôde ser carregada.');

  let model: BlueprintModel;
  try {
    model = modelFromCanonicalPayload(parseCanonicalPayload(snapshot.payload as string));
  } catch (e) {
    throw new Error(`A versão publicada não pôde ser lida: ${e instanceof Error ? e.message : String(e)}`);
  }

  const quadras = model.quadras ?? [];
  const lotes = (model.lotes ?? []).filter((l) => l.tipo === 'LOTE');
  if (lotes.length === 0) {
    warnings.push('A versão publicada não tem lote nenhum. Desenhe os lotes (aba Terreno › Lotear) e publique de novo.');
  }

  const soltos = lotes.filter((l) => l.quadraId == null);
  if (soltos.length > 0) {
    warnings.push(`${soltos.length} lote${soltos.length > 1 ? 's' : ''} fora de qualquer quadra — não ${soltos.length > 1 ? 'entram' : 'entra'} no espelho, porque a unidade precisa de uma torre. Ponha ${soltos.length > 1 ? 'os lotes' : 'o lote'} dentro de uma quadra e publique de novo.`);
  }

  const liveUnitSourceIds = new Set<string>();
  const towers: CanonicalTower[] = [];

  for (const quadra of quadras) {
    const daQuadra = lotes.filter((l) => l.quadraId === quadra.id);
    if (daQuadra.length === 0) {
      warnings.push(`Quadra ${quadra.nome}: sem lotes na versão publicada.`);
      continue;
    }

    const units: CanonicalUnit[] = daQuadra.map((lote) => {
      liveUnitSourceIds.add(lote.uid);
      const medida = medirLote(model, lote);
      const areaM2 = m2(medida.areaMm2 / 1e6);
      const frentes = medida.lados.filter((l) => l.papel === 'FRENTE').length;

      return {
        sourceId: lote.uid,
        fields: {
          name: rotuloDoLote(model, lote),
          quadra: quadra.nome,
          lote: lote.numero,
          // O lote não tem área comum: o que se vende é o terreno inteiro. Por
          // isso `private_area` e `total_area` são a mesma coisa aqui, e é por
          // `private_area` que a tabela de preços calcula.
          private_area: areaM2,
          common_area: 0,
          total_area: areaM2,
          testada_m: m2(medida.testadaMm / 1000),
          position_type: posicaoPelaTestada(frentes),
        },
        createOnly: {
          blueprint_lote_uid: lote.uid,
          // Tipologia de lote é sempre LOTE, e por ser imutável fica FORA do
          // diff: campo que nunca muda, comparado a cada sync, é conflito eterno.
          typology: 'LOTE',
          is_vendavel: true,
          // O desenho não sabe preço nem status de venda — isso é do
          // Empreendimento, como nas outras duas arestas.
          status: 'DISPONIVEL' as UnitStatus,
          confrontantes: medida.lados.map((l) => ({
            papel: l.papel,
            confrontante: l.confrontante,
            comprimentoM: m2(l.comprimentoMm / 1000),
          })),
        } satisfies Partial<EmpreendimentoUnitInsert> as Record<string, unknown>,
      };
    });

    towers.push({
      sourceId: quadra.uid,
      // A quadra TEM nome que o usuário reconhece ("Quadra A"), então ela pode
      // ser adotada por uma torre criada à mão com esse nome — é o remédio do
      // bug da torre-fantasma, e aqui o casamento por nome faz sentido (ao
      // contrário do cenário do Planta IA, cujo nome é rótulo de análise).
      matchName: `Quadra ${quadra.nome}`,
      // A quadra não propõe campo nenhum de torre: pavimentos e preço por m²
      // não existem em loteamento. Ela é só o agrupador.
      fields: {},
      createOnly: { blueprint_quadra_uid: quadra.uid, name: `Quadra ${quadra.nome}` },
      units,
    });
  }

  return {
    origin: 'blueprint',
    empreendimento,
    towers,
    commonAreaCandidates: [],
    liveTowerSourceIds: new Set(quadras.map((q) => q.uid)),
    liveUnitSourceIds,
    warnings,
  };
}
