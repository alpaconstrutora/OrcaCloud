# Diário de Obras — gravação por registro (fim da perda silenciosa)

## Pedido original

Sessão de 14/10/2026.

> availe: operacional > diario de obra > versao mobile

A avaliação listou, como item 1 (grave), *"Registro criado pela prévia some no
próximo save do desktop"* e terminou com *"Quer que eu comece pelo item 1?"*.
Resposta do usuário:

> sim

## O defeito

Os registros moram em `projects.settings.diaryEntries` (JSONB). Toda gravação
regravava o `settings` INTEIRO a partir da cópia que a tela tinha em memória:

- a prévia mobile grava direto no banco; o desktop continua com a cópia antiga
  (fechar a prévia não recarrega) — o próximo save do desktop
  (`ProjectDiaryManager.handleSave`) ou o auto-save (`usePersistenceSync`, 2 s
  depois de qualquer mudança no `settings`) apaga o registro feito na prévia;
- o mesmo vale para duas pessoas no mesmo diário (campo × escritório, dois
  mestres de obra): quem salva por último apaga o registro do outro;
- "Editar projeto" e qualquer outro save do projeto também regravam
  `diaryEntries` com o que estava em memória.

## Itens — 4 de 5 concluídos (item 1: funções no ar, gatilho entra depois do push)

### 1. 🟡 Banco: gravar um registro por vez, com a linha travada
`aplicar_20271014500000_diario_gravacao_por_registro.sql`:
- `diary_upsert_entry(p_project_id, p_entry)` e `diary_delete_entry(p_project_id,
  p_entry_id)` — `SECURITY INVOKER` (a RLS de `projects` decide quem grava),
  `SELECT … FOR UPDATE` e troca só o registro do `id`; devolvem a lista inteira
  já gravada e a versão anterior do registro (para limpar mídia órfã contra o
  banco, não contra a memória). REVOKE de PUBLIC/anon (REGRA #7).
- gatilho `trg_projects_diary_entries_guard` (BEFORE UPDATE OF settings): UPDATE
  que não veio dessas funções não muda `diaryEntries` — a chave volta ao valor do
  banco. INSERT (duplicar/importar projeto) não é afetado.

**Pronto quando:** aplicada; num BEGIN…ROLLBACK com projeto de teste: (a) dois
upserts de registros diferentes mantêm os dois; (b) um UPDATE do `settings`
inteiro com lista velha não apaga nenhum; (c) delete remove só o registro;
(d) `authenticated` sem vínculo com a org recebe erro; (e) ACL sem `anon`/PUBLIC.

### 2. ✅ `services/diaryEntryService.ts` (novo)
`salvarRegistroDiario` / `excluirRegistroDiario` / `carregarRegistrosDiario`.

**Pronto quando:** `tsc` limpo.

### 3. ✅ Mobile (`DiaryMobileApp`) grava pelas funções
Atualiza o estado local com a lista devolvida; órfãos de mídia = refs da versão
ANTERIOR do banco − refs do registro salvo.

**Pronto quando:** `tsc` limpo e o fluxo do app não grava mais `saveProject`.

### 4. ✅ Desktop (`ProjectDiaryManager`) grava pelas funções e recarrega ao fechar a prévia
- salvar/excluir pelas funções; a lista devolvida vai para `onUpdateSettings`
  (o auto-save que isso dispara não mexe mais em `diaryEntries` — item 1);
- a sincronização de evolução com o Planejamento passa a usar a lista devolvida
  pelo banco (antes usava a da memória);
- fechar a prévia mobile relê os registros do banco.

**Pronto quando:** `tsc` limpo; `check-ui-standard.sh` sem violação nova.

### 5. ✅ Verificação
`npm run typecheck`, `segurancaMigrations.test.ts`, `orgContextGuard.test.ts`,
`check-ui-standard.sh` nos arquivos tocados, roteiro do item 1 no banco.

## Ordem de aplicação (o gatilho NÃO pode entrar antes do front)

Com o gatilho ligado, o front que ainda grava pelo `saveProject` teria toda
gravação do diário descartada em silêncio. Então:

1. ✅ 14/10 — só as funções (seções 2 e 3 do arquivo) aplicadas; ACL
   `{postgres, authenticated, service_role}`, `prosecdef = false`.
2. push do front → conferir produção (`conferir-producao.sh`).
3. arquivo inteiro (idempotente) → liga o gatilho.

Aba antiga aberta (PWA não recarregado) depois do passo 3: o save do registro
"passa" e o registro não fica — cai com o primeiro reload. Uso hoje: 3 diários,
3 registros.

## Como foi verificado (14/10/2026)

- Banco, migration INTEIRA + roteiro num `BEGIN … ROLLBACK` com projeto de
  teste, chamando como `authenticated` com o JWT de um membro real (RLS
  valendo): 7/7 — dois upserts mantêm os 3 registros; UPDATE do `settings`
  inteiro com a lista velha + renomear → renomeia e mantém os 3; edição devolve
  a versão anterior; delete remove só o registro; estranho à org recebe 42501;
  ACL sem anon/PUBLIC.
- `tsc --noEmit` 0 erros (1ª rodada caiu no V8 sem erro de tipo, repetida com
  12 GB); `segurancaMigrations` + `orgContextGuard` 16/16 (8 arquivos);
  `check-ui-standard.sh` 0 violação nos dois componentes (antes e depois);
  `vite build` ✓ com PWA.
- **Não exercitado no navegador**: a fiação da tela foi conferida só por tipos.

## Fora deste plano (itens 2–8 da avaliação de 14/10)
Atividades sem vínculo ao cronograma no mobile; app dentro do Layout num celular
real; fotos sem compressão; sem rascunho offline; efetivo texto livre; aprovação
sem papel; `TODAY_ISO` fixo.
