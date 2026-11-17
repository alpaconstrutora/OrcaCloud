/**
 * Catálogo das exceções do painel da Diretoria (ÒPURA CEO, 17/11/2026) e os textos de cada
 * grupo — UM arquivo para a tela (utils/diretoria.ts reexporta) e para o resumo semanal por
 * e-mail (supabase/functions/diretoria-resumo-semanal). Puro, sem import: roda no Vite e no Deno.
 * Plano: docs/planos/2026-11-17-opura-ceo.md.
 *
 * As FAIXAS de gravidade moram no banco (`_diretoria_excecoes`), porque fazem parte da chave
 * do grupo; o texto de `regra` aqui descreve essas mesmas faixas — mudou uma, muda a outra.
 */

export type TipoExcecao =
    | 'conta_vencida' | 'parcela_cliente' | 'extrato_sem_conciliar' | 'aprovacao_parada'
    | 'contrato_vencendo' | 'entrega_atrasada' | 'documento_vencido' | 'ferias_vencendo' | 'tarefa_vencida';

export type Area = 'financeiro' | 'comercial' | 'suprimentos' | 'rh' | 'obras';
export type Severidade = 'critico' | 'atencao' | 'acompanhar';

export interface DefinicaoTipo {
    nome: string;
    /** [singular, plural] do que o grupo conta: "1 conta a pagar vencida" / "694 contas…". */
    contagem: [string, string];
    /** Como a data de referência se lê no detalhe: [passou, futuro, hoje]. */
    quando: [string, string, string];
    regra: string;
    /** Área que responde quando o próprio dado não aponta pessoa; null = sempre o do dado. */
    area: Area | null;
    /** activeView da tela de origem. */
    tela: string;
    telaNome: string;
}

export const TIPOS: Record<TipoExcecao, DefinicaoTipo> = {
    conta_vencida: {
        nome: 'Conta a pagar vencida', contagem: ['conta a pagar vencida', 'contas a pagar vencidas'],
        quando: ['a mais antiga venceu em', 'a primeira vence em', 'a primeira vence hoje'],
        regra: 'Vencimento passou e não foi paga (o "Vencido" de Contas a pagar). Mais de 30 dias pede decisão; 8 a 30, atenção.',
        area: 'financeiro', tela: 'contas-a-pagar', telaNome: 'Financeiro › Contas a pagar',
    },
    parcela_cliente: {
        nome: 'Parcela de cliente vencida', contagem: ['parcela de cliente vencida', 'parcelas de clientes vencidas'],
        quando: ['a mais antiga venceu em', 'a primeira vence em', 'a primeira vence hoje'],
        regra: 'Cliente não pagou até o vencimento (o "Vencido" de Contas a receber). Mais de 30 dias pede decisão; 8 a 30, atenção.',
        area: 'comercial', tela: 'contas-a-receber', telaNome: 'Financeiro › Contas a receber',
    },
    extrato_sem_conciliar: {
        nome: 'Extrato sem conciliar', contagem: ['linha do extrato sem conciliar', 'linhas do extrato sem conciliar'],
        quando: ['a mais antiga é de', 'a primeira é de', 'a primeira é de hoje'],
        regra: 'Linha do banco há mais de 7 dias sem conciliar. Mais de 30 dias pede decisão.',
        area: 'financeiro', tela: 'bank-reconciliation', telaNome: 'Financeiro › Conciliação',
    },
    aprovacao_parada: {
        nome: 'Aprovação parada na alçada', contagem: ['aprovação parada na alçada', 'aprovações paradas na alçada'],
        quando: ['o primeiro venceu em', 'o primeiro vence em', 'o primeiro vence hoje'],
        regra: 'Esperando aprovação e vence em até 3 dias. Já vencido pede decisão. Responde quem aprova o próximo nível.',
        area: 'financeiro', tela: 'financial-approval', telaNome: 'Financeiro › Aprovações',
    },
    contrato_vencendo: {
        nome: 'Contrato de locação vencendo', contagem: ['contrato de locação vencendo', 'contratos de locação vencendo'],
        quando: ['o primeiro terminou em', 'o primeiro termina em', 'o primeiro termina hoje'],
        regra: 'Locação ativa que termina em até 30 dias sem renovação. Já terminado pede decisão; até 7 dias, atenção.',
        area: 'comercial', tela: 'rentals', telaNome: 'Comercial › Locações',
    },
    entrega_atrasada: {
        nome: 'Entrega de fornecedor atrasada', contagem: ['entrega de fornecedor atrasada', 'entregas de fornecedor atrasadas'],
        quando: ['a mais antiga era para', 'a primeira é para', 'a primeira é para hoje'],
        regra: 'Data de entrega do pedido passou e não foi recebido. Mais de 30 dias pede decisão; 8 a 30, atenção.',
        area: 'suprimentos', tela: 'supplies-orders', telaNome: 'Suprimentos › Pedidos',
    },
    documento_vencido: {
        nome: 'Documento de colaborador vencido', contagem: ['documento de colaborador vencido', 'documentos de colaborador vencidos'],
        quando: ['o mais antigo venceu em', 'o primeiro vence em', 'o primeiro vence hoje'],
        regra: 'Validade passou (ASO, NR, CNH…), pelo critério do painel de RH. Mais de 30 dias pede decisão.',
        area: 'rh', tela: 'labor-documents', telaNome: 'RH › Documentos',
    },
    ferias_vencendo: {
        nome: 'Férias vencendo', contagem: ['período de férias vencendo', 'períodos de férias vencendo'],
        quando: ['o primeiro venceu em', 'o primeiro vence em', 'o primeiro vence hoje'],
        regra: 'Período concessivo com saldo acaba em até 60 dias. Já vencido (paga em dobro) pede decisão; até 30 dias, atenção.',
        area: 'rh', tela: 'labor-absences', telaNome: 'RH › Férias e ausências',
    },
    tarefa_vencida: {
        nome: 'Tarefa vencida', contagem: ['tarefa de equipe vencida', 'tarefas de equipe vencidas'],
        quando: ['o prazo mais antigo foi', 'o primeiro prazo é', 'o primeiro prazo é hoje'],
        regra: 'Tarefa de equipe (com colaborador responsável ou num espaço) com o prazo passado. A agenda pessoal fica fora.',
        area: null, tela: 'tarefas', telaNome: 'Minhas tarefas',
    },
};

export const AREAS: Record<Area, string> = {
    financeiro: 'Financeiro', comercial: 'Comercial', suprimentos: 'Suprimentos', rh: 'RH', obras: 'Obras',
};

export const SEVERIDADES: Record<Severidade, { nome: string; ordem: number }> = {
    critico: { nome: 'Pede decisão', ordem: 0 },
    atencao: { nome: 'Atenção', ordem: 1 },
    acompanhar: { nome: 'Acompanhar', ordem: 2 },
};

/** O que o título e o detalhe de um grupo precisam (o grupo do banco tem mais). */
export interface GrupoParaTexto {
    tipo: TipoExcecao;
    quantidade: number;
    grupo: string | null;
    valor: number | null;
    dias: number | null;
    data_ref: string | null;
}

export function brl(v: number): string {
    return 'R$ ' + Math.round(v).toLocaleString('pt-BR');
}

/** 'AAAA-MM-DD' → 'DD/MM/AAAA', sem passar por Date (fuso). */
export function dataBr(iso: string | null | undefined): string {
    if (!iso) return '';
    const [a, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
}

const plural = (n: number, umOuMais: [string, string]) => `${n} ${n === 1 ? umOuMais[0] : umOuMais[1]}`;

export function tituloDoGrupo(g: GrupoParaTexto): string {
    const def = TIPOS[g.tipo];
    const corpo = plural(g.quantidade, def.contagem);
    return g.grupo ? `${g.grupo}: ${corpo}` : corpo;
}

export function detalheDoGrupo(g: GrupoParaTexto): string {
    const def = TIPOS[g.tipo];
    const partes: string[] = [];
    if (g.valor != null && g.valor > 0) partes.push(brl(g.valor));
    if (g.data_ref && g.dias != null) {
        if (g.dias > 0) partes.push(`${def.quando[0]} ${dataBr(g.data_ref)} (há ${g.dias} ${g.dias === 1 ? 'dia' : 'dias'})`);
        else if (g.dias < 0) partes.push(`${def.quando[1]} ${dataBr(g.data_ref)} (em ${-g.dias} ${g.dias === -1 ? 'dia' : 'dias'})`);
        else partes.push(def.quando[2]);
    }
    return partes.join(' · ');
}
