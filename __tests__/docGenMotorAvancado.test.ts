import { describe, it, expect } from 'vitest';
import { avaliarCondicao, chavesDaCondicao, erroDaCondicao, numeroBr } from '../services/docGen/condicional';
import { FONTES_TABELA, fontesDoModelo, tabelasDoDocumento } from '../services/docGen/tabelasDinamicas';
import { contextoDeExemplo, diasEntre, resolverCampos } from '../services/docGen/catalogoCampos';
import { chavesDoModelo, montarDocDefinition } from '../services/docGen/motorRender';
import { validarDocumento } from '../services/docGen/validarDocumento';
import { LAYOUT_PADRAO, type DocTipTap } from '../types/docGen';

/** F6 — motor avançado: condições, tabelas dinâmicas, campos calculados (Fase 3). */

const P = (texto: string) => ({ type: 'paragraph', content: [{ type: 'text', text: texto }] });

describe('condições', () => {
    const v = {
        'destinatario.tipo': 'Órgão público',
        'contrato.saldo_a_pagar': 'R$ 687.500,00',
        'contrato.percentual_pago': '45%',
        'obra.cno': '',
        'documento.em_resposta_a': 'Ofício nº 9/2026',
    };

    it('texto, número brasileiro, preenchido/vazio, contém', () => {
        expect(avaliarCondicao('destinatario.tipo = "órgão PÚBLICO"', v).valor).toBe(true);
        expect(avaliarCondicao('destinatario.tipo != "Órgão público"', v).valor).toBe(false);
        expect(avaliarCondicao('contrato.saldo_a_pagar > 0', v).valor).toBe(true);
        expect(avaliarCondicao('contrato.saldo_a_pagar >= 687500', v).valor).toBe(true);
        expect(avaliarCondicao('contrato.percentual_pago < 50', v).valor).toBe(true);
        expect(avaliarCondicao('obra.cno vazio', v).valor).toBe(true);
        expect(avaliarCondicao('obra.cno preenchido', v).valor).toBe(false);
        expect(avaliarCondicao('documento.em_resposta_a', v).valor).toBe(true);
        expect(avaliarCondicao('documento.em_resposta_a contém "9/2026"', v).valor).toBe(true);
    });

    it('e, ou, não e parênteses com a precedência certa', () => {
        expect(avaliarCondicao('obra.cno preenchido ou contrato.saldo_a_pagar > 0 e destinatario.tipo = "Órgão público"', v).valor).toBe(true);
        expect(avaliarCondicao('(obra.cno preenchido ou contrato.saldo_a_pagar > 0) e destinatario.tipo = "Outro"', v).valor).toBe(false);
        expect(avaliarCondicao('não obra.cno preenchido', v).valor).toBe(true);
        expect(avaliarCondicao('nao (obra.cno vazio)', v).valor).toBe(false);
    });

    it('comparação numérica sem número é falsa, não erro; variável desconhecida é vazia', () => {
        expect(avaliarCondicao('destinatario.tipo > 3', v)).toEqual({ valor: false, erro: null });
        expect(avaliarCondicao('variavel.que_nao_existe vazio', v).valor).toBe(true);
    });

    it('erro de escrita é explicado, e a condição inválida vale falso', () => {
        expect(erroDaCondicao('contrato.saldo_a_pagar >')).toMatch(/terminou no meio/);
        expect(erroDaCondicao('(obra.cno preenchido')).toMatch(/Parêntese/);
        expect(erroDaCondicao('destinatario.tipo = "aberto')).toMatch(/Aspas/);
        expect(erroDaCondicao('a b')).toMatch(/Sobrou "b"/);
        expect(erroDaCondicao('')).toMatch(/vazia/);
        expect(avaliarCondicao('a >', v)).toMatchObject({ valor: false });
        expect(erroDaCondicao('obra.cno preenchido e contrato.saldo_a_pagar > 0')).toBeNull();
    });

    it('números brasileiros e as variáveis citadas', () => {
        expect(numeroBr('R$ 1.250.000,00')).toBe(1250000);
        expect(numeroBr('35,5%')).toBe(35.5);
        expect(numeroBr('1.250.000')).toBe(1250000);
        expect(numeroBr('3.5')).toBe(3.5);
        expect(numeroBr('2026-10-30')).toBeNaN();
        expect(chavesDaCondicao('a.b = c.d ou e.f vazio')).toEqual(['a.b', 'c.d', 'e.f']);
        expect(chavesDaCondicao('a >')).toEqual([]);
    });
});

describe('campos calculados', () => {
    it('saldo, pago, medido e percentuais a partir das parcelas e medições', () => {
        const ctx = contextoDeExemplo();
        const r = resolverCampos(['contrato.valor_pago', 'contrato.valor_em_aberto', 'contrato.saldo_a_pagar', 'contrato.percentual_pago', 'contrato.valor_medido', 'contrato.percentual_medido', 'contrato.dias_para_terminar', 'documento.dias_para_resposta', 'documento.prazo_resposta'], ctx);
        const nbsp = (s: string) => s.replace(/ /g, ' ');
        expect(nbsp(r['contrato.valor_pago'])).toBe('R$ 562.500,00');
        expect(nbsp(r['contrato.valor_em_aberto'])).toBe('R$ 187.500,00');
        expect(nbsp(r['contrato.saldo_a_pagar'])).toBe('R$ 687.500,00');
        expect(r['contrato.percentual_pago']).toBe('45%');
        // Medição "Pendente" não conta como medido.
        expect(nbsp(r['contrato.valor_medido'])).toBe('R$ 562.500,00');
        expect(r['contrato.dias_para_terminar']).toBe(String(diasEntre('2026-10-07', '2027-02-28')));
        expect(r['documento.dias_para_resposta']).toBe('15');
        expect(r['documento.prazo_resposta']).toBe('22/10/2026');
    });

    it('sem contrato ou sem financeiro, o campo fica vazio (pendente), não zero', () => {
        const ctx = { ...contextoDeExemplo(), financeiroContrato: null };
        expect(resolverCampos(['contrato.saldo_a_pagar'], ctx)['contrato.saldo_a_pagar']).toBe('');
        const semContrato = { ...contextoDeExemplo(), contract: null };
        expect(resolverCampos(['contrato.valor_pago'], semContrato)['contrato.valor_pago']).toBe('');
    });

    it('dias entre datas sem fuso', () => {
        expect(diasEntre('2026-10-10', '2026-10-30')).toBe(20);
        expect(diasEntre('2026-12-31', '2027-01-01')).toBe(1);
        expect(diasEntre('2026-10-10', null)).toBeNull();
    });
});

describe('tabelas dinâmicas e o motor', () => {
    const MODELO: DocTipTap = {
        type: 'doc',
        content: [
            P('Início'),
            { type: 'condicional', attrs: { expressao: 'contrato.saldo_a_pagar > 0' }, content: [P('Há saldo a pagar.')] },
            { type: 'condicional', attrs: { expressao: 'obra.cno vazio' }, content: [P('Sem CNO.')] },
            { type: 'condicional', attrs: { expressao: 'contrato.saldo_a_pagar >' }, content: [P('Nunca.')] },
            { type: 'tabelaDinamica', attrs: { fonte: 'parcelas_em_aberto' } },
            { type: 'tabelaDinamica', attrs: { fonte: 'medicoes' } },
        ],
    };

    it('o modelo declara as fontes e as variáveis das condições', () => {
        expect(fontesDoModelo(MODELO)).toEqual(['parcelas_em_aberto', 'medicoes']);
        expect(chavesDoModelo(MODELO)).toEqual(expect.arrayContaining(['contrato.saldo_a_pagar', 'obra.cno']));
        expect(chavesDoModelo(MODELO, undefined, false)).toEqual([]);
    });

    it('tabelas montadas do contexto, com total; sem contrato, explicação', () => {
        const ctx = contextoDeExemplo();
        const t = tabelasDoDocumento({ conteudo: MODELO }, ctx);
        expect(t.parcelas_em_aberto.linhas).toHaveLength(1);
        expect(t.parcelas_em_aberto.linhas[0][0]).toBe('10/10/2026');
        expect(t.parcelas_em_aberto.total?.[1]).toBe('Total em aberto');
        expect(t.medicoes.linhas.map(l => l[0])).toEqual(['01', '02', '03']);
        const vazio = FONTES_TABELA.find(f => f.id === 'medicoes')!.montar({ ...ctx, financeiroContrato: null });
        expect(vazio.linhas).toEqual([]);
        expect(vazio.vazia).toMatch(/Sem contrato/);
    });

    it('no PDF: condição verdadeira entra, falsa some, inválida só aparece na prévia; tabela vira table', () => {
        const ctx = contextoDeExemplo();
        const valores = { 'contrato.saldo_a_pagar': 'R$ 687.500,00', 'obra.cno': '12.345' };
        const base = { conteudo: MODELO, layout: LAYOUT_PADRAO, valores, tabelas: tabelasDoDocumento({ conteudo: MODELO }, ctx) };
        const previa = JSON.stringify(montarDocDefinition({ ...base, marcarCondicaoInvalida: true }).content);
        const oficial = JSON.stringify(montarDocDefinition(base).content);
        expect(previa).toContain('Há saldo a pagar.');
        expect(previa).not.toContain('Sem CNO.');
        expect(previa).toContain('[[condição inválida: contrato.saldo_a_pagar >');
        expect(oficial).not.toContain('condição inválida');
        expect(oficial).not.toContain('Nunca.');
        expect(oficial).toContain('"headerRows":1');
        expect(oficial).toContain('Total em aberto');
    });

    it('validação: condição inválida bloqueia; variável só de condição não é cobrada', () => {
        const p = validarDocumento({
            modelo: { conteudo: MODELO, layout: { ...LAYOUT_PADRAO, cabecalho: { ...LAYOUT_PADRAO.cabecalho, mostrar: false }, rodape: { ...LAYOUT_PADRAO.rodape, mostrar: false } }, campos_obrigatorios: [] },
            assunto: 'x', temDestinatario: true, quantidadeSignatarios: 0, conteudo: {}, valores: {},
        });
        expect(p.filter(x => x.chave.startsWith('condicao:')).map(x => x.severidade)).toEqual(['bloqueante']);
        expect(p.some(x => x.chave === 'obra.cno')).toBe(false);
    });
});
