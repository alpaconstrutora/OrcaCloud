// RH › Encargos Sociais — as duas relações impressas da folha do mês:
//   relacaoInss                bases do INSS e o que vai na guia (DCTFWeb)
//   relacaoFolhaPorEmpregado   proventos, descontos, líquido e FGTS de cada um
//
// Puro: recebe o que `payrollService.carregarFolhasFechadasDoMes` leu e devolve
// linhas e totais. As regras são as MESMAS de `folhaFinanceiro.ts`, que gera os
// títulos de Tributos a Pagar — a tela não pode dizer um valor e a guia outro:
//   INSS segurado = desconto de código INSS (não "rubrica com INSS no nome")
//   IRRF          = desconto de código IRRF
//   FGTS          = encargo de código FGTS*
//   CPP/RAT/terceiros = base INSS × alíquota da organização (RAT × FAP)

import { EncargosConfig, ehFgts } from './folhaFinanceiro';

export interface DadosDaFolhaDoMes {
    orgId: string;
    /** Folhas FECHADAS da competência; cada relação escolhe os tipos que entram. */
    folhas: { id: string; type: string }[];
    resultados: { payroll_run_id: string; employee_id: string; gross: number | null; net: number | null; base_inss: number | null }[];
    itens: { payroll_run_id: string; employee_id: string; code: string; type: string; amount: number | null }[];
    colaboradores: { id: string; name: string | null; matricula: string | null }[];
    rubricas: { code: string; name: string; organization_id: string | null }[];
    cfg: EncargosConfig;
}

export const ROTULO_DO_CALCULO: Record<string, string> = {
    mensal: 'Folha mensal',
    ferias: 'Férias',
    rescisao: 'Rescisão',
    decimo_terceiro: '13º salário',
    adiantamento: 'Adiantamento',
};

export const SEM_CADASTRO = 'Colaborador sem cadastro';

const centavos = (v: number) => Math.round(v * 100) / 100;

/** Rubrica por código: a da organização da folha vence a global, que vence a de outra
 *  organização — a mesma prioridade de `carregarFolhaParaFinanceiro`. */
function nomesDasRubricas(d: DadosDaFolhaDoMes): Map<string, string> {
    const prioridade = (orgDaRubrica: string | null) => (orgDaRubrica === d.orgId ? 0 : orgDaRubrica == null ? 1 : 2);
    const melhor = new Map<string, { name: string; p: number }>();
    for (const r of d.rubricas) {
        const p = prioridade(r.organization_id);
        const atual = melhor.get(r.code);
        if (!atual || p < atual.p) melhor.set(r.code, { name: r.name, p });
    }
    return new Map([...melhor].map(([code, v]) => [code, v.name]));
}

function cadastro(d: DadosDaFolhaDoMes) {
    const porId = new Map(d.colaboradores.map(c => [c.id, c]));
    return (employeeId: string) => {
        const c = porId.get(employeeId);
        return { nome: c?.name?.trim() || SEM_CADASTRO, matricula: c?.matricula?.trim() || null };
    };
}

const porNome = <T extends { nome: string }>(a: T, b: T) => a.nome.localeCompare(b.nome, 'pt-BR');

// ── Relação de bases do INSS ──────────────────────────────────────────────

export interface LinhaInss {
    employeeId: string;
    nome: string;
    matricula: string | null;
    base: number;
    inss: number;
    /** INSS ÷ base (fração); null sem base. */
    aliquotaEfetiva: number | null;
}

export interface RelacaoInss {
    linhas: LinhaInss[];
    /** Nomes de quem está na folha sem base nem desconto — fora da lista. */
    semValor: string[];
    /** Rótulos dos cálculos que entraram ("Folha mensal", "Férias"…). */
    calculos: string[];
    aliquotas: { cpp: number; rat: number; terceiros: number };
    totais: { base: number; segurados: number; cpp: number; rat: number; terceiros: number; totalGuia: number };
}

/** Adiantamento antecipa o salário do mês: a base e o INSS dele estão na folha mensal. */
const entraNoInss = (tipo: string) => tipo !== 'adiantamento';

export function relacaoInss(d: DadosDaFolhaDoMes): RelacaoInss {
    const folhas = d.folhas.filter(f => entraNoInss(f.type));
    const ids = new Set(folhas.map(f => f.id));
    const quem = cadastro(d);

    const acc = new Map<string, { base: number; inss: number }>();
    const de = (id: string) => {
        let a = acc.get(id);
        if (!a) { a = { base: 0, inss: 0 }; acc.set(id, a); }
        return a;
    };
    for (const r of d.resultados) {
        if (!ids.has(r.payroll_run_id)) continue;
        de(r.employee_id).base += Number(r.base_inss ?? r.gross) || 0;
    }
    for (const it of d.itens) {
        if (!ids.has(it.payroll_run_id) || it.type !== 'desconto' || it.code !== 'INSS') continue;
        de(it.employee_id).inss += Math.abs(Number(it.amount) || 0);
    }

    const linhas: LinhaInss[] = [];
    const semValor: string[] = [];
    for (const [employeeId, a] of acc) {
        const { nome, matricula } = quem(employeeId);
        const base = centavos(a.base);
        const inss = centavos(a.inss);
        if (!base && !inss) { semValor.push(nome); continue; }
        linhas.push({ employeeId, nome, matricula, base, inss, aliquotaEfetiva: base > 0 ? inss / base : null });
    }
    linhas.sort(porNome);
    semValor.sort((a, b) => a.localeCompare(b, 'pt-BR'));

    const aliquotas = {
        cpp: d.cfg.cppRate,
        rat: d.cfg.ratRate * d.cfg.fap,
        terceiros: d.cfg.terceiros.reduce((s, t) => s + t.rate, 0),
    };
    const base = centavos(linhas.reduce((s, l) => s + l.base, 0));
    const segurados = centavos(linhas.reduce((s, l) => s + l.inss, 0));
    const cpp = centavos(base * aliquotas.cpp);
    const rat = centavos(base * aliquotas.rat);
    const terceiros = centavos(base * aliquotas.terceiros);

    const tipos = [...new Set(folhas.map(f => f.type))];
    const ordem = Object.keys(ROTULO_DO_CALCULO);
    tipos.sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b));

    return {
        linhas,
        semValor,
        calculos: tipos.map(t => ROTULO_DO_CALCULO[t] ?? t),
        aliquotas,
        totais: { base, segurados, cpp, rat, terceiros, totalGuia: centavos(segurados + cpp + rat + terceiros) },
    };
}

// ── Relação da folha por empregado ────────────────────────────────────────

export interface LinhaFolha {
    employeeId: string;
    nome: string;
    matricula: string | null;
    salario: number;
    outrosProventos: number;
    salarioFamilia: number;
    inss: number;
    irrf: number;
    outrosDescontos: number;
    liquido: number;
    fgts: number;
}

type Valores = Omit<LinhaFolha, 'employeeId' | 'nome' | 'matricula'>;
const CAMPOS: (keyof Valores)[] = ['salario', 'outrosProventos', 'salarioFamilia', 'inss', 'irrf', 'outrosDescontos', 'liquido', 'fgts'];
const zerado = (): Valores => ({ salario: 0, outrosProventos: 0, salarioFamilia: 0, inss: 0, irrf: 0, outrosDescontos: 0, liquido: 0, fgts: 0 });

export interface RelacaoFolha {
    linhas: LinhaFolha[];
    semValor: string[];
    totais: Valores;
}

const ehSalarioFamilia = (nome: string) => /sal[aá]rio[\s-]*fam[ií]lia/i.test(nome);
const ehSalarioBase = (code: string, nome: string) =>
    code === 'SALARIO' || /^sal[aá]rio(\s+(base|mensal))?$/i.test(nome.trim());

/** Só a folha mensal: é a relação do cálculo mensal (férias e rescisão têm recibo próprio). */
export function relacaoFolhaPorEmpregado(d: DadosDaFolhaDoMes): RelacaoFolha {
    const ids = new Set(d.folhas.filter(f => f.type === 'mensal').map(f => f.id));
    const rubrica = nomesDasRubricas(d);
    const quem = cadastro(d);

    const acc = new Map<string, Valores>();
    for (const r of d.resultados) {
        if (!ids.has(r.payroll_run_id)) continue;
        const a = acc.get(r.employee_id) ?? zerado();
        a.liquido += Number(r.net) || 0;
        acc.set(r.employee_id, a);
    }
    for (const it of d.itens) {
        if (!ids.has(it.payroll_run_id)) continue;
        const a = acc.get(it.employee_id);
        if (!a) continue;   // item sem resultado não tem líquido: não inventa linha
        const valor = Number(it.amount) || 0;
        const v = Math.abs(valor);
        const nome = rubrica.get(it.code) ?? it.code;
        switch (it.type) {
            case 'provento':
                if (ehSalarioFamilia(nome)) a.salarioFamilia += v;
                else if (ehSalarioBase(it.code, nome)) a.salario += v;
                else a.outrosProventos += v;
                break;
            case 'desconto':
                if (it.code === 'INSS') a.inss += v;
                else if (it.code === 'IRRF') a.irrf += v;
                else a.outrosDescontos += v;
                break;
            case 'encargo':
                if (ehFgts(it.code)) a.fgts += v;
                break;
            case 'informativa':
                break;
            default:
                if (valor < 0) a.outrosDescontos += v; else a.outrosProventos += v;
        }
    }

    const linhas: LinhaFolha[] = [];
    const semValor: string[] = [];
    const totais = zerado();
    for (const [employeeId, a] of acc) {
        const { nome, matricula } = quem(employeeId);
        for (const k of CAMPOS) a[k] = centavos(a[k]);
        if (CAMPOS.every(k => !a[k])) { semValor.push(nome); continue; }
        linhas.push({ employeeId, nome, matricula, ...a });
        for (const k of CAMPOS) totais[k] += a[k];
    }
    for (const k of CAMPOS) totais[k] = centavos(totais[k]);
    linhas.sort(porNome);
    semValor.sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return { linhas, semValor, totais };
}
