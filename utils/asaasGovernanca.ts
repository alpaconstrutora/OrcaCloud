// Pode disparar dinheiro pela Asaas? — decisão pura (Deno + Vitest, SEM imports).
//
// Plano: docs/planos/2026-10-16-asaas-pendencias-e-pix.md (Fase 4, parte do
// disparo — antecipada para a Fase 3: PIX não pode existir sem ela).
// Decisão do usuário (16/10): alçada aprovada + só owner/admin dispara +
// teto editável por org; piloto só na org dona.
//
// A Edge reúne os FATOS (lendo o banco) e esta função devolve a lista de
// bloqueios — cada um uma frase para o usuário. Lista vazia = pode. A mesma
// lista aparece na tela, no botão desabilitado (regra: botão desligado
// sempre diz o porquê).

export interface FatosDoDisparo {
    temConta: boolean;
    ehGestor: boolean;
    /** internal_transactions.status / business_status / approval_status do título. */
    status: string | null;
    businessStatus: string | null;
    approvalStatus: string | null;
    /** Para RASCUNHO: o valor cai em alguma faixa de alçada configurada? */
    valorTemFaixaDeAlcada: boolean;
    valor: number;
    tetos: { porPagamento: number; porDia: number; avulso: number } | null;
    /** Soma do que já saiu (ou está saindo) HOJE pela conta, sem este. */
    somaDoDia: number;
    avulso: boolean;
    piloto: boolean;
    orgDoTitulo: string | null;
    orgDaConta: string | null;
    competenciaFechada: string | null;   // 'MM/AAAA' quando fechada
    pagamentoEmCurso: string | null;     // status do supplier_payments que ocupa o título
}

const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

export function bloqueiosDoDisparo(f: FatosDoDisparo): string[] {
    const b: string[] = [];

    if (!f.temConta) {
        b.push('A organização não tem conta Asaas cadastrada (Minha Organização › Contas). A chave global antiga não paga nada.');
    }
    if (!f.ehGestor) b.push('Só proprietário ou administrador da organização dispara pagamento pela Asaas.');

    if (f.status === 'CANCELLED' || f.businessStatus === 'CANCELADO') b.push('O título está cancelado.');
    else if (f.status === 'CONCILIATED' || f.businessStatus === 'PAGO') b.push('O título já está pago.');

    if (f.pagamentoEmCurso === 'DONE') b.push('Este título já foi pago pela Asaas.');
    else if (f.pagamentoEmCurso) b.push(`Já existe um pagamento deste título em andamento (${f.pagamentoEmCurso}). Cancele-o antes de tentar de novo.`);

    if (f.approvalStatus === 'PENDENTE') b.push('O título está aguardando a alçada (Financeiro › Aprovações).');
    else if (f.approvalStatus === 'REJEITADO') b.push('O título foi rejeitado na alçada.');
    else if ((f.approvalStatus ?? 'RASCUNHO') === 'RASCUNHO' && f.valorTemFaixaDeAlcada) {
        b.push('O valor exige alçada e o título não foi submetido (Financeiro › Aprovações).');
    }

    if (!(f.valor > 0)) b.push('O título não tem valor a pagar.');

    if (f.tetos) {
        if (f.valor > f.tetos.porPagamento) {
            b.push(`Acima do teto por pagamento da conta Asaas (${brl(f.tetos.porPagamento)}).`);
        }
        if (f.avulso && f.valor > f.tetos.avulso) {
            b.push(`PIX para chave digitada acima do teto de PIX avulso (${brl(f.tetos.avulso)}).`);
        }
        if (f.somaDoDia + f.valor > f.tetos.porDia) {
            const resta = Math.max(0, f.tetos.porDia - f.somaDoDia);
            b.push(`Ultrapassa o teto diário da conta Asaas (${brl(f.tetos.porDia)}; resta ${brl(resta)} hoje).`);
        }
    }

    if (f.piloto && f.orgDoTitulo && f.orgDaConta && f.orgDoTitulo !== f.orgDaConta) {
        b.push('A conta Asaas está em modo piloto: só paga títulos da organização dona dela.');
    }

    if (f.competenciaFechada) {
        b.push(`A competência ${f.competenciaFechada} está fechada em Contas a Pagar — reabra antes de pagar, senão o título não poderá ser baixado.`);
    }

    return b;
}

/**
 * Início do "hoje" de Brasília em UTC, para somar o teto diário. A Asaas e o
 * financeiro contam o dia em BRT; contar em UTC liberaria o teto às 21h.
 */
export function inicioDoDiaBrasilia(agora: Date): string {
    const brt = new Date(agora.getTime() - 3 * 3600_000);
    return `${brt.toISOString().slice(0, 10)}T03:00:00.000Z`;
}
