// services/sync/modeloPublicado.ts
//
// O modelo da versão PUBLICADA de um estudo da Planta Inteligente, para as
// arestas de sync (loteamento e estudo de massa).
//
// ⚠️ 02/10/2026: `blueprint_snapshots.payload` é jsonb — o supabase-js devolve
// OBJETO, não texto. Os dois adaptadores faziam `payload as string`, e o parse
// lia "[object Object]": nenhum envio da Planta ao Empreendimento funcionava. A
// prova real (empreendimento descartável) foi o que pegou; os testes do motor,
// que montam o lado canônico a partir de um modelo em memória, não passavam por
// aqui. Uma função só, para as duas arestas não divergirem de novo.

import { modelFromCanonicalPayload, parseCanonicalPayload, type BlueprintModel } from '../../utils/blueprintKernel';

export function modeloDoPayloadPublicado(payload: unknown): BlueprintModel {
  try {
    return modelFromCanonicalPayload(parseCanonicalPayload(typeof payload === 'string' ? payload : JSON.stringify(payload)));
  } catch (e) {
    throw new Error(`A versão publicada não pôde ser lida: ${e instanceof Error ? e.message : String(e)}`);
  }
}
