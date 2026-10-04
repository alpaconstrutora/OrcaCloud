# Processos: editar modelo, dono obrigatório e alçada por valor na aprovação

## Pedido original

> avalie o módulo Processos
>
> Sessão: 7a23f194 · 2026-10-04 ~17:00

A avaliação (registrada em memória `project_modulo_processos.md`, seção "AVALIAÇÃO
2026-10-04") listou 6 problemas e recomendou corrigir os 3 primeiros numa frente só:

1. processo atrasado sem aviso a ninguém (88/88 etapas dos 24 modelos ativos sem
   responsável, escalado ou dono — a função de atraso calcula destino nulo e cala);
2. não existe edição de modelo, e a tela de criação não grava evento nem dono;
3. a aprovação ignora a alçada por valor (`step.amount` nunca preenchido) e o
   botão manda sempre o nível 1.

> ok, seguir com a sua
>
> corrigir os itens 1 a 3 numa frente só
>
> Sessão: 7a23f194 · 2026-10-04 ~17:30

Fora desta frente, de propósito (itens 4 a 6 da avaliação): quem pode agir na etapa,
saída da etapa reprovada, gatilhos no banco.

## Decisões tomadas

| Data | Pergunta | Decisão |
|---|---|---|
| 04/10 | O que fazer com os 24 modelos que já existem sem dono? | Não adivinhar uma pessoa. A função de atraso ganha rede de segurança: sem responsável, escalado nem dono, avisa os donos/administradores da organização. A tela mostra "Sem dono" no modelo e exige dono ao salvar modelo automático. |
| 04/10 | Exigir dono no banco (CHECK)? | Não. Os 24 modelos existentes violariam, e um CHECK `NOT VALID` travaria até o arquivamento deles. A regra vive no service + tela; a rede de segurança vive no banco. |
| 04/10 | Editar modelo muda processo em curso? | Não. A instância já copia nome, tipo, condição, responsável e escalado. Faltava o prazo: `advanceToNextStep` lia `sla_hours` e o responsável do MODELO na hora de avançar. Passa a ler da própria etapa da instância (nova coluna `sla_hours`, preenchida no início). Assim a edição vale só para processos novos, e a versão sobe a cada edição. |
| 04/10 | Etapa removida do modelo que já foi usada por processo | A FK `template_step_id` é `ON DELETE RESTRICT`. Vira `ON DELETE SET NULL`: a etapa da instância é cópia completa e não precisa mais do original. |
| 04/10 | Mesmo usuário aprova os dois níveis? | Não. Nível 2 exige pessoa diferente da que aprovou o nível 1, com o motivo no botão desabilitado. Sem isso o "nível 2" seria um segundo clique da mesma pessoa. |
| 04/10 | De qual organização é a alçada? | Da organização DO PROCESSO, nunca do topo. Com o topo em "Todas", a tela mandava organização vazia. |

## Plano

### Item 1 — ninguém fica sem aviso

- **Migration** `supabase/migrations/aplicar_20271004000070_processos_modelo_dono_alcada.sql`:
  `fn_process_sla_sweep` reescrita a partir do arquivo `aplicar_20270929000003` (não do
  banco). Única mudança na parte de atraso: se ninguém foi avisado, avisa cada
  owner/admin da organização. Rearma `overdue_notified_at` das etapas EM_ANDAMENTO cujo
  log STEP_OVERDUE registrou `notified = []`, para o próximo ciclo avisar.
  **Pronto quando:** rodar a função em produção gera notificação para os admins da org
  do processo `2c8d805b…` e o log STEP_OVERDUE dele traz `notified` não vazio.
- **Tela** (`components/ProcessosModule.tsx`): lista de modelos mostra "Automático —
  dispara em <evento>" e "Sem dono" em âmbar quando falta.
  **Pronto quando:** aba Modelos mostra os 6 modelos automáticos da org com "Sem dono".

### Item 2 — editar modelo

- **Service** (`services/processService.ts`): `updateTemplate(id, cabeçalho, etapas)` —
  atualiza cabeçalho, atualiza etapas por id, insere novas, apaga removidas, sobe
  `version`. `createTemplate` e `updateTemplate` recusam modelo `EVENTO` sem dono e sem
  evento. `advanceToNextStep` lê prazo e responsável da etapa da instância.
  `startInstance` copia `sla_hours`.
  **Pronto quando:** teste novo cobre editar (update/insert/delete + versão), recusa sem
  dono e prazo lido da instância; suíte verde.
- **Migration** (a mesma do item 1): coluna `process_instance_steps.sla_hours` +
  backfill a partir do modelo; FK `template_step_id` → `ON DELETE SET NULL`.
  **Pronto quando:** consulta confirma a coluna preenchida nas 12 etapas e a FK nova.
- **Tela**: o formulário de criação vira formulário de criar/editar, com Dono, Disparo
  (Manual / Evento + qual evento). Botão editar em cada modelo.
  **Pronto quando:** no app, editar o modelo "Aprovação de pagamento de fornecedor",
  definir dono e salvar mostra v2 e "Sem dono" some.

### Item 3 — alçada por valor na aprovação

- **Service**: `submitStepApproval(stepId, instanceId)` busca a org e o valor do
  processo (valor do pedido, mesma régua da alçada de pedido), grava `amount` na etapa
  e submete. Se a alçada liberar (abaixo do piso), a etapa conclui e o processo avança.
  `approveStep` decide o nível sozinho (2 se o 1 já aprovou e são exigidos 2), usa os
  rótulos da faixa e recusa a mesma pessoa nos dois níveis.
  **Pronto quando:** testes cobrem valor do pedido → 2 níveis, nível 2 com outra
  pessoa, recusa mesma pessoa, liberação abaixo do piso avançando; suíte verde.
- **Tela**: botão mostra "Aprovar (Gestor)" / "Aprovar (Diretoria)", desabilitado com o
  motivo para quem já aprovou o nível 1; a linha mostra o valor e os níveis exigidos.
  **Pronto quando:** `check-ui-standard.sh` limpo no arquivo tocado e conferido no app.

## Estado

- [x] Item 1 — migration aplicada em 04/10 ~17:50 (12/12 etapas com `sla_hours`, FK
      SET NULL, sweep com rede de segurança, sem mojibake, ACL só postgres/service_role;
      etapa do processo `2c8d805b` rearmada) + tela ("Sem dono" em âmbar no modelo automático)
- [ ] Item 1 — prova do aviso: próximo ciclo do cron gera notificação para a admin da org
- [x] Item 2 — service (`updateTemplate`, `problemaDoModelo`, prazo/responsável lidos da
      instância) + migration + tela (editar modelo, Dono, Disparo/evento)
- [x] Item 3 — service (`submitStepApproval` com org e valor do processo, liberação abaixo
      do piso avança, `approveStep` decide o nível e recusa a mesma pessoa) + tela
      (botão "Aprovar nível N de 2", motivo quando desabilitado, valor e níveis na etapa)
- [x] typecheck 0 · suíte 7495 = 7461 + 34 pendentes, 0 falha · vite build ok ·
      check-ui-standard limpo · segurancaMigrations/migrationsPrefixo/orgContextGuard verdes ·
      check-xss-sinks limpo · testes novos derrubados por mutação (nível 1 fixo e prazo do
      modelo → 2 falhas) antes de aceitos
- [ ] Conferido no app real com login (precisa da senha do usuário de leitura — não guardada)
- [ ] publicado, CI verde, domínio conferido

Fora do escopo, registrado: rótulos em caixa alta no "Iniciar processo", no Dashboard e
nas abas do módulo (§21/§19) — dívida anterior, não tocada nesta frente.

## Verificação

1. `npx vitest run __tests__/processService*.test.ts __tests__/segurancaMigrations.test.ts`
2. Migration aplicada por `db query -f`; consultas de prova do item 1 e 2.
3. No app: editar o modelo piloto, ver a versão subir, o dono aparecer.
