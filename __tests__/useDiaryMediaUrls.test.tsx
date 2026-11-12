// @vitest-environment jsdom
/**
 * `useDiaryMediaUrls` — falha ao assinar a mídia do Diário.
 *
 * Limite de uso do link (429 / 54000): NÃO apaga as URLs já assinadas (a foto
 * que já estava na tela continua lá) e avisa quem chamou, com a mensagem do
 * servidor. Qualquer outra falha segue como sempre: limpa o mapa. Assinatura
 * que volta a funcionar apaga o aviso.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../lib/supabase', () => ({ supabase: {} }))

import { useDiaryMediaUrls } from '../hooks/useDiaryMediaUrls'

const LIMITE = 'Limite de uso do link atingido — tente de novo na próxima hora.'
const A = 'org1/d1/a.jpg'
const B = 'org1/d1/b.jpg'

describe('useDiaryMediaUrls — falha ao assinar', () => {
  it('limite de uso (429) mantém as URLs já assinadas e avisa com a mensagem do servidor', async () => {
    const aviso = vi.fn()
    const assinar = vi.fn()
      .mockResolvedValueOnce({ [A]: 'https://assinada/a' })
      .mockRejectedValueOnce(Object.assign(new Error(LIMITE), { status: 429, code: '54000' }))
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result, rerender } = renderHook(
      ({ refs }) => useDiaryMediaUrls(refs, undefined, assinar, aviso),
      { initialProps: { refs: [A] } },
    )
    await waitFor(() => expect(result.current[A]).toBe('https://assinada/a'))
    expect(aviso).toHaveBeenLastCalledWith(null)

    rerender({ refs: [A, B] })
    await waitFor(() => expect(aviso).toHaveBeenLastCalledWith(LIMITE))
    expect(result.current[A]).toBe('https://assinada/a')
    expect(result.current[B]).toBeUndefined()
    erro.mockRestore()
  })

  it('outra falha limpa o mapa, como sempre, sem avisar de limite', async () => {
    const aviso = vi.fn()
    const assinar = vi.fn()
      .mockResolvedValueOnce({ [A]: 'https://assinada/a' })
      .mockRejectedValueOnce(new Error('rede caiu'))
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result, rerender } = renderHook(
      ({ refs }) => useDiaryMediaUrls(refs, undefined, assinar, aviso),
      { initialProps: { refs: [A] } },
    )
    await waitFor(() => expect(result.current[A]).toBe('https://assinada/a'))
    rerender({ refs: [A, B] })
    await waitFor(() => expect(result.current[A]).toBeUndefined())
    expect(aviso).not.toHaveBeenCalledWith(expect.stringContaining('Limite'))
    erro.mockRestore()
  })

  it('assinatura que volta a funcionar apaga o aviso', async () => {
    const aviso = vi.fn()
    const assinar = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error(LIMITE), { status: 429 }))
      .mockResolvedValueOnce({ [A]: 'https://assinada/a', [B]: 'https://assinada/b' })
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender } = renderHook(
      ({ refs }) => useDiaryMediaUrls(refs, undefined, assinar, aviso),
      { initialProps: { refs: [A] } },
    )
    await waitFor(() => expect(aviso).toHaveBeenLastCalledWith(LIMITE))
    rerender({ refs: [A, B] })
    await waitFor(() => expect(aviso).toHaveBeenLastCalledWith(null))
    erro.mockRestore()
  })
})
