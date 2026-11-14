// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../lib/supabase', () => ({ supabase: { rpc } }))

import {
  celularSessao, gerarLinkCelular, tokenDoCelularDaUrl, urlDoLinkCelular, type SessaoCelular,
} from '../services/celular/celularLinkService'

// Token real tem 43 caracteres (32 bytes em base64url); o mínimo aceito é 20.
const TOKEN = 'abcDEF_123-xyzxyzxyzxyz'

describe('tokenDoCelularDaUrl', () => {
  it('lê o token de /celular e de /celular/', () => {
    expect(tokenDoCelularDaUrl('/celular', `?token=${TOKEN}`)).toBe(TOKEN)
    expect(tokenDoCelularDaUrl('/celular/', `?token=${TOKEN}`)).toBe(TOKEN)
  })

  it('aceita a query sem o "?" e com outros parâmetros', () => {
    expect(tokenDoCelularDaUrl('/celular', `token=${TOKEN}`)).toBe(TOKEN)
    expect(tokenDoCelularDaUrl('/celular', `?a=1&token=${TOKEN}&b=2`)).toBe(TOKEN)
  })

  it('devolve null sem token, vazio ou só com espaços', () => {
    expect(tokenDoCelularDaUrl('/celular', '')).toBeNull()
    expect(tokenDoCelularDaUrl('/celular', '?token=')).toBeNull()
    expect(tokenDoCelularDaUrl('/celular', '?token=%20%20')).toBeNull()
  })

  it('devolve null com espaço no meio, tag ou caractere fora de [A-Za-z0-9_-]', () => {
    expect(tokenDoCelularDaUrl('/celular', '?token=a b')).toBeNull()
    expect(tokenDoCelularDaUrl('/celular', '?token=<script>')).toBeNull()
    expect(tokenDoCelularDaUrl('/celular', `?token=${TOKEN}%20x`)).toBeNull()
    expect(tokenDoCelularDaUrl('/celular', `?token=${TOKEN}%00`)).toBeNull()
    expect(tokenDoCelularDaUrl('/celular', `?token=${TOKEN}=`)).toBeNull()
  })

  it('devolve null com token curto (10 caracteres)', () => {
    expect(tokenDoCelularDaUrl('/celular', '?token=abcdefghij')).toBeNull()
    expect(tokenDoCelularDaUrl('/celular', `?token=${TOKEN.slice(0, 19)}`)).toBeNull()
  })

  it('apara espaços em volta do token (antes de validar)', () => {
    expect(tokenDoCelularDaUrl('/celular', `?token=%20${TOKEN}%20`)).toBe(TOKEN)
  })

  it('só vale em /celular: outras rotas dão null', () => {
    expect(tokenDoCelularDaUrl('/m/loja', `?token=${TOKEN}`)).toBeNull()
    expect(tokenDoCelularDaUrl('/', `?token=${TOKEN}`)).toBeNull()
    expect(tokenDoCelularDaUrl('/celular/x', `?token=${TOKEN}`)).toBeNull()
    expect(tokenDoCelularDaUrl('/celulares', `?token=${TOKEN}`)).toBeNull()
    expect(tokenDoCelularDaUrl('/portal-corretor', `?token=${TOKEN}`)).toBeNull()
  })
})

describe('urlDoLinkCelular', () => {
  it('monta origem + /celular?token=', () => {
    expect(urlDoLinkCelular('t', 'https://x')).toBe('https://x/celular?token=t')
  })

  it('sem origem usa a do navegador', () => {
    expect(urlDoLinkCelular('t', undefined)).toBe(`${window.location.origin}/celular?token=t`)
  })
})

describe('celularSessao', () => {
  it('chama só celular_sessao com o token e devolve a sessão', async () => {
    const sessao: SessaoCelular = { user_id: 'u1', nome: 'Ana', org_id: 'o1', org_nome: 'Alpa', pode_aprovar_diario: false }
    rpc.mockResolvedValueOnce({ data: sessao, error: null })
    await expect(celularSessao(TOKEN)).resolves.toEqual(sessao)
    expect(rpc).toHaveBeenCalledWith('celular_sessao', { p_token: TOKEN })
  })

  it('recusa do banco (42501) vira null', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'link inválido ou vencido' } })
    await expect(celularSessao(TOKEN)).resolves.toBeNull()
  })

  it('outro erro (rede, 5xx) é lançado — não vira "link inválido"', async () => {
    const falha = { code: '', message: 'Failed to fetch' }
    rpc.mockResolvedValueOnce({ data: null, error: falha })
    await expect(celularSessao(TOKEN)).rejects.toBe(falha)
  })
})

describe('gerarLinkCelular', () => {
  it('devolve a URL completa a partir do token que o banco gerou', async () => {
    rpc.mockResolvedValueOnce({ data: TOKEN, error: null })
    await expect(gerarLinkCelular('u1', 'o1')).resolves.toBe(`${window.location.origin}/celular?token=${TOKEN}`)
    expect(rpc).toHaveBeenCalledWith('mobile_link_generate', { p_user_id: 'u1', p_org_id: 'o1' })
  })
})
