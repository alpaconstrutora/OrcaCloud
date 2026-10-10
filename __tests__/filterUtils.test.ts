import { describe, it, expect } from 'vitest'
import { applyFilterRules, distinctOptions, normalizarTexto, type FilterFieldConfig, type FilterRule } from '../components/ui/FilterUtils'

// Caso real de 10/10/2026 (Minhas Tarefas): o usuário filtrou "Status Não é concluído"
// e nada mudou. O valor comparado precisa ser o que a célula MOSTRA, e a comparação
// não pode depender de caixa nem de acento.
type Linha = { titulo: string; status: string; obra: string | null; valor: number }
const linhas: Linha[] = [
  { titulo: 'Reboco parede', status: 'Concluído', obra: 'Residencial Ipê', valor: 10 },
  { titulo: 'Pintura', status: 'Em Andamento', obra: 'Edifício São João', valor: 20 },
  { titulo: 'Comprar ventilador', status: 'Pendente', obra: null, valor: 30 },
]
const campos: FilterFieldConfig[] = [
  { key: 'titulo', label: 'Nome', type: 'text' },
  { key: 'status', label: 'Status', type: 'select', options: [
    { value: 'Pendente', label: 'Pendente' }, { value: 'Em Andamento', label: 'Em Andamento' }, { value: 'Concluído', label: 'Concluído' },
  ] },
  { key: 'obra', label: 'Obra', type: 'text', options: distinctOptions(linhas, l => l.obra) },
  { key: 'valor', label: 'Valor', type: 'number' },
]
const valor = (l: Linha, k: string) => l[k as keyof Linha]
const regra = (fieldKey: string, operator: FilterRule['operator'], value: unknown): FilterRule => ({ id: fieldKey, fieldKey, operator, value })
const titulos = (rules: FilterRule[]) => applyFilterRules(linhas, rules, campos, valor).map(l => l.titulo)

describe('FilterUtils — valor escolhido, comparação sem caixa nem acento', () => {
  it('"Status Não é concluído" (digitado em minúscula e sem acento) esconde as concluídas', () => {
    expect(titulos([regra('status', 'is_not', 'concluido')])).toEqual(['Pintura', 'Comprar ventilador'])
    expect(titulos([regra('status', 'is_not', 'concluído')])).toEqual(['Pintura', 'Comprar ventilador'])
  })

  it('"É" casa ignorando caixa e acento', () => {
    expect(titulos([regra('status', 'is', 'EM ANDAMENTO')])).toEqual(['Pintura'])
    expect(titulos([regra('obra', 'is', 'edificio sao joao')])).toEqual(['Pintura'])
  })

  it('"Contém" continua valendo em campo de texto com lista, sem acento', () => {
    expect(titulos([regra('obra', 'contains', 'sao')])).toEqual(['Pintura'])
    expect(titulos([regra('obra', 'not_contains', 'ipe')])).toEqual(['Pintura', 'Comprar ventilador'])
  })

  it('número continua comparando como número', () => {
    expect(titulos([regra('valor', 'gt', '15')])).toEqual(['Pintura', 'Comprar ventilador'])
  })

  it('regra de campo que saiu da configuração não derruba a lista', () => {
    expect(titulos([regra('campo_removido', 'is', 'x')])).toHaveLength(3)
  })

  it('distinctOptions: sem vazios, sem repetidos (caixa/acento), em ordem alfabética', () => {
    const opts = distinctOptions(
      ['Obra B', 'obra b', '', null, undefined, '  ', 'Obra A', 'Óbra A'],
      v => v,
    )
    expect(opts.map(o => o.label)).toEqual(['Obra A', 'Obra B'])
  })

  it('normalizarTexto tira acento, caixa e espaço das pontas', () => {
    expect(normalizarTexto('  Concluído ')).toBe('concluido')
    expect(normalizarTexto(null)).toBe('')
  })
})
