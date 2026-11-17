/**
 * Plano B pegajoso da Central de Controle (17/11/2026).
 *
 * Quando `fn_central_controle_bootstrap` cai (estouro dos 8 s, função quebrada, rede),
 * a tela pede os blocos um a um (plano B, #521). Sem memória, cada Atualizar voltava a
 * tentar a chamada única: 8 s de espera e uma consulta pesada a mais no banco, que
 * naquele momento já está no dia ruim. Aqui fica, por organização, até quando ir
 * direto aos blocos.
 *
 * - 5 minutos; vencido, a tela volta a tentar a chamada única (e, se cair, remarca).
 * - Por organização: "Todas" é uma chave própria — "Todas" caindo não tira a Alpa
 *   da chamada única. O AppRouter entrega "Todas" como `''` (`activeOrganizationId || ''`);
 *   `''` e `null` são a mesma chave, como no serviço (`organizationId || null`).
 * - Memória da aba (módulo): recarregar a página zera.
 *
 * Plano: docs/planos/2026-11-17-central-menores-plano-b.md
 */

export const PLANO_B_PEGAJOSO_MS = 5 * 60 * 1000;

export interface MemoriaDoPlanoB {
    /** A chamada única desta organização caiu agora. */
    marcarQueCaiu(organizationId: string | null): void;
    /** `true` = ir direto aos blocos (a chamada única caiu há menos de 5 minutos). */
    pularChamadaUnica(organizationId: string | null): boolean;
    /** Zera tudo (testes). */
    esquecer(): void;
}

// `null` ou `''` = "Todas as organizações"; nenhum id de organização é igual a isto.
const TODAS = '\u0000todas';

// `() => Date.now()`, não `Date.now`: lido a cada chamada (um relógio trocado depois vale).
export function criarMemoriaDoPlanoB(agora: () => number = () => Date.now()): MemoriaDoPlanoB {
    const caiuEm = new Map<string, number>();
    const chave = (organizationId: string | null) => organizationId || TODAS;
    return {
        marcarQueCaiu(organizationId) {
            caiuEm.set(chave(organizationId), agora());
        },
        pularChamadaUnica(organizationId) {
            const k = chave(organizationId);
            const quando = caiuEm.get(k);
            if (quando === undefined) return false;
            if (agora() >= quando + PLANO_B_PEGAJOSO_MS) {
                caiuEm.delete(k);
                return false;
            }
            return true;
        },
        esquecer() {
            caiuEm.clear();
        },
    };
}

/** A memória desta aba. */
export const memoriaDoPlanoB = criarMemoriaDoPlanoB();
