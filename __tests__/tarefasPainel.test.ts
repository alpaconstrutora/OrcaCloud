import { describe, it, expect } from 'vitest'
import { montarPainelTarefas, type TarefaDoPainel, type OpcoesDoPainel } from '../utils/tarefasPainel'

// Segunda-feira, 16/11/2026, 10h locais.
const HOJE = new Date(2026, 10, 16, 10, 0, 0)

/** Prazo gravado como o formulário grava: meio-dia local do dia escolhido. */
const prazo = (dia: string) => `${dia}T12:00:00`
/** Instante local (criação/conclusão). */
const em = (dia: string, hora = '09:00:00') => new Date(`${dia}T${hora}`).toISOString()

let seq = 0
function tarefa(p: Partial<TarefaDoPainel> = {}): TarefaDoPainel {
  seq += 1
  return {
    id: p.id ?? `t${seq}`,
    title: p.title ?? `Tarefa ${seq}`,
    status: p.status ?? 'open',
    due_date: p.due_date ?? null,
    created_at: p.created_at ?? em('2026-11-01'),
    completed_at: p.completed_at ?? null,
    assignee_employee_id: p.assignee_employee_id ?? null,
    project_id: p.project_id ?? null,
    space_id: p.space_id ?? null,
    source_module: p.source_module ?? 'manual',
    priority: p.priority ?? 3,
    parent_task_id: p.parent_task_id ?? null,
  }
}

const OPCOES: OpcoesDoPainel = {
  hoje: HOJE,
  semanas: 8,
  responsaveis: [{ id: 'ana', name: 'Ana' }, { id: 'joao', name: 'João' }],
  espacos: [{ id: 'esp1', name: 'Compras' }],
  obras: [{ id: 'obra1', name: 'Residencial Garden' }],
}

const painel = (tarefas: TarefaDoPainel[], o: Partial<OpcoesDoPainel> = {}) =>
  montarPainelTarefas(tarefas, { ...OPCOES, ...o })

describe('montarPainelTarefas — faixa Hoje', () => {
  it('prazo de hoje não é atrasada; prazo de ontem é atrasada há 1 dia', () => {
    const p = painel([
      tarefa({ due_date: prazo('2026-11-16') }),
      tarefa({ due_date: prazo('2026-11-15') }),
    ])
    expect(p.hoje.abertas).toBe(2)
    expect(p.hoje.atrasadas).toBe(1)
    expect(p.hoje.atrasoMaisAntigo).toBe(1)
    expect(p.hoje.vencem7).toBe(1) // a de hoje conta em "vencem em até 7 dias"
  })

  it('concluída não conta como aberta nem como atrasada', () => {
    const p = painel([tarefa({ status: 'done', due_date: prazo('2026-10-01'), completed_at: em('2026-10-02') })])
    expect(p.hoje.abertas).toBe(0)
    expect(p.hoje.atrasadas).toBe(0)
    expect(p.hoje.atrasoMaisAntigo).toBeNull()
  })

  it('distribui as abertas com prazo pelas faixas de atraso; sem prazo fica fora da base', () => {
    const p = painel([
      tarefa({ due_date: prazo('2026-11-30') }),   // futura → no prazo
      tarefa({ due_date: prazo('2026-11-09') }),   // 7 dias → 1 a 7
      tarefa({ due_date: prazo('2026-11-08') }),   // 8 dias → 8 a 30
      tarefa({ due_date: prazo('2026-10-17') }),   // 30 dias → 8 a 30
      tarefa({ due_date: prazo('2026-10-16') }),   // 31 dias → 31 a 90
      tarefa({ due_date: prazo('2026-08-17') }),   // 91 dias → mais de 90
      tarefa({ due_date: null }),
    ])
    const porFaixa = Object.fromEntries(p.hoje.atraso.map(f => [f.faixa, f.qtd]))
    expect(porFaixa).toEqual({ no_prazo: 1, d1_7: 1, d8_30: 2, d31_90: 1, d90: 1 })
    expect(p.hoje.comPrazo).toBe(6)
    expect(p.hoje.semPrazo).toBe(1)
    expect(p.hoje.atrasoMaisAntigo).toBe(91)
  })

  it('subtarefa conta como tarefa e é informada à parte', () => {
    const mae = tarefa({ id: 'mae' })
    const p = painel([
      mae,
      tarefa({ parent_task_id: 'mae', due_date: prazo('2026-11-10') }),
      tarefa({ parent_task_id: 'mae', status: 'done', completed_at: em('2026-11-10') }),
    ])
    expect(p.hoje.abertas).toBe(2)
    expect(p.hoje.subtarefasAbertas).toBe(1)
    expect(p.hoje.atrasadas).toBe(1)
    expect(p.hoje.subtarefasAtrasadas).toBe(1)
  })

  it('agrupa por responsável: nome, sem responsável e colaborador inativo (fora da lista) juntos', () => {
    const p = painel([
      tarefa({ assignee_employee_id: 'ana', due_date: prazo('2026-11-20') }),
      tarefa({ assignee_employee_id: 'ana', due_date: prazo('2026-11-10') }),
      tarefa({ assignee_employee_id: 'ana' }),
      tarefa({ assignee_employee_id: null }),
      tarefa({ assignee_employee_id: 'saiu1' }),
      tarefa({ assignee_employee_id: 'saiu2' }),
    ])
    const ana = p.hoje.porResponsavel.find(r => r.rotulo === 'Ana')!
    expect(ana).toMatchObject({ abertas: 3, emDia: 1, atrasadas: 1, semPrazo: 1 })
    expect(p.hoje.porResponsavel.find(r => r.rotulo === 'Sem responsável')?.abertas).toBe(1)
    const inativos = p.hoje.porResponsavel.filter(r => r.rotulo === 'Colaborador inativo')
    expect(inativos).toHaveLength(1)
    expect(inativos[0].abertas).toBe(2)
    expect(p.hoje.porResponsavel[0].rotulo).toBe('Ana') // mais abertas primeiro
  })

  it('junta o que passa de 8 linhas em "Outros"', () => {
    const responsaveis = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, name: `Pessoa ${i}` }))
    const tarefas = responsaveis.flatMap((r, i) => Array.from({ length: 10 - i }, () => tarefa({ assignee_employee_id: r.id })))
    const p = painel(tarefas, { responsaveis })
    expect(p.hoje.porResponsavel).toHaveLength(9)
    const outros = p.hoje.porResponsavel[8]
    expect(outros.rotulo).toBe('Outros (2)')
    expect(outros.abertas).toBe(2 + 1)
  })

  it('carga por obra separa "sem obra" de "obra fora da lista"; prioridade segue a ordem 1–4', () => {
    const p = painel([
      tarefa({ project_id: 'obra1', due_date: prazo('2026-11-01'), priority: 4 }),
      tarefa({ project_id: 'obra1', priority: 1 }),
      tarefa({ project_id: null, priority: 2 }),
      tarefa({ project_id: 'orcamento-x', priority: 1 }),
    ])
    expect(p.hoje.carga.obra.map(l => [l.rotulo, l.abertas, l.atrasadas])).toEqual([
      ['Residencial Garden', 2, 1],
      ['Obra fora da lista', 1, 0],
      ['Sem obra', 1, 0],
    ])
    expect(p.hoje.carga.prioridade.map(l => [l.rotulo, l.abertas])).toEqual([
      ['Urgente', 2], ['Alta', 1], ['Baixa', 1],
    ])
  })

  it('carga por origem usa o rótulo do módulo (Suprimentos não vira Manual)', () => {
    const p = painel([tarefa({ source_module: 'suprimentos' }), tarefa({ source_module: 'manual' }), tarefa({ source_module: 'suprimentos' })])
    expect(p.hoje.carga.origem.map(l => [l.rotulo, l.abertas])).toEqual([['Suprimentos', 2], ['Manual', 1]])
  })

  it('carga por espaço: "Sem espaço" e espaço fora da lista', () => {
    const p = painel([tarefa({ space_id: 'esp1' }), tarefa({ space_id: null }), tarefa({ space_id: 'apagado' })])
    expect(p.hoje.carga.espaco.map(l => l.rotulo).sort()).toEqual(['Compras', 'Espaço fora da lista', 'Sem espaço'])
  })

  it('atrasadas mais antigas: a mais atrasada primeiro, no máximo 5, com o responsável', () => {
    const tarefas = Array.from({ length: 10 }, (_, i) => tarefa({
      id: `a${i}`, due_date: prazo(`2026-11-${String(i + 1).padStart(2, '0')}`), assignee_employee_id: i === 0 ? 'joao' : null,
    }))
    const p = painel(tarefas)
    expect(p.hoje.maisAtrasadas).toHaveLength(5)
    expect(p.hoje.atrasadas).toBe(10)
    expect(p.hoje.maisAtrasadas[0]).toMatchObject({ dias: 15, responsavel: 'João' })
    expect(p.hoje.maisAtrasadas[0].tarefa.id).toBe('a0')
    expect(p.hoje.maisAtrasadas[1].responsavel).toBe('Sem responsável')
  })
})

describe('montarPainelTarefas — faixa do período', () => {
  it('a janela de 8 semanas começa na segunda-feira de 7 semanas atrás e tem todas as semanas', () => {
    const p = painel([])
    expect(p.periodo.desde).toBe('2026-09-28')
    expect(p.periodo.ate).toBe('2026-11-16')
    expect(p.periodo.semanas.map(s => s.rotulo)).toEqual(['28/09', '05/10', '12/10', '19/10', '26/10', '02/11', '09/11', '16/11'])
    expect(p.periodo.semanas.every(s => s.criadas === 0 && s.concluidas === 0)).toBe(true)
  })

  it('o período corta pela data de conclusão (27/09 fica fora, 28/09 entra)', () => {
    const p = painel([
      tarefa({ status: 'done', created_at: em('2026-09-01'), completed_at: em('2026-09-27', '23:00:00') }),
      tarefa({ status: 'done', created_at: em('2026-09-01'), completed_at: em('2026-09-28', '08:00:00') }),
      tarefa({ status: 'done', created_at: em('2026-11-10'), completed_at: em('2026-11-16', '09:30:00') }),
    ])
    expect(p.periodo.concluidas).toBe(2)
    expect(p.periodo.semanas[0].concluidas).toBe(1)
    expect(p.periodo.semanas[7].concluidas).toBe(1)
    expect(p.periodo.criadas).toBe(1) // só a criada em 10/11 cai na janela
    expect(p.periodo.semanas[6].criadas).toBe(1)
  })

  it('reaberta (status aberto) não conta como concluída, mesmo com completed_at antigo', () => {
    const p = painel([tarefa({ status: 'open', completed_at: em('2026-11-10') })])
    expect(p.periodo.concluidas).toBe(0)
  })

  it('no prazo: concluir no dia do prazo conta; um dia depois não; sem prazo fica fora da base', () => {
    const p = painel([
      tarefa({ status: 'done', due_date: prazo('2026-11-10'), completed_at: em('2026-11-10', '18:00:00') }),
      tarefa({ status: 'done', due_date: prazo('2026-11-10'), completed_at: em('2026-11-11', '08:00:00') }),
      tarefa({ status: 'done', due_date: null, completed_at: em('2026-11-11') }),
    ])
    expect(p.periodo.comPrazo).toBe(2)
    expect(p.periodo.noPrazo).toBe(1)
    expect(p.periodo.taxaNoPrazo).toBe(0.5)
  })

  it('sem nenhuma concluída com prazo, a taxa é "não medida" (null), nunca zero', () => {
    const p = painel([tarefa({ status: 'done', due_date: null, completed_at: em('2026-11-11') })])
    expect(p.periodo.taxaNoPrazo).toBeNull()
  })

  it('tempo até concluir é a mediana em dias', () => {
    const p = painel([
      tarefa({ status: 'done', created_at: em('2026-11-01'), completed_at: em('2026-11-02') }),  // 1
      tarefa({ status: 'done', created_at: em('2026-11-01'), completed_at: em('2026-11-04') }),  // 3
      tarefa({ status: 'done', created_at: em('2026-11-01'), completed_at: em('2026-11-11') }),  // 10
    ])
    expect(p.periodo.medianaDias).toBeCloseTo(3, 5)
    expect(painel([
      tarefa({ status: 'done', created_at: em('2026-11-01'), completed_at: em('2026-11-02') }),
      tarefa({ status: 'done', created_at: em('2026-11-01'), completed_at: em('2026-11-04') }),
    ]).periodo.medianaDias).toBeCloseTo(2, 5)
    expect(painel([]).periodo.medianaDias).toBeNull()
  })

  it('concluídas por responsável contam só as do período', () => {
    const p = painel([
      tarefa({ status: 'done', assignee_employee_id: 'ana', completed_at: em('2026-11-12') }),
      tarefa({ status: 'done', assignee_employee_id: 'ana', completed_at: em('2026-11-13') }),
      tarefa({ status: 'done', assignee_employee_id: 'ana', completed_at: em('2026-01-13') }),
      tarefa({ status: 'done', assignee_employee_id: null, completed_at: em('2026-11-13') }),
    ])
    expect(p.periodo.porResponsavel.map(r => [r.rotulo, r.concluidas])).toEqual([['Ana', 2], ['Sem responsável', 1]])
  })
})
