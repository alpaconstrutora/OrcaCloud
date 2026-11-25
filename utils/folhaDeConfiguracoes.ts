/**
 * Folha de Configurações do Sistema pedida por quem abre a tela de fora (ex.: o
 * endereço antigo `labor-fiscal` → Tributos e Impostos › INSS). Mora fora de
 * Settings.tsx porque a tela é carregada sob demanda (React.lazy no AppRouter).
 *
 * A LEITURA NÃO APAGA: em produção a tela é montada três vezes num carregamento
 * (sonda de 24/11/2026), e ler-e-apagar deixava a montagem que fica na tela sem o
 * pedido — abria em Nomenclatura. O pedido vale por `VALIDADE_DO_PEDIDO_MS` e
 * sai quando o usuário escolhe uma folha (`esquecerFolhaPedida`).
 */
export const CHAVE_FOLHA_PEDIDA = 'settings_active_leaf';
export const VALIDADE_DO_PEDIDO_MS = 30_000;

export function pedirFolha(folha: string): void {
    try { localStorage.setItem(CHAVE_FOLHA_PEDIDA, JSON.stringify({ folha, em: Date.now() })); } catch { /* sem localStorage: abre na folha inicial */ }
}

export function esquecerFolhaPedida(): void {
    try { localStorage.removeItem(CHAVE_FOLHA_PEDIDA); } catch { /* nada a fazer */ }
}

/** A folha pedida há menos de `VALIDADE_DO_PEDIDO_MS`; null = sem pedido válido. */
export function lerFolhaPedida(): string | null {
    let bruto: string | null = null;
    try { bruto = localStorage.getItem(CHAVE_FOLHA_PEDIDA); } catch { return null; }
    if (!bruto) return null;
    try {
        const { folha, em } = JSON.parse(bruto) as { folha?: unknown; em?: unknown };
        if (typeof folha === 'string' && typeof em === 'number' && Date.now() - em <= VALIDADE_DO_PEDIDO_MS) return folha;
    } catch { /* formato antigo ou lixo */ }
    esquecerFolhaPedida();
    return null;
}
