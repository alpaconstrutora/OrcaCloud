/**
 * Salário base da folha pela COMPETÊNCIA, lido do Histórico Salarial
 * (`employee_salary_history`).
 *
 * Até 22/10/2026 o motor usava `employees.base_salary` — o salário de HOJE — em
 * toda competência: reajuste lançado com data de agosto não entrava na folha
 * de agosto, e reprocessar uma folha antiga trazia o salário novo para trás.
 * Plano: `docs/planos/2026-10-22-folha-salario-por-competencia.md`.
 *
 * Regra de produto (usuário, 22/10/2026): reajuste no meio do mês é
 * PROPORCIONAL — dias antes da vigência no salário antigo, a partir dela no
 * novo, sobre o mês comercial de 30 dias (o mesmo da admissão).
 */

export interface SalarioLancamento {
    effective_date: string;
    previous_salary: number | null;
    new_salary: number;
    created_at?: string | null;
}

export interface FaixaSalarial {
    de: string;
    ate: string;
    dias: number;
    salario: number;
}

export interface SalarioDoPeriodo {
    /** Salário do período já proporcionalizado (dias × salário/30), em centavos exatos. */
    valor: number;
    /** Dias CLT pagos no período (≤ 30). */
    dias: number;
    /** Salário contratual vigente no fim do período — base de hora extra e da coluna "Salário base". */
    vigenteNoFim: number;
    faixas: FaixaSalarial[];
}

/**
 * "Salário base" de uma linha da folha para exibir: o gravado na competência;
 * o do cadastro só para resultado antigo, calculado antes da coluna existir.
 */
export function salarioBaseDoResultado(res: { base_salary?: number | null; employee?: { base_salary?: number | null } | null }): number {
    return Number(res.base_salary ?? res.employee?.base_salary ?? 0);
}

const soData = (d: string) => d.slice(0, 10);
const centavos = (v: number) => Math.round(v * 100) / 100;

/**
 * Salário em vigor numa data: o lançamento com a maior vigência até ela (empate:
 * o lançado por último). Antes do primeiro lançamento vale o salário anterior
 * dele; sem histórico nenhum, o cadastro.
 */
export function salarioNaData(historico: SalarioLancamento[], salarioCadastro: number, data: string): number {
    if (historico.length === 0) return salarioCadastro;
    const dia = soData(data);
    const ordenado = [...historico].sort((a, b) =>
        soData(a.effective_date).localeCompare(soData(b.effective_date))
        || (a.created_at ?? '').localeCompare(b.created_at ?? ''));

    let vigente: SalarioLancamento | null = null;
    for (const l of ordenado) {
        if (soData(l.effective_date) <= dia) vigente = l;
        else break;
    }
    if (vigente) return Number(vigente.new_salary);
    const primeiro = ordenado[0];
    return Number(primeiro.previous_salary ?? primeiro.new_salary);
}

/**
 * Salário de um período mensal, dia a dia no calendário CLT (o dia 31 vale como
 * 30; fevereiro também vai até o dia 30). `desde` é a admissão: se cair dentro
 * do período, só conta a partir dela.
 *
 * Período que atravessa meses não é mensal comercial: sai cheio, pelo salário
 * vigente no fim.
 */
export function salarioDoPeriodo(
    historico: SalarioLancamento[],
    salarioCadastro: number,
    inicio: string,
    fim: string,
    desde?: string | null,
): SalarioDoPeriodo {
    const ini = soData(inicio);
    const fin = soData(fim);
    const vigenteNoFim = salarioNaData(historico, salarioCadastro, fin);
    const mes = ini.slice(0, 7);

    if (mes !== fin.slice(0, 7)) {
        return { valor: centavos(vigenteNoFim), dias: 30, vigenteNoFim, faixas: [{ de: ini, ate: fin, dias: 30, salario: vigenteNoFim }] };
    }

    const diaCLT = (d: string) => Math.min(Number(d.slice(8, 10)), 30);
    const [ano, mesNum] = fin.split('-').map(Number);
    const ultimoDoMes = new Date(Date.UTC(ano, mesNum, 0)).getUTCDate();
    const primeiroDia = Math.max(diaCLT(ini), desde && soData(desde) > ini ? diaCLT(soData(desde)) : 1);
    const ultimoDia = Number(fin.slice(8, 10)) >= ultimoDoMes ? 30 : diaCLT(fin);

    const faixas: FaixaSalarial[] = [];
    let total = 0;
    for (let d = primeiroDia; d <= ultimoDia; d++) {
        // '2026-02-29' e '2026-02-30' não existem, mas a comparação é de texto:
        // caem depois de qualquer vigência de fevereiro, que é o que se quer.
        const data = `${mes}-${String(d).padStart(2, '0')}`;
        const salario = salarioNaData(historico, salarioCadastro, data);
        total += salario / 30;
        const ultima = faixas[faixas.length - 1];
        if (ultima && ultima.salario === salario) {
            ultima.ate = data;
            ultima.dias++;
        } else {
            faixas.push({ de: data, ate: data, dias: 1, salario });
        }
    }

    const dias = Math.max(0, ultimoDia - primeiroDia + 1);
    return { valor: centavos(total), dias, vigenteNoFim, faixas };
}
