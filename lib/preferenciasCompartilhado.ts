import type { QueryClient } from '@tanstack/react-query';

/**
 * Peças que os hooks de preferências do usuário (`usePreferenciasEletricas` e `usePreferenciaDaPlanta`)
 * COMPARTILHAM porque leem a MESMA query (`preferenciasKeys.usuario`): um aviso de falha de leitura só,
 * e um contador de gravações em voo por chave.
 */

// ── Aviso de falha de leitura ────────────────────────────────────────────────────────────────

/**
 * Última mensagem de falha de leitura já avisada. Os hooks são montados por muitos consumidores ao mesmo
 * tempo (canvas, PDF, gaveta, ~37 itens do menu Exibir): cada instância dispararia o mesmo aviso. Avisa
 * UMA vez por mensagem; zera quando a leitura volta a dar certo (uma falha nova avisa de novo).
 */
let ultimoAvisoDeLeitura: string | null = null;

/** `true` quando é a 1ª vez que esta mensagem aparece (e a registra); `false` se já foi avisada. */
export function registrarAvisoDeLeitura(erro: string): boolean {
  if (ultimoAvisoDeLeitura === erro) return false;
  ultimoAvisoDeLeitura = erro;
  return true;
}

/** A leitura voltou a dar certo: a próxima falha avisa de novo. */
export function limparAvisoDeLeitura(): void {
  ultimoAvisoDeLeitura = null;
}

/** A mensagem do aviso é a mesma para quem desenha a planta elétrica e para o menu Exibir. */
export function mensagemDeFalhaDeLeitura(erro: string): string {
  return `Não foi possível carregar as suas preferências da planta: ${erro}. Valem os padrões (ou o que está salvo neste navegador).`;
}

// ── Gravações em voo por chave de query ──────────────────────────────────────────────────────

/**
 * Cada gravação termina relendo a lista. Quando várias saem em rajada (aplicar um template de vista
 * grava ~22 itens), uma releitura que termina ANTES das outras gravações devolveria o valor antigo
 * dos itens ainda em voo e eles "piscariam". Por isso a releitura só acontece quando a ÚLTIMA
 * gravação daquela chave termina. Um mapa por `QueryClient`: clientes diferentes não se misturam.
 */
const emVoo = new WeakMap<QueryClient, Map<string, number>>();

const idDaChave = (chave: readonly unknown[]): string => JSON.stringify(chave);

/** Começa uma gravação nesta chave. */
export function iniciarGravacao(queryClient: QueryClient, chave: readonly unknown[]): void {
  let mapa = emVoo.get(queryClient);
  if (!mapa) {
    mapa = new Map();
    emVoo.set(queryClient, mapa);
  }
  const id = idDaChave(chave);
  mapa.set(id, (mapa.get(id) ?? 0) + 1);
}

/** Termina uma gravação nesta chave; `true` = era a última (é hora de reler). */
export function terminarGravacao(queryClient: QueryClient, chave: readonly unknown[]): boolean {
  const mapa = emVoo.get(queryClient);
  const id = idDaChave(chave);
  const restantes = Math.max(0, (mapa?.get(id) ?? 1) - 1);
  if (restantes === 0) mapa?.delete(id);
  else mapa?.set(id, restantes);
  return restantes === 0;
}
