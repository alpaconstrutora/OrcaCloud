# Auditoria de acesso — Medição Inteligente (`measure_*`)

## Pedido original

Ao avaliar os quatro módulos que representam planta, apareceu que nenhuma das
cinco tabelas do Medição tem `organization_id`. A recomendação foi auditar antes
de qualquer outra coisa, por ser risco e não melhoria. O usuário respondeu:

> pode auditar

## Método

Lido no repositório: `20261120000000_opura_measure_ai.sql` (criação),
`20270208000002_drop_anon_dev_policies_rollout.sql`,
`20270208000003_drop_anon_storage_measure_plants.sql`, `services/measureService.ts`
e `components/MeasureAIModule.tsx`.

⚠️ **O repositório não é a fonte da verdade aqui.** As migrations `20270208*`
foram aplicadas por SQL direto, fora de `schema_migrations`. O bloco de
verificação no fim confirma o estado real.

## Achado 1 — o trabalho pertence à PESSOA, não à empresa

```sql
CREATE POLICY "measure_projects_owner_access" ON public.measure_projects
    FOR ALL TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

As outras quatro tabelas herdam isso por subconsulta no projeto. Consequências,
todas reais e nenhuma sinalizada na tela:

- **Ninguém mais na empresa enxerga o levantamento.** Nem sócio, nem
  administrador, nem quem for continuar o serviço.
- **Quem sai leva o trabalho.** Desativado o usuário, as linhas continuam no
  banco e nenhum `auth.uid()` volta a casá-las. Não há caminho de recuperação
  pela aplicação.
- **O seletor de organização do topo não tem efeito** neste módulo, ao contrário
  de todo o resto do sistema.
- **Não há vazamento entre organizações** — este ponto é bom, e é o único.

**Não é um erro de escrita de policy; é ausência da coluna.** Corrigir a policy
sem acrescentar `organization_id` não tem como funcionar.

## Achado 2 — o bucket das plantas é PÚBLICO

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('measure-plants', 'measure-plants', true);
```

E a policy de leitura não declara papel — vale para `anon` também:

```sql
CREATE POLICY "Allow read access to measure-plants for select"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'measure-plants');
```

O rollout de 08/02 tratou essa policy como inócua, e pela lógica dele estava
certo: com `public = true` o bucket já é mundialmente legível, e derrubar a
policy não mudaria nada. Ele removeu as três policies anon de **escrita**, que
eram o risco maior. **A flag `public = true` continua de pé.**

`measureService.getPlantPublicUrl` usa `getPublicUrl` — a aplicação depende
disso hoje.

**Atenuante que muda a gravidade:** o caminho é
`{projectId}/{crypto.randomUUID()}.{ext}` — dois UUID. Não é enumerável; não dá
para varrer o bucket. O risco real não é varredura, é **permanência**: a URL
funciona para sempre, para qualquer um que a receba, sem autenticação e sem
expiração. Quem sair da empresa continua com acesso a toda planta cujo link
tenha guardado, e o link atravessa histórico de navegador, cache de CDN e
qualquer lugar onde tenha sido colado.

Planta de cliente costuma ser documento com endereço, nome do proprietário e
implantação do imóvel.

## Achado 3 — as policies anon das TABELAS foram removidas

`20270208000002` derruba as cinco `Allow anon all on measure_*`, que eram
`USING (true) WITH CHECK (true)` — acesso total com a chave anônima. **Se
aplicado, isto está resolvido.** É o item que mais precisa de confirmação contra
o banco real, pela ressalva do histórico de migrations.

## Verificação — rodar no SQL Editor

```sql
-- 1. Policies das cinco tabelas. Esperado: 5 linhas, todas roles={authenticated}.
--    QUALQUER linha com roles={anon} ou qual='true' é achado grave.
SELECT tablename, policyname, roles::text, cmd, qual
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename LIKE 'measure_%'
 ORDER BY tablename, policyname;

-- 2. A flag do bucket. Esperado hoje: public = true (o achado 2).
SELECT id, public FROM storage.buckets WHERE id = 'measure-plants';

-- 3. Policies do storage para o bucket. Procurar roles={anon} em INSERT/UPDATE/DELETE.
SELECT policyname, roles::text, cmd
  FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects'
   AND (qual LIKE '%measure-plants%' OR with_check LIKE '%measure-plants%')
 ORDER BY policyname;

-- 4. Tamanho do problema: quantas pessoas têm levantamento preso ao próprio id,
--    e quantos deles já não têm usuário ativo.
SELECT count(*) AS projetos,
       count(DISTINCT p.user_id) AS pessoas,
       count(*) FILTER (WHERE u.id IS NULL) AS de_usuario_inexistente
  FROM public.measure_projects p
  LEFT JOIN auth.users u ON u.id = p.user_id;
```

## Correção proposta

**Fase 1 — parar de piorar (barato, sem migração de dados).**
Trocar `getPublicUrl` por `createSignedUrl` no `measureService` e virar o bucket
para `public = false`. É o padrão que `electrical_plans` e o
`blueprint_underlays` já seguem. Um link antigo deixa de funcionar — é o
objetivo.

**Fase 2 — dar dono organizacional.**
`ALTER TABLE public.measure_projects ADD COLUMN organization_id UUID`, preencher
a partir da organização do `user_id` (ou de `associated_project_id`, quando
houver), e reescrever a policy para `is_org_member(organization_id)` **mantendo**
o `user_id` como autoria. As quatro filhas continuam herdando pelo projeto.

⚠️ Preencher exige decisão para quem participa de mais de uma organização: não
há como o banco saber em qual o levantamento foi feito. Opções: usar a
organização do `associated_project_id` quando existir, e **perguntar** para o
resto — atribuir por chute deixaria trabalho na empresa errada, o que é pior que
o problema atual.

**Fase 3 — unificar o escritor de `projects.budget`** (ver
[[blueprint-modulos-concorrentes]]). Independente das duas primeiras.

## O que NÃO recomendo

Migrar o acervo do Medição para o `blueprint_*`. São representações diferentes e
a conversão perde informação; e enquanto a titularidade não estiver resolvida,
migrar só move o problema de tabela.
