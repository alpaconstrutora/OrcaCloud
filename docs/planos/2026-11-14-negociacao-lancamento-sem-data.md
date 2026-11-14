# Negociação › Parcelas: lançamento sem data não derruba a tela

## Pedido original

> 1. Corrigir Defeito real encontrado no caminho, não corrigido: na Negociação, a lista de lançamentos do contrato é ordenada pela data. Se algum lançamento vier sem data, a tela inteira da Negociação deixa de abrir.

Sessão: Claude Code (VS Code) · 14/11/2026. Origem: a CI do PR #407 (outro assunto) falhou em `dealModalAvisoReceitaFinanceira.test.tsx` com `TypeError: Cannot read properties of undefined (reading 'localeCompare')` em `components/DealModal.tsx:4781`.

## O que se apurou

- O `DealModal` ordenava as cobranças em três lugares. Um deles se protegia (`(a.transaction_date || '')`, na carga, linha 2373); os outros dois não: a tabela da aba Parcelas (4781) e a ordem do Shift+clique (4799).
- **Correção ao que foi dito na conversa:** em produção `internal_transactions.transaction_date` é **NOT NULL** (consultado em 14/11). Hoje um lançamento real nunca chega sem data, então a tela não quebrava para usuários. Quem trazia lançamento sem data era o **mock do teste** (`{ id: 't1', status: 'PENDING' }`). O teste falhava só quando a tabela desenhava antes da conferência; por isso era intermitente.

## Itens

- [x] `utils/ordemDosLancamentos.ts`: `porDataDoLancamento`, uma regra só, com a mais antiga primeiro e sem data no fim.
- [x] `components/DealModal.tsx`: as três ordenações usam a função. Assim a ordem da carga, a da tabela e a do Shift+clique ficam sempre iguais.
- [x] `__tests__/ordemDosLancamentos.test.ts`: reproduz o `TypeError` do código antigo e prova a ordem nova.
- [x] `__tests__/components/dealModalAvisoReceitaFinanceira.test.tsx`: o mock passa a trazer `transaction_date`, como o banco garante.

## Verificação

- O teste que falhava passou 3 vezes em 3; os 6 arquivos que montam o `DealModal` passaram (86 testes).
- `tsc` 0 erros; `check-ui-standard.sh` limpo no `DealModal.tsx`.
