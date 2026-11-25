// @vitest-environment jsdom
/**
 * Link do celular no Editar membro — `LinkDoCelularBloco` com `motivoGerarBloqueado`
 * (revisão final de 2026-11-11): o gestor só gera o link de quem é `member` (o banco recusa
 * admin/owner e, por decisão, visualizador), então "Gerar link" fica desligado DIZENDO o motivo;
 * Revogar continua.
 */
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))

import LinkDoCelularBloco, { MOTIVO_COPIAR_LINK_ANTIGO, MOTIVO_GERAR_SO_O_PROPRIO, motivoGerarBloqueadoPara } from '../../components/celular/LinkDoCelularBloco'
import { ConfirmProvider } from '../../components/ui/confirm'

const ATIVO = {
  existe: true,
  expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
  last_used_at: null,
  revogado: false,
}

const montar = (motivo?: string) =>
  render(
    <ConfirmProvider>
      <LinkDoCelularBloco userId="u1" orgId="o1" nomePessoa="Ana" motivoGerarBloqueado={motivo} />
    </ConfirmProvider>,
  )

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ data: ATIVO, error: null })
})

describe('LinkDoCelularBloco · gerar bloqueado por regra', () => {
  it('admin/owner editado por outro gestor: Gerar desligado com title e texto; Revogar liberado', async () => {
    montar(MOTIVO_GERAR_SO_O_PROPRIO)
    expect(await screen.findByText('Link ativo', { exact: false })).toBeInTheDocument()
    const gerar = screen.getByTestId('link-do-celular-gerar')
    expect(gerar).toBeDisabled()
    expect(gerar).toHaveAttribute('title', 'O gestor só gera link para membros comuns. Admin e owner geram o próprio, pelo menu da conta › Meu link do celular.')
    expect(screen.getByTestId('link-do-celular-motivo-gerar')).toHaveTextContent(MOTIVO_GERAR_SO_O_PROPRIO)
    expect(screen.getByTestId('link-do-celular-revogar')).toBeEnabled()
    expect(rpc).toHaveBeenCalledWith('mobile_link_status', { p_user_id: 'u1', p_org_id: 'o1' })
  })

  it('visualizador editado pelo gestor: Gerar desligado com o mesmo title exato; Revogar liberado', async () => {
    montar(motivoGerarBloqueadoPara('viewer', false))
    expect(await screen.findByText('Link ativo', { exact: false })).toBeInTheDocument()
    const gerar = screen.getByTestId('link-do-celular-gerar')
    expect(gerar).toBeDisabled()
    expect(gerar).toHaveAttribute('title', 'O gestor só gera link para membros comuns. Admin e owner geram o próprio, pelo menu da conta › Meu link do celular.')
    expect(screen.getByTestId('link-do-celular-revogar')).toBeEnabled()
  })

  it('membro comum editado pelo gestor: Gerar liberado e sem o aviso', async () => {
    montar(motivoGerarBloqueadoPara('member', false))
    expect(await screen.findByText('Link ativo', { exact: false })).toBeInTheDocument()
    expect(screen.getByTestId('link-do-celular-gerar')).toBeEnabled()
    expect(screen.queryByTestId('link-do-celular-motivo-gerar')).toBeNull()
  })
})

describe('regra de OrganizationUsers · quem recebe motivo', () => {
  it.each([
    ['owner', false, true],
    ['admin', false, true],
    ['viewer', false, true],
    ['member', false, false],
    ['admin', true, false],
    ['viewer', true, false],
  ])('papel salvo %s, é o próprio usuário=%s → bloqueia=%s', (role, proprio, bloqueia) => {
    expect(motivoGerarBloqueadoPara(role, proprio) === MOTIVO_GERAR_SO_O_PROPRIO).toBe(bloqueia)
  })
})

describe('LinkDoCelularBloco · Copiar link ativo (25/11/2026)', () => {
  const TOKEN = 'A'.repeat(43)
  const comRpc = (status: object, tokenCopiado: string | null) =>
    rpc.mockImplementation((nome: string) =>
      Promise.resolve(nome === 'mobile_link_copiar' ? { data: tokenCopiado, error: null } : { data: status, error: null }))

  it('link ativo com endereço guardado: Copiar link busca no banco, copia e mostra o endereço', async () => {
    comRpc({ ...ATIVO, copiavel: true }, TOKEN)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    montar()
    const botao = await screen.findByTestId('link-do-celular-copiar-ativo')
    await waitFor(() => expect(botao).toBeEnabled())
    expect(screen.getByTestId('link-do-celular-gerar')).toHaveTextContent('Gerar novo link')
    fireEvent.click(botao)
    const url = `${window.location.origin}/celular?token=${TOKEN}`
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(url))
    expect(rpc).toHaveBeenCalledWith('mobile_link_copiar', { p_user_id: 'u1', p_org_id: 'o1' })
    expect(screen.getByTestId('link-do-celular-url')).toHaveTextContent(url)
    expect(screen.getByTestId('link-do-celular-copiar')).toHaveTextContent('Copiado')
  })

  it('link ativo antigo (sem endereço guardado): Copiar link desligado dizendo o motivo', async () => {
    comRpc({ ...ATIVO, copiavel: false }, null)
    montar()
    const botao = await screen.findByTestId('link-do-celular-copiar-ativo')
    await waitFor(() => expect(screen.getByTestId('link-do-celular-motivo-copiar')).toHaveTextContent(MOTIVO_COPIAR_LINK_ANTIGO))
    expect(botao).toBeDisabled()
    expect(botao).toHaveAttribute('title', MOTIVO_COPIAR_LINK_ANTIGO)
    expect(rpc).not.toHaveBeenCalledWith('mobile_link_copiar', expect.anything())
  })

  it('banco sem o campo copiavel (versão antiga) conta como não copiável', async () => {
    comRpc(ATIVO, null)
    montar()
    const botao = await screen.findByTestId('link-do-celular-copiar-ativo')
    await waitFor(() => expect(botao).toHaveAttribute('title', MOTIVO_COPIAR_LINK_ANTIGO))
    expect(botao).toBeDisabled()
  })

  it('sem link: não há Copiar link', async () => {
    comRpc({ existe: false, expires_at: null, last_used_at: null, revogado: false, copiavel: false }, null)
    montar()
    expect(await screen.findByText('Nenhum link gerado.')).toBeInTheDocument()
    expect(screen.queryByTestId('link-do-celular-copiar-ativo')).toBeNull()
  })

  it('link mudou entre a consulta e o clique: avisa e não copia', async () => {
    comRpc({ ...ATIVO, copiavel: true }, null)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    montar()
    const botao = await screen.findByTestId('link-do-celular-copiar-ativo')
    await waitFor(() => expect(botao).toBeEnabled())
    fireEvent.click(botao)
    expect(await screen.findByRole('alert')).toHaveTextContent('O link mudou desde que esta tela abriu.')
    expect(writeText).not.toHaveBeenCalled()
    expect(screen.queryByTestId('link-do-celular-url')).toBeNull()
  })
})
