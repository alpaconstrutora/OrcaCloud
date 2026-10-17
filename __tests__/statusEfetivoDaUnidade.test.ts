import { describe, it, expect } from 'vitest';
import { negocioAtivoDaUnidade, statusEfetivoDaUnidade } from '../utils/statusEfetivoDaUnidade';

// Plano: docs/planos/2026-10-17-portal-corretor-pendencias.md (item 1.2) — o mesmo status no
// Estoque (espelho) e em Empreendimentos.
describe('statusEfetivoDaUnidade', () => {
  it('sem negócio: o status do cadastro', () => {
    expect(statusEfetivoDaUnidade('AVAILABLE')).toBe('AVAILABLE');
    expect(statusEfetivoDaUnidade('SOLD', undefined)).toBe('SOLD');
  });

  it('proposta aprovada / negócio concluído = vendida; locação concluída = alugada', () => {
    expect(statusEfetivoDaUnidade('AVAILABLE', { status: 'APROVADA' })).toBe('SOLD');
    expect(statusEfetivoDaUnidade('AVAILABLE', { status: 'COMPLETED' })).toBe('SOLD');
    expect(statusEfetivoDaUnidade('AVAILABLE', { status: 'CLOSED', type: 'RENTAL' })).toBe('RENTED');
  });

  it('proposta enviada / pendente = reservada; em negociação = bloqueada', () => {
    expect(statusEfetivoDaUnidade('AVAILABLE', { status: 'ENVIADA' })).toBe('RESERVED');
    expect(statusEfetivoDaUnidade('AVAILABLE', { status: 'PENDING' })).toBe('RESERVED');
    expect(statusEfetivoDaUnidade('AVAILABLE', { status: 'IN_NEGOTIATION' })).toBe('MAINTENANCE');
  });

  it('negócio cancelado ou de status desconhecido não muda o cadastro', () => {
    expect(statusEfetivoDaUnidade('AVAILABLE', { status: 'CANCELLED' })).toBe('AVAILABLE');
    expect(statusEfetivoDaUnidade('RESERVED', { status: 'REJEITADA' })).toBe('RESERVED');
  });
});

describe('negocioAtivoDaUnidade', () => {
  const negocios = [
    { property_id: 'U-1', status: 'CANCELLED' },
    { property_id: 'u-1', status: 'APROVADA' },
    { property_id: 'u-2', status: 'CANCELLED' },
  ];

  it('o primeiro não cancelado da unidade, sem diferenciar maiúscula', () => {
    expect(negocioAtivoDaUnidade('u-1', negocios)?.status).toBe('APROVADA');
  });

  it('só cancelados: o primeiro deles; sem negócio ou sem id: nada', () => {
    expect(negocioAtivoDaUnidade('u-2', negocios)?.status).toBe('CANCELLED');
    expect(negocioAtivoDaUnidade('u-3', negocios)).toBeUndefined();
    expect(negocioAtivoDaUnidade(null, negocios)).toBeUndefined();
    expect(negocioAtivoDaUnidade('u-1', null)).toBeUndefined();
  });
});
