import type { DocTipTap, NoTipTap } from '../../types/docGen';
import type { ContextoDoc } from './catalogoCampos';
import { dataCurta } from './dataExtenso';

/**
 * Tabelas dinâmicas dos modelos (F6 — Fase 3). O modelo guarda só a FONTE
 * (`tabelaDinamica { fonte }`); as linhas vêm do documento na hora da prévia e
 * da emissão. PURO: lê o contexto já montado (`resolverContexto` carrega o
 * financeiro do contrato).
 */
export interface TabelaRender {
    colunas: string[];
    /** Alinhamento por coluna. */
    alinhamento: ('left' | 'right' | 'center')[];
    linhas: string[][];
    /** Linha de total (opcional), já formatada. */
    total?: string[] | null;
    /** Por que está vazia ("Sem contrato vinculado"). */
    vazia?: string | null;
}

export interface FonteTabela {
    id: string;
    rotulo: string;
    descricao: string;
    montar: (ctx: ContextoDoc) => TabelaRender;
}

const moeda = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const somar = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

const semContrato = (colunas: string[], alinhamento: TabelaRender['alinhamento']): TabelaRender =>
    ({ colunas, alinhamento, linhas: [], vazia: 'Sem contrato vinculado ao documento.' });

export const FONTES_TABELA: FonteTabela[] = [
    {
        id: 'parcelas_em_aberto',
        rotulo: 'Parcelas em aberto do contrato',
        descricao: 'Vencimento, descrição e valor das parcelas ainda não quitadas, com o total.',
        montar: ctx => {
            const col = ['Vencimento', 'Descrição', 'Valor'];
            const al: TabelaRender['alinhamento'] = ['left', 'left', 'right'];
            const f = ctx.financeiroContrato;
            if (!f) return semContrato(col, al);
            const abertas = f.parcelas.filter(p => !p.quitada);
            return {
                colunas: col, alinhamento: al,
                linhas: abertas.map(p => [dataCurta(p.vencimento), p.descricao, moeda(p.valor)]),
                total: abertas.length ? ['', 'Total em aberto', moeda(somar(abertas.map(p => p.valor)))] : null,
                vazia: abertas.length ? null : 'Nenhuma parcela em aberto.',
            };
        },
    },
    {
        id: 'parcelas_pagas',
        rotulo: 'Parcelas quitadas do contrato',
        descricao: 'Parcelas já quitadas (conciliadas), com o total pago.',
        montar: ctx => {
            const col = ['Vencimento', 'Descrição', 'Valor'];
            const al: TabelaRender['alinhamento'] = ['left', 'left', 'right'];
            const f = ctx.financeiroContrato;
            if (!f) return semContrato(col, al);
            const pagas = f.parcelas.filter(p => p.quitada);
            return {
                colunas: col, alinhamento: al,
                linhas: pagas.map(p => [dataCurta(p.vencimento), p.descricao, moeda(p.valor)]),
                total: pagas.length ? ['', 'Total pago', moeda(somar(pagas.map(p => p.valor)))] : null,
                vazia: pagas.length ? null : 'Nenhuma parcela quitada.',
            };
        },
    },
    {
        id: 'medicoes',
        rotulo: 'Medições do contrato',
        descricao: 'Número, período, data, situação e valor de cada medição.',
        montar: ctx => {
            const col = ['Nº', 'Período', 'Data', 'Situação', 'Valor'];
            const al: TabelaRender['alinhamento'] = ['left', 'left', 'left', 'left', 'right'];
            const f = ctx.financeiroContrato;
            if (!f) return semContrato(col, al);
            return {
                colunas: col, alinhamento: al,
                linhas: f.medicoes.map(m => [
                    m.numero, [dataCurta(m.inicio), dataCurta(m.fim)].filter(Boolean).join(' a '), dataCurta(m.data), m.situacao, moeda(m.valor),
                ]),
                total: f.medicoes.length ? ['', '', '', 'Total', moeda(somar(f.medicoes.map(m => m.valor)))] : null,
                vazia: f.medicoes.length ? null : 'Nenhuma medição registrada.',
            };
        },
    },
    {
        id: 'anexos',
        rotulo: 'Anexos do documento',
        descricao: 'Número e nome de cada anexo listado no documento.',
        montar: ctx => {
            const anexos = ctx.documento?.anexos ?? [];
            return {
                colunas: ['Nº', 'Documento'], alinhamento: ['left', 'left'],
                linhas: anexos.map((a, i) => [String(i + 1), a]),
                vazia: anexos.length ? null : 'Nenhum anexo.',
            };
        },
    },
];

export const FONTE_POR_ID: Record<string, FonteTabela> = Object.fromEntries(FONTES_TABELA.map(f => [f.id, f]));

/** Fontes de tabela usadas no modelo, sem repetição. */
export function fontesDoModelo(conteudo: DocTipTap): string[] {
    const out = new Set<string>();
    const visita = (n: NoTipTap | undefined) => {
        if (!n) return;
        if (n.type === 'tabelaDinamica' && typeof n.attrs?.fonte === 'string') out.add(n.attrs.fonte);
        n.content?.forEach(visita);
    };
    visita(conteudo);
    return [...out];
}

/** As tabelas que o modelo usa, montadas para o documento. */
export function tabelasDoDocumento(modelo: { conteudo: DocTipTap }, ctx: ContextoDoc): Record<string, TabelaRender> {
    const out: Record<string, TabelaRender> = {};
    for (const fonte of fontesDoModelo(modelo.conteudo)) {
        const f = FONTE_POR_ID[fonte];
        if (f) out[fonte] = f.montar(ctx);
    }
    return out;
}
