/**
 * Links de portal (Cliente e Colaborador): desde aplicar_20271125913700 só owner/admin grava.
 * Para quem não é gestor, a RLS faz o UPDATE de "revogar" alterar 0 linhas SEM erro — o serviço
 * tem de acusar, senão a tela diz "Acesso revogado" sem ter revogado. E a recusa 42501 de gerar
 * vira a mensagem legível (antes chegava "not_allowed").
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const estado = vi.hoisted(() => ({
  linhas: [] as unknown[] | null,
  erro: null as unknown,
  rpcErro: null as unknown,
  chamadas: [] as string[],
}))

vi.mock('../lib/supabase', () => {
  const cadeia = {
    update: () => { estado.chamadas.push('update'); return cadeia },
    eq: () => cadeia,
    select: (cols: string) => {
      estado.chamadas.push(`select:${cols}`)
      return Promise.resolve({ data: estado.linhas, error: estado.erro })
    },
  }
  return {
    supabase: {
      from: () => cadeia,
      rpc: () => Promise.resolve({ data: estado.rpcErro ? null : 'tok', error: estado.rpcErro }),
    },
  }
})

import { clientPortalService } from '../services/clientPortalService'
import { atsService } from '../services/atsService'
import { MSG_LINK_PORTAL_SO_GESTOR } from '../utils/portalLinkPermissao'

beforeEach(() => {
  estado.linhas = []
  estado.erro = null
  estado.rpcErro = null
  estado.chamadas = []
})

const revogar = {
  'Portal do Cliente': () => clientPortalService.revokeToken('c1'),
  'Portal do Colaborador': () => atsService.revokePortalToken('t1'),
}
const gerar = {
  'Portal do Cliente': () => clientPortalService.generateToken('c1', 'o1'),
  'Portal do Colaborador': () => atsService.generatePortalToken('e1', 'o1'),
}

describe.each(Object.keys(revogar) as (keyof typeof revogar)[])('%s', (portal) => {
  it('revogar que não alterou linha nenhuma (não é gestor) lança a mensagem de permissão', async () => {
    estado.linhas = []
    await expect(revogar[portal]()).rejects.toThrow(MSG_LINK_PORTAL_SO_GESTOR)
    expect(estado.chamadas).toEqual(['update', 'select:id'])
  })

  it('revogar que alterou a linha (gestor) resolve', async () => {
    estado.linhas = [{ id: 'x' }]
    await expect(revogar[portal]()).resolves.toBeUndefined()
  })

  it('revogar com erro 42501 vira a mensagem de permissão; outro erro passa como veio', async () => {
    estado.erro = { code: '42501', message: 'new row violates row-level security policy' }
    await expect(revogar[portal]()).rejects.toThrow(MSG_LINK_PORTAL_SO_GESTOR)
    const rede = { code: 'PGRST000', message: 'rede' }
    estado.erro = rede
    await expect(revogar[portal]()).rejects.toBe(rede)
  })

  it('gerar recusado (42501 not_allowed) vira a mensagem de permissão', async () => {
    estado.rpcErro = { code: '42501', message: 'not_allowed' }
    await expect(gerar[portal]()).rejects.toThrow(MSG_LINK_PORTAL_SO_GESTOR)
  })
})
