import { describe, it, expect } from 'vitest';
import {
    somarMeses,
    mesesEntre,
    expandirBloco,
    agruparPlano,
    subtotalDoBloco,
    saldoDoPlano,
    blocoParaGerador,
    type BlocoPagamento,
} from '../utils/paymentPlan';
import { PaymentInstallment } from '../types/financial';

const bloco = (over: Partial<BlocoPagamento> = {}): BlocoPagamento => ({
    tipo: 'MENSAL',
    quantidade: 12,
    valorParcela: 25000,
    primeiroVencimento: '2026-10-10',
    intervaloMeses: 1,
    ...over,
});

describe('somarMeses', () => {
    it('avança meses sem escorregar o dia', () => {
        expect(somarMeses('2026-10-10', 1)).toBe('2026-11-10');
        expect(somarMeses('2026-10-10', 11)).toBe('2027-09-10');
    });

    // O parse de 'YYYY-MM-DD' pelo Date é UTC: em UTC-3 volta um dia. Este teste
    // é a guarda contra a reintrodução desse defeito (ver curva do dashboard).
    it('não perde um dia na virada do ano (fuso)', () => {
        expect(somarMeses('2026-01-01', 0)).toBe('2026-01-01');
        expect(somarMeses('2026-12-31', 1)).toBe('2027-01-31');
        expect(somarMeses('2026-01-01', 12)).toBe('2027-01-01');
    });

    it('não transborda o mês quando o dia não existe no destino', () => {
        expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28');
        expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29'); // bissexto
        expect(somarMeses('2026-03-31', 1)).toBe('2026-04-30');
    });

    it('anda para trás com meses negativos', () => {
        expect(somarMeses('2026-01-10', -1)).toBe('2025-12-10');
    });
});

describe('mesesEntre', () => {
    it('conta a distância em meses', () => {
        expect(mesesEntre('2026-10-10', '2026-11-10')).toBe(1);
        expect(mesesEntre('2026-10-10', '2027-04-10')).toBe(6);
        expect(mesesEntre('2026-10-10', '2026-10-10')).toBe(0);
    });
});

describe('expandirBloco', () => {
    it('12 mensais de 25.000 a partir de 10/10/2026', () => {
        const linhas = expandirBloco(bloco(), 'b1');
        expect(linhas).toHaveLength(12);
        expect(linhas[0].dueDate).toBe('2026-10-10');
        expect(linhas[11].dueDate).toBe('2027-09-10');
        expect(linhas.reduce((s, l) => s + l.value, 0)).toBe(300000);
        expect(linhas.every(l => l.installmentType === 'MENSAL')).toBe(true);
        expect(linhas.every(l => l.status === 'PENDING')).toBe(true);
    });

    it('respeita o intervalo do tipo (semestral)', () => {
        const linhas = expandirBloco(bloco({ tipo: 'SEMESTRAL', quantidade: 3, intervaloMeses: 6 }), 'b2');
        expect(linhas.map(l => l.dueDate)).toEqual(['2026-10-10', '2027-04-10', '2027-10-10']);
    });

    it('parcela única quando o tipo não tem periodicidade', () => {
        const linhas = expandirBloco(
            bloco({ tipo: 'CHAVES', quantidade: 1, valorParcela: 300000, intervaloMeses: null }),
            'b3',
        );
        expect(linhas).toHaveLength(1);
        expect(linhas[0].value).toBe(300000);
        expect(linhas[0].description).toBe('Parcela única');
    });

    it('carrega forma de pagamento e observação quando informadas', () => {
        const linhas = expandirBloco(bloco({ quantidade: 2, paymentType: 'PIX', notes: 'cheque do sócio' }), 'b4');
        expect(linhas[0].paymentType).toBe('PIX');
        expect(linhas[1].notes).toBe('cheque do sócio');
    });
});

describe('agruparPlano', () => {
    it('reagrupa o que expandirBloco produziu', () => {
        const linhas = expandirBloco(bloco(), 'b1');
        const blocos = agruparPlano(linhas);
        expect(blocos).toHaveLength(1);
        expect(blocos[0]).toMatchObject({
            tipo: 'MENSAL', quantidade: 12, valorParcela: 25000,
            primeiroVencimento: '2026-10-10', intervaloMeses: 1,
        });
        expect(subtotalDoBloco(blocos[0])).toBe(300000);
    });

    it('separa blocos de tipos e valores diferentes', () => {
        const plano = [
            ...expandirBloco(bloco({ quantidade: 12 }), 'm'),
            ...expandirBloco(bloco({ tipo: 'CHAVES', quantidade: 1, valorParcela: 300000, intervaloMeses: null, primeiroVencimento: '2027-10-10' }), 'c'),
        ];
        const blocos = agruparPlano(plano);
        expect(blocos.map(b => b.tipo)).toEqual(['MENSAL', 'CHAVES']);
        expect(blocos[1].quantidade).toBe(1);
    });

    it('quebra o bloco quando a cadência tem um buraco', () => {
        const linhas: PaymentInstallment[] = [
            { id: '1', dueDate: '2026-10-10', value: 1000, status: 'PENDING', description: '', installmentType: 'MENSAL' },
            { id: '2', dueDate: '2026-11-10', value: 1000, status: 'PENDING', description: '', installmentType: 'MENSAL' },
            // pula dezembro
            { id: '3', dueDate: '2027-01-10', value: 1000, status: 'PENDING', description: '', installmentType: 'MENSAL' },
        ];
        const blocos = agruparPlano(linhas);
        expect(blocos).toHaveLength(2);
        expect(blocos[0].quantidade).toBe(2);
        expect(blocos[1].quantidade).toBe(1);
    });

    it('lista vazia devolve nenhum bloco', () => {
        expect(agruparPlano([])).toEqual([]);
    });
});

describe('saldoDoPlano', () => {
    const linhas = expandirBloco(bloco({ quantidade: 12, valorParcela: 16666.67 }), 'm');

    it('desconta sinal e parcelas do total', () => {
        // 400.000 − 50.000 (sinal) − 200.000,04 (12 × 16.666,67)
        expect(saldoDoPlano(400000, 50000, linhas)).toBe(149999.96);
    });

    it('zera quando o plano fecha o total', () => {
        expect(saldoDoPlano(350000, 50000, expandirBloco(bloco({ quantidade: 12, valorParcela: 25000 }), 'm'))).toBe(0);
    });

    it('fica negativo quando o plano passa do total', () => {
        expect(saldoDoPlano(100000, 50000, expandirBloco(bloco({ quantidade: 2, valorParcela: 40000 }), 'm'))).toBe(-30000);
    });

    it('sem plano nenhum, o saldo é o total', () => {
        expect(saldoDoPlano(650000, 0, [])).toBe(650000);
    });
});

describe('blocoParaGerador', () => {
    it('escolhe o maior bloco periódico', () => {
        const blocos = agruparPlano([
            ...expandirBloco(bloco({ quantidade: 12, valorParcela: 25000 }), 'm'),
            ...expandirBloco(bloco({ tipo: 'SEMESTRAL', quantidade: 2, valorParcela: 50000, intervaloMeses: 6, primeiroVencimento: '2027-10-10' }), 's'),
        ]);
        expect(blocoParaGerador(blocos)).toEqual({ valor: 25000, quantidade: 12 });
    });

    it('devolve null quando não há série periódica', () => {
        const blocos = agruparPlano(
            expandirBloco(bloco({ tipo: 'CHAVES', quantidade: 1, valorParcela: 300000, intervaloMeses: null }), 'c'),
        );
        expect(blocoParaGerador(blocos)).toBeNull();
    });
});
