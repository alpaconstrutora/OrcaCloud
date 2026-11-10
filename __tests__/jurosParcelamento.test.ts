import { describe, it, expect } from 'vitest';
import {
    calcularParcelasComJuros,
    montarPlanoComJuros,
    preverPlano,
    montarPlanoNoNegocio,
    resumoDoPlano,
    editarValorTotal,
    valorDoContratoPeloPlano,
    manterJurosDoBlocoEditado,
    planoComoSchedule,
    atualizacaoDoContratoPeloPlano,
    espelhoDoPlano,
    replanejarSerie,
    type PlanoComJuros,
    type CamposDoPlano,
    type NegocioDoPlano,
} from '../utils/jurosParcelamento';
import { agruparPlano, expandirBloco, montarPlanoRapido, saldoDoPlano, type BlocoPagamento } from '../utils/paymentPlan';
import type { PropertyDeal } from '../types/imovib';

const dois = (n: number) => Number(n.toFixed(2));
const soma = (xs: number[]) => dois(xs.reduce((s, x) => s + x, 0));

const plano = (over: Partial<PlanoComJuros> = {}): PlanoComJuros => ({
    precoSemJuros: 100000,
    entrada: 0,
    parcelas: 12,
    tipo: 'MENSAL',
    intervaloMeses: 1,
    primeiroVencimento: '2026-12-10',
    dataBase: '2026-11-10',
    taxaMensal: 1,
    sistema: 'PRICE',
    ...over,
});

describe('calcularParcelasComJuros', () => {
    it('price sem carência', () => {
        const l = calcularParcelasComJuros(plano());
        expect(l).toHaveLength(12);
        expect(l[0]).toMatchObject({ vencimento: '2026-12-10', valor: 8884.88, juros: 1000, principal: 7884.88 });
        expect(l[11].valor).toBe(8884.85);
        expect(soma(l.map(x => x.valor))).toBe(106618.53);
        expect(soma(l.map(x => x.principal))).toBe(100000);
        expect(soma(l.map(x => x.juros))).toBe(6618.53);
    });

    it('price com carência de 3 meses', () => {
        const l = calcularParcelasComJuros(plano({ primeiroVencimento: '2027-02-10' }));
        expect(l[0].valor).toBe(9063.46);
        expect(l[11].valor).toBe(9063.54);
        expect(soma(l.map(x => x.valor))).toBe(108761.6);
        expect(l[0].juros).toBe(3030.1);
        expect(l[0].principal).toBe(6033.36);
        expect(soma(l.map(x => x.principal))).toBe(100000);
        expect(soma(l.map(x => x.juros))).toBe(8761.6);
    });

    it('price trimestral', () => {
        const l = calcularParcelasComJuros(plano({
            parcelas: 4, intervaloMeses: 3, tipo: 'TRIMESTRAL', primeiroVencimento: '2027-02-10',
        }));
        expect(l.map(x => x.vencimento)).toEqual(['2027-02-10', '2027-05-10', '2027-08-10', '2027-11-10']);
        expect(l[0].valor).toBe(26922.07);
        expect(l[0].juros).toBe(3030.1);
        expect(soma(l.map(x => x.valor))).toBe(107688.28);
        expect(soma(l.map(x => x.principal))).toBe(100000);
    });

    it('sac', () => {
        const l = calcularParcelasComJuros(plano({ precoSemJuros: 120000, sistema: 'SAC' }));
        expect(l[0].valor).toBe(11200);
        expect(l[11].valor).toBe(10100);
        expect(soma(l.map(x => x.valor))).toBe(127800);
        expect(l.every(x => x.principal === 10000)).toBe(true);
    });

    it('entrada não paga juros: a base é preço − entrada', () => {
        const l = calcularParcelasComJuros(plano({ precoSemJuros: 120000, entrada: 20000 }));
        expect(l[0]).toMatchObject({ valor: 8884.88, juros: 1000, principal: 7884.88 });
        expect(soma(l.map(x => x.valor))).toBe(106618.53);
        expect(soma(l.map(x => x.principal))).toBe(100000);
    });

    it('taxa 0 não quebra: parcelas iguais, sem juros, soma fecha na base', () => {
        const l = calcularParcelasComJuros(plano({ taxaMensal: 0, precoSemJuros: 1000, parcelas: 3 }));
        expect(l.map(x => x.valor)).toEqual([333.33, 333.33, 333.34]);
        expect(soma(l.map(x => x.juros))).toBe(0);
        expect(soma(l.map(x => x.principal))).toBe(1000);
    });
});

describe('montarPlanoComJuros', () => {
    it('price: 2 blocos (11× + última) e totais', () => {
        const r = montarPlanoComJuros(plano({ precoSemJuros: 120000, entrada: 20000 }));
        expect(r.entrada).toBe(20000);
        expect(r.blocos).toHaveLength(2);
        expect(r.blocos[0]).toMatchObject({ quantidade: 11, valorParcela: 8884.88, primeiroVencimento: '2026-12-10' });
        expect(r.blocos[0].juros).toHaveLength(11);
        expect(r.blocos[0].principal).toHaveLength(11);
        expect(r.blocos[1]).toMatchObject({ quantidade: 1, valorParcela: 8884.85, primeiroVencimento: '2027-11-10' });
        expect(r.totalComJuros).toBe(dois(20000 + 106618.53));
        expect(r.totalJuros).toBe(6618.53);
    });
});

// ── "Montar plano" na negociação (a transição que o DealModal aplica) ─────────
// Ruling 3 do plano: a parte de estado do botão "Montar plano" é pura e é
// testada aqui; o componente só junta os campos da tela e faz setFormData.
const negocio = (over: Partial<PropertyDeal> = {}): Partial<PropertyDeal> => ({
    type: 'SALE',
    value: 100000,
    date: '2026-11-10',
    contract_total_value: 100000,
    ...over,
});
const campos = (over: Partial<CamposDoPlano> = {}): CamposDoPlano => ({
    entrada: 0,
    parcelas: 12,
    tipo: 'MENSAL',
    intervaloMeses: 1,
    primeiroVencimento: '2026-12-10',
    taxaMensal: 1,
    sistema: 'PRICE',
    ...over,
});
/** O que `setFormData(prev => ({ ...prev, ...patch }))` faz na tela. */
const montar = (d: Partial<PropertyDeal>, c: CamposDoPlano) =>
    ({ ...d, ...montarPlanoNoNegocio(d as NegocioDoPlano, c, 'plano-t') });

describe('montarPlanoNoNegocio — juros na negociação', () => {
    it('com juros grava taxa, sistema, preço sem juros, total com juros e linhas com interest/principal', () => {
        const d = montar(negocio(), campos());
        expect(d.interest_rate_monthly).toBe(1);
        expect(d.amortization_system).toBe('PRICE');
        expect(d.price_before_interest).toBe(100000);
        expect(d.contract_total_value).toBe(106618.53);
        expect(d.custom_installments).toHaveLength(12);
        expect(d.custom_installments![0]).toMatchObject({ value: 8884.88, interest: 1000, principal: 7884.88, dueDate: '2026-12-10' });
        expect(d.custom_installments![11]).toMatchObject({ value: 8884.85 });
        expect(soma(d.custom_installments!.map(l => l.principal!))).toBe(100000);
        expect(d.down_payment).toBe(0);
        expect(d.payment_due_date).toBe('2026-12-10');
        // Espelho (Nº de Parcelas / Valor Mensal): as 12 parcelas e a parcela fixa.
        // Até 10/11/2026 dava 11 — o maior bloco; a 12ª (centavos) é bloco próprio.
        expect(d.installment_value).toBe(8884.88);
        expect(d.installments).toBe(12);
    });

    it('SAC grava o espelho: 12 parcelas, Valor Mensal = a 1ª (a maior)', () => {
        // Antes: SAC são 12 blocos de 1× e blocoParaGerador devolvia null — o
        // nº/valor antigo da negociação ficava gravado e ia para o contrato.
        const d = montar(negocio({ installments: 36, installment_value: 999 }), campos({ sistema: 'SAC' }));
        expect(d.custom_installments![0]).toMatchObject({ value: 9333.33, interest: 1000 });
        expect(d.installments).toBe(12);
        expect(d.installment_value).toBe(9333.33);
    });

    it('espelhoDoPlano sem juros = blocoParaGerador (maior série periódica)', () => {
        const blocos = [
            { tipo: 'MENSAL', quantidade: 10, valorParcela: 1000, primeiroVencimento: '2026-12-10', intervaloMeses: 1 },
            { tipo: 'ANUAL', quantidade: 2, valorParcela: 20000, primeiroVencimento: '2027-06-10', intervaloMeses: 12 },
        ];
        expect(espelhoDoPlano(blocos)).toEqual({ valor: 20000, quantidade: 2 });
        expect(espelhoDoPlano([])).toBeNull();
    });

    it('remontar não aplica juros sobre juros', () => {
        const d1 = montar(negocio(), campos());
        expect(d1.contract_total_value).toBe(106618.53);
        // Mesmo painel, nada mudou: o preço sem juros sai de price_before_interest.
        const d2 = montar(d1, campos());
        expect(d2.contract_total_value).toBe(106618.53);
        expect(d2.price_before_interest).toBe(100000);
    });

    it('juros zero volta ao plano simples', () => {
        const d1 = montar(negocio(), campos());
        const d2 = montar(d1, campos({ taxaMensal: 0 }));
        expect(d2.contract_total_value).toBe(100000);
        expect(d2.interest_rate_monthly).toBeNull();
        expect(d2.amortization_system).toBeNull();
        expect(d2.price_before_interest).toBeNull();
        const valores = d2.custom_installments!.map(l => l.value);
        expect(valores).toHaveLength(12);
        expect(valores.slice(0, 11).every(v => v === 8333.33)).toBe(true);
        expect(valores[11]).toBe(8333.37);
        expect(d2.custom_installments!.some(l => 'interest' in l || 'principal' in l)).toBe(false);
    });

    it('editar bloco à mão limpa o destaque', () => {
        const d1 = montar(negocio(), campos());
        // O que salvarBloco faz: reagrupa o cronograma, troca o bloco editado
        // (o formulário do Sheet não tem juros) e expande tudo de novo.
        const blocos = agruparPlano(d1.custom_installments!);
        expect(blocos.map(b => b.quantidade)).toEqual([11, 1]);
        const editado = { tipo: 'MENSAL', quantidade: 11, valorParcela: 9000, primeiroVencimento: '2026-12-10', intervaloMeses: 1 };
        const linhas = blocos.map((b, i) => (i === 0 ? editado : b)).flatMap((b, i) => expandirBloco(b, `e-${i}`));
        expect(linhas.slice(0, 11).some(l => 'interest' in l || 'principal' in l)).toBe(false);
        // O bloco que NÃO foi editado continua com a decomposição dele.
        expect(linhas[11].interest).toBeGreaterThan(0);
        expect(linhas[11].principal).toBeGreaterThan(0);
    });

    it('editar bloco só na forma de pagamento/observação mantém o destaque (Price)', () => {
        const d1 = montar(negocio(), campos());
        const blocos = agruparPlano(d1.custom_installments!);
        // O que o Sheet devolve ao trocar só a forma de pagamento: mesmos nº,
        // valor, 1º vencimento e intervalo; o formulário não tem juros.
        const doSheet = {
            tipo: 'MENSAL', quantidade: 11, valorParcela: 8884.88, primeiroVencimento: '2026-12-10',
            intervaloMeses: 1, paymentType: 'BOLETO' as const, notes: 'boleto bancário',
        };
        const editado = manterJurosDoBlocoEditado(blocos[0], doSheet);
        expect(editado.paymentType).toBe('BOLETO');
        expect(editado.notes).toBe('boleto bancário');
        const linhas = blocos.map((b, i) => (i === 0 ? editado : b)).flatMap((b, i) => expandirBloco(b, `e-${i}`));
        expect(linhas.map(l => l.interest)).toEqual(d1.custom_installments!.map(l => l.interest));
        expect(linhas.map(l => l.principal)).toEqual(d1.custom_installments!.map(l => l.principal));
        expect(linhas.slice(0, 11).every(l => l.paymentType === 'BOLETO')).toBe(true);
    });

    it('SAC (N blocos de 1×): trocar a forma de pagamento de um bloco mantém o destaque', () => {
        const d1 = montar(negocio({ contract_total_value: 120000 }), campos({ sistema: 'SAC' }));
        const blocos = agruparPlano(d1.custom_installments!);
        expect(blocos[0].quantidade).toBe(1);
        // Bloco de 1× vem de agruparPlano com intervalo null; o Sheet devolve o
        // intervalo do tipo (MENSAL = 1). Numa parcela só o intervalo não importa.
        expect(blocos[0].intervaloMeses).toBeNull();
        const doSheet = {
            tipo: 'MENSAL', quantidade: 1, valorParcela: blocos[0].valorParcela,
            primeiroVencimento: blocos[0].primeiroVencimento, intervaloMeses: 1, paymentType: 'PIX' as const,
        };
        const editado = manterJurosDoBlocoEditado(blocos[0], doSheet);
        expect(editado.juros).toEqual(blocos[0].juros);
        expect(editado.principal).toEqual(blocos[0].principal);
    });

    it('editar bloco mudando nº, valor, 1º vencimento ou intervalo limpa o destaque', () => {
        const d1 = montar(negocio(), campos());
        const [b0] = agruparPlano(d1.custom_installments!);
        const base = { tipo: 'MENSAL', quantidade: 11, valorParcela: 8884.88, primeiroVencimento: '2026-12-10', intervaloMeses: 1 };
        for (const mudou of [
            { quantidade: 10 },
            { valorParcela: 9000 },
            { primeiroVencimento: '2027-01-10' },
            { intervaloMeses: 2 },
        ]) {
            const editado = manterJurosDoBlocoEditado(b0, { ...base, ...mudou });
            expect(editado).not.toHaveProperty('juros');
            expect(editado).not.toHaveProperty('principal');
        }
        // Bloco novo (sem original) ou original sem juros: nada a carregar.
        expect(manterJurosDoBlocoEditado(undefined, base)).not.toHaveProperty('juros');
    });

    it('negócio sem juros: idêntico ao gerador simples, sem nenhuma coluna nova no patch', () => {
        const c = campos({ taxaMensal: 0, entrada: 20000 });
        const patch = montarPlanoNoNegocio(negocio({ contract_total_value: 120000 }) as NegocioDoPlano, c, 'plano-t');
        expect('interest_rate_monthly' in patch).toBe(false);
        expect('amortization_system' in patch).toBe(false);
        expect('price_before_interest' in patch).toBe(false);
        expect('contract_total_value' in patch).toBe(false);
        const simples = montarPlanoRapido({
            total: 120000, entrada: 20000, parcelas: 12, tipo: 'MENSAL', intervaloMeses: 1, primeiroVencimento: '2026-12-10',
        });
        expect(patch.custom_installments).toEqual(simples.blocos.flatMap((b, i) => expandirBloco(b, `plano-t-${i}`)));
        expect(patch.down_payment).toBe(20000);
        expect(patch.down_payment_installment_type).toBe('SINAL');
    });

    it('locação nunca aplica juros, mesmo com taxa digitada', () => {
        const d = montar(
            { type: 'RENTAL', value: 2500, date: '2026-11-10' },
            campos({ entrada: 999, taxaMensal: 1 }),
        );
        expect(d.interest_rate_monthly).toBeUndefined();
        expect(d.price_before_interest).toBeUndefined();
        expect(d.contract_total_value).toBe(30000);
        expect(d.custom_installments!.every(l => l.value === 2500 && !('interest' in l))).toBe(true);
    });

    it('preço sem juros digitado vale mais que o gravado; entrada não paga juros', () => {
        const d = montar(negocio({ contract_total_value: 999999 }), campos({ precoSemJuros: 120000, entrada: 20000 }));
        expect(d.price_before_interest).toBe(120000);
        expect(d.down_payment).toBe(20000);
        expect(d.contract_total_value).toBe(126618.53);
    });

    it('SAC: parcelas decrescentes, principal constante, total com juros', () => {
        const d = montar(negocio({ contract_total_value: 120000 }), campos({ sistema: 'SAC' }));
        expect(d.amortization_system).toBe('SAC');
        expect(d.contract_total_value).toBe(127800);
        expect(d.custom_installments!.every(l => l.principal === 10000)).toBe(true);
    });
});

describe('resumoDoPlano', () => {
    const nbsp = (s: string) => s.replace(/ /g, ' ');

    it('com juros (Price): taxa, juros e total na linha', () => {
        const previa = preverPlano(negocio({ contract_total_value: 120000 }) as NegocioDoPlano, campos({ entrada: 20000 }));
        expect('Vai gerar: ' + nbsp(resumoDoPlano(previa, 'Parcelas mensais')) + '.').toBe(
            'Vai gerar: entrada de R$ 20.000,00 + 12× parcelas mensais de R$ 8.884,88 (Price, 1% a.m.) — juros R$ 6.618,53, total R$ 126.618,53.',
        );
    });

    it('com juros (SAC): mostra da primeira à última parcela', () => {
        const previa = preverPlano(negocio({ contract_total_value: 120000 }) as NegocioDoPlano, campos({ sistema: 'SAC', taxaMensal: 1.5 }));
        expect(nbsp(resumoDoPlano(previa, 'Parcelas mensais'))).toMatch(
            /^12× parcelas mensais de R\$ 11\.800,00 a R\$ 10\.150,00 \(SAC, 1,5% a\.m\.\) — juros R\$ [\d.]+,\d\d, total R\$ [\d.]+,\d\d$/,
        );
    });

    it('sem juros: o texto de sempre', () => {
        const previa = preverPlano(negocio({ contract_total_value: 120000 }) as NegocioDoPlano, campos({ taxaMensal: 0, entrada: 20000, parcelas: 10 }));
        expect(nbsp(resumoDoPlano(previa, 'Parcelas mensais'))).toBe('entrada de R$ 20.000,00 + 10× parcelas mensais de R$ 10.000,00');
        const sobra = preverPlano(negocio() as NegocioDoPlano, campos({ taxaMensal: 0 }));
        expect(nbsp(resumoDoPlano(sobra, 'Parcelas mensais'))).toBe('12× parcelas mensais (11× R$ 8.333,33 + 1× R$ 8.333,37)');
    });
});

describe('Fix round 1 — Valor Total editado à mão depois dos juros', () => {
    it('editar o Valor Total limpa o preço sem juros gravado; negócio sem juros não ganha a chave', () => {
        expect(editarValorTotal({ price_before_interest: 120000 }, 130000)).toEqual({ contract_total_value: 130000, price_before_interest: null });
        expect(editarValorTotal({}, 130000)).toEqual({ contract_total_value: 130000 });
        expect('price_before_interest' in editarValorTotal({ price_before_interest: null }, 1)).toBe(false);
    });

    it('total editado depois dos juros → taxa 0 → remontar: o total digitado vale', () => {
        const d1 = montar(negocio(), campos());
        const d2 = { ...d1, ...editarValorTotal(d1, 130000) };
        const previa = preverPlano(d2 as NegocioDoPlano, campos({ taxaMensal: 0 }));
        expect(previa.base).toBe(130000);
        const d3 = montar(d2, campos({ taxaMensal: 0 }));
        expect(d3.contract_total_value).toBe(130000);
        expect(d3.interest_rate_monthly).toBeNull();
        expect(d3.amortization_system).toBeNull();
        expect(d3.price_before_interest).toBeNull();
        const valores = d3.custom_installments!.map(l => l.value);
        expect(valores).toHaveLength(12);
        expect(valores.slice(0, 11).every(v => v === 10833.33)).toBe(true);
        expect(valores[11]).toBe(10833.37);
    });

    it('total editado depois dos juros → taxa > 0 → remontar: a base é o total digitado', () => {
        const d1 = montar(negocio(), campos());
        const d2 = { ...d1, ...editarValorTotal(d1, 130000) };
        expect(preverPlano(d2 as NegocioDoPlano, campos()).base).toBe(130000);
        const d3 = montar(d2, campos());
        expect(d3.price_before_interest).toBe(130000);
        expect(soma(d3.custom_installments!.map(l => l.principal!))).toBe(130000);
        expect(d3.contract_total_value).toBe(soma(d3.custom_installments!.map(l => l.value)));
        expect(d3.contract_total_value!).toBeGreaterThan(130000);
    });

    it('taxa 0 com preço sem juros digitado (campo visível): o digitado é a base e vira o total', () => {
        const d1 = montar(negocio(), campos());
        const d2 = montar(d1, campos({ taxaMensal: 0, precoSemJuros: 110000 }));
        expect(d2.contract_total_value).toBe(110000);
        expect(d2.price_before_interest).toBeNull();
        expect(soma(d2.custom_installments!.map(l => l.value))).toBe(110000);
    });

    it('previa.base: sem juros e sem preço sem juros é o Valor Total; com juros é o preço sem juros', () => {
        expect(preverPlano(negocio({ contract_total_value: 90000 }) as NegocioDoPlano, campos({ taxaMensal: 0 })).base).toBe(90000);
        expect(preverPlano(negocio({ contract_total_value: 90000 }) as NegocioDoPlano, campos({ precoSemJuros: 80000 })).base).toBe(80000);
        expect(preverPlano(negocio({ contract_total_value: 106618.53, price_before_interest: 100000 }) as NegocioDoPlano, campos()).base).toBe(100000);
    });
});

describe('valorDoContratoPeloPlano — contrato existente ao lançar o plano', () => {
    it('venda com juros: o contrato passa a valer o total com juros', () => {
        const d = montar(negocio({ contract_total_value: 120000 }), campos({ entrada: 20000 }));
        expect(valorDoContratoPeloPlano(d)).toEqual({ original_value: 126618.53 });
    });

    it('sem juros: não mexe no valor do contrato', () => {
        const d = montar(negocio({ contract_total_value: 120000 }), campos({ entrada: 20000, taxaMensal: 0 }));
        expect(valorDoContratoPeloPlano(d)).toEqual({});
    });

    it('locação: nunca (original_value do recorrente é o valor da parcela)', () => {
        expect(valorDoContratoPeloPlano({ type: 'RENTAL', interest_rate_monthly: 1, contract_total_value: 30000 })).toEqual({});
    });

    it('juros zerado DEPOIS de lançar: o contrato volta ao total sem juros', () => {
        const comJuros = montar(negocio({ contract_total_value: 120000 }), campos({ entrada: 20000 }));
        // O que foi lançado: o cronograma do contrato tem parcelas com juros.
        const cronogramaDoContrato = planoComoSchedule(comJuros);
        expect(valorDoContratoPeloPlano(comJuros, cronogramaDoContrato)).toEqual({ original_value: 126618.53 });
        const zerado = montar(comJuros, campos({ entrada: 20000, taxaMensal: 0 }));
        expect(zerado.contract_total_value).toBe(120000);
        expect(valorDoContratoPeloPlano(zerado, cronogramaDoContrato)).toEqual({ original_value: 120000 });
    });

    it('venda que nunca teve juros: nada muda, nem com o cronograma do contrato em mãos', () => {
        const d = montar(negocio({ contract_total_value: 120000 }), campos({ entrada: 20000, taxaMensal: 0 }));
        expect(valorDoContratoPeloPlano(d, planoComoSchedule(d))).toEqual({});
        expect(valorDoContratoPeloPlano(d, [])).toEqual({});
        expect(valorDoContratoPeloPlano(d, [{ date: '2026-12-10', value: 1000, interest: 0, principal: 1000 }])).toEqual({});
    });

    it('locação com cronograma antigo com juros: continua nunca', () => {
        expect(valorDoContratoPeloPlano(
            { type: 'RENTAL', contract_total_value: 30000 },
            [{ date: '2026-12-10', value: 2500, interest: 100 }],
        )).toEqual({});
    });
});

describe('planoComoSchedule / atualizacaoDoContratoPeloPlano — o elo DealModal → contrato', () => {
    it('com juros: cada parcela leva interest/principal, o sinal não, e o contrato vale o total com juros', () => {
        const d = {
            ...montar(negocio({ contract_total_value: 120000 }), campos({ entrada: 20000 })),
            down_payment_payment_type: 'PIX' as const,
            cost_center_id: 'cc-1',
            plano_de_contas_id: 'pc-1',
        };
        const payload = atualizacaoDoContratoPeloPlano(d, undefined);
        expect(payload.payment_term_type).toBe('Parcelado');
        expect(payload.cost_center_id).toBe('cc-1');
        expect(payload.plano_de_contas_id).toBe('pc-1');
        expect(payload.original_value).toBe(126618.53);
        const linhas = payload.payment_schedule!;
        expect(linhas).toHaveLength(13);
        // Sinal na Data Efetiva, sem juros.
        expect(linhas[0]).toEqual({ date: '2026-11-10', value: 20000, installment_type: 'SINAL', payment_type: 'PIX' });
        // Parcelas: uma linha por parcela do plano, com a decomposição dela.
        const parcelas = d.custom_installments!;
        linhas.slice(1).forEach((l, k) => {
            expect(l.date).toBe(parcelas[k].dueDate);
            expect(l.value).toBe(parcelas[k].value);
            expect(l.interest).toBe(parcelas[k].interest);
            expect(l.principal).toBe(parcelas[k].principal);
            expect(dois(l.interest! + l.principal!)).toBe(l.value);
        });
        expect(soma(linhas.map(l => l.value))).toBe(126618.53);
        expect(soma(linhas.slice(1).map(l => l.principal!))).toBe(100000);
    });

    it('sem juros: nenhuma linha leva interest/principal e o valor do contrato não vai', () => {
        const d = montar(negocio({ contract_total_value: 120000 }), campos({ entrada: 20000, taxaMensal: 0 }));
        const payload = atualizacaoDoContratoPeloPlano(d, []);
        expect(payload.payment_schedule!.some(l => 'interest' in l || 'principal' in l)).toBe(false);
        expect(payload).not.toHaveProperty('original_value');
        expect(payload).not.toHaveProperty('cost_center_id');
    });

    it('ordena por data e descarta linha sem data ou sem valor', () => {
        const linhas = planoComoSchedule({
            date: '2026-11-10', down_payment: 0,
            custom_installments: [
                { id: 'b', dueDate: '2027-01-10', value: 10 },
                { id: 'a', dueDate: '2026-12-10', value: 10 },
                { id: 'z', dueDate: '2027-02-10', value: 0 },
            ] as PropertyDeal['custom_installments'],
        });
        expect(linhas.map(l => l.date)).toEqual(['2026-12-10', '2027-01-10']);
    });
});

describe('replanejarSerie', () => {
    // A tabela do plano edita a série principal NA LINHA: ela fecha a conta sobre
    // o que sobra do sinal e das demais linhas, que ficam como estão (o
    // montarPlanoNoNegocio, ao contrário, troca o plano inteiro por entrada + série).
    const chaves: BlocoPagamento = { tipo: 'CHAVES', quantidade: 1, valorParcela: 10000, primeiroVencimento: '2031-01-10', intervaloMeses: null };
    const serie = { parcelas: 47, tipo: 'MENSAL', intervaloMeses: 1, primeiroVencimento: '2026-12-10' };
    const semJuros = { taxaMensal: 0, sistema: 'PRICE' as const };

    it('sem juros: sinal e chaves ficam; a série fecha o total', () => {
        const r = replanejarSerie(negocio({ contract_total_value: 80000 }), 30000, [chaves], serie, semJuros, 'x');
        if (!r.ok) throw new Error(r.motivo);
        expect(r.patch.down_payment).toBe(30000);
        const linhas = r.patch.custom_installments!;
        expect(linhas.filter(l => l.installmentType === 'CHAVES').map(l => l.value)).toEqual([10000]);
        expect(linhas.filter(l => l.installmentType === 'MENSAL')).toHaveLength(47);
        expect(saldoDoPlano(80000, 30000, linhas)).toBe(0);
        expect(r.patch.payment_due_date).toBe('2026-12-10');
    });

    it('com juros (Price): juros só sobre a série; chaves nominal; total = preço + juros', () => {
        const r = replanejarSerie(negocio({ contract_total_value: 80000 }), 30000, [chaves], serie, { taxaMensal: 1, sistema: 'PRICE' }, 'x');
        if (!r.ok) throw new Error(r.motivo);
        const linhas = r.patch.custom_installments!;
        const mensais = linhas.filter(l => l.installmentType === 'MENSAL');
        expect(mensais).toHaveLength(47);
        expect(mensais.every(l => (l.interest ?? 0) >= 0 && l.principal != null)).toBe(true);
        const principal = mensais.reduce((t, l) => t + (l.principal ?? 0), 0);
        expect(Math.round(principal * 100) / 100).toBe(40000);
        const chavesLinha = linhas.find(l => l.installmentType === 'CHAVES')!;
        expect(chavesLinha.value).toBe(10000);
        expect(chavesLinha.interest ?? null).toBeNull();
        expect(r.patch.interest_rate_monthly).toBe(1);
        expect(r.patch.price_before_interest).toBe(80000);
        const juros = mensais.reduce((t, l) => t + (l.interest ?? 0), 0);
        expect(r.patch.contract_total_value).toBeCloseTo(80000 + juros, 2);
    });

    it('sinal + demais linhas já passam do total: recusa e diz quanto excede', () => {
        const r = replanejarSerie(negocio({ contract_total_value: 80000 }), 50000, [{ ...chaves, valorParcela: 40000 }], serie, semJuros, 'x');
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.excesso).toBe(10000);
    });

    it('locação: a parcela é o aluguel; demais linhas ficam; total = soma', () => {
        const caucao: BlocoPagamento = { tipo: 'AVULSA', quantidade: 1, valorParcela: 5000, primeiroVencimento: '2026-11-15', intervaloMeses: null };
        const r = replanejarSerie(negocio({ type: 'RENTAL', value: 2500, contract_total_value: 0 }), 0, [caucao], { ...serie, parcelas: 24 }, semJuros, 'x');
        if (!r.ok) throw new Error(r.motivo);
        expect('down_payment' in r.patch).toBe(false);
        const linhas = r.patch.custom_installments!;
        expect(linhas.filter(l => l.installmentType === 'MENSAL').every(l => l.value === 2500)).toBe(true);
        expect(r.patch.contract_total_value).toBe(24 * 2500 + 5000);
    });

    it('a forma de pagamento e a observação da série sobrevivem ao recálculo', () => {
        const r = replanejarSerie(negocio({ contract_total_value: 80000 }), 30000, [], { ...serie, paymentType: 'BOLETO', notes: 'Boleto Sicredi' }, semJuros, 'x');
        if (!r.ok) throw new Error(r.motivo);
        expect(r.patch.custom_installments!.every(l => l.paymentType === 'BOLETO' && l.notes === 'Boleto Sicredi')).toBe(true);
    });

    it('demais linhas com juros conhecidos mantêm a decomposição', () => {
        const reforco: BlocoPagamento = { ...chaves, tipo: 'ANUAL', juros: [120], principal: [9880] };
        const r = replanejarSerie(negocio({ contract_total_value: 80000 }), 30000, [reforco], serie, semJuros, 'x');
        if (!r.ok) throw new Error(r.motivo);
        const l = r.patch.custom_installments!.find(x => x.installmentType === 'ANUAL')!;
        expect([l.interest, l.principal]).toEqual([120, 9880]);
    });
});
