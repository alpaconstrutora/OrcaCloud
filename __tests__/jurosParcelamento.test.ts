import { describe, it, expect } from 'vitest';
import {
    calcularParcelasComJuros,
    montarPlanoComJuros,
    preverPlano,
    montarPlanoNoNegocio,
    resumoDoPlano,
    editarValorTotal,
    type PlanoComJuros,
    type CamposDoPlano,
    type NegocioDoPlano,
} from '../utils/jurosParcelamento';
import { agruparPlano, expandirBloco, montarPlanoRapido } from '../utils/paymentPlan';
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
        // Espelho para o gerador do contrato (maior bloco periódico).
        expect(d.installment_value).toBe(8884.88);
        expect(d.installments).toBe(11);
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
