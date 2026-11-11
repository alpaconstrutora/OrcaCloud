// @vitest-environment jsdom
/**
 * Link do celular no Editar membro — `LinkDoCelularBloco` com `motivoGerarBloqueado`
 * (revisão final de 2026-11-11): o gestor não gera o link de um admin/owner (o banco
 * recusa), então "Gerar link" fica desligado DIZENDO o motivo; Revogar continua.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))

import LinkDoCelularBloco, { MOTIVO_GERAR_SO_O_PROPRIO } from '../../components/celular/LinkDoCelularBloco'
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
    expect(gerar).toHaveAttribute('title', 'Admin e owner geram o próprio link, pelo menu da conta › Meu link do celular')
    expect(screen.getByTestId('link-do-celular-motivo-gerar')).toHaveTextContent(MOTIVO_GERAR_SO_O_PROPRIO)
    expect(screen.getByTestId('link-do-celular-revogar')).toBeEnabled()
    expect(rpc).toHaveBeenCalledWith('mobile_link_status', { p_user_id: 'u1', p_org_id: 'o1' })
  })

  it('sem motivo (membro comum, ou a própria pessoa): Gerar liberado e sem o aviso', async () => {
    montar()
    expect(await screen.findByText('Link ativo', { exact: false })).toBeInTheDocument()
    expect(screen.getByTestId('link-do-celular-gerar')).toBeEnabled()
    expect(screen.queryByTestId('link-do-celular-motivo-gerar')).toBeNull()
  })
})
