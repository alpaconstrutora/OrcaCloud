# Nomenclatura "Boletos" — renomear o documento do boleto no cadastro

## Pedido original

> Transcrição LITERAL das mensagens do usuário. Sessão: Claude Code VS Code (`c--D-OR-ACLOUD`) · 13/10/2026.

1. (print do Financeiro do condomínio, coluna Documento com `download (98).pdf`)
   > qual o problema: em comecial > condomonios > financeiro: o nome original fica sendo algo completamente aleatório. Veja print com um exemplo. download (98).pdf

2. Depois de eu apontar as opções (mostrar nome montado só na tela / renomear no cadastro / deixar como está):
   > Renomear no cadastro do boleto (2). com um ajuste, o nome será definido em Configurações do Sistema > Nomenclatura: criar um novo item chamado Boletos

3. Respostas às 3 perguntas do plano:
   > Como o item "Boletos" deve ser configurado na tela Nomenclatura? → **"nao invente nada! é so acrescentar mais um item."**
   > Quando o arquivo deve ser renomeado? → **Ao salvar com fornecedor/descrição (Recomendado)**
   > E os boletos que já estão cadastrados? → **Botão para renomear os existentes**

4. (print da tela Nomenclatura, tabela Módulo · Prefixo · Livre…) 
   > veja print

5. Pedido posterior (14/10/2026), depois de eu explicar que um boleto já renomeado não muda de novo:
   > Se quiser renomear de novo na tela, posso criar uma ação "Renomear de novo" no formulário do boleto. Quer? → **sim**
   (escopo da sessão: exclusivamente Financeiro › Boletos a Pagar)

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 13/10/2026 | Formato do item Boletos | Mais um item (linha) da tabela de Nomenclatura existente, sem inventar nada |
| 13/10/2026 | Quando renomear | Ao salvar com fornecedor/descrição (formulário, edição em lote, importação em lote) |
| 13/10/2026 | Boletos já cadastrados | Botão que renomeia os existentes |

Decisões de implementação (aprovadas junto com o plano, ver "Pontos para a aprovação"):
máscara padrão `BOL` + Fornecedor + Obra (editável); só renomeia depois de a organização
**salvar** a máscara de Boletos; só renomeia boleto com fornecedor definido.

## Plano

Consequência do motor existente (não é invenção): o nome é o **número da máscara** — códigos de
cadastro + sequencial, ex. `BOL-FORN003-TR1-0001.pdf`. Não entram descrição, vencimento nem valor.
Variável sem valor some do nome ("nunca bloqueia").

1. **Banco** — `supabase/migrations/aplicar_20271013180000_boleto_nomenclatura.sql`: CHECK de
   `document_numbering_settings.doc_type` aceita `'BOLETO'`; coluna `boletos.documento_nome_original`.
   *Pronto quando:* `pg_get_constraintdef` contém `BOLETO` e a coluna existe (`db query --linked`, leitura).
2. **Catálogo** — `'BOLETO'` em `DocType` (`types.ts`) e `DOC_TYPE_CATALOG` (`catalog.ts`), em `MAIN_DOC_TYPES`.
   *Pronto quando:* a tela Nomenclatura mostra a linha "Boletos" com prévia `BOL-FORN003-TR1-0001`.
3. **Serviço** — `services/boletoNomeDocumentoService.ts` (`renomearDocumentoDoBoleto`,
   `renomearBoletosExistentes`, `contarBoletosParaRenomear`) + `hasSavedNumberingConfig`.
   *Pronto quando:* `__tests__/boletoNomeDocumento.test.ts` passa (extensão, 1× só, sem fornecedor,
   sem máscara, falha do motor sem lançar, contagem).
4. **Ganchos** — `boletoService.associar`, `associarEmLote` e `aprovarEmLote` chamam o serviço
   (a importação em lote passa por `associar`). *Pronto quando:* boleto salvo com fornecedor tem
   `documento_nome` novo e `documento_nome_original` = nome de upload.
5. **Botão** — "Renomear boletos existentes" em `NomenclaturaTable.tsx` (organização via
   `resolveWriteOrg('single')`, contagem em `useConfirm()`, progresso, resumo).
   *Pronto quando:* conta, confirma, renomeia e informa "N renomeados".

6. **Renomear de novo (14/10/2026)** — botão "Renomear" no rodapé do preview do documento em
   `BoletoFormModal.tsx` (confirma com `useConfirm`; usa fornecedor/obra já salvos; gasta um número) +
   `renomearDocumentoDeNovo` em `services/boletoNomeDocumentoService.ts` (mantém o `documento_nome_original`
   de upload; UPDATE compara o nome atual contra edição concorrente; devolve o motivo quando não renomeia).
   *Pronto quando:* testes `renomearDocumentoDeNovo` passam e, na tela, o botão troca o nome e a coluna
   Documento mostra o novo.

Fora do escopo: `invoices.file_name` de boleto já aprovado não é sincronizado; `documento_path`
(storage) nunca muda.

## Estado

- [x] 1. Banco — aplicado em 13/10/2026 via `db query -f` (constraint e coluna conferidas em leitura)
- [x] 2. Catálogo
- [x] 3. Serviço + 13 testes
- [x] 4. Ganchos
- [x] 5. Botão
- [x] Publicado e conferido em produção (3bd1bf7, domínio serve origin/main)
- [ ] Conferido na interface (Nomenclatura › Boletos → salvar → boleto com fornecedor → coluna Documento)

## Verificação

`tsc --noEmit`; `vitest` (suíte inteira + `boletoNomeDocumento.test.ts`);
`bash scripts/check-ui-standard.sh components/settings/NomenclaturaTable.tsx`;
na interface: Configurações › Nomenclatura (linha Boletos, Salvar, botão) e Financeiro do condomínio
(coluna Documento mostra o nome novo; o link abre o mesmo PDF).
