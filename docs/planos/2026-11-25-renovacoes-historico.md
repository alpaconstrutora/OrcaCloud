# Locações › Renovações: Histórico (como o de Reajustes)

## Pedido original

Sessão 98df7c3d, 25/11/2026. Diante da pergunta sobre como corrigir o CTL-006-012-0001
(o AD-002 tinha virado AD-003 às 15:51 e isso não aparecia em lugar nenhum):

> Antes de te responder verifique se o renovações tem  historico como tem reajustes

Resposta: não — a aba Renovações é só a fila; o histórico vive dentro de cada
negociação e não guarda quem nem quando. Proposta: seletor "A renovar | Histórico",
todas as renovações (inclusive canceladas), quando e quem fez (gravado a partir de
agora), Ver/Editar/Excluir como em Reajustes. Resposta do usuário:

> 1. corrigir
> 2. sim

## Itens

1. **Banco — autoria** (`supabase/migrations/aplicar_20271125420000_renovacao_autoria.sql`):
   `contract_addendums.requested_by` com default `auth.jwt()->>'email'`; colunas
   `cancelado_em`/`cancelado_por` preenchidas por gatilho quando o status vira
   Cancelado (vale para Excluir, Editar e aba Aditivos). Função de gatilho sem
   EXECUTE para PUBLIC/anon/authenticated (REGRA #7). Passado não é inventado (NULL).
   **Pronto quando:** testada numa transação desfeita como usuário comum (gatilho
   marcou o e-mail; nada ficou) ✅; aplicada e conferida — colunas, default, gatilho,
   ACL `{postgres, service_role}` ✅; o AD-004 do CTL-006 já nasceu com autor ✅.
2. **`contractRenewalService.historicoGeral(org)`** — aditivos de prorrogação de
   locação (inclusive cancelados) + contratos novos de renovação (pendurados no pai),
   mais recentes primeiro, recortáveis pelo empreendimento (`negociacaoId`).
   **Pronto quando:** `__tests__/renovacoesHistorico.test.ts` verde ✅.
3. **Tela** — `RentalRenewals.tsx` ganha o seletor "A renovar (N) | Histórico"
   (`rentals:renovacoes:visao`); `RentalRenovacoesHistorico.tsx` (StandardTable:
   Contrato, Locatário, Renovação, Período, Aluguel, Parcelas, Situação, Feito por, Em)
   com Ver (`RenovacaoRegistroSheet.tsx`), Editar (negociação já editando o aditivo) e
   Excluir — só na última renovação do contrato, desligados com o motivo nos outros.
   Painel da negociação mostra "Feito por … / Cancelado por …".
   **Pronto quando:** `__tests__/components/renovacoesHistoricoAcoes.test.tsx` verde ✅;
   em produção o Histórico do 006 mostra AD-004…AD-001 do CTL-006, Editar/Excluir só
   no AD-004.

## Correção do CTL-006 (item 1 da resposta do usuário)

Feita pelo app em 25/11/2026 (via recomendada: renovar de novo, sem desfazer nada):
AD-004 de 23/03/2020 a 22/09/2021, 18 parcelas de R$ 5.832,48 (10/05/2020 a
10/10/2021, dia 10), IRRF R$ 734,57; 60 parcelas no total, nenhum mês em dobro ✅.
