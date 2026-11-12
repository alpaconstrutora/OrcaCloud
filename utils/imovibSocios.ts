/**
 * Resultado por sócio (item 9.2 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). Função pura sobre
 * os aportes e distribuições do motor (`ImovibMathResult.aportes`); a tela de
 * sócios (aba Capital) a chama. Testes: __tests__/imovibSocios.test.ts.
 *
 * O que é do incorporador em cada mês: o aporte inteiro e a distribuição menos a
 * parte das fontes por participação (`paraTerceiros`). Os sócios aportam pela
 * participação nos aportes. Cada distribuição devolve primeiro o capital ainda não
 * devolvido do incorporador; cada sócio recebe a parte que aportou desse capital (com
 * aportes somando menos de 100%, a parte sem dono volta para ninguém, nunca vira
 * lucro). O que passa do capital é lucro, repartido pela participação no resultado — a mesma regra das fontes
 * (`partilhaDasDistribuicoes`). Retorno preferencial fica fora (plano, "Fora do escopo").
 * Soma diferente de 100% gera aviso e calcula como veio.
 */
import type { LinhaDeAporte } from './imovibAportes';
import { calcularTirMensal } from './imovibMotor';

export interface SocioDoEstudo {
    name: string;
    /** % do resultado (lucro). */
    share_percent: number;
    /** % dos aportes. */
    capital_percent: number;
}

/** Linha de imovib_partners (migration aplicar_20271112400000). */
export interface ImovibPartner extends SocioDoEstudo {
    id: string;
    study_id: string;
    notes?: string | null;
    /** Sócio da empresa de onde a linha veio ("Importar os sócios da empresa"). */
    company_partner_id?: string | null;
    sort_order: number;
    created_at?: string;
}

export interface ResultadoDoSocio {
    name: string;
    aportes: number;
    distribuicoes: number;
    /** Distribuições − aportes. */
    lucro: number;
    /** % a.a.; NaN quando o fluxo não troca de sinal (só aporta ou só recebe). */
    tirAnual: number;
}

export interface ResultadoPorSocio {
    socios: ResultadoDoSocio[];
    /** TIR do fluxo do incorporador inteiro (aportes e distribuições), % a.a. */
    tirDoIncorporador: number;
    avisos: string[];
}

const tirAnual = (fluxo: number[]): number => {
    const { taxa } = calcularTirMensal(fluxo);
    return Number.isFinite(taxa) ? (Math.pow(1 + taxa, 12) - 1) * 100 : NaN;
};

const pctBR = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

export function resultadoPorSocio(linhas: readonly LinhaDeAporte[], socios: readonly SocioDoEstudo[]): ResultadoPorSocio {
    const doIncorporador = linhas.map(l => l.distribuicao - l.paraTerceiros - l.aporte);
    const avisos: string[] = [];
    if (socios.length) {
        const somaResultado = socios.reduce((a, s) => a + (s.share_percent || 0), 0);
        const somaAportes = socios.reduce((a, s) => a + (s.capital_percent || 0), 0);
        if (Math.abs(somaResultado - 100) > 0.01) avisos.push(`A participação no resultado soma ${pctBR(somaResultado)}%, não 100%: o resultado por sócio foi calculado como está.`);
        if (Math.abs(somaAportes - 100) > 0.01) avisos.push(`A participação nos aportes soma ${pctBR(somaAportes)}%, não 100%: o resultado por sócio foi calculado como está.`);
    }

    const emAberto = socios.map(() => 0);
    /** Capital do incorporador inteiro ainda não devolvido (inclusive a parte sem dono). */
    let emAbertoDoIncorporador = 0;
    const fluxos = socios.map(() => [] as number[]);
    const aportes = socios.map(() => 0);
    const distribuicoes = socios.map(() => 0);
    for (const l of linhas) {
        const distribuido = l.distribuicao - l.paraTerceiros;
        emAbertoDoIncorporador += l.aporte;
        socios.forEach((s, k) => {
            const aporte = l.aporte * (s.capital_percent || 0) / 100;
            emAberto[k] += aporte;
            aportes[k] += aporte;
            fluxos[k].push(-aporte);
        });
        const devolvido = Math.min(Math.max(0, distribuido), emAbertoDoIncorporador);
        const fracao = emAbertoDoIncorporador > 0 ? devolvido / emAbertoDoIncorporador : 0;
        emAbertoDoIncorporador -= devolvido;
        socios.forEach((s, k) => {
            const capital = emAberto[k] * fracao;
            const recebe = capital + (distribuido - devolvido) * (s.share_percent || 0) / 100;
            emAberto[k] -= capital;
            distribuicoes[k] += recebe;
            fluxos[k][fluxos[k].length - 1] += recebe;
        });
    }

    return {
        socios: socios.map((s, k) => ({
            name: s.name,
            aportes: aportes[k],
            distribuicoes: distribuicoes[k],
            lucro: distribuicoes[k] - aportes[k],
            tirAnual: tirAnual(fluxos[k]),
        })),
        tirDoIncorporador: tirAnual(doIncorporador),
        avisos,
    };
}

/** Sócio do quadro societário da empresa, como a importação o recebe. */
export interface SocioDaEmpresa { id: string; nome: string; participacao_pct: number }

const nomeComparavel = (n: string) =>
    n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * O que "Importar os sócios da empresa" faz com cada sócio dela: já importado
 * (`company_partner_id` igual) fica como está; o que tem o mesmo nome de um sócio
 * digitado à mão (sem diferenciar maiúscula, acento e espaço) é LIGADO a ele — os
 * percentuais digitados ficam; o resto é criado. Cada sócio digitado liga a um só.
 */
export function planoDeImportacao(atuais: readonly ImovibPartner[], daEmpresa: readonly SocioDaEmpresa[]): {
    vincular: { id: string; company_partner_id: string }[];
    criar: SocioDaEmpresa[];
    jaImportados: number;
} {
    const importados = new Set(atuais.map(s => s.company_partner_id).filter(Boolean));
    const livres = atuais.filter(s => !s.company_partner_id);
    const vincular: { id: string; company_partner_id: string }[] = [];
    const criar: SocioDaEmpresa[] = [];
    let jaImportados = 0;
    for (const p of daEmpresa) {
        if (importados.has(p.id)) { jaImportados++; continue; }
        const i = livres.findIndex(s => nomeComparavel(s.name) === nomeComparavel(p.nome));
        if (i >= 0) {
            vincular.push({ id: livres[i].id, company_partner_id: p.id });
            livres.splice(i, 1);
        } else {
            criar.push(p);
        }
    }
    return { vincular, criar, jaImportados };
}
