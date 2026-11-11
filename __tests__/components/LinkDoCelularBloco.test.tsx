// @vitest-environment jsdom
/**
 * Link do celular no Editar membro — `LinkDoCelularBloco` com `motivoGerarBloqueado`
 * (revisão final de 2026-11-11): o gestor só gera o link de quem é `member` (o banco recusa
 * admin/owner e, por decisão, visualizador), então "Gerar link" fica desligado DIZENDO o motivo;
 * Revogar continua.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))

import LinkDoCelularBloco, { MOTIVO_GERAR_SO_O_PROPRIO, motivoGerarBloqueadoPara } from '../../components/celular/LinkDoCelularBloco'
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
