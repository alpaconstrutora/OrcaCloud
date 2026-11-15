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
    situacao = SITUACAO_INICIAL;
}

// ── Situação da gravação do projeto aberto, para o topo da tela (2ª crítica, 2026-11-14): o
// salvamento automático era invisível e o "Salvar" do topo não dizia se faltava algo — o
// usuário clicava "por garantia". Na 1ª versão só aparecia "Salvo às HH:MM" DEPOIS de uma
// gravação; quem só abria e olhava não via nada (relato de 14/11). Agora há sempre um estado:
//   em_dia (+ última hora, se já gravou nesta sessão) · pendente (mudou, aguardando os 2 s) ·
//   gravando · erro (a última tentativa falhou).
export type EstadoGravacao = 'em_dia' | 'pendente' | 'gravando' | 'erro';
export interface SituacaoGravacao { estado: EstadoGravacao; ultima: Date | null }
const SITUACAO_INICIAL: SituacaoGravacao = { estado: 'em_dia', ultima: null };
let situacao: SituacaoGravacao = SITUACAO_INICIAL;
const ouvintes = new Set<() => void>();

// Objeto novo só quando muda: useSyncExternalStore compara por referência.
function definir(parcial: Partial<SituacaoGravacao>): void {
    const novo = { ...situacao, ...parcial };
    if (novo.estado === situacao.estado && novo.ultima === situacao.ultima) return;
    situacao = novo;
    ouvintes.forEach(f => f());
}

/** Há alteração ainda não gravada (o salvamento automático vai gravar em 2 s). */
export function marcarPendente(): void { definir({ estado: 'pendente' }); }
/** Gravação em andamento. */
export function marcarGravando(): void { definir({ estado: 'gravando' }); }
/** Gravou de verdade (salvamento automático ou o botão Salvar). */
export function marcarGravacao(): void { definir({ estado: 'em_dia', ultima: new Date() }); }
/** A tentativa de gravar falhou: o que está na tela NÃO está no banco. */
export function marcarErroGravacao(): void { definir({ estado: 'erro' }); }
/** Abriu (ou recarregou) um projeto: está em dia com o banco e nada foi gravado nesta sessão. */
export function zerarUltimaGravacao(): void { definir({ estado: 'em_dia', ultima: null }); }

export function assinarGravacoes(cb: () => void): () => void {
    ouvintes.add(cb);
    return () => { ouvintes.delete(cb); };
}
export function obterSituacaoGravacao(): SituacaoGravacao {
    return situacao;
}
export function obterUltimaGravacao(): Date | null {
    return situacao.ultima;
}
