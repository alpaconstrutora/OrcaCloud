# RH › Desligamentos — botão Editar

## Pedido original

Sessão de 22/10/2026 (Claude Code, VS Code), logo depois do PR #108 (Desligamentos em tabela):

> incluir botão editar

Decisão pedida ao usuário na mesma sessão — *"No desligamento JÁ CONCLUÍDO, o que o botão Editar pode alterar?"*
— e respondida: **"Tudo, sincronizando"** (data, tipo e motivo editáveis; o cadastro do colaborador acompanha).

## Armadilhas achadas ao reabrir um concluído

1. **"Salvar Rascunho" rebaixaria o status.** O assistente gravava `status: RASCUNHO` por padrão; num concluído
   isso reabriria o processo. Concluído salva sempre `CONCLUIDO` e não chama `finalizeTermination` de novo.
2. **O colaborador some do campo.** A lista mostra só ATIVO/AFASTADO; o desligado não estava nela. O colaborador do
   registro entra na lista ao editar (o campo continua travado).
3. **"Todas as organizações" recusava a gravação.** Editar usa a organização DO REGISTRO (REGRA #5), não a do topo.
4. **O gatilho só agia na passagem para CONCLUIDO.** Corrigir a data deixaria `employees.termination_date` com a data
   antiga — e é ela que a folha usa (`participaDaFolha`). Migration `20271022500000` faz o gatilho reescrever
   `termination_date`/`termination_reason` do colaborador quando data, tipo ou motivo mudam num concluído.

## Itens

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `components/LaborTermination.tsx` | `ActionIconButton kind="edit"` em toda linha (em andamento: "Continuar editando", substitui o link "Continuar" — §9.1); assistente com `isConcluded` | `check-ui-standard.sh` limpo; tipos sem erro |
| 2 | `supabase/migrations/20271022500000_…sql` | gatilho sincroniza o cadastro ao editar concluído | aplicada com `db query -f`; função tem `ELSIF`, gatilho `BEFORE INSERT OR UPDATE`, `EXECUTE` negado a `anon`/`authenticated`; prova em bloco que desfaz: data 31/05 → 28/05 no cadastro, status DESLIGADO preservado, edição só de checklist não toca o cadastro; banco conferido intacto depois |
| 3 | `__tests__/components/LaborTerminationTabela.test.tsx` | botão em toda linha; concluído abre sem "Salvar Rascunho", salva `CONCLUIDO`, não refinaliza, funciona com `orgId` nulo; em andamento continua `RASCUNHO` | 10 de 11 → 11 de 11 verdes |

## Fora do escopo / avisos

- Folhas já processadas **não** se refazem sozinhas: a data nova vale no próximo reprocessamento.
- Mudar a data de um concluído não "des-desliga" ninguém: status segue DESLIGADO.
- O assistente continua no estilo antigo (modal central, `alert()` nativo) — igual ao PR #108.

## Andamento

- [x] 1
- [x] 2 (aplicada no banco em 22/10/2026)
- [x] 3 — 52 de 52 em 8 arquivos (com vizinhos e guardas de migration)
- [ ] PR + CI + publicação
