import { describe, it, expect } from 'vitest';
import { dataDoPagamentoDeBoleto, cancelamentoConfirmado } from '../utils/asaasBoletoPagamento';

const hoje = '2026-11-13';

describe('dataDoPagamentoDeBoleto', () => {
    it('sem escolha: paga o quanto antes (data mínima da Asaas), nunca deixa cair no vencimento', () => {
        expect(dataDoPagamentoDeBoleto({ hoje, vencimento: '2026-11-30', dataMinima: '2026-11-13' }))
            .toEqual({ scheduleDate: '2026-11-13', agendado: false });
        expect(dataDoPagamentoDeBoleto({ hoje, vencimento: '2026-11-30' }))
            .toEqual({ scheduleDate: '2026-11-13', agendado: false });
    });

    it('data escolhida até o vencimento: agenda', () => {
        expect(dataDoPagamentoDeBoleto({ hoje, vencimento: '2026-11-30', escolhida: '2026-11-20', dataMinima: hoje }))
            .toEqual({ scheduleDate: '2026-11-20', agendado: true });
        expect(dataDoPagamentoDeBoleto({ hoje, vencimento: '2026-11-30', escolhida: '2026-11-30' }).scheduleDate).toBe('2026-11-30');
    });

    it('recusa data depois do vencimento, no passado ou antes da mínima da Asaas', () => {
        expect(dataDoPagamentoDeBoleto({ hoje, vencimento: '2026-11-30', escolhida: '2026-12-01' }).erro).toMatch(/vencimento \(30\/11\/2026\)/);
        expect(dataDoPagamentoDeBoleto({ hoje, vencimento: '2026-11-30', escolhida: '2026-11-12' }).erro).toMatch(/passado/);
        expect(dataDoPagamentoDeBoleto({ hoje, vencimento: '2026-11-30', escolhida: hoje, dataMinima: '2026-11-16' }).erro).toMatch(/16\/11\/2026/);
    });

    it('conta vencida: sem data (pagamento imediato — a Asaas não agenda vencida)', () => {
        expect(dataDoPagamentoDeBoleto({ hoje, vencimento: '2026-11-02', escolhida: '2026-11-20' }))
            .toEqual({ scheduleDate: null, agendado: false });
    });

    it('sem vencimento conhecido: aceita a data escolhida', () => {
        expect(dataDoPagamentoDeBoleto({ hoje, vencimento: null, escolhida: '2026-11-20' }).scheduleDate).toBe('2026-11-20');
    });
});

describe('cancelamentoConfirmado', () => {
    it('só com CANCELLED na resposta (ou 404)', () => {
        expect(cancelamentoConfirmado(200, { status: 'CANCELLED' })).toBe(true);
        expect(cancelamentoConfirmado(404, null)).toBe(true);
    });

    it('resposta sem CANCELLED (aguardando autorização por SMS/app) não é cancelamento', () => {
        expect(cancelamentoConfirmado(200, { status: 'PENDING', awaitingCriticalActionAuthorization: true })).toBe(false);
        expect(cancelamentoConfirmado(200, {})).toBe(false);
        expect(cancelamentoConfirmado(200, null)).toBe(false);
    });
});
