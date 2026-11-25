# Tirar de PUBLIC/anon as funções e tabelas do antigo módulo Qualidade

## Pedido original
> Fora deste trabalho, mas vale fechar: três funções antigas do Pós-Obra (quality_calculate_score, quality_emit_event e quality_lock_condition) podem ser executadas por qualquer pessoa, até sem login. incluir em uma fase ou abrir uma para isso

Sessão: c3015bbd-c4c3-4c7d-9bca-95fa2943cdac · 25/11/2026

## Decisões tomadas com o usuário
| Data | Pergunta | Resposta |
|---|---|---|
| 25/11 | Incluir numa fase do trabalho em curso ou abrir frente própria? | Frente separada ("abrir uma para isso"): worktree `seguranca-qualidade-antiga`, branch `feat/seguranca-qualidade-antiga`. |

## Fatos verificados em produção (25/11, somente leitura)
- Eram **21** funções (não 3): as três do pedido + 18 RPCs do antigo módulo (20 nomes; `detect_condition` tem 2 sobrecargas), todas SECURITY INVOKER, com EXECUTE para PUBLIC/anon. As funções novas (`quality_registrar_treinamento_em_obra`, `quality_controlled_items_mesma_org`, `quality_touch_updated_at`) já não tinham anon.
- Dependências: nenhuma outra função, trigger (só `set_updated_at`), policy, `cron.job` nem view (`vw_bi_operational` é security_invoker e já sem anon) depende de anon executar. A Edge Function `quality-sla-enforcement` exige `Bearer <service_role>` e usa service_role. O app (`services/qualityConditionService.ts`, `warrantyService.getLegacyConditionEvidence`) chama já logado (authenticated, que mantém EXECUTE). Obs.: o pedido dizia "nenhum código do app chama" — `qualityConditionService.ts` chama; não há importadores fora dele e de `warrantyService`.
- Tabelas: RLS ligada e policies só `TO authenticated` — anon já era barrado. É **higiene** (defesa em profundidade), não vazamento comprovado.

## Plano
1. **Migration `aplicar_20271125990000_revoga_anon_qualidade_antiga.sql`.** O que muda: REVOKE EXECUTE de PUBLIC/anon + GRANT a authenticated nas 21 funções; REVOKE ALL de anon e REVOKE TRUNCATE/REFERENCES/TRIGGER de authenticated nas 5 tabelas pedidas e nas 4 irmãs (`condition_action_plans`, `condition_contestations`, `condition_responsibilities`, `condition_validations`). Pronto quando: migration aplicada 2x sem erro, contagem de funções do módulo com EXECUTE para anon = 0, authenticated mantém EXECUTE nas 21, anon sem privilégio nas 9 tabelas.
2. **Testes de trava.** Pronto quando `__tests__/segurancaMigrations.test.ts` e `__tests__/migrationsPrefixo.test.ts` passam.

## Estado
- [x] 1. Migration criada e aplicada em produção (25/11, 2 execuções)
- [x] 2. Testes: 15 de 15 passam
- [ ] PR/merge (fora desta tarefa)

## Verificação (produção, após aplicar)
- `fn_anon_restantes` = 0 · `fn_auth_ok_de_21` = 21 · `anon_priv_tabelas` = 0
- authenticated nas 9 tabelas: só DELETE, INSERT, SELECT, UPDATE.
- Não testado: chamada real de RPC logado pelo app (EXECUTE de authenticated confirmado por `has_function_privilege`).
