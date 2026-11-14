/**
 * O que o banco tem de cada projeto aberto — para o salvamento automático gravar só
 * quando algo MUDOU, e não a cada abertura.
 *
 * Por que existe (14/11/2026): o `usePersistenceSync` gravava o projeto inteiro 2 s
 * depois de qualquer mudança de estado — inclusive a do próprio carregamento. Só abrir
 * um orçamento regravava `projects` (medido: Casa de Furnas e Garden mudaram de data sem
 * ninguém editar), o que:
 *   - mexia na coluna Atualização e no card "Parados há mais de 30 dias" da lista;
 *   - fazia "quem grava por último vence": abrir um orçamento que um colega estava
 *     editando podia atropelar a edição dele com a cópia antiga.
 *
 * Quem CARREGA o projeto (abrir pela lista, reidratar ao recarregar a página) registra
 * aqui a assinatura do que veio do banco; o salvamento automático compara antes de gravar
 * e, depois de gravar, registra a nova. Um caso PRECISA gravar ao abrir — o planejamento
 * que congela a versão do orçamento (`snapshotToPersist`): ali a assinatura é registrada
 * ANTES de aplicar o congelamento, então a diferença aparece e ele é gravado.
 *
 * Estado de módulo (não de React) de propósito: dois hooks diferentes escrevem e leem
 * (`useProjectOperations` carrega, `usePersistenceSync` grava).
 */
import type { BudgetEntry, ProjectSettings } from '../types';

const persistido = new Map<string, string>();

/** Assinatura do conteúdo gravável. JSON é estável aqui: o estado vem do mesmo JSON do
 *  banco, e quem edita troca o valor da chave sem reordenar o objeto. */
export function assinaturaDoProjeto(settings: ProjectSettings | null | undefined, budget: BudgetEntry[] | null | undefined): string {
    return JSON.stringify([settings ?? null, budget ?? []]);
}

/** O banco tem exatamente isto para o projeto `id` (acabou de carregar ou de gravar). */
export function registrarPersistido(id: string, settings: ProjectSettings | null | undefined, budget: BudgetEntry[] | null | undefined): void {
    persistido.set(id, assinaturaDoProjeto(settings, budget));
}

/** Há diferença entre o estado e o que o banco tem? Projeto nunca registrado = grava
 *  (comportamento antigo: na dúvida, não perde edição). */
export function precisaGravar(id: string, settings: ProjectSettings | null | undefined, budget: BudgetEntry[] | null | undefined): boolean {
    const registrado = persistido.get(id);
    return registrado === undefined || registrado !== assinaturaDoProjeto(settings, budget);
}

/** Só para testes. */
export function limparPersistidos(): void {
    persistido.clear();
    ultimaGravacao = null;
}

// ── Hora da última gravação do projeto aberto (2ª crítica, 2026-11-14): o salvamento
// automático era invisível e o "Salvar" do topo não dizia se faltava algo — o usuário clicava
// "por garantia". O topo mostra "Salvo às HH:MM" lendo daqui (useSyncExternalStore).
let ultimaGravacao: Date | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach(f => f());

/** Gravou de verdade (salvamento automático ou o botão Salvar). */
export function marcarGravacao(): void {
    ultimaGravacao = new Date();
    avisar();
}
/** Abriu outro projeto: ainda não gravou nada nesta sessão. */
export function zerarUltimaGravacao(): void {
    if (ultimaGravacao === null) return;
    ultimaGravacao = null;
    avisar();
}
export function assinarGravacoes(cb: () => void): () => void {
    ouvintes.add(cb);
    return () => { ouvintes.delete(cb); };
}
export function obterUltimaGravacao(): Date | null {
    return ultimaGravacao;
}
