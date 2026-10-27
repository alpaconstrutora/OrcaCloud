import { describe, it, expect } from 'vitest';
import {
    conferirParcelas,
    planoDeDistribuicao,
    planoDoGerador,
    parcelaComplementar, motivoContratoFechado,
    baseParaCorrecao,
    novoValorOriginal,
    motivoNaoAjustaContrato,
    vencimentoSugerido,
    motivoParaComplementar,
    type ParcelaConferida,
} from '../utils/conferenciaParcelasContrato';

const ID = 'c1';
const parcela = (n: number, valor: number, extra: Partial<ParcelaConferida> = {}): ParcelaConferida => ({
    id: `t${n}`, source_system: 'CONTRACT_PARCELADO', reference_id: `${ID}:p${n}`,
    status: 'PENDING', business_status: 'PREVISTO', amount: valor, original_amount: null, ...extra,
});
const pago = { status: 'CONCILIATED', business_status: 'PAGO' };

// CTS-042-0001, medido em 26/10/2026.
const cts042 = { is_recurring: false, payment_term_type: 'Parcelado' as const, original_value: 2700, current_value: 2850 };
const aditivoAD001 = [{ number: 'AD-001', value_impact: 150, status: 'Aprovado' }];
const cronograma042 = [{ date: '2026-05-11', value: 1000 }, { date: '2026-06-11', value: 1700 }];

describe('conferirParcelas', () => {
    it('CTS-042-0001: faltam R$ 150 e a causa é o aditivo AD-001', () => {
        const c = conferirParcelas(cts042, [parcela(1, 1000), parcela(2, 1700)], aditivoAD001);
        expect(c.aplica).toBe(true);
        expect(c.valorContrato).toBe(2850);
        expect(c.somaParcelas).toBe(2700);
        expect(c.saldo).toBe(150);
        expect(c.situacao).toBe('faltam');
        expect(c.aditivosSemParcela).toEqual([{ numero: 'AD-001', valor: 150 }]);
    });

    it('confere quando a soma bate (tolerância de 1 centavo)', () => {
        const c = conferirParcelas({ ...cts042, current_value: 2700.004 }, [parcela(1, 1000), parcela(2, 1700)], []);
        expect(c.situacao).toBe('confere');
        expect(c.saldo).toBe(0);
    });

    it('excedem quando as parcelas passam do contrato', () => {
        const c = conferirParcelas({ ...cts042, current_value: 2500 }, [parcela(1, 1000), parcela(2, 1700)], []);
        expect(c.situacao).toBe('excedem');
        expect(c.saldo).toBe(-200);
    });

    it('cancelada fica fora da soma; vale o valor BRUTO (antes do desconto)', () => {
        const c = conferirParcelas(cts042, [
            parcela(1, 900, { original_amount: 1000 }),
            parcela(2, 1700),
            parcela(3, 500, { status: 'CANCELLED' }),
        ], aditivoAD001);
        expect(c.somaParcelas).toBe(2700);
    });

    it('recorrente e medição não se conferem', () => {
        expect(conferirParcelas({ ...cts042, is_recurring: true }, [parcela(1, 10)], []).aplica).toBe(false);
        expect(conferirParcelas(cts042, [parcela(1, 10, { source_system: 'CONTRACT_MEASUREMENT' })], []).aplica).toBe(false);
    });

    it('aditivo só é apontado como causa quando o Original bate com as parcelas', () => {
        const c = conferirParcelas({ ...cts042, original_value: 3000, current_value: 3150 }, [parcela(1, 1000), parcela(2, 1700)], aditivoAD001);
        expect(c.aditivosSemParcela).toEqual([]);
    });
});

describe('parcelaComplementar', () => {
    it('acrescenta uma parcela com o saldo no vencimento escolhido', () => {
        const r = parcelaComplementar(cronograma042, 150, '2026-11-10');
        // Com Tipo: a sincronização leva o installment_type ao título (coluna "Tipo").
        expect(r).toEqual([...cronograma042, { date: '2026-11-10', value: 150, installment_type: 'AVULSA' }]);
    });

    it('não lança complemento sem falta', () => {
        expect(() => parcelaComplementar(cronograma042, -10, '2026-11-10')).toThrow(/falta/i);
    });
});

describe('planoDeDistribuicao', () => {
    it('divide o saldo igual entre as abertas, centavos na última; paga fica como está', () => {
        const parcelas = [parcela(1, 1000, pago), parcela(2, 1700), parcela(3, 300)];
        const crono = [...cronograma042, { date: '2026-07-11', value: 300 }];
        const r = planoDeDistribuicao(crono, parcelas, 100.01, new Set());
        if ('motivo' in r) throw new Error(r.motivo);
        expect(r.cronograma.map(l => l.value)).toEqual([1000, 1750, 350.01]);
        expect(r.reescritas).toEqual(['t2', 't3']);
    });

    it('reduz quando as parcelas excedem', () => {
        const r = planoDeDistribuicao(cronograma042, [parcela(1, 1000), parcela(2, 1700)], -200, new Set());
        if ('motivo' in r) throw new Error(r.motivo);
        expect(r.cronograma.map(l => l.value)).toEqual([900, 1600]);
    });

    it('recusa se a redução zera ou deixa negativa alguma parcela', () => {
        const r = planoDeDistribuicao(cronograma042, [parcela(1, 1000), parcela(2, 1700)], -2100, new Set());
        expect(r).toEqual({ motivo: expect.stringMatching(/zerada ou negativa/) });
    });

    it('recusa sem parcela em aberto', () => {
        const r = planoDeDistribuicao(cronograma042, [parcela(1, 1000, pago), parcela(2, 1700, pago)], 150, new Set());
        expect(r).toEqual({ motivo: expect.stringMatching(/em aberto/) });
    });

    it('recusa se há aberta ANTES de uma paga (o cronograma casa por posição)', () => {
        const r = planoDeDistribuicao(cronograma042, [parcela(1, 1000), parcela(2, 1700, pago)], 150, new Set());
        expect(r).toEqual({ motivo: expect.stringMatching(/antes de uma paga/) });
    });

    it('recusa se alguma aberta tem pagamento Asaas em andamento', () => {
        const r = planoDeDistribuicao(cronograma042, [parcela(1, 1000), parcela(2, 1700)], 150, new Set(['t2']));
        expect(r).toEqual({ motivo: expect.stringMatching(/Asaas/) });
    });
});

describe('planoDoGerador', () => {
    const gerador = { parcelas: 3, periodicidade: 'Mensal' as const, primeiroVencimento: '2026-11-10', entrada: 0, vencimentoEntrada: '2026-11-10' };

    it('mantém a paga e divide o saldo (Atual − pago) nas novas', () => {
        const r = planoDoGerador(2850, cronograma042, [parcela(1, 1000, pago), parcela(2, 1700)], gerador, new Set());
        if ('motivo' in r) throw new Error(r.motivo);
        expect(r.cronograma[0]).toEqual(cronograma042[0]);
        expect(r.cronograma.slice(1).map(l => [l.date, l.value])).toEqual([
            ['2026-11-10', 616.66], ['2026-12-10', 616.66], ['2027-01-10', 616.68],
        ]);
        expect(r.cronograma.reduce((s, l) => s + l.value, 0)).toBeCloseTo(2850, 2);
        expect(r.reescritas).toEqual(['t2']);
    });

    it('sem parcelas: divide o valor todo', () => {
        const r = planoDoGerador(2850, [], [], { ...gerador, parcelas: 2 }, new Set());
        if ('motivo' in r) throw new Error(r.motivo);
        expect(r.cronograma.map(l => l.value)).toEqual([1425, 1425]);
    });

    it('recusa quando o pago já cobre o contrato', () => {
        const r = planoDoGerador(1000, cronograma042, [parcela(1, 1000, pago), parcela(2, 1700)], gerador, new Set());
        expect(r).toEqual({ motivo: expect.stringMatching(/já cobre/) });
    });

    it('à vista paga conta como pago e sai do cronograma novo', () => {
        const avista = { ...parcela(0, 1000, pago), source_system: 'CONTRACT_AVISTA', reference_id: ID };
        const r = planoDoGerador(2850, [], [avista], { ...gerador, parcelas: 1 }, new Set());
        if ('motivo' in r) throw new Error(r.motivo);
        expect(r.cronograma).toEqual([{ date: '2026-11-10', value: 1850, installment_type: expect.anything() }]);
    });
});

describe('baseParaCorrecao', () => {
    it('parcelado: cronograma e parcelas como estão', () => {
        const parcelas = [parcela(1, 1000), parcela(2, 1700)];
        expect(baseParaCorrecao(cts042, cronograma042, parcelas)).toEqual({ cronograma: cronograma042, parcelas });
    });

    it('à vista ABERTA vira a 1ª linha do cronograma (o contrato passa a parcelado)', () => {
        const avista = { ...parcela(0, 2700), source_system: 'CONTRACT_AVISTA', reference_id: ID, transaction_date: '2026-11-01' };
        const b = baseParaCorrecao({ ...cts042, payment_term_type: 'Vista' }, [], [avista]);
        expect(b.cronograma).toEqual([{ date: '2026-11-01', value: 2700 }]);
        expect(b.parcelas).toEqual([{ ...avista, source_system: 'CONTRACT_PARCELADO', reference_id: `${ID}:p1` }]);
        const r = planoDeDistribuicao(b.cronograma, b.parcelas, 150, new Set());
        if ('motivo' in r) throw new Error(r.motivo);
        expect(r.cronograma).toEqual([{ date: '2026-11-01', value: 2850 }]);
        expect(r.reescritas).toEqual([avista.id]);
    });

    it('à vista PAGA fica fora do cronograma (a sync nunca apaga cobrança baixada)', () => {
        const avista = { ...parcela(0, 2700, pago), source_system: 'CONTRACT_AVISTA', reference_id: ID, transaction_date: '2026-05-01' };
        const b = baseParaCorrecao({ ...cts042, payment_term_type: 'Vista' }, [], [avista]);
        expect(b.cronograma).toEqual([]);
        expect(parcelaComplementar(b.cronograma, 150, '2026-11-10')).toEqual([{ date: '2026-11-10', value: 150, installment_type: 'AVULSA' }]);
    });
});

describe('ajustar o valor do contrato', () => {
    it('novo Original = soma das parcelas − aditivos aprovados (o Atual passa a bater)', () => {
        const c = conferirParcelas(cts042, [parcela(1, 1000), parcela(2, 1700)], aditivoAD001);
        expect(novoValorOriginal(c, aditivoAD001)).toBe(2550);
    });

    it('à vista com aditivo não se ajusta pelo contrato (a cobrança é regravada pelo Original)', () => {
        const c = conferirParcelas({ ...cts042, payment_term_type: 'Vista' }, [parcela(1, 2700)], aditivoAD001);
        expect(motivoNaoAjustaContrato({ ...cts042, payment_term_type: 'Vista' }, c, aditivoAD001)).toMatch(/à vista/);
        expect(motivoNaoAjustaContrato(cts042, c, aditivoAD001)).toBeNull();
    });

    it('recusa Original zerado ou negativo', () => {
        const c = conferirParcelas({ ...cts042, original_value: 300, current_value: 450 }, [parcela(1, 100)], aditivoAD001);
        expect(motivoNaoAjustaContrato(cts042, c, aditivoAD001)).toMatch(/zerado ou negativo/);
    });
});

describe('vencimentoSugerido', () => {
    it('um mês depois da última linha do cronograma', () => {
        expect(vencimentoSugerido(cronograma042, '2026-10-26')).toBe('2026-07-11');
    });
    it('sem cronograma, um mês depois de hoje', () => {
        expect(vencimentoSugerido([], '2026-10-26')).toBe('2026-11-26');
    });
});

// ── Revisão final (26/10/2026) ──────────────────────────────────────────────
describe('revisão: o que a correção não pode desfazer em silêncio', () => {
    it('distribuir mantém o VENCIMENTO do título (alterado à mão), não a data antiga do cronograma', () => {
        const p2 = parcela(2, 1700, { transaction_date: '2026-08-11', vencimento_manual: true });
        const b = baseParaCorrecao(cts042, cronograma042, [parcela(1, 1000, { transaction_date: '2026-05-11' }), p2]);
        const r = planoDeDistribuicao(b.cronograma, b.parcelas, 150, new Set());
        if ('motivo' in r) throw new Error(r.motivo);
        expect(r.cronograma[1]).toMatchObject({ date: '2026-08-11' });
    });

    it('a base usa o VALOR do título (alterado à mão), não o do cronograma', () => {
        const b = baseParaCorrecao(cts042, cronograma042, [parcela(1, 1000), parcela(2, 1800, { valor_manual: true })]);
        expect(b.cronograma.map(l => l.value)).toEqual([1000, 1800]);
    });

    it('distribuir recusa parcela em aberto com desconto (o desconto se perderia)', () => {
        const r = planoDeDistribuicao(cronograma042, [parcela(1, 1000), parcela(2, 1600, { original_amount: 1700, discount_type: 'VALUE', discount_amount: 100 })], 150, new Set());
        expect(r).toEqual({ motivo: expect.stringMatching(/desconto/) });
    });

    it('complemento recusa Asaas em andamento, à vista com desconto e cronograma desatualizado', () => {
        const ok = [parcela(1, 1000), parcela(2, 1700)];
        expect(motivoParaComplementar(cts042, cronograma042, ok, new Set())).toBeNull();
        expect(motivoParaComplementar(cts042, cronograma042, ok, new Set(['t2']))).toMatch(/Asaas/);
        expect(motivoParaComplementar(cts042, [cronograma042[0]], [parcela(1, 1000), parcela(2, 1700, pago)], new Set())).toMatch(/desatualizado/);
        const avistaDesc = { ...parcela(0, 2600, { original_amount: 2700, discount_type: 'VALUE', discount_amount: 100 }), source_system: 'CONTRACT_AVISTA', reference_id: ID };
        expect(motivoParaComplementar({ ...cts042, payment_term_type: 'Vista' }, [], [avistaDesc], new Set())).toMatch(/desconto/);
    });

    it('ajustar o contrato também recusa Asaas em andamento (a sync recria as abertas)', () => {
        const c = conferirParcelas(cts042, [parcela(1, 1000), parcela(2, 1700)], aditivoAD001);
        expect(motivoNaoAjustaContrato(cts042, c, aditivoAD001, [parcela(1, 1000), parcela(2, 1700)], new Set(['t1']))).toMatch(/Asaas/);
    });

    it('contrato por MEDIÇÃO não se confere nem sem título de medição', () => {
        expect(conferirParcelas({ ...cts042, billing_mode: 'MEDICAO' }, [parcela(1, 10)], []).aplica).toBe(false);
    });

    it('contrato que ainda não lança no financeiro não se confere (sem títulos, diria "faltam" o valor cheio)', () => {
        expect(conferirParcelas(cts042, [], [], { podeLancar: false }).aplica).toBe(false);
    });

    it('gerador recusa entrada que cobre o saldo (geraria parcelas de R$ 0)', () => {
        const g = { parcelas: 2, periodicidade: 'Mensal' as const, primeiroVencimento: '2026-11-10', entrada: 2850, vencimentoEntrada: '2026-11-01' };
        expect(planoDoGerador(2850, [], [], g, new Set())).toEqual({ motivo: expect.stringMatching(/entrada/i) });
    });

    it('gerador guarda a paga pelo valor e data do TÍTULO', () => {
        const paga = parcela(1, 1100, { ...pago, transaction_date: '2026-05-15' });
        const g = { parcelas: 1, periodicidade: 'Mensal' as const, primeiroVencimento: '2026-11-10', entrada: 0, vencimentoEntrada: '2026-11-10' };
        const r = planoDoGerador(2850, cronograma042, [paga, parcela(2, 1700)], g, new Set());
        if ('motivo' in r) throw new Error(r.motivo);
        expect(r.cronograma[0]).toMatchObject({ date: '2026-05-15', value: 1100 });
        expect(r.cronograma[1].value).toBe(1750);
    });
});

describe('contrato fechado (pontos adiados do PR #183)', () => {
    it('Cancelado não se confere: as parcelas canceladas diriam "faltam" o valor cheio', () => {
        expect(conferirParcelas({ ...cts042, status: 'Cancelado' }, [parcela(1, 1000), parcela(2, 1700)], aditivoAD001).aplica).toBe(false);
    });

    it('Concluído e Encerrado se conferem (a informação vale), mas as ações dizem por que não', () => {
        for (const status of ['Concluído', 'Encerrado']) {
            expect(conferirParcelas({ ...cts042, status }, [parcela(1, 1000), parcela(2, 1700)], aditivoAD001).aplica).toBe(true);
            expect(motivoContratoFechado({ ...cts042, status })).toBe(`Contrato ${status} — reabra o contrato para mexer nas parcelas.`);
        }
    });

    it('contrato em andamento não tem motivo de bloqueio', () => {
        for (const status of ['Ativo', 'Assinado', 'Suspenso', undefined]) {
            expect(motivoContratoFechado({ ...cts042, status })).toBeNull();
        }
    });
});
