/**
 * Catálogo das rotinas automáticas (jobs do pg_cron) — Configurações › Rotinas automáticas.
 * Plano: docs/planos/2026-11-16-rotinas-automaticas-ligar-desligar.md
 *
 * Cada frase foi conferida no código da rotina em 16/11/2026 (função SQL ou Edge Function).
 * Job novo sem entrada aqui NÃO quebra a tela: aparece em "Outras" com o nome técnico e
 * pode ser ligado/desligado igual — o mesmo modelo de `notificationTypes.ts`.
 *
 * `sensivel`: desligar pede confirmação, com o texto de `aoDesligar` (rotinas de dinheiro,
 * de sistemas externos e o relatório do investidor — decisão do desenho aprovado).
 */

export type GrupoRotina = 'avisos' | 'dinheiro' | 'relatorios' | 'tecnicas' | 'outras';

export const GRUPOS_ROTINA: { id: GrupoRotina; rotulo: string }[] = [
    { id: 'avisos', rotulo: 'Avisos à equipe' },
    { id: 'dinheiro', rotulo: 'Dinheiro e sistemas externos' },
    { id: 'relatorios', rotulo: 'Relatórios' },
    { id: 'tecnicas', rotulo: 'Técnicas' },
    { id: 'outras', rotulo: 'Outras' },
];

export interface MetaRotina {
    nome: string;
    grupo: GrupoRotina;
    oQueFaz: string;
    sensivel: boolean;
    /** O que deixa de acontecer — texto do diálogo de confirmação (só nas sensíveis). */
    aoDesligar?: string;
}

const CATALOGO: Record<string, MetaRotina> = {
    // ── Avisos à equipe ──────────────────────────────────────────────────────
    'process-sla-sweep': {
        nome: 'Prazo de etapa de processo', grupo: 'avisos', sensivel: false,
        oQueFaz: 'Marca a etapa de processo (BPM) que passou do prazo e avisa os responsáveis.',
    },
    'process-overdue-sweep': {
        nome: 'Processo para conta vencida', grupo: 'avisos', sensivel: false,
        oQueFaz: 'Abre um processo de tratamento para cada conta a pagar ou a receber vencida, uma vez por conta, nas organizações que têm modelo de processo para isso.',
    },
    'daily-financial-notifications': {
        nome: 'Avisos financeiros do dia', grupo: 'avisos', sensivel: false,
        oQueFaz: 'Avisa os membros: recibo disponível para emitir, conta que vence em 3 dias, conta atrasada e reajuste de contrato pendente.',
    },
    'daily-payment-tasks': {
        nome: 'Tarefas de pagamento', grupo: 'avisos', sensivel: false,
        oQueFaz: 'Cria a tarefa "Pagar: …" para cada conta que vence nos próximos 3 dias, uma para cada membro da organização.',
    },
    'task-alert-notifier': {
        nome: 'Alerta de tarefa', grupo: 'avisos', sensivel: false,
        oQueFaz: 'Na hora do alerta marcado na tarefa, manda e-mail e aviso no sininho para quem a criou.',
    },
    'riscos-alertas-diarios': {
        nome: 'Alertas de riscos', grupo: 'avisos', sensivel: false,
        oQueFaz: 'Avisa o responsável e o dono quando vence uma ação de tratamento ou a revisão de um risco.',
    },
    'manutencao-vencimento-alerts': {
        nome: 'Manutenção e garantia de ativos', grupo: 'avisos', sensivel: false,
        oQueFaz: 'Avisa manutenção preventiva que vence em 30 dias e garantia de fornecedor de ativo que vence em 90 dias.',
    },
    'opura-docs-vencimento-alerts': {
        nome: 'Validade de documentos', grupo: 'avisos', sensivel: false,
        oQueFaz: 'Avisa os membros quando um documento do GED se aproxima da validade, com a antecedência cadastrada no documento (padrão: 30 dias).',
    },
    'daily-academy-alerts': {
        nome: 'Treinamentos (Academia)', grupo: 'avisos', sensivel: false,
        oQueFaz: 'Encerra treinamentos vencidos, avisa os que vencem em 7 dias e abre as reciclagens.',
    },
    'warranty-sla-sweep': {
        nome: 'Prazo de chamado de garantia', grupo: 'avisos', sensivel: false,
        oQueFaz: 'Registra no histórico do chamado de garantia que o prazo estourou. Não manda aviso.',
    },
    'vencimento-portal-alerts': {
        nome: 'Parcela no Portal do Cliente', grupo: 'avisos', sensivel: false,
        oQueFaz: 'Deixa uma mensagem no Portal do Cliente sobre a parcela que vence em 3 dias.',
    },

    // ── Dinheiro e sistemas externos (todas sensíveis) ───────────────────────
    'dunning-notifier-hourly': {
        nome: 'Cobrança de clientes', grupo: 'dinheiro', sensivel: true,
        oQueFaz: 'Manda por e-mail a régua de cobrança (Financeiro › Cobrança automática) aos clientes com parcela a vencer ou vencida.',
        aoDesligar: 'Os clientes deixam de receber os e-mails da régua de cobrança.',
    },
    'asaas-status-sync': {
        nome: 'Situação das cobranças no Asaas', grupo: 'dinheiro', sensivel: true,
        oQueFaz: 'Consulta no Asaas as cobranças e boletos ainda em aberto e marca os que foram pagos, caso o aviso automático do Asaas se perca.',
        aoDesligar: 'PIX e boletos pagos podem ficar como não pagos quando o aviso automático do Asaas falhar.',
    },
    'asaas-conta-extrato': {
        nome: 'Extrato da conta Asaas', grupo: 'dinheiro', sensivel: true,
        oQueFaz: 'Importa o extrato de todas as contas Asaas ativas para o extrato bancário.',
        aoDesligar: 'O extrato das contas Asaas para de chegar sozinho; só entra pelo botão de sincronizar.',
    },
    'reconciliation-engine-sweep': {
        nome: 'Conciliação automática', grupo: 'dinheiro', sensivel: true,
        oQueFaz: 'Concilia as linhas novas do extrato bancário com os lançamentos, conta por conta.',
        aoDesligar: 'O extrato deixa de ser conciliado sozinho; a conciliação passa a ser só manual.',
    },
    'email-capture-sync': {
        nome: 'Captura de boletos por e-mail', grupo: 'dinheiro', sensivel: true,
        oQueFaz: 'Lê as caixas de e-mail monitoradas e cria em Boletos a pagar os boletos que chegaram.',
        aoDesligar: 'Boletos que chegam por e-mail deixam de entrar sozinhos em Boletos a pagar.',
    },
    'email-capture-busca-diaria': {
        nome: 'Busca diária nas caixas de e-mail', grupo: 'dinheiro', sensivel: true,
        oQueFaz: 'Abre a busca do dia em cada caixa de e-mail monitorada, que a captura de boletos percorre.',
        aoDesligar: 'A busca diária de boletos nas caixas de e-mail deixa de ser aberta.',
    },
    'fiscal-fallback-polling': {
        nome: 'Notas fiscais pendentes', grupo: 'dinheiro', sensivel: true,
        oQueFaz: 'Retoma o processamento das notas fiscais (NF-e) que falharam ou ficaram paradas na fila.',
        aoDesligar: 'Notas fiscais que falharem ou ficarem paradas na fila não são retomadas sozinhas.',
    },

    // ── Relatórios ───────────────────────────────────────────────────────────
    'financial-report-hourly': {
        nome: 'Relatório da Inteligência Financeira', grupo: 'relatorios', sensivel: false,
        oQueFaz: 'Envia por e-mail os relatórios da Inteligência Financeira agendados para a hora.',
    },
    'hourly-bi-report-check': {
        nome: 'Agenda dos relatórios de BI', grupo: 'relatorios', sensivel: false,
        oQueFaz: 'Recalcula a próxima data de envio dos relatórios de BI agendados.',
    },
    'monthly-investor-report': {
        nome: 'Relatório mensal do investidor', grupo: 'relatorios', sensivel: true,
        oQueFaz: 'No dia 1, gera o relatório do mês anterior e o comunicado no Portal do Investidor.',
        aoDesligar: 'Os investidores deixam de receber o relatório mensal no portal.',
    },

    // ── Técnicas ─────────────────────────────────────────────────────────────
    'planta-webhooks-retentativas': {
        nome: 'Reenvio de webhooks da Planta', grupo: 'tecnicas', sensivel: true,
        oQueFaz: 'Reenvia as entregas de webhook da Planta que falharam, quando chega a hora da nova tentativa.',
        aoDesligar: 'Entregas de webhook da Planta que falharem não são reenviadas.',
    },
    'opura-market-feeds-diario': {
        nome: 'Anúncios do ÒPURA Market', grupo: 'tecnicas', sensivel: false,
        oQueFaz: 'Importa os anúncios das fontes cadastradas no ÒPURA Market Intelligence.',
    },
    'limpar-historico-rotinas': {
        nome: 'Limpeza do histórico das rotinas', grupo: 'tecnicas', sensivel: false,
        oQueFaz: 'Apaga os registros de execução das rotinas com mais de 60 dias. Desligada, o histórico volta a crescer sem limite.',
    },
};

/** `jobname` NULL é job criado por `cron.schedule(expr, cmd)` sem nome — identificado pelo jobid. */
export function rotinaMeta(jobname: string | null, jobid?: number): MetaRotina {
    if (jobname === null) {
        return { nome: `Rotina sem nome (#${jobid ?? '?'})`, grupo: 'outras', oQueFaz: '', sensivel: false };
    }
    return CATALOGO[jobname] ?? { nome: jobname, grupo: 'outras', oQueFaz: '', sensivel: false };
}

const STATUS_DA_EXECUCAO: Record<string, string> = {
    succeeded: 'concluída',
    failed: 'falhou',
    running: 'rodando',
    starting: 'iniciando',
    connecting: 'conectando',
    sending: 'enviando',
};

/** Status de `cron.job_run_details` em português; status desconhecido passa como veio. */
export function statusDaExecucao(status: string): string {
    return STATUS_DA_EXECUCAO[status] ?? status;
}

/** GMT (fuso do pg_cron neste banco) → BRT. Brasil sem horário de verão desde 2019. */
const DESLOCAMENTO_BRT = -3;
const doisDigitos = (n: number) => String(n).padStart(2, '0');

/**
 * Expressão cron (em GMT) → texto em horário de Brasília. Só os formatos que existem;
 * o resto volta cru, para a tela nunca mostrar um horário errado.
 */
export function quandoRoda(schedule: string): string {
    const partes = schedule.trim().split(/\s+/);
    if (partes.length !== 5) return schedule;
    const [min, hora, dia, mes, semana] = partes;
    if (mes !== '*' || semana !== '*') return schedule;

    const aCada = /^\*\/(\d+)$/.exec(min);
    const numero = (s: string) => (/^\d+$/.test(s) ? Number(s) : null);

    if (hora === '*' && dia === '*') {
        if (min === '*') return 'A cada minuto';
        if (aCada) return `A cada ${aCada[1]} min`;
        const m = numero(min);
        if (m === 0) return 'De hora em hora';
        if (m !== null) return `De hora em hora (minuto ${m})`;
        return schedule;
    }

    const faixa = /^(\d+)-(\d+)$/.exec(hora);
    if (aCada && faixa && dia === '*') {
        const de = Number(faixa[1]) + DESLOCAMENTO_BRT;
        const ate = Number(faixa[2]) + DESLOCAMENTO_BRT;
        if (de < 0 || ate < 0) return schedule;
        return `A cada ${aCada[1]} min, das ${doisDigitos(de)}h às ${doisDigitos(ate)}h59`;
    }

    const m = numero(min);
    const h = numero(hora);
    if (m === null || h === null) return schedule;
    const hBrt = (h + DESLOCAMENTO_BRT + 24) % 24;
    const as = `${doisDigitos(hBrt)}h${doisDigitos(m)}`;
    if (dia === '*') return `Diária às ${as}`;
    const d = numero(dia);
    if (d === null || h + DESLOCAMENTO_BRT < 0) return schedule; // em BRT cairia no dia anterior
    return `Mensal, dia ${d} às ${as}`;
}
