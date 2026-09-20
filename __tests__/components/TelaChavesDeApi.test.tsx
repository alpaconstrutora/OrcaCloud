// @vitest-environment jsdom
/**
 * Chaves da API pública (20/09/2026, E9.2): a tela lista os tokens (prefixo,
 * uso, status), cria com validação e mostra o token UMA vez, revoga com
 * confirmação, e aponta a documentação publicada.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import TelaChavesDeApi, { validarNovoToken } from '../../components/blueprint/TelaChavesDeApi';
import { ConfirmProvider } from '../../components/ui/confirm';
import type { TokenDaApi } from '../../services/blueprintApiTokenService';

const tokens: TokenDaApi[] = [
  { id: 't1', organizationId: 'org_1', nome: 'Power BI', prefixo: 'opk_1a2b3c4d', escopos: ['leitura'], active: true, createdAt: '2026-09-01T10:00:00Z', expiresAt: null, lastUsedAt: '2026-09-19T15:30:00Z', usos: 42, revokedAt: null },
  { id: 't2', organizationId: 'org_2', nome: 'ERP antigo', prefixo: 'opk_ffff0000', escopos: ['leitura'], active: false, createdAt: '2026-08-01T10:00:00Z', expiresAt: null, lastUsedAt: null, usos: 0, revokedAt: '2026-09-10T10:00:00Z' },
];

function montar(extra: Partial<React.ComponentProps<typeof TelaChavesDeApi>> = {}) {
  const onCriar = vi.fn().mockResolvedValue({ id: 't3', token: 'opk_' + 'a'.repeat(48), prefixo: 'opk_aaaaaaaa' });
  const onRevogar = vi.fn().mockResolvedValue(undefined);
  render(
    <ConfirmProvider>
      <TelaChavesDeApi tokens={tokens} carregando={false} indisponivel={null} mostrarOrg nomeDaOrg={(id) => (id === 'org_1' ? 'Alpa' : 'SPE Garden')} urlBase="https://x.supabase.co/functions/v1/planta-api" onCriar={onCriar} onRevogar={onRevogar} {...extra} />
    </ConfirmProvider>,
  );
  return { onCriar, onRevogar };
}

describe('TelaChavesDeApi (E9.2)', () => {
  it('valida: nome obrigatório e ≤ 80; validade no passado é recusada', () => {
    expect(validarNovoToken('', '')).toEqual(['nome é obrigatório']);
    expect(validarNovoToken('x'.repeat(81), '')).toEqual(['nome maior que 80 caracteres']);
    expect(validarNovoToken('BI', '2020-01-01')).toEqual(['validade tem de estar no futuro']);
    expect(validarNovoToken('BI', '2099-01-01')).toEqual([]);
  });

  it('lista com prefixo, organização, último uso, chamadas e status; a documentação publicada está apontada; revogar só nos ativos e pede confirmação', async () => {
    const { onRevogar } = montar();
    const tela = screen.getByTestId('tela-chaves-de-api');
    expect(within(tela).getByTestId('link-docs-da-api')).toHaveAttribute('href', 'https://x.supabase.co/functions/v1/planta-api/docs');
    expect(within(tela).getByTestId('como-usar-a-api')).toHaveTextContent(/somente leitura/);
    // As rotas vêm do MESMO OpenAPI que a function publica.
    const rotas = within(tela).getByTestId('rotas-da-api');
    expect(rotas).toHaveTextContent('Rotas (7)');
    expect(rotas).toHaveTextContent('GET /v1/estudos/{estudoId}/versoes/{revisao}/ifc');
    expect(rotas).toHaveTextContent(/planilha\.csv/);
    expect(tela).toHaveTextContent('opk_1a2b3c4d…');
    expect(tela).toHaveTextContent('Alpa');
    expect(tela).toHaveTextContent('SPE Garden');
    expect(tela).toHaveTextContent('42');
    expect(tela).toHaveTextContent('ativo');
    expect(tela).toHaveTextContent(/revogado/);
    expect(screen.queryByRole('button', { name: 'Revogar token ERP antigo' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Revogar token Power BI' }));
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent(/param na hora/);
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Revogar' }));
    await waitFor(() => expect(onRevogar).toHaveBeenCalledWith('t1'));
  });

  it('criar: recusa nome vazio sem chamar o serviço; com nome e validade chama e mostra o token UMA vez, com copiar', async () => {
    const { onCriar } = montar();
    await userEvent.click(screen.getByTestId('novo-token'));
    await userEvent.click(screen.getByTestId('salvar-token'));
    expect(screen.getByTestId('erros-do-token')).toHaveTextContent(/nome é obrigatório/);
    expect(onCriar).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Nome do token'), 'Power Query');
    await userEvent.type(screen.getByLabelText('Validade do token'), '2099-12-31');
    await userEvent.click(screen.getByTestId('salvar-token'));
    await waitFor(() => expect(onCriar).toHaveBeenCalledTimes(1));
    expect(onCriar.mock.calls[0][0]).toBe('Power Query');
    expect(onCriar.mock.calls[0][1]).toMatch(/^2099-12-31T|^2100-01-01T/);
    const caixa = await screen.findByTestId('token-criado');
    expect(within(caixa).getByTestId('token-em-texto')).toHaveTextContent('opk_' + 'a'.repeat(48));
    expect(caixa).toHaveTextContent(/não será mostrado de novo/);
    expect(screen.queryByTestId('form-token')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Já guardei' }));
    expect(screen.queryByTestId('token-criado')).toBeNull();
  });

  it('a falha do serviço aparece no formulário (ex.: não é membro da organização)', async () => {
    const onCriar = vi.fn().mockRejectedValue(new Error('blueprintApiToken/create: você não é membro desta organização'));
    montar({ onCriar });
    await userEvent.click(screen.getByTestId('novo-token'));
    await userEvent.type(screen.getByLabelText('Nome do token'), 'X');
    await userEvent.click(screen.getByTestId('salvar-token'));
    await waitFor(() => expect(screen.getByTestId('erros-do-token')).toHaveTextContent(/não é membro/));
    expect(screen.queryByTestId('token-criado')).toBeNull();
  });
});
