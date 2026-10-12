// constants/imovibClassificacao.ts
//
// Listas de classificação do Estudo de Viabilidade (Imovib) — fonte única para
// o drawer de criar/editar (ImovibForm), Premissas › Identificação e a listagem
// (ImovibDashboard). Antes cada tela tinha a sua: a modalidade era select na
// criação e texto livre em Premissas, e a listagem coloria fases que o
// formulário nunca grava ('Viabilidade', 'Aprovado'…). Plano
// docs/planos/2026-10-12-imovib-viabilidade-correcoes.md, item 5.2.

export const IMOVIB_SEGMENTOS = ['Residencial', 'Comercial', 'Logístico', 'Misto', 'Loteamento', 'BTS'];
export const IMOVIB_SUBCLASSIFICACOES = ['Econômico', 'Médio', 'Alto', 'Luxo', 'MCMV F1', 'MCMV F2', 'MCMV F3'];
export const IMOVIB_FASES = ['Greenfield', 'Brownfield', 'Retrofit', 'Conversão de Uso'];
export const IMOVIB_MODALIDADES = ['Incorporação Própria', 'Built-to-Sell', 'Built-to-Rent', 'Land Banking', 'Permuta'];

/**
 * Opções de um select de lista fechada que preserva o valor antigo: estudo
 * gravado com um valor fora da lista (ex.: modalidade digitada à mão quando
 * Premissas era texto livre) continua aparecendo como opção, em vez de o
 * select mostrar "Selecione..." e o próximo salvamento apagar o valor.
 */
export function opcoesComValorAtual(lista: readonly string[], atual: string | null | undefined): string[] {
    const v = (atual ?? '').trim();
    return v && !lista.includes(v) ? [...lista, v] : [...lista];
}

/**
 * Coluna canônica com leitura de compatibilidade. O estudo tem dois jogos de
 * colunas para o mesmo dado: `cnpj`/`developer`/`manager` (criação e listagem)
 * e `spe_cnpj`/`developer_name`/`project_manager` (o que Premissas editava até
 * 2026-10-12). A canônica é a primeira; a antiga só é lida quando a canônica
 * está vazia. Toda gravação vai para a canônica. Nenhuma coluna foi apagada.
 */
export const imovibCnpj = (s: { cnpj?: string | null; spe_cnpj?: string | null }) => s.cnpj || s.spe_cnpj || '';
export const imovibIncorporadora = (s: { developer?: string | null; developer_name?: string | null }) => s.developer || s.developer_name || '';
export const imovibGestor = (s: { manager?: string | null; project_manager?: string | null }) => s.manager || s.project_manager || '';

/**
 * Payload de gravação dos três campos: vai para a canônica. Quando o usuário
 * deixa a canônica VAZIA, a antiga também é limpa — senão a leitura de
 * compatibilidade ressuscitaria o valor antigo e o campo nunca ficaria vazio.
 * (Limpa o valor na própria gravação do usuário; não apaga coluna nem roda
 * script no banco.)
 */
export function imovibIdentificacaoParaGravar(c: { cnpj: string; developer: string; manager: string }) {
    const cnpj = c.cnpj.trim();
    const developer = c.developer.trim();
    const manager = c.manager.trim();
    return {
        cnpj,
        developer,
        manager,
        ...(cnpj ? {} : { spe_cnpj: '' }),
        ...(developer ? {} : { developer_name: '' }),
        ...(manager ? {} : { project_manager: '' }),
    };
}
