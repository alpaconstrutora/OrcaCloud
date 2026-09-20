// @vitest-environment jsdom
/**
 * Webhooks (20/09/2026, E9.3): a tela lista as assinaturas (URL, segredo com
 * copiar, eventos, última entrega, ativo/pausado), cria com validação,
 * testa, apaga com confirmação, e mostra o log das entregas com reenviar.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import TelaWebhooks from '../../components/blueprint/TelaWebhooks';
import { ConfirmProvider } from '../../components/ui/confirm';
import type { EntregaDeWebhook, Webhook } from '../../services/blueprintWebhookService';

const webhooks: Webhook[] = [
  { id: 'w1', organizationId: 'org_1', nome: 'ERP', url: 'https://erp.exemplo.com.br/opura', segredo: 'abcdef0123456789abcdef0123456789abcdef0123456789', eventos: ['versao.publicada', 'versao.aprovada'], active: true, createdAt: '2026-09-01T10:00:00Z', ultimaEntregaAt: '2026-09-19T15:30:00Z', ultimoStatus: 204 },
  { id: 'w2', organizationId: 'org_1', nome: 'Slack', url: 'https://hooks.slack.com/x', segredo: 'ffff', eventos: ['comentario.criado'], active: false, createdAt: '2026-08-01T10:00:00Z', ultimaEntregaAt: null, ultimoStatus: null },
];
const entregas: EntregaDeWebhook[] = [
  { id: 'e1', webhookId: 'w1', evento: 'versao.publicada', payload: { revisao: 3 }, status: 'ENTREGUE', tentativas: 1, httpStatus: 204, erro: null, proximaTentativaAt: '2026-09-19T15:30:00Z', createdAt: '2026-09-19T15:29:58Z', entregueAt: '2026-09-19T15:30:00Z' },
  { id: 'e2', webhookId: 'w1', evento: 'teste.ping', payload: {}, status: 'PENDENTE', tentativas: 2, httpStatus: 503, erro: 'HTTP 503', proximaTentativaAt: '2026-09-19T15:40:00Z', createdAt: '2026-09-19T15:34:00Z', entregueAt: null },
  { id: 'e3', webhookId: 'w2', evento: 'comentario.criado', payload: {}, status: 'FALHOU', tentativas: 6, httpStatus: null, erro: 'sem resposta em 10 s', proximaTentativaAt: '2026-09-19T15:40:00Z', createdAt: '2026-09-18T10:00:00Z', entregueAt: null },
];

function montar(extra: Partial<React.ComponentProps<typeof TelaWebhooks>> = {}) {
  const props = {
    onCriar: vi.fn().mockResolvedValue(undefined),
    onAtualizar: vi.fn().mockResolvedValue(undefined),
    onApagar: vi.fn().mockResolvedValue(undefined),
    onTestar: vi.fn().mockResolvedValue(undefined),
    onReenviar: vi.fn().mockResolvedValue(undefined),
    onRecarregarEntregas: vi.fn(),
  };
  render(
    <ConfirmProvider>
      <TelaWebhooks webhooks={webhooks} entregas={entregas} carregando={false} indisponivel={null} mostrarOrg={false} nomeDaOrg={() => 'Alpa'} {...props} {...extra} />
    </ConfirmProvider>,
  );
  return props;
}

describe('TelaWebhooks (E9.3)', () => {
  it('lista: URL, segredo abreviado com copiar, eventos com rótulo, última entrega com HTTP, ativo/pausado alternável; o log mostra estado, tentativas, HTTP e erro; reenviar só fora de PENDENTE', async () => {
    const p = montar();
    const tela = screen.getByTestId('tela-webhooks');
    expect(within(tela).getByTestId('como-funciona-webhook')).toHaveTextContent(/X-Opura-Signature/);
    expect(tela).toHaveTextContent('https://erp.exemplo.com.br/opura');
    expect(tela).toHaveTextContent('abcdef01…');
    expect(tela).toHaveTextContent('Versão publicada · Versão aprovada');
    expect(tela).toHaveTextContent(/HTTP 204/);
    expect(screen.getByRole('button', { name: 'Desativar webhook ERP' })).toHaveTextContent('ativo');
    expect(screen.getByRole('button', { name: 'Ativar webhook Slack' })).toHaveTextContent('pausado');
    await userEvent.click(screen.getByRole('button', { name: 'Ativar webhook Slack' }));
    expect(p.onAtualizar).toHaveBeenCalledWith('w2', { active: true });
    const log = within(tela).getByTestId('log-de-entregas');
    expect(log).toHaveTextContent('Entregas (últimas 3)');
    expect(log).toHaveTextContent('entregue');
    expect(log).toHaveTextContent('pendente');
    expect(log).toHaveTextContent('falhou');
    expect(log).toHaveTextContent('HTTP 503');
    expect(log).toHaveTextContent('sem resposta em 10 s');
    expect(within(log).queryByRole('button', { name: 'Reenviar entrega e2' })).toBeNull(); // pendente: o servidor vai tentar
    await userEvent.click(within(log).getByRole('button', { name: 'Reenviar entrega e3' }));
    expect(p.onReenviar).toHaveBeenCalledWith('e3');
    // Filtro por webhook.
    await userEvent.selectOptions(within(log).getByLabelText('Filtrar entregas por webhook'), 'w2');
    expect(within(log).getAllByRole('row').filter((r) => /falhou|entregue|pendente/.test(r.textContent ?? ''))).toHaveLength(1);
  });

  it('criar: valida (nome, https pública, ≥ 1 evento) antes de chamar; com tudo certo chama com nome, URL e eventos', async () => {
    const p = montar();
    await userEvent.click(screen.getByTestId('novo-webhook'));
    const form = screen.getByTestId('form-webhook');
    // Já vem com "Versão publicada" marcado.
    expect(within(form).getByLabelText('Versão publicada')).toBeChecked();
    await userEvent.type(within(form).getByLabelText('URL do webhook'), 'http://localhost:3000/x');
    await userEvent.click(screen.getByTestId('salvar-webhook'));
    expect(screen.getByTestId('erros-do-webhook')).toHaveTextContent(/nome é obrigatório/);
    expect(screen.getByTestId('erros-do-webhook')).toHaveTextContent(/https/);
    expect(p.onCriar).not.toHaveBeenCalled();
    await userEvent.type(within(form).getByLabelText('Nome do webhook'), 'Power Automate');
    await userEvent.clear(within(form).getByLabelText('URL do webhook'));
    await userEvent.type(within(form).getByLabelText('URL do webhook'), 'https://prod.flow.microsoft.com/abc');
    await userEvent.click(within(form).getByLabelText('Comentário novo'));
    await userEvent.click(screen.getByTestId('salvar-webhook'));
    await waitFor(() => expect(p.onCriar).toHaveBeenCalledWith({ nome: 'Power Automate', url: 'https://prod.flow.microsoft.com/abc', eventos: ['versao.publicada', 'comentario.criado'] }));
    expect(await screen.findByTestId('aviso-webhook')).toHaveTextContent(/Copie o segredo/);
    expect(screen.queryByTestId('form-webhook')).toBeNull();
  });

  it('testar enfileira e avisa; apagar pede confirmação e explica que pausar é pelo status', async () => {
    const p = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Testar webhook ERP' }));
    await waitFor(() => expect(p.onTestar).toHaveBeenCalledWith('w1'));
    expect(screen.getByTestId('aviso-webhook')).toHaveTextContent(/Teste enfileirado para "ERP"/);
    await userEvent.click(screen.getByRole('button', { name: 'Apagar webhook Slack' }));
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent(/Para só pausar, use o status/);
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Apagar' }));
    await waitFor(() => expect(p.onApagar).toHaveBeenCalledWith('w2'));
  });

  it('editar abre o formulário preenchido e salva só o que mudou', async () => {
    const p = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Editar webhook ERP' }));
    const form = screen.getByTestId('form-webhook');
    expect(within(form).getByLabelText('Nome do webhook')).toHaveValue('ERP');
    expect(within(form).getByLabelText('Versão aprovada')).toBeChecked();
    await userEvent.click(within(form).getByLabelText('Versão aprovada'));
    await userEvent.click(screen.getByTestId('salvar-webhook'));
    await waitFor(() => expect(p.onAtualizar).toHaveBeenCalledWith('w1', { nome: 'ERP', url: 'https://erp.exemplo.com.br/opura', eventos: ['versao.publicada'] }));
  });
});
