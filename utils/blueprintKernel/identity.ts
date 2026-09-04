/**
 * Identidade persistente de elemento — o `uid`.
 *
 * ─── O PROBLEMA QUE ISTO RESOLVE ────────────────────────────────────────────
 *
 * Até 04/09/2026 o kernel só tinha `id` (`wal_0001`), atribuído por contador
 * determinístico e REATRIBUÍDO por posição a cada `modelFromCanonicalPayload`.
 * Isso era correto para o hash (o payload não carrega identificador volátil), e
 * era o que impedia tudo o que é BIM:
 *
 *   • o GUID do IFC saía do hash do snapshot + índice, então a MESMA parede
 *     tinha GUID diferente a cada revisão publicada — Revit, Solibri e BIMcollab
 *     não conseguem dizer "esta parede mudou", só "sumiu uma, apareceu outra";
 *   • uma FK para elemento (ferragem, tarefa do cronograma, comentário) se perdia
 *     no primeiro publish — foi por isso que a ponte com o módulo de ferragem
 *     ficou adiada e que `SpaceLabel` é ancorado num ponto;
 *   • o diff entre versões só sabia casar por geometria: mover uma parede era
 *     "removida + adicionada".
 *
 * ─── O QUE O `uid` É, E O QUE ELE NÃO É ─────────────────────────────────────
 *
 * `uid` é um UUID que nasce na criação do elemento e sobrevive a autosave,
 * publish, reload e troca de sessão. É IDENTIDADE, não CONTEÚDO: dois desenhos
 * com a mesma geometria e uids diferentes são o MESMO desenho, e por isso o uid
 * fica FORA do hash do snapshot (ver `canonical.ts`, seção `identity`). É o que
 * permite que ele seja aleatório sem quebrar o critério do Spike A — o `id`
 * continua determinístico porque continua sendo o que o histórico e os comandos
 * referenciam dentro de uma sessão.
 *
 * `id` × `uid`: o `id` é endereço de sessão (curto, legível em log, reatribuído
 * sem cerimônia); o `uid` é o nome pelo qual o mundo de fora conhece a peça.
 * Nenhum comando aceita `uid` como argumento — quem quiser agir sobre uma peça
 * procura o `id` dela pelo `uid`.
 *
 * ─── SNAPSHOT ANTIGO ────────────────────────────────────────────────────────
 *
 * Payload gravado antes disto não tem identidade. Na leitura, cada elemento
 * recebe um uid DERIVADO do hash geométrico + família + índice canônico — o
 * mesmo critério que o IFC já usava. Reabrir o mesmo snapshot duas vezes dá os
 * mesmos uids, e o primeiro autosave os grava para sempre. Esses uids levam o
 * nibble de versão `8` (em vez do `4` do aleatório) só para serem
 * reconhecíveis a olho num diagnóstico; nada lê essa diferença.
 */

import { sha256 } from './hash';

export type ElementUid = string;

/** UUID em texto: 8-4-4-4-12 hex minúsculo. Não restringe versão nem variante. */
export const EH_UID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Gancho de TESTE. Um teste que precisa afirmar o valor de um uid (golden de
 * payload com identidade, por exemplo) troca o gerador por um determinístico e
 * o devolve a `null` no fim. Fora de teste ninguém chama isto.
 */
let geradorInjetado: (() => ElementUid) | null = null;
export function usarGeradorDeUid(gerador: (() => ElementUid) | null): void {
  geradorInjetado = gerador;
}

/** Uid reproduzível para teste: `00000000-0000-4000-8000-000000000042`. */
export function uidDeTeste(n: number): ElementUid {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

/** Gerador sequencial para `usarGeradorDeUid` — começa em 1 a cada chamada. */
export function geradorSequencial(inicio = 1): () => ElementUid {
  let n = inicio;
  return () => uidDeTeste(n++);
}

/**
 * Uid novo, aleatório (UUID v4).
 *
 * `crypto.randomUUID` existe em todo navegador atual e em Node ≥ 19; o fallback
 * por `getRandomValues` cobre contexto não seguro (http:// em rede local, onde
 * `randomUUID` não é exposto) sem cair em `Math.random`.
 */
export function novoUid(): ElementUid {
  if (geradorInjetado) return geradorInjetado();

  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return formatarUuid(bytes, 4);
}

/**
 * Uid DETERMINÍSTICO a partir de uma semente — para snapshot gravado antes da
 * identidade existir. A semente é `${hashGeometrico}:${familia}:${indice}`, e
 * portanto duas leituras do mesmo payload produzem o mesmo uid.
 */
export function uidDeterministico(semente: string): ElementUid {
  const hex = sha256(semente);
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return formatarUuid(bytes, 8);
}

function formatarUuid(b: Uint8Array, versao: number): ElementUid {
  b[6] = (b[6] & 0x0f) | ((versao & 0x0f) << 4);
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Prefixo do rótulo curto por família. É o que a tela e o diff mostram
 * ("Parede P-1A2B movida"): quatro hex bastam para o olho, e o painel copia o
 * uid inteiro quando alguém precisa do valor exato.
 */
export const PREFIXO_ROTULO_UID = {
  level: 'N',
  wall: 'P',
  opening: 'V',
  boundary: 'L',
  structural: 'C',
  label: 'R',
} as const;

export type FamiliaComUid = keyof typeof PREFIXO_ROTULO_UID;

export function rotuloCurto(uid: ElementUid, familia: FamiliaComUid): string {
  return `${PREFIXO_ROTULO_UID[familia]}-${uid.slice(0, 4).toUpperCase()}`;
}
