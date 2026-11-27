/**
 * Condomínio › Financeiro: "Conta de recebimento" (27/11/2026).
 * Plano: docs/planos/2026-11-27-condominio-conta-de-recebimento.md
 *
 * A emissão dos boletos não pergunta a conta: usa a conta Asaas ativa da org do
 * condomínio (ou a emprestada com "Atende também"). Quem responde qual é a RPC
 * `condominio_conta_recebimento` — a mesma regra da emissão, sem a RLS do navegador.
 */

export interface ContaDeRecebimento {
    id: string;
    nome: string;
    /** false = conta de outra organização, emprestada com "Atende também". */
    propria: boolean;
    orgDona: string;
    ambiente: 'sandbox' | 'production';
}

export interface SituacaoContaDeRecebimento {
    orgNome: string | null;
    conta: ContaDeRecebimento | null;
    /** Frase da recusa quando há mais de uma conta (a mesma da emissão). */
    problema: string | null;
}

/**
 * Por que "Emitir boletos" fica desligado; null = pode emitir.
 * Situação ainda não lida (ou que falhou ao ler) não trava: o servidor decide e diz.
 */
export function motivoSemContaDeRecebimento(s: SituacaoContaDeRecebimento | null): string | null {
    if (!s) return null;
    if (s.problema) return s.problema;
    if (!s.conta) {
        const org = s.orgNome ? ` na organização ${s.orgNome}` : '';
        return `Nenhuma conta Asaas recebe por este condomínio. Cadastre em Minha Organização › Contas${org}.`;
    }
    return null;
}
