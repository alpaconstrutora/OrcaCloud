/**
 * ÒPURA Pro — "Baixar meus dados" (15/11/2026, docs/planos/2026-11-14-opura-pro-publico.md,
 * seção "Minha conta"). LGPD art. 18: cópia dos dados num formato que a pessoa leve embora.
 *
 * O arquivo é montado no navegador com o que o próprio usuário lê pelo RLS (pro_*_user_access);
 * não passa por função no banco. Fotos e assinaturas vão junto: elas moram dentro das linhas
 * (data URL), então o arquivo pode ficar grande — é o preço de ser uma cópia completa.
 *
 * Testes: `__tests__/proMeusDados.test.ts`.
 */

/** Sobe quando o formato do arquivo mudar (campo novo não sobe; renomear/remover sobe). */
export const VERSAO_DO_ARQUIVO = 1;

export interface MeusDadosDoPro {
  conta: { id: string; email: string | null };
  ajustes: Record<string, unknown> | null;
  clientes: Record<string, unknown>[];
  orcamentos: Record<string, unknown>[];
  servicos: Record<string, unknown>[];
}

/** `opura-pro-meus-dados-AAAA-MM-DD.json`, na data LOCAL (quem baixa à noite não recebe o dia seguinte). */
export function nomeDoArquivoMeusDados(agora: Date): string {
  const dois = (n: number) => String(n).padStart(2, '0');
  return `opura-pro-meus-dados-${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}.json`;
}

export function montarArquivoMeusDados(dados: MeusDadosDoPro, agora: Date): string {
  const arquivo = {
    aplicativo: 'ÒPURA Pro',
    versao_do_arquivo: VERSAO_DO_ARQUIVO,
    gerado_em: agora.toISOString(),
    conta: dados.conta,
    totais: {
      clientes: dados.clientes.length,
      orcamentos: dados.orcamentos.length,
      servicos: dados.servicos.length,
    },
    ajustes: dados.ajustes,
    clientes: dados.clientes,
    orcamentos: dados.orcamentos,
    servicos: dados.servicos,
  };
  return JSON.stringify(arquivo, null, 2);
}
