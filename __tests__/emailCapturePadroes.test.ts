/**
 * Padrões do boleto por remetente monitorado (16/10/2026) — regras puras.
 * Plano: docs/planos/2026-10-16-captura-padroes-do-remetente.md (passo A).
 */
import { describe, it, expect } from 'vitest';
import {
    vencimentoPeloDia,
    dataLocalDoEmail,
    descricaoComMes,
    modeloDaDescricao,
    aplicarPadroesDoRemetente,
    camposDoPadraoIntactos,
    encontrarRemetenteCadastrado,
    remetenteJaCadastrado,
    type CamposParaPadroes,
    type PadroesRemetente,
} from '../utils/emailCaptureRegras';

const vazio = (): CamposParaPadroes => ({
    vencimento: null, valor: null, multa: null, multa_percentual: null, juros_dia: null, juros_dia_tipo: null,
    descricao: null, observacoes: null, project_id: null, cost_center_id: null, plano_de_contas_id: null, category_id: null,
});

const padroes = (p: Partial<PadroesRemetente> = {}): Partial<PadroesRemetente> => ({
    padrao_descricao: 'Energia – {mês}', padrao_observacoes: 'Débito automático',
    padrao_project_id: 'obra1', padrao_cost_center_id: 'cc1', padrao_plano_de_contas_id: 'pc1', padrao_category_id: 'cat1',
    padrao_dia_vencimento: 10, padrao_valor: 546.63,
    padrao_multa: null, padrao_multa_percentual: 2, padrao_juros_dia: 0.033, padrao_juros_dia_tipo: 'percentual',
    ...p,
});

describe('vencimento pelo dia', () => {
    it('mesmo mês, o próprio dia, mês seguinte e virada de ano', () => {
        expect(vencimentoPeloDia(10, '2026-10-05')).toBe('2026-10-10');
        expect(vencimentoPeloDia(10, '2026-10-10')).toBe('2026-10-10');
        expect(vencimentoPeloDia(10, '2026-10-16')).toBe('2026-11-10');
        expect(vencimentoPeloDia(5, '2026-12-20')).toBe('2027-01-05');
    });
    it('dia que o mês não tem vira o último dia do mês', () => {
        expect(vencimentoPeloDia(31, '2026-04-01')).toBe('2026-04-30');
        expect(vencimentoPeloDia(30, '2027-02-01')).toBe('2027-02-28');
        expect(vencimentoPeloDia(30, '2028-02-01')).toBe('2028-02-29');
        expect(vencimentoPeloDia(30, '2027-01-31')).toBe('2027-02-28');
    });
});

describe('data do e-mail no fuso de São Paulo', () => {
    it('madrugada UTC ainda é o dia anterior em Brasília; sem data usa agora', () => {
        expect(dataLocalDoEmail('2026-09-01T02:30:00Z')).toBe('2026-08-31');
        expect(dataLocalDoEmail('2026-09-01T15:00:00Z')).toBe('2026-09-01');
        expect(dataLocalDoEmail(null, new Date('2026-10-16T12:00:00Z'))).toBe('2026-10-16');
    });
});

describe('descrição com o mês', () => {
    it('{mês}, {mes} e {MÊS} viram MM/AAAA do vencimento; sem vencimento, o mês do e-mail', () => {
        expect(descricaoComMes('Energia – {mês}', '2026-08-21', '2026-07-30')).toBe('Energia – 08/2026');
        expect(descricaoComMes('Energia {mes}', '2026-08-21', '2026-07-30')).toBe('Energia 08/2026');
        expect(descricaoComMes('Energia {MÊS}', null, '2026-07-30')).toBe('Energia 07/2026');
        expect(descricaoComMes('Honorários {mês} ({mês})', '2026-09-10', '2026-09-01')).toBe('Honorários 09/2026 (09/2026)');
        expect(descricaoComMes('Sem marcador', '2026-09-10', '2026-09-01')).toBe('Sem marcador');
    });
    it('modelo a partir de uma descrição pronta troca só o mês do vencimento', () => {
        expect(modeloDaDescricao('Energia – 08/2026', '2026-08-21')).toBe('Energia – {mês}');
        expect(modeloDaDescricao('Parcela 08/2026 de 12', '2026-09-10')).toBe('Parcela 08/2026 de 12');
        expect(modeloDaDescricao('Energia', null)).toBe('Energia');
    });
});

describe('aplicar os padrões do remetente', () => {
    it('PDF sem nada: tudo vem do padrão, descrição com o mês do vencimento do padrão', () => {
        const { patch, campos } = aplicarPadroesDoRemetente(vazio(), padroes(), '2026-08-21');
        expect(patch).toEqual({
            vencimento: '2026-09-10', valor: 546.63, multa_percentual: 2, juros_dia: 0.033, juros_dia_tipo: 'percentual',
            descricao: 'Energia – 09/2026', observacoes: 'Débito automático',
            project_id: 'obra1', cost_center_id: 'cc1', plano_de_contas_id: 'pc1', category_id: 'cat1',
        });
        expect(campos.sort()).toEqual(Object.keys(patch).sort());
        expect(Object.values(patch)).not.toContain(null);
    });

    it('o que veio do PDF nunca é trocado', () => {
        const doPdf = { ...vazio(), vencimento: '2026-08-21', valor: 150.52, juros_dia: 0.5, juros_dia_tipo: 'valor' as const };
        const { patch } = aplicarPadroesDoRemetente(doPdf, padroes(), '2026-07-30');
        expect(patch.vencimento).toBeUndefined();
        expect(patch.valor).toBeUndefined();
        // Multa e juros são um grupo: o PDF trouxe juros → nada do padrão (nem a multa).
        expect(patch.multa_percentual).toBeUndefined();
        expect(patch.juros_dia).toBeUndefined();
        expect(patch.descricao).toBe('Energia – 08/2026');
    });

    it('valor zero conta como vazio; juros sem tipo vira "valor"', () => {
        const { patch } = aplicarPadroesDoRemetente({ ...vazio(), valor: 0 }, padroes({ padrao_juros_dia_tipo: null, padrao_multa_percentual: null }), '2026-08-01');
        expect(patch.valor).toBe(546.63);
        expect(patch.juros_dia_tipo).toBe('valor');
    });

    it('texto em branco conta como vazio; texto escrito fica', () => {
        const { patch } = aplicarPadroesDoRemetente({ ...vazio(), descricao: '   ', observacoes: 'minha nota' }, padroes(), '2026-08-01');
        expect(patch.descricao).toBeDefined();
        expect(patch.observacoes).toBeUndefined();
    });

    it('classificação: só os campos vazios', () => {
        const { patch } = aplicarPadroesDoRemetente({ ...vazio(), cost_center_id: 'ccX' }, padroes(), '2026-08-01');
        expect(patch.cost_center_id).toBeUndefined();
        expect(patch.project_id).toBe('obra1');
    });

    it('sem padrões: patch vazio; a entrada não é alterada', () => {
        const entrada = vazio();
        const copia = JSON.stringify(entrada);
        expect(aplicarPadroesDoRemetente(entrada, {}, '2026-08-01')).toEqual({ patch: {}, campos: [] });
        aplicarPadroesDoRemetente(entrada, padroes(), '2026-08-01');
        expect(JSON.stringify(entrada)).toBe(copia);
    });
});

describe('releitura: o que veio do padrão e o usuário não mexeu', () => {
    it('intacto pode ser trocado pelo PDF; alterado pelo usuário fica', () => {
        const gravado = { vencimento: '2026-09-10', descricao: 'Energia – 09/2026', cost_center_id: 'cc1' };
        expect(camposDoPadraoIntactos({ vencimento: '2026-09-10', descricao: 'Energia – 09/2026', cost_center_id: 'ccOutro' }, gravado).sort())
            .toEqual(['descricao', 'vencimento']);
    });
    it('multa e juros como grupo: o usuário mexer em qualquer um tira o grupo inteiro', () => {
        const gravado = { multa_percentual: 2, juros_dia: 0.033, juros_dia_tipo: 'percentual' as const };
        expect(camposDoPadraoIntactos({ multa_percentual: 2, juros_dia: 0.033, juros_dia_tipo: 'percentual' }, gravado).sort())
            .toEqual(['juros_dia', 'juros_dia_tipo', 'multa_percentual']);
        expect(camposDoPadraoIntactos({ multa_percentual: 2, juros_dia: 0.05, juros_dia_tipo: 'percentual' }, gravado)).toEqual([]);
        expect(camposDoPadraoIntactos({ multa: 10, multa_percentual: 2, juros_dia: 0.033, juros_dia_tipo: 'percentual' }, gravado)).toEqual([]);
    });
    it('número que volta do banco como texto ainda conta como igual', () => {
        expect(camposDoPadraoIntactos({ valor: '546.63' as unknown as number }, { valor: 546.63 })).toEqual(['valor']);
    });
});

describe('cadastro existente do endereço', () => {
    const cadastros = [
        { id: 'dom', tipo: 'dominio' as const, email: null, dominio: 'energisa.com.br' },
        { id: 'exa', tipo: 'exato' as const, email: 'faturas@energisa.com.br', dominio: null },
    ];
    it('exato ganha de domínio; subdomínio casa; trecho parecido não', () => {
        expect(encontrarRemetenteCadastrado('Energisa <faturas@energisa.com.br>', cadastros)?.id).toBe('exa');
        expect(encontrarRemetenteCadastrado('reaviso@mail.energisa.com.br', cadastros)?.id).toBe('dom');
        expect(encontrarRemetenteCadastrado('x@falso-energisa.com.br', cadastros)).toBeNull();
        expect(remetenteJaCadastrado('outro@energisa.com.br', cadastros)).toBe(true);
    });
});
