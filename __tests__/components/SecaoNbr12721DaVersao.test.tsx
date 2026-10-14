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

const estado: { quadro: unknown; aprovacoes: unknown[]; nomes: Map<string, string> | null; emp: unknown } = { quadro: null, aprovacoes: [], nomes: null, emp: null };
const aprovar = vi.fn(async () => 'apr_1');
vi.mock('../../services/blueprintSnapshotNbr12721Service', () => ({
  blueprintSnapshotNbr12721Service: {
    daVersao: vi.fn(async () => estado.quadro),
    aprovacoes: vi.fn(async () => estado.aprovacoes),
    aprovar: (...args: unknown[]) => aprovar(...(args as [])),
    // `null` = o serviço não tem a função (como antes da Fase 8): o nome falha e a seção tem de seguir.
    empreendimentoDoEstudo: vi.fn(async () => estado.emp),
    get nomesDeQuemAprovou() {
      return estado.nomes ? vi.fn(async () => estado.nomes) : undefined;
    },
  },
}));
const documentoDaVersao = vi.fn(async () => ({ estudo: 'E', revisao: 1 }));
const exportarPdf = vi.fn(async () => undefined);
const exportarXlsx = vi.fn();
vi.mock('../../services/nbr12721ExportService', () => ({
  nbr12721ExportService: {
    documentoDaVersao: (...a: unknown[]) => documentoDaVersao(...(a as [])),
    exportarPdf: (...a: unknown[]) => exportarPdf(...(a as [])),
    exportarXlsx: (...a: unknown[]) => exportarXlsx(...(a as [])),
  },
}));
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: { id: 'eu-uuid' } } }) } } }));

import SecaoNbr12721DaVersao from '../../components/blueprint/SecaoNbr12721DaVersao';

vi.mock('../../components/blueprint/DevolucaoNbr12721', () => ({
  default: ({ aberto }: { aberto: boolean }) => (aberto ? <div data-testid="drawer-devolucao" /> : null),
}));

const quadroOk = { snapshotId: 's1', studyId: 'st1', hash: 'abcdef0123456789'.repeat(4), status: 'success', versaoMotor: 'nbr12721-ts-1.0.0', congeladoEm: '2026-10-14T10:00:00Z' };

describe('SecaoNbr12721DaVersao', () => {
  beforeEach(() => {
    estado.quadro = null;
    estado.aprovacoes = [];
    estado.nomes = null;
    estado.emp = null;
    aprovar.mockClear();
    documentoDaVersao.mockClear();
    exportarPdf.mockClear();
    exportarXlsx.mockClear();
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

  it('Fase 8: aprovação de outra pessoa mostra o NOME; baixar PDF e XLSX lê o documento da versão', async () => {
    estado.quadro = quadroOk;
    estado.nomes = new Map([['outra-uuid', 'Fulana Arquiteta']]);
    estado.aprovacoes = [{ id: 'a1', tipo: 'TECNICA', hash: quadroOk.hash, observacao: null, aprovadoPor: 'outra-uuid', aprovadoEm: '2026-10-14T11:00:00Z' }];
    render(<SecaoNbr12721DaVersao snapshotId="s1" />);
    expect(await screen.findByText(/por Fulana Arquiteta/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Baixar PDF' }));
    expect(documentoDaVersao).toHaveBeenCalledWith('s1');
    expect(exportarPdf).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Baixar XLSX' }));
    expect(exportarXlsx).toHaveBeenCalledTimes(1);
  });

  it('sem o nome (serviço falha), a linha mostra o id curto e a seção segue', async () => {
    estado.quadro = quadroOk;
    estado.aprovacoes = [{ id: 'a1', tipo: 'TECNICA', hash: quadroOk.hash, observacao: null, aprovadoPor: 'outra-uuid-123', aprovadoEm: '2026-10-14T11:00:00Z' }];
    render(<SecaoNbr12721DaVersao snapshotId="s1" />);
    expect(await screen.findByText(/por outra-uu/)).toBeTruthy();
    expect(screen.getByText('Quadros I, II e IV-B congelados')).toBeTruthy();
  });

  it('erro ao gerar o arquivo aparece com o motivo', async () => {
    estado.quadro = quadroOk;
    documentoDaVersao.mockRejectedValueOnce(new Error('nbr12721Export/versao: esta versão não tem os Quadros NBR 12721 congelados'));
    render(<SecaoNbr12721DaVersao snapshotId="s1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Baixar PDF' }));
    expect((await screen.findByRole('alert')).textContent).toBe('esta versão não tem os Quadros NBR 12721 congelados');
  });

  it('Fase 9: "Levar ao Empreendimento" só com estudo ligado e as duas aprovações; abre o drawer', async () => {
    estado.quadro = quadroOk;
    const { unmount } = render(<SecaoNbr12721DaVersao snapshotId="s1" />);
    const semEmp = await screen.findByRole('button', { name: 'Levar ao Empreendimento' });
    await vi.waitFor(() => expect(semEmp.getAttribute('title')).toBe('Este estudo não está ligado a um Empreendimento'));
    unmount();
    estado.emp = { id: 'e1', name: 'Residencial', organizationId: 'org1' };
    estado.aprovacoes = [{ id: 'a1', tipo: 'TECNICA', hash: quadroOk.hash, observacao: null, aprovadoPor: 'eu-uuid', aprovadoEm: '2026-10-14T11:00:00Z' }];
    const r2 = render(<SecaoNbr12721DaVersao snapshotId="s1" />);
    const soTecnica = await screen.findByRole('button', { name: 'Levar ao Empreendimento' });
    await vi.waitFor(() => expect(soTecnica.getAttribute('title')).toMatch(/aprovada na técnica e na jurídica/));
    r2.unmount();
    estado.aprovacoes = [...estado.aprovacoes, { id: 'a2', tipo: 'JURIDICA', hash: quadroOk.hash, observacao: null, aprovadoPor: 'eu-uuid', aprovadoEm: '2026-10-14T12:00:00Z' }];
    render(<SecaoNbr12721DaVersao snapshotId="s1" />);
    const ok = await screen.findByRole('button', { name: 'Levar ao Empreendimento' });
    await vi.waitFor(() => expect((ok as HTMLButtonElement).disabled).toBe(false));
    expect(ok.getAttribute('title')).toMatch(/Residencial/);
    await userEvent.click(ok);
    expect(screen.getByTestId('drawer-devolucao')).toBeTruthy();
  });

  it('erro do banco aparece com o motivo (a RPC é quem decide)', async () => {
    estado.quadro = quadroOk;
    aprovar.mockRejectedValueOnce(new Error('blueprintSnapshotNbr12721/aprovar: você não é membro da organização desta versão'));
    render(<SecaoNbr12721DaVersao snapshotId="s1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Aprovar técnica' }));
    expect((await screen.findByRole('alert')).textContent).toBe('você não é membro da organização desta versão');
  });
});
