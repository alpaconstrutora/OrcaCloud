// Estado do acesso do síndico no card de Portais › Portal do Condomínio (20/10/2026).
import { describe, it, expect } from 'vitest';
import { acessoDoSindico, type EstadoDoSindico } from '../utils/acessoDoSindico';

const HOJE = '2026-10-20';
const AGORA = new Date('2026-10-20T15:00:00Z');
const sindico = { clientId: 'c1', nome: 'Fulano', email: 'f@x.com', mandatoInicio: null, mandatoFim: null };

const estado = (e: Partial<EstadoDoSindico>): EstadoDoSindico => ({ sindico, acesso: null, ...e });

describe('acessoDoSindico', () => {
    it('sem síndico vem antes de tudo', () => {
        expect(acessoDoSindico({ sindico: null, acesso: null }, HOJE, AGORA).situacao).toBe('SEM_SINDICO');
    });

    it('mandato fora da vigência derruba até link ativo', () => {
        const e = estado({
            sindico: { ...sindico, mandatoFim: '2026-10-19' },
            acesso: { ativo: true, expiraEm: '2027-01-01T00:00:00Z', ultimoUso: null, convidadoEm: null },
        });
        expect(acessoDoSindico(e, HOJE, AGORA).situacao).toBe('MANDATO_FORA');
    });

    it('sem acesso, revogado, expirado', () => {
        expect(acessoDoSindico(estado({}), HOJE, AGORA).situacao).toBe('SEM_ACESSO');
        expect(acessoDoSindico(estado({ acesso: { ativo: false, expiraEm: '2027-01-01T00:00:00Z', ultimoUso: null, convidadoEm: null } }), HOJE, AGORA).situacao).toBe('REVOGADO');
        expect(acessoDoSindico(estado({ acesso: { ativo: true, expiraEm: '2026-10-20T14:00:00Z', ultimoUso: null, convidadoEm: null } }), HOJE, AGORA).situacao).toBe('EXPIRADO');
    });

    it('ativo diz quantos dias faltam', () => {
        const r = acessoDoSindico(estado({ acesso: { ativo: true, expiraEm: '2026-10-21T15:00:00Z', ultimoUso: null, convidadoEm: null } }), HOJE, AGORA);
        expect(r).toEqual({ situacao: 'ATIVO', rotulo: 'Ativo · 1 dia', dias: 1 });
    });
});
