# E0 — Fundação de domínio do Planta Inteligente

## Pedido original

> qual a fase estamos no plano de implementacao?
>
> (resposta: pré-R0, descoberta; o portão bifurcava entre Spike C e E0)
>
> **e0**

Sessão de 2026-08-08. Executa o épico E0 do PRD v1.1 §28.

---

## 1. O que o E0 pede, e o que foi entregue

| item do E0 (§28) | antes | agora |
|:---|:---|:---|
| Schema canônico, unidades, hashes, versionamento | só em TypeScript | ✅ tabelas `blueprint_*` + payload versionado por `kernel_version` |
| Comandos básicos e golden files | ✅ (Spike A) | ✅ mantido |
| Branches, autosave, publicação e auditoria | nada | ✅ ramos, rascunho, RPC de publicação atômica, trilha append-only |
| Kernel igual no navegador e no servidor | provado por construção | ✅ + `verifySnapshotIntegrity` prova sobre registro real |

**Não faz parte do E0 e continua sem existir:** tela, rota, permissão de menu,
editor. Isso é o épico E3. Depois desta entrega ainda não há onde clicar.

## 2. O furo que a persistência revelou

Ao desenhar o carregamento de um snapshot, precisei reconstruir o modelo a partir
do payload — e aí o payload não fechava.

As aberturas guardavam `wallId` (`wal_0001`), mas as paredes tinham o `id`
removido. O payload referenciava um identificador que ele próprio não continha.
Duas consequências, ambas sérias:

1. **Impossível reconstruir.** Sem saber a que parede o `wal_0001` corresponde, a
   abertura não tem onde se hospedar. A persistência era de mão única.
2. **Hash instável.** O payload carregava identificador volátil. A mesma planta
   desenhada em ordem diferente gerava hash diferente **assim que tivesse uma
   porta** — quebrando a garantia central que o Spike A tinha declarado provada.

O teste que deveria ter pego isso — "o payload não carrega ID volátil" — passava
porque **nenhum golden tem abertura**. Ele verificava a ausência de `wal_` num
payload que nunca teve aberturas para vazar.

`levelId` vazava do mesmo jeito em `boundaries` e `spaces`.

**Correção:** o payload passou a referenciar nível e parede por **índice** na lista
canônica. Como a ordem canônica é função só da geometria, o índice é estável e o
modelo reconstruído re-serializa para exatamente o mesmo payload.

Quatro casos novos (30–33) travam isso, incluindo o que faltava:
*com abertura, a ordem de desenho não muda o hash.*

### Consequência: kernel 0.1.0 → 0.2.0 e goldens revisados

O formato mudou, então todo hash anterior é incompatível. Os seis goldens foram
recapturados **uma vez**, com registro no cabeçalho do arquivo. A distinção que
importa: **a geometria não mudou** — as contagens de ambientes dos seis casos
seguiram idênticas, e só as linhas de hash falharam. Foi revisão de formato, não
de resultado, e veio acompanhada de bump de `KERNEL_VERSION`.

## 3. Schema

`supabase/migrations/aplicar_20270905000000_blueprint_kernel_foundation.sql`

| tabela | papel |
|:---|:---|
| `blueprint_studies` | Raiz de autorização |
| `blueprint_levels` | Níveis, elevação em mm inteiros |
| `blueprint_branches` | Ramo de trabalho + rascunho de autosave |
| `blueprint_snapshots` | Versão imutável, endereçável por hash |
| `blueprint_objects` | Paredes/aberturas/limites/ambientes explodidos para consulta |
| `blueprint_audit_events` | Trilha append-only |

Três decisões que valem explicação:

**FK composto para isolamento de organização.** `blueprint_studies` tem
`UNIQUE (id, organization_id)`, e todo filho referencia esse par. Um ramo de uma
org pendurar num estudo de outra deixa de ser possível **no nível do schema** —
não depende de trigger nem de disciplina da aplicação.

**Rascunho é o único ponto mutável.** `draft_payload` existe para o autosave não
publicar versão a cada gesto (RF-048). Não é fonte da verdade: é buffer entre duas
publicações. Publicar congela num snapshot com hash e limpa o rascunho.

**Imutabilidade por trigger, não por convenção.** `UPDATE`/`DELETE` em snapshots e
auditoria levantam exceção. Sem isso, "mesmo hash = mesmo desenho" é promessa
verbal, e um `UPDATE` distraído transforma num outro desenho um snapshot já citado
por um orçamento.

## 4. Publicação atômica

`fn_blueprint_publish_snapshot` faz numa transação só: grava o snapshot, explode os
objetos, avança o ramo, limpa o rascunho e registra a auditoria.

- **Idempotente** (CA-07): republicar o mesmo conteúdo sobre a mesma revisão
  devolve o snapshot existente. O cliente pode reenviar após queda de rede.
- **Concorrência otimista** (CA-05): revisão desatualizada levanta
  `serialization_failure`, que o service converte em `BlueprintRevisionConflict`.
  Recusa explícita em vez de sobrescrita silenciosa.
- `SECURITY INVOKER`: a RLS vale para o chamador.
- `REVOKE ALL ... FROM PUBLIC` e `FROM anon`; `GRANT EXECUTE` só a `authenticated`.

## 5. RLS

Todas as seis tabelas com RLS por `is_org_member(organization_id)` — função que já
resolve `user_id` com fallback por e-mail para linhas legadas, então não reinventei
o dual-check. `REVOKE ALL FROM anon` em todas. Snapshots, objetos e auditoria
recebem só `SELECT, INSERT` (sem `UPDATE`/`DELETE`), coerente com a imutabilidade.

## 6. Verificação

```
npx tsc --noEmit   → exit 0
npx vitest run     → 50 arquivos, 885 testes, todos passam
```

Kernel: 36 casos (32 anteriores + 4 de round-trip). Goldens: 7.

**O que NÃO foi verificado, e é a lacuna honesta desta entrega:** a migration
**não foi aplicada**. O histórico de `schema_migrations` está furado desde
`20270208*`, então o arquivo é `aplicar_*` e precisa ir à mão pelo SQL Editor.
Consequência: nada do que depende do banco foi exercitado contra um Postgres real —
RLS, triggers de imutabilidade, o FK composto e a RPC de publicação estão
**escritos e revisados, não executados**. `verifySnapshotIntegrity` existe
justamente para ser a primeira coisa a rodar depois de aplicar.

## 7. Critério de pronto

- [x] Schema `blueprint_*` com FK composto de organização
- [x] RLS em todas as tabelas, `anon` revogado, RPC com `REVOKE PUBLIC`
- [x] Imutabilidade de snapshot e auditoria por trigger
- [x] Publicação atômica, idempotente, com concorrência otimista
- [x] Rascunho/autosave separado da publicação
- [x] Round-trip payload → modelo → payload provado por teste
- [x] Furo do identificador volátil fechado, com caso de regressão
- [x] `tsc` limpo, 885 testes passando
- [ ] **Pendente:** aplicar a migration à mão e rodar `verifySnapshotIntegrity`
- [ ] **Pendente:** testes negativos de RLS (acesso cruzado entre orgs) — só dá
      para fazer depois de aplicar
- [ ] **Pendente:** E3 (editor) — é ele que dá uma tela para o usuário
