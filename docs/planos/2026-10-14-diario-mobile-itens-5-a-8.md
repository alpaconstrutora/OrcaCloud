# Diário de Obras mobile — itens 5 a 8 da avaliação

## Pedido original

Sessão de 14/10/2026.

> availe: operacional > diario de obra > versao mobile

Itens 1–4 da avaliação feitos antes no mesmo dia (planos
`2026-10-14-diario-gravacao-por-registro.md`, `…-mobile-atividades-cronograma.md`,
`…-mobile-tela-cheia-aparelho.md`, `…-fotos-compressao.md`). Pedido seguinte:

> faça do 5 ao 8. nao precisa pedir autorizacao para iniciar o proximo item

Os quatro itens, como estavam na avaliação:

- **5.** Não há rascunho local nem modo offline. Sem sinal, o salvamento falha.
  Se a página recarregar (o celular costuma descarregar a aba quando a câmera
  abre e falta memória), tudo o que foi digitado se perde.
- **6.** O efetivo é só texto livre. O desktop sugere colaboradores do RH,
  equipes e o pessoal do planejamento; o mobile não. Os nomes digitados de
  qualquer jeito vão poluir a "Análise de equipes".
- **7.** Qualquer usuário pode marcar "Aprovado" e excluir um registro aprovado,
  no mobile e no desktop. Não existe fluxo de aprovação de verdade.
- **8.** A data de "hoje" é fixada quando o app carrega (`TODAY_ISO`). Com o app
  instalado aberto desde ontem, o registro novo nasce com a data de ontem.

## Itens — 4 de 4 concluídos em 14/10/2026

### 8. ✅ Data de hoje calculada na hora, no dia LOCAL
- mobile: `emptyEntry()` usa `hojeLocal()` na hora de abrir (saiu o `TODAY_ISO`
  de módulo);
- desktop: as 3 ocorrências de `new Date().toISOString().split('T')[0]` viraram
  `hojeLocal()` — `toISOString()` é UTC: depois das 21h em Brasília o registro
  novo nascia com a data de AMANHÃ (defeito irmão, achado aqui).
- `hojeLocal` reaproveitado de `utils/baixaRecebivel.ts` (mesmo defeito, já
  testado no financeiro).

**Pronto quando:** harness com fuso `America/Sao_Paulo`: às 22h30 o novo nasce
14/10; com o relógio passado para 00h10 do dia 15 SEM recarregar, nasce 15/10.

### 5. ✅ Rascunho no aparelho + aviso de sem conexão
- `utils/diaryDraft.ts` (novo): rascunho por diário e por registro em
  `localStorage` (`orca_diario_rascunho:{diário}:{registro|novo}`); tudo em
  try/catch (cota cheia, navegação privada). Prefixo `orca_` = o logout apaga
  (tablet de obra compartilhado).
- folha: guarda 400 ms depois de cada mudança e NA HORA em `visibilitychange`
  hidden / `pagehide` (abrir a câmera põe a página em segundo plano). Ao abrir,
  se há rascunho diferente: "Há alterações não salvas… [Recuperar] [Descartar]";
  editar sem escolher substitui. Cancelar apaga; salvar/excluir apagam.
- lista: cartão com "Não salvo"; registro novo não salvo vira faixa no topo
  ("Continuar"). Nome escolhido para não confundir com o STATUS "Rascunho".
- falha ao salvar: a folha fica aberta e o aviso ("Sem conexão. O registro ficou
  guardado neste aparelho…") aparece DENTRO dela, acima do Salvar. Antes ia para
  o toast, que fica ATRÁS da folha (z-20 < z-30) — não aparecia; só o PNG mostrou.

**Pronto quando:** harness: digitar → recarregar → recuperar; segundo plano
grava sem esperar o debounce; sem sinal mostra o aviso à vista (elementFromPoint).

### 6. ✅ Efetivo com os nomes do RH e dos recursos
- `utils/diaryLabor.ts` (novo): a regra das sugestões que morava no desktop
  (`laborSuggestions`: trabalhadores com a função, equipes, funções com gente) +
  colaboradores ATIVOS do RH; `aplicarNomeNoEfetivo` grava a grafia da lista e
  leva a função/cargo para observações; `nomeEstaNaLista`.
- mobile: `<datalist>` nativa no campo (recursos das organizações do store +
  `laborService.listEmployees` da org do topo — REGRA #5, como a folha de RH do
  desktop); o cargo aparece sob a linha; nome fora da lista ganha aviso
  "Fora da lista do RH e dos recursos — confira a grafia." (não bloqueia).
- desktop: `laborSuggestions` e o `onChange` do campo passam a usar as mesmas peças.

**Pronto quando:** harness: a lista traz RH ativo + trabalhador + equipe +
função e não traz o desligado; "maria   souza" vira "Maria Souza" com "Servente";
o fora-da-lista avisa e grava como digitado.

### 7. ✅ Aprovar/recusar exige permissão — conferida no BANCO
- `aplicar_20271014600000_diario_aprovacao_permissao.sql`:
  `fn_pode_aprovar_diario(org)` (DEFINER, REVOKE PUBLIC/anon) — admin/owner da
  org do diário, ou membro com `canApproveDiary = true`; sem a chave, member e
  viewer NÃO aprovam. `diary_upsert_entry` passa a recusar (42501) quando o
  registro vira Aprovado/Recusado ou já estava Aprovado; `diary_delete_entry`,
  ao excluir Aprovado. Recusado segue editável (corrigir e reenviar). Corpo
  copiado do ARQUIVO da 20271014500000.
- chave nova `canApproveDiary` (`types/users.ts`, padrão false; admin = true)
  e linha "Diário de Obra — aprovar e recusar registros" em Permissões
  Detalhadas › Operação de Obra.
- `utils/diaryAprovacao.ts` (a mesma regra, pura) + `hooks/useDiaryAprovacao.ts`
  (org DO DIÁRIO, não o topo). Mobile e desktop: Aprovado/Recusado desligados com
  o motivo; registro aprovado trava salvar/excluir/status com aviso; recusa do
  banco mostra a frase do banco (não "sem conexão").
- Em 14/10: nenhum registro Aprovado/Recusado em produção (3 Rascunho), nenhum
  membro com a chave; 9 member, 2 admin, 3 owner.

**Ordem de aplicação:** front primeiro (só desliga botão), depois a migration
(o banco passa a recusar). Com a ordem inversa, o front antigo deixaria member
tentar aprovar e receber erro genérico.

**Pronto quando:** roteiro SQL com ROLLBACK como owner e member reais (RLS
valendo) + harness: member não aprova, owner aprova, recusa do banco aparece.

## Como foi verificado

### Itens 5 e 8 (14/10/2026)
- `diaryDraft.test.ts` (novo) + `baixaRecebivel.test.ts`: 16/16.
- `tsc` 0 erros; `check-ui-standard.sh` 0 violação nos dois componentes.
- Harness isolado + Playwright a 390px, fuso `America/Sao_Paulo`, relógio fixo,
  PostgREST stub, servidor novo: **20/20** — 22h30 → 14/10; 00h10 sem recarregar
  → 15/10; rascunho do novo guardado; depois do reload a faixa "Registro novo não
  salvo" e o texto volta; offline: aviso à vista, folha aberta, rascunho mantido;
  sinal de volta: salva o texto recuperado e apaga o rascunho; edição + segundo
  plano grava na hora; cartão "Não salvo"; Recuperar e Descartar; Cancelar apaga.
- Direção contrária do item 8 (data de volta a constante de módulo, servidor
  novo): **19/20** — falha exatamente "passou da meia-noite… nasce 15/10" (veio 14).
- Tropeço registrado: olhei PNGs que a rodada "antes" tinha sobrescrito (mesma
  pasta) e achei que havia defeito de data; a depuração passo a passo mostrou 15/10
  em todos os passos. O PNG certo foi regerado.

### Item 6 (14/10/2026)
- `diaryLabor.test.ts` (novo) + `orgContextGuard`: 21/21; `tsc` 0 erros.
- Harness + Playwright a 390px, RH e recursos stub, servidor novo: **11/11** —
  lista nativa ligada ao campo; RH ativo, trabalhador, equipe e função na lista,
  desligado fora; grafia padronizada e cargo em observações; aviso para nome fora
  da lista; RPC recebeu `{category:'Maria Souza', observations:'Servente'}` e o
  avulso como digitado; sem scroll horizontal. Primeira rodada caiu no MEU
  seletor ("Servente" também está na `<option>`), não no app.

### Item 7 (14/10/2026)
- Banco, migration INTEIRA + roteiro em `BEGIN … ROLLBACK`, como `authenticated`
  com JWT de um owner e de um member reais da mesma org: **12/12** — member sem
  chave: `fn` = false, edita e envia para Em Análise, corrige Recusado mantendo o
  status, NÃO aprova, NÃO cria já Recusado; owner aprova; member NÃO altera, NÃO
  desaprova e NÃO exclui o aprovado, exclui o não aprovado; member COM a chave
  (concedida na transação) recusa o aprovado; ACL das 3 funções sem anon/PUBLIC.
  Roteiro do item 1 repetido com as funções novas: 7/7.
- `diaryAprovacao.test.ts` (novo) + `segurancaMigrations` + `orgContextGuard`:
  25/25; `tsc` 0 erros; `check-ui-standard.sh` 0 violação nos 3 componentes;
  `check-org-selector-guard.sh` ok.
- Harness + Playwright a 390px, papel pela URL, servidor novo: **16/16** —
  member: Aprovado/Recusado desligados com `title` e aviso à vista, Em Análise
  livre; no aprovado, trava à vista, "Registro aprovado" no lugar de Salvar,
  excluir e status desligados; owner aprova e edita o aprovado; recusa 42501 do
  banco aparece na folha com a frase do banco. Primeira rodada caiu no MEU
  seletor (o `title` do excluir também começa com "Registro aprovado").
- **Desktop não exercitado no navegador**: mesma regra pura, conferida por tipos.
