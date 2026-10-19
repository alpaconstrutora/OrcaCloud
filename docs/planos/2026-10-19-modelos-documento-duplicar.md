# Modelos de documento — botão "Duplicar" que reaproveita o mapeamento

## Pedido original

> suprimentos > contratos > emissão > Modelos de documento:
> Ao criar um novo modelo, deve ser feito todo mapeamento novamente. Se for um documento diferente faz sentido novo mapeamento, mas no caso de ser apenas uma revisão de um documento ter que mapear manualmente todo documento é um trabalho desnecessário se podemos apenas com botao duplicar e remapear em um novo documento. reaproveitando.

Sessão: Claude Code (VS Code) · 19/10/2026. Plano aprovado no plan mode na mesma sessão.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 19/10/2026 | (plano aprovado sem ressalvas) Duplicar abre o formulário de criação já preenchido; o original fica intacto | aprovado |

## Contexto

A tela é `components/DocxTemplateManager.tsx` (lista + formulário + mapeamento no
mesmo arquivo). A linha só tinha o menu ⋮ com **Excluir**; criar um modelo exigia
subir um `.docx` e mapear cada marcador `{001}` do zero.

O que já existia e foi reaproveitado:
- o mapeamento é a coluna JSONB `token_map` (chave = nome do marcador) e os marcadores
  ficam em `detected_tokens` (`document_templates`, migration `20261110000001`);
- `handleFile` já preservava o mapeamento dos marcadores que continuam no arquivo
  novo ao trocar o arquivo — faltava só um ponto de entrada que comece de uma cópia;
- `InlineDisclosureMenu` aceita `menuItems` (guia §9; mesmo padrão de
  `SupplyChainContractList.tsx`, "Duplicar Contrato").

O original nunca é alterado: as versões já emitidas apontam para ele por
`template_id` (`EmitDocumentModal.tsx`). Sem mudança de banco — nenhuma coluna,
policy ou função nova (REGRA #7 não se aplica).

## Plano

### 1. `services/documentTemplateService.ts` — criar a partir de arquivo existente
- **Muda:** `create()` aceita como origem um `File` **ou** `{ fromPath, fileName }`.
  Com `fromPath`, copia no bucket (`storage.copy`) para um caminho novo
  `${organizationId}/${Date.now()}_${nomeSeguro}` — cada modelo tem o próprio arquivo.
- **Pronto quando:** `tsc` passa e o teste unitário mostra `copy` com o caminho de
  origem e o `insert` com o `file_path` novo e o `file_name` original.

### 2. `components/DocxTemplateManager.tsx` — ação Duplicar e formulário pré-preenchido
- **Muda:** `Draft` ganha `source` (arquivo + org + marcadores do original);
  `startDuplicate(t)` abre a criação com `"<nome> (cópia)"`, descrição, marcadores e
  mapeamento copiados; `canSave` aceita arquivo novo **ou** de origem; `save()` grava
  na org **do original**; a área do arquivo diz "Arquivo do modelo de origem" e o botão
  vira "Enviar versão revisada (.docx)"; ⋮ ganha "Duplicar".
- **Pronto quando:** Duplicar → formulário com "(cópia)" e o mesmo mapeamento →
  Salvar → linha nova com o mesmo `mapeados/total`; original igual.

### 3. Mostrar o que mudou ao trocar o arquivo (cópia e edição)
- **Muda:** após trocar o arquivo, faixa informativa: mantidos com mapeamento · novos
  para mapear · que não existem mais (lista). Marcador novo ganha "Novo" em texto
  colorido (§8 — sem pílula).
- **Pronto quando:** arquivo com um marcador a mais e um a menos mostra a contagem
  certa e o "Novo" só no novo; os demais mantêm o mapeamento.

### 4. Testes
- **Muda:** `__tests__/components/DocxTemplateManagerDuplicar.test.tsx` (jsdom) +
  teste do service.
- **Pronto quando:** os testes passam e a suíte inteira passa (`npm run ci`).

### 5. Portões das regras
- **Pronto quando:** `check-ui-standard.sh components/DocxTemplateManager.tsx` = 0;
  `orgContextGuard.test.ts` passa; relatório lista o CHECKLIST DE APLICAÇÃO.

### 6. Verificação na interface e publicação
- **Pronto quando:** na tela (Playwright), Duplicar → Salvar; Duplicar → enviar
  `.docx` revisado → faixa e "Novo"; Emitir com o duplicado; sem erro de console nem
  4xx/5xx; push em `main` e prova de produção com o SHA. Modelo de teste excluído.

## Estado

- [x] 1. Service — `create(org, File | { fromPath, fileName })`; `storageService.copy` novo
- [x] 2. Duplicar na tela — também: a edição passa a gravar o arquivo na pasta da org DO
      REGISTRO (antes, a da tela), e o "Salvar modelo" desligado diz o motivo no `title`
- [x] 3. Faixa do que mudou + "Novo" (texto colorido, §8)
- [x] 4. Testes — `__tests__/components/DocxTemplateManagerDuplicar.test.tsx` (3) e
      `__tests__/documentTemplateServiceDuplicar.test.ts` (3), verdes
- [x] 5. Portões — `check-ui-standard` = 0; `tsc` exit 0 sem `error TS`; `orgContextGuard`,
      `valorDeCampoSemCinzaGuard`, `darkSoPorClasse`, `cabecalhoSemCinzaGuard` verdes
- [ ] 6. Interface ✅ (abaixo) · publicação pendente

### Verificação na tela (19/10/2026, Playwright, conta de leitura, org Alpa)

Roteiro `c:/tmp/pwtest/verificar-modelos-duplicar.cjs`, modelo de origem
"Opura_-_CONTRATO_DE_PRESTA_O_DE_SERVICOS r1" (33/36 mapeados):

- Duplicar → nome "(cópia)", aviso, 33/36 mapeados, "Enviar versão revisada (.docx)", Salvar
  habilitado → Salvar: `storage/v1/object/copy` 200 + `insert` 201; a lista ganhou a cópia com
  33/36 e o original ficou 33/36. A cópia nasceu com `file_path` PRÓPRIO.
- Duplicar → .docx revisado ({036} trocado por {099}): faixa "35 continuam · 1 novo · 1 não
  existe mais", {036} listado como saído, "Novo" só no {099}, 32/36 mapeados.
- Gerar pelo modelo › a cópia › Baixar .docx: sobraram só {017} {021} {034} — exatamente os 3
  não mapeados.
- Único 4xx: `empreendimentos.planta_ai_study_id` (42703) — a frente estava 7 commits atrás de
  `origin/main`, que já removeu a coluna do select (Planta AI removida). Alheio a esta mudança.
- Modelo de teste apagado do banco e do bucket ao final.

## Verificação

Contratos → um contrato → Emissão → Modelos de documento → ⋮ → Duplicar.
