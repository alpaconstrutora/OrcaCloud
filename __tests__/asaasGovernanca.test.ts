import { describe, it, expect } from 'vitest';
import { bloqueiosDoDisparo, inicioDoDiaBrasilia, type FatosDoDisparo } from '../utils/asaasGovernanca';

const ok: FatosDoDisparo = {
    temConta: true, ehGestor: true,
    status: 'PENDING', businessStatus: 'APROVADO', approvalStatus: 'APROVADO',
    valorTemFaixaDeAlcada: false,
    valor: 300,
    tetos: { porPagamento: 500, porDia: 2000, avulso: 200 },
    somaDoDia: 0, avulso: false, piloto: true,
    orgDoTitulo: 'A', orgDaConta: 'A',
    competenciaFechada: null, pagamentoEmCurso: null,
};

describe('bloqueiosDoDisparo', () => {
    it('tudo em ordem → nenhum bloqueio', () => {
        expect(bloqueiosDoDisparo(ok)).toEqual([]);
    });

    it('sem conta Asaas e sem papel de gestor', () => {
        const b = bloqueiosDoDisparo({ ...ok, temConta: false, ehGestor: false });
        expect(b).toHaveLength(2);
        expect(b[0]).toMatch(/conta Asaas/);
        expect(b[1]).toMatch(/proprietário ou administrador/);
    });

    it('título pago ou cancelado', () => {
        expect(bloqueiosDoDisparo({ ...ok, status: 'CONCILIATED' })[0]).toMatch(/já está pago/);
        expect(bloqueiosDoDisparo({ ...ok, businessStatus: 'CANCELADO' })[0]).toMatch(/cancelado/);
    });

    it('alçada: pendente, rejeitado e rascunho com faixa bloqueiam; rascunho sem faixa passa', () => {
        expect(bloqueiosDoDisparo({ ...ok, approvalStatus: 'PENDENTE' })[0]).toMatch(/aguardando a alçada/);
        expect(bloqueiosDoDisparo({ ...ok, approvalStatus: 'REJEITADO' })[0]).toMatch(/rejeitado/);
        expect(bloqueiosDoDisparo({ ...ok, approvalStatus: 'RASCUNHO', valorTemFaixaDeAlcada: true })[0]).toMatch(/não foi submetido/);
        expect(bloqueiosDoDisparo({ ...ok, approvalStatus: 'RASCUNHO', valorTemFaixaDeAlcada: false })).toEqual([]);
        expect(bloqueiosDoDisparo({ ...ok, approvalStatus: null, valorTemFaixaDeAlcada: false })).toEqual([]);
    });

    it('tetos: por pagamento, avulso e diário (com quanto resta)', () => {
        expect(bloqueiosDoDisparo({ ...ok, valor: 600 }).join(' ')).toMatch(/teto por pagamento da conta Asaas \(R\$ 500,00\)/);
        expect(bloqueiosDoDisparo({ ...ok, valor: 250, avulso: true })[0]).toMatch(/PIX avulso \(R\$ 200,00\)/);
        expect(bloqueiosDoDisparo({ ...ok, avulso: false, valor: 250 })).toEqual([]);
        const d = bloqueiosDoDisparo({ ...ok, somaDoDia: 1900, valor: 300 });
        expect(d[0]).toMatch(/teto diário .*R\$ 2\.000,00.*resta R\$ 100,00/);
    });

    it('sem tetos (conta sem configuração) não inventa teto', () => {
        expect(bloqueiosDoDisparo({ ...ok, tetos: null, valor: 999999 })).toEqual([]);
    });

    it('piloto só paga título da org dona', () => {
        expect(bloqueiosDoDisparo({ ...ok, orgDoTitulo: 'B' })[0]).toMatch(/modo piloto/);
        expect(bloqueiosDoDisparo({ ...ok, orgDoTitulo: 'B', piloto: false })).toEqual([]);
    });

    it('competência fechada e pagamento em curso', () => {
        expect(bloqueiosDoDisparo({ ...ok, competenciaFechada: '09/2026' })[0]).toMatch(/09\/2026 está fechada/);
        expect(bloqueiosDoDisparo({ ...ok, pagamentoEmCurso: 'PENDING' })[0]).toMatch(/em andamento \(PENDING\)/);
        expect(bloqueiosDoDisparo({ ...ok, pagamentoEmCurso: 'DONE' })[0]).toMatch(/já foi pago pela Asaas/);
    });

    it('valor zero', () => {
        expect(bloqueiosDoDisparo({ ...ok, valor: 0 })[0]).toMatch(/não tem valor/);
    });
});

describe('inicioDoDiaBrasilia', () => {
    it('22h de Brasília ainda é o mesmo dia (UTC já virou)', () => {
        expect(inicioDoDiaBrasilia(new Date('2026-10-18T01:00:00Z'))).toBe('2026-10-17T03:00:00.000Z');
        expect(inicioDoDiaBrasilia(new Date('2026-10-17T12:00:00Z'))).toBe('2026-10-17T03:00:00.000Z');
        expect(inicioDoDiaBrasilia(new Date('2026-10-17T02:59:00Z'))).toBe('2026-10-16T03:00:00.000Z');
    });
});
