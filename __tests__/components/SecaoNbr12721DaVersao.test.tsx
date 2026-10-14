// @vitest-environment jsdom
/**
 * Áreas NBR 12721 na versão publicada (Fase 7): a seção do painel Versões —
 * quadro congelado com hash, aprovações, e os botões que dizem o motivo de
 * estarem desligados (quem decide de verdade é a RPC no banco).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const estado: { quadro: unknown; aprovacoes: unknown[] } = { quadro: null, aprovacoes: [] };
const aprovar = vi.fn(async () => 'apr_1');
vi.mock('../../services/blueprintSnapshotNbr12721Service', () => ({
  blueprintSnapshotNbr12721Service: {
    daVersao: vi.fn(async () => estado.quadro),
    aprovacoes: vi.fn(async () => estado.aprovacoes),
    aprovar: (...args: unknown[]) => aprovar(...(args as [])),
  },
}));
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: { id: 'eu-uuid' } } }) } } }));

import SecaoNbr12721DaVersao from '../../components/blueprint/SecaoNbr12721DaVersao';

const quadroOk = { snapshotId: 's1', hash: 'abcdef0123456789'.repeat(4), status: 'success', versaoMotor: 'nbr12721-ts-1.0.0', congeladoEm: '2026-10-14T10:00:00Z' };

describe('SecaoNbr12721DaVersao', () => {
  beforeEach(() => {
    estado.quadro = null;
    estado.aprovacoes = [];
    aprovar.mockClear();
  });

  it('versão sem quadro: diz por quê e não oferece aprovar', async () => {
    render(<SecaoNbr12721DaVersao snapshotId="s1" />);
    expect(await screen.findByText(/não tem os quadros congelados/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Aprovar/ })).toBeNull();
  });

  it('quadro ok: hash curto, jurídica desligada até a técnica; aprovar a técnica chama a RPC com a observação', async () => {
    estado.quadro = quadroOk;
    render(<SecaoNbr12721DaVersao snapshotId="s1" />);
    expect(await screen.findByText('Quadros I, II e IV-B congelados')).toBeTruthy();
    expect(screen.getByText('abcdef012345')).toBeTruthy();
    const juridica = screen.getByRole('button', { name: 'Aprovar jurídica' });
    expect(juridica.getAttribute('title')).toBe('A aprovação jurídica vem depois da técnica');
    await userEvent.type(screen.getByLabelText('Observação da aprovação NBR 12721'), 'conferido com o projeto');
    estado.aprovacoes = [{ id: 'a1', tipo: 'TECNICA', hash: quadroOk.hash, observacao: 'conferido com o projeto', aprovadoPor: 'eu-uuid', aprovadoEm: '2026-10-14T11:00:00Z' }];
    await userEvent.click(screen.getByRole('button', { name: 'Aprovar técnica' }));
    expect(aprovar).toHaveBeenCalledWith('s1', 'TECNICA', 'conferido com o projeto');
    expect(await screen.findByText(/por você/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Aprovar técnica' }).getAttribute('title')).toBe('Esta versão já tem a aprovação técnica');
    expect(screen.getByRole('button', { name: 'Aprovar jurídica' }).getAttribute('title')).not.toMatch(/depois da técnica/);
  });

  it('quadro com pendência bloqueante: os dois botões dizem o motivo; sem permissão também', async () => {
    estado.quadro = { ...quadroOk, status: 'failed' };
    const { unmount } = render(<SecaoNbr12721DaVersao snapshotId="s1" />);
    expect(await screen.findByText(/COM pendência bloqueante/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Aprovar técnica' }).getAttribute('title')).toBe('Os quadros desta versão têm pendência bloqueante');
    unmount();
    estado.quadro = quadroOk;
    render(<SecaoNbr12721DaVersao snapshotId="s1" podeAprovar={false} />);
    expect((await screen.findByRole('button', { name: 'Aprovar técnica' })).getAttribute('title')).toBe('Sem permissão para aprovar as Áreas NBR 12721');
  });

  it('erro do banco aparece com o motivo (a RPC é quem decide)', async () => {
    estado.quadro = quadroOk;
    aprovar.mockRejectedValueOnce(new Error('blueprintSnapshotNbr12721/aprovar: você não é membro da organização desta versão'));
    render(<SecaoNbr12721DaVersao snapshotId="s1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Aprovar técnica' }));
    expect((await screen.findByRole('alert')).textContent).toBe('você não é membro da organização desta versão');
  });
});
