// @vitest-environment jsdom
/**
 * Diário desktop — "registrado por" (2026-11-13). A autoria vem carimbada pelo
 * banco (`_diary_upsert_core`, aplicar_20271113300000); a tela só exibe:
 *  - coluna "Autor" na tabela de registros, com quem registrou e o resto no `title`;
 *  - no editor (painel lateral), "Registrado por …" e "editado por … em DD/MM HH:MM";
 *  - registro antigo, sem carimbo, não mostra autoria.
 */
import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../hooks/useDiaryAprovacao', () => ({ useDiaryAprovacao: () => ({ pode: true }) }))
vi.mock('../../hooks/useDiaryMediaUrls', () => ({ useDiaryMediaUrls: () => ({}) }))
vi.mock('../../hooks/useDiaryLinkedPlanning', () => ({
  useDiaryLinkedPlanning: () => ({ planejamentoId: null, schedule: null, budget: [], itens: [], setSchedule: () => {} }),
}))

import ProjectDiaryManager from '../../components/ProjectDiaryManager'
import { useStore } from '../../store/useStore'
import { ConfirmProvider } from '../../components/ui/confirm'
import type { DiaryEntry, ProjectSettings } from '../../types'

const emLocal = (h: number, min: number) => new Date(2026, 10, 13, h, min).toISOString()
const base: DiaryEntry = {
  id: 'e1', date: '2026-11-12', weather: 'Ensolarado', description: 'Forma dos pilares', images: [],
  status: 'Rascunho', weatherShifts: [], activities: [], labor: [],
}
const CARIMBADO: DiaryEntry = {
  ...base,
  registradoPor: { id: 'u-iago', nome: 'Iago Marcos', em: emLocal(8, 0) },
  editadoPor: { id: 'u-ana', nome: 'Ana Souza', em: emLocal(17, 45) },
}
const ANTIGO: DiaryEntry = { ...base, id: 'e2', date: '2026-10-01', description: 'Registro antigo' }

const settings = {
  id: 'd1', name: 'Diário Torre A', classification: 'DIARIO', organizationId: 'org1',
  diaryEntries: [CARIMBADO, ANTIGO],
} as unknown as ProjectSettings

const montar = () => render(
  <ConfirmProvider>
    <ProjectDiaryManager settings={settings} projects={[]} onLoadProject={() => {}} onUpdateSettings={() => {}} organizationId="org1" />
  </ConfirmProvider>,
)

beforeEach(() => {
  window.localStorage.clear()
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  useStore.setState({ organizations: [{ id: 'org1', name: 'Org' }] as never, fetchOrganizations: vi.fn() as never })
})

describe('ProjectDiaryManager — autoria do registro', () => {
  it('tabela: coluna Autor com quem registrou; o title diz quem editou; antigo fica "-"', () => {
    montar()
    expect(screen.getByText('Autor')).toBeInTheDocument()
    const nome = screen.getByText('Iago Marcos')
    expect(nome).toHaveAttribute('title', 'Registrado por Iago Marcos · editado por Ana Souza em 13/11 17:45')
    const linhaAntiga = screen.getByText('Registro antigo').closest('tr')!
    expect(within(linhaAntiga).queryByText(/Registrado por|Iago|Ana/)).toBeNull()
  })

  it('editor: painel lateral mostra "Registrado por" e "editado por … em"', () => {
    montar()
    fireEvent.click(screen.getByText('Forma dos pilares'))
    const autoria = screen.getByTestId('diario-autoria')
    expect(autoria).toHaveTextContent('Registrado por Iago Marcos')
    expect(autoria).toHaveTextContent('editado por Ana Souza em 13/11 17:45')
  })

  it('editor do registro antigo (sem carimbo): sem bloco de autoria', () => {
    montar()
    fireEvent.click(screen.getByText('Registro antigo'))
    expect(screen.queryByTestId('diario-autoria')).toBeNull()
  })
})
