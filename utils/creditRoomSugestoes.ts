/**
 * Sugestão de documentos do GED para o Data Room (capacidade F3, Task 3).
 *
 * Puro (sem Supabase): o serviço lê o GED e monta `DocumentoSugerido[]`; aqui só
 * se agrupa por origem. A tela (equipe interna) mostra os grupos para a pessoa
 * marcar o que compartilha com o credor.
 *
 * Privacidade: `referencia` NUNCA é nome de cliente — de contrato é o rótulo
 * mascarado da versão congelada. Documento do CLIENTE é dado pessoal → grupo
 * próprio, desmarcado, com aviso de LGPD.
 */

export type OrigemSugestao = 'CONTRATO' | 'EMPREENDIMENTO' | 'OBRA' | 'CLIENTE';

export interface DocumentoSugerido {
    documentId: string;
    nome: string;
    categoria: string;
    tipoDocumento: string;
    organizationId: string;
    dataValidade: string | null;
    origem: OrigemSugestao;
    /** Rótulo do contrato (mascarado) ou nome do empreendimento/obra — nunca nome de cliente. */
    referencia: string;
    vencido: boolean;
    jaCompartilhado: boolean;
}

export interface GrupoDeSugestoes {
    origem: OrigemSugestao;
    titulo: string;
    aviso?: string;
    marcadoPorPadrao: boolean;
    itens: DocumentoSugerido[];
}

/** Ordem de exibição — e de prioridade quando o mesmo documento tem mais de uma origem. */
export const ORDEM_DAS_ORIGENS: readonly OrigemSugestao[] = ['CONTRATO', 'EMPREENDIMENTO', 'OBRA', 'CLIENTE'];

const TITULOS: Record<OrigemSugestao, string> = {
    CONTRATO: 'Documentos dos contratos da carteira',
    EMPREENDIMENTO: 'Documentos dos empreendimentos',
    OBRA: 'Documentos da obra',
    CLIENTE: 'Documentos dos clientes',
};

export const AVISO_LGPD_CLIENTE =
    'Contêm dados pessoais dos clientes (LGPD). Compartilhe com o credor só o que for necessário '
    + 'e com base legal — por isso vêm desmarcados.';

/**
 * Documento vencido? `dataValidade` é 'AAAA-MM-DD' e `hoje` também (local, via
 * `hojeLocalISO`): compara texto, sem `new Date('AAAA-MM-DD')` (que lê como UTC
 * e erra o dia no fuso do Brasil). Sem validade → não vencido (dado ausente ≠ vencido).
 */
export function estaVencido(dataValidade: string | null | undefined, hoje: string): boolean {
    const d = (dataValidade ?? '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) && d < hoje;
}

export function agruparSugestoes(docs: DocumentoSugerido[]): GrupoDeSugestoes[] {
    const porOrigem = new Map<OrigemSugestao, DocumentoSugerido[]>(ORDEM_DAS_ORIGENS.map(o => [o, []]));
    for (const d of docs) porOrigem.get(d.origem)?.push(d);

    const vistos = new Set<string>();
    const grupos: GrupoDeSugestoes[] = [];
    for (const origem of ORDEM_DAS_ORIGENS) {
        const itens: DocumentoSugerido[] = [];
        for (const d of porOrigem.get(origem) ?? []) {
            if (vistos.has(d.documentId)) continue; // já saiu numa origem anterior da ordem
            vistos.add(d.documentId);
            itens.push(d);
        }
        if (!itens.length) continue;
        const cliente = origem === 'CLIENTE';
        grupos.push({
            origem,
            titulo: TITULOS[origem],
            ...(cliente ? { aviso: AVISO_LGPD_CLIENTE } : {}),
            marcadoPorPadrao: !cliente,
            itens,
        });
    }
    return grupos;
}
