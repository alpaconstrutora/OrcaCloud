/**
 * Relatório de BI por e-mail (F11/F55, varredura de 15/11/2026; decisão de 18/11: "só membros").
 *
 * A `send-bi-report` deixou de repassar assunto e HTML do cliente: o molde é
 * fixo (`relatorio.ts`), os valores entram escapados, e os destinatários são
 * conferidos contra os membros da organização na hora do envio (`regras.ts`).
 * A Edge em si é provada de fora (POST sem header = 401) depois de publicada.
 */
import { describe, expect, it } from 'vitest';
import { montarRelatorioBI, dataBrasilia, textoDeUmaLinha, MAX_NARRATIVA } from '../supabase/functions/send-bi-report/relatorio';
import { conferirDestinatarios, dataValida, uuidOpcional, MAX_DESTINATARIOS } from '../supabase/functions/send-bi-report/regras';

const ATAQUE = '<a href="https://phish.example/login">Atualize seu cadastro</a><script>alert(1)</script>';

const base = () => ({
    nomeOrganizacao: 'Alpa Construtora',
    dateFrom: '2026-01-01',
    dateTo: '2026-12-31',
    // 18/11/2026 01:30 UTC = 17/11/2026 22:30 em São Paulo
    geradoEm: new Date('2026-11-18T01:30:00Z'),
    kpis: {
        comercial: { vgv_fechado: 1234567, taxa_conversao_pct: 12.345, ticket_medio: 500000 },
        operacional: { obras_ativas: 7 },
        rh: { periodo: { turnover_pct: 3.2 }, headcount: { ativos: 42 } },
        dre: [
            { linha: 'Receita Bruta', realizado: 1000000, previsto: 0 },
            { linha: '= EBITDA', realizado: -25000, previsto: 0 },
            { linha: 'Sem valor', realizado: null, previsto: 0 },
        ],
    },
    tendencia: Array.from({ length: 8 }, (_, i) => ({ mes: `2026-0${i + 1}`, receita: (i + 1) * 1000, ebitda: i * 100 })),
    narrativa: 'Primeiro parágrafo.\nSegundo parágrafo.',
});

describe('montarRelatorioBI — molde fixo, valores escapados', () => {
    it('assunto no formato de antes, com o dia civil de São Paulo', () => {
        const { assunto } = montarRelatorioBI(base());
        expect(assunto).toBe('Relatório Executivo — Alpa Construtora — 17/11/2026');
        expect(dataBrasilia(new Date('2026-11-18T03:00:00Z'))).toBe('18/11/2026');
    });

    it('HTML do nome da organização, da narrativa, do rótulo do DRE e do mês sai escapado', () => {
        const { html, assunto } = montarRelatorioBI({
            ...base(),
            nomeOrganizacao: ATAQUE,
            narrativa: `Texto ${ATAQUE}`,
            kpis: { ...base().kpis, dre: [{ linha: '<img src=x onerror=alert(1)>', realizado: 1 }] },
            tendencia: [{ mes: '<b>jan</b>', receita: 1, ebitda: 1 }],
        });
        expect(html).not.toContain('<a href');
        expect(html).not.toContain('<script');
        expect(html).not.toContain('<img');
        expect(html).not.toContain('<b>jan</b>');
        expect(html).toContain('&lt;a href=&quot;https://phish.example/login&quot;&gt;');
        expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
        // O assunto é cabeçalho, não HTML: vai como texto, sem quebra de linha.
        expect(assunto).not.toMatch(/[\r\n]/);
    });

    it('quebra de linha da narrativa vira <br> DEPOIS do escape; CR/LF no nome não chega ao assunto', () => {
        const { html, assunto } = montarRelatorioBI({
            ...base(),
            nomeOrganizacao: 'Alpa\r\nBcc: alvo@x.com',
            narrativa: 'a < b\r\nfim',
        });
        expect(html).toContain('<div class="narrative">a &lt; b<br>fim</div>');
        expect(assunto).toBe('Relatório Executivo — Alpa Bcc: alvo@x.com — 17/11/2026');
    });

    it('números em pt-BR; valor que não é número vira "—"; linha do DRE sem realizado fica de fora', () => {
        const { html } = montarRelatorioBI(base());
        expect(html).toMatch(/VGV Fechado<\/div><div class="value">R\$\s1\.234\.567<\/div>/);
        expect(html).toContain('<div class="value">12.3%</div>');
        expect(html).toContain('<div class="value">7</div>');
        expect(html).toContain('<div class="value">42</div>');
        expect(html).toMatch(/= EBITDA<\/td><td[^>]*>-R\$\s25\.000</);
        expect(html).not.toContain('Sem valor');

        const ruim = montarRelatorioBI({ ...base(), kpis: { comercial: { vgv_fechado: '<b>1</b>' }, operacional: { obras_ativas: 'x' } } });
        expect(ruim.html).toContain('VGV Fechado</div><div class="value">—</div>');
        expect(ruim.html).toContain('Obras Ativas</div><div class="value">—</div>');
        expect(ruim.html).not.toContain('<b>1</b>');
    });

    it('tendência: só os últimos 6 meses; seções sem dado e narrativa vazia somem', () => {
        const { html } = montarRelatorioBI(base());
        expect(html).not.toContain('<td>2026-02</td>');
        expect(html).toContain('<td>2026-03</td>');
        expect(html).toContain('<td>2026-08</td>');

        const vazio = montarRelatorioBI({ ...base(), kpis: null, tendencia: 'lixo', narrativa: '   ' });
        expect(vazio.html).not.toContain('Resumo Executivo');
        expect(vazio.html).not.toContain('DRE Consolidada');
        expect(vazio.html).not.toContain('Tendência');
        expect(vazio.html).toContain('Indicadores-Chave');
    });

    it('sem nome vira "Empresa"; textos longos são cortados', () => {
        expect(montarRelatorioBI({ ...base(), nomeOrganizacao: null }).assunto).toContain('— Empresa —');
        expect(textoDeUmaLinha('x'.repeat(500), 120)).toHaveLength(120);
        const { html } = montarRelatorioBI({ ...base(), narrativa: 'n'.repeat(MAX_NARRATIVA + 500) });
        expect(html).toContain('n'.repeat(MAX_NARRATIVA));
        expect(html).not.toContain('n'.repeat(MAX_NARRATIVA + 1));
    });
});

describe('conferirDestinatarios — só membros recebem, conferido na hora', () => {
    const membros = ['ana@alpa.com.br', 'Bruno@Alpa.com.br '];

    it('membro passa, normalizado e sem repetição', () => {
        expect(conferirDestinatarios([' ANA@alpa.com.br', 'bruno@alpa.com.br', 'ana@alpa.com.br'], membros))
            .toEqual({ ok: true, destinatarios: ['ana@alpa.com.br', 'bruno@alpa.com.br'] });
    });

    it('um de fora recusa o envio inteiro e diz quem foi recusado (403)', () => {
        expect(conferirDestinatarios(['ana@alpa.com.br', 'Vitima@Gmail.com'], membros)).toEqual({
            ok: false,
            status: 403,
            erro: 'Só membros da organização, com e-mail confirmado, recebem o relatório.',
            recusados: ['vitima@gmail.com'],
        });
    });

    it('estar na lista do agendamento não basta: sem membros, ninguém recebe', () => {
        const r = conferirDestinatarios(['ana@alpa.com.br'], []);
        expect(r.ok).toBe(false);
        expect(r.ok ? 0 : r.status).toBe(403);
    });

    it('pedido malformado é 400: não-lista, vazio, item não-texto, longo demais, acima do teto', () => {
        for (const ruim of [undefined, 'ana@alpa.com.br', {}, [], ['  ']]) {
            expect(conferirDestinatarios(ruim, membros)).toMatchObject({ ok: false, status: 400 });
        }
        expect(conferirDestinatarios(['ana@alpa.com.br', 42], membros)).toMatchObject({ ok: false, status: 400 });
        expect(conferirDestinatarios([`${'a'.repeat(400)}@x.com`], membros)).toMatchObject({ ok: false, status: 400 });
        const muitos = Array.from({ length: MAX_DESTINATARIOS + 1 }, (_, i) => `p${i}@alpa.com.br`);
        expect(conferirDestinatarios(muitos, muitos)).toMatchObject({ ok: false, status: 400 });
        expect(conferirDestinatarios(muitos.slice(0, MAX_DESTINATARIOS), muitos)).toMatchObject({ ok: true });
    });
});

describe('entrada da send-bi-report', () => {
    it('período: só AAAA-MM-DD que existe', () => {
        expect(dataValida('2026-02-28')).toBe('2026-02-28');
        expect(dataValida('2026-02-31')).toBeNull();
        expect(dataValida('2026-2-1')).toBeNull();
        expect(dataValida('2026-01-01T00:00:00Z')).toBeNull();
        expect(dataValida(20260101)).toBeNull();
    });

    it('id opcional: ausente = null, uuid = ele, o resto = invalido', () => {
        expect(uuidOpcional(undefined)).toBeNull();
        expect(uuidOpcional(null)).toBeNull();
        expect(uuidOpcional('')).toBeNull();
        expect(uuidOpcional('0E984725-C51C-4BF4-9960-E1C80E27ABA0')).toBe('0e984725-c51c-4bf4-9960-e1c80e27aba0');
        expect(uuidOpcional("x' or 1=1")).toBe('invalido');
        expect(uuidOpcional(7)).toBe('invalido');
    });
});
