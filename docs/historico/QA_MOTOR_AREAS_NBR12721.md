# QA Tecnico - Motor de Areas NBR 12721 MVP

Este documento consolida a bateria manual executada no Supabase SQL Editor para o motor de calculo de areas NBR 12721, Quadros I, II e IV-B.

## Escopo Validado

- Materializacao real de blocos, pavimentos, unidades e espacos para calculo oficial.
- Calculo dos Quadros I, II e IV-B.
- Coeficientes de proporcionalidade e fracoes ideais derivadas.
- Acessorios vinculados.
- Areas comuns proporcionais e nao proporcionais.
- Validacoes bloqueantes de integridade.
- Hash de payload antes do lock.
- Hash documental definitivo no lock.
- Auditoria de calculo e lock.
- Bloqueio de mutacao em versoes travadas.
- Idempotencia do recalculo.
- Fechamento contabil entre quadros.

## Migrations Do Motor

- `20261231000000_area_engine_nbr12721_mvp.sql`: schema base.
- `20261231000001_area_engine_nbr12721_functions.sql`: validacao e calculo.
- `20261231000002_area_engine_hash_search_path_fix.sql`: `pgcrypto`/`digest`.
- `20261231000004_area_engine_draft_validation_constraints.sql`: constraints compativeis com rascunho/importacao.
- `20261231000005_area_engine_lifecycle_functions.sql`: aprovacao, lock, hash documental e supersedencia.

## Casos Executados

| Caso | Fixture | Objetivo | Resultado |
| --- | --- | --- | --- |
| 1 | `area_engine_case1_fixture.sql` | Edificio simples sem garagem | Passou |
| 2 | `area_engine_case2_varanda_fixture.sql` | Varanda com coeficiente 0.75 | Passou |
| 3 | `area_engine_case3_vaga_vinculada_fixture.sql` | Vaga acessoria vinculada | Passou |
| 4 | `area_engine_case4_common_nonprop_fixture.sql` | Area comum nao proporcional | Passou |
| 5 | `area_engine_case5_error_common_without_division_fixture.sql` | Bloqueio `MOTOR_012` | Passou |
| 6 | `area_engine_case6_error_missing_coefficient_fixture.sql` | Bloqueio `MOTOR_007` | Passou |
| 7 | `area_engine_case7_lock_hash_fixture.sql` | Aprovacao, lock, hash e bloqueio de mutacao | Passou |
| 8 | `area_engine_case8_deterministic_recalculation_fixture.sql` | Determinismo e idempotencia | Passou |
| 9 | `area_engine_case9_accounting_closure_fixture.sql` | Fechamento entre Quadros I, II e IV-B | Passou |
| 10 | `area_engine_case10_error_double_count_parking_fixture.sql` | Bloqueio `ACC_VAL_003` | Passou |

## Evidencias Principais

- `version_payload_hash` e gerado apos calculo.
- `version_identity_hash` permanece nulo antes do lock.
- `version_identity_hash` e gerado no lock.
- Versao locked bloqueia mutacao com `SQLSTATE 45000`.
- Recalculo repetido manteve o mesmo `version_payload_hash`.
- Recalculo repetido nao duplicou linhas dos Quadros I, II, IV-B ou fracoes.
- Soma de coeficientes: `1.000000000000`.
- Soma de fracoes: `1.000000000000`.
- Total real Quadro II = total real IV-B.
- Total equivalente Quadro II = total equivalente Quadro I.

## Proximo Marco

Integrar a camada TypeScript/RPC do app:

- Criacao e listagem de projetos/versoes.
- Cadastro materializado de blocos, pavimentos, unidades e espacos.
- Acionamento de `validate_area_version`, `calculate_area_version`, `approve_area_version`, `lock_area_version`.
- Leitura dos Quadros I, II, IV-B e fracoes.
- Fluxo de exportacao PDF/XLSX sobre versoes calculadas ou locked.
