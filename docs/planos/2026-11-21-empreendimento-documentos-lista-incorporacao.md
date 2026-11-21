# Empreendimento › Documentos: vários por tipo, data de emissão e lista Incorporação

> Continuação da aba nascida em #397/#399 (plano `docs/planos/2026-11-12-empreendimento-aba-documentos.md`).
> Sessão: Claude Code (VS Code) · 21/11/2026.

## Pedido original (21/11/2026)

> Aba documentos:
> 1. Carregar lista padrão somente permite somente um de cada tipo. Porem podemos ter mais de uma escritura por exemplo. Permitir mais de um documento de cada tipo.
> 2. criar coluna data de emissão.
> 3. criar mais um tipo de lista padao chamada incorporaçào e Incluir seguintes documentos
> 3.1. Memorial de incorporação · 3.2. Título de propriedade do terreno · 3.3. Certidões negativas de tributos federais, estaduais e municipais · 3.4. Certidões das justiças federal e estadual · 3.5. Certidões de protesto de títulos · 3.6. Certidões do imóvel · 3.7. Histórico dos títulos de propriedade do imóvel de que trata o art. 39, Ii, lei 4.591/64 · 3.8. Quadros da NBR 12.721:2006, com ART/RRT · 3.9. Projeto arquitetônico de construção · 3.10. Alvará de construção · 3.11. Atestado de idoneidade financeira · 3.12. Contrato-padrão · 3.13. Declaração em que se defina a parcela do preço · 3.14. Certidão de instrumento público de mandato · 3.15. Declaração do prazo de carência

### Decisões do usuário (AskUserQuestion, mesma sessão)
- **Data de emissão nas duas tabelas.** "Outros documentos" ganha a coluna e o campo. Nos legais, a coluna "Emissão" passa a se chamar "Data de emissão".
- **Documento repetido entre as listas entra uma vez só.** Alvará de construção, Certidões do imóvel, Título de propriedade (= Escritura) e Projeto arquitetônico (= Aprovação do projeto) usam o mesmo tipo nas duas listas. O Memorial de incorporação é um tipo próprio: é o que se protocola, e o Registro de incorporação é o resultado.
- **Os títulos seguem a lei.** O "art. 39, II" vai para a 3.13. A 3.7 fica "(últimos 20 anos)", conforme a alínea c do art. 32.

## Contexto (o que existe hoje)
- `empreendimento_documentos_legais`:
  - tem o índice único parcial `uq_emp_doc_legal_tipo (empreendimento_id, tipo) WHERE tipo <> 'OUTRO'`, e é ele que impede a 2ª escritura;
  - o tipo é limitado pelo CHECK `chk_emp_doc_legal_tipo`, com 19 valores;
  - em produção há 36 itens, no máximo 1 por tipo e empreendimento, então nada quebra ao soltar.
- `types/empreendimentoDocumentos.ts`: `TIPOS_DOCUMENTO_LEGAL` é ao mesmo tempo o catálogo de tipos e a lista padrão (18 itens).
- `utils/empreendimentoDocumentos.ts` › `faltantesDaListaPadrao`: traz os tipos que faltam, com `sort_order = (i+1)*10`.
- `DocumentosEmpreendimentoTab.tsx`:
  - `tiposDisponiveis` tira do "+ Documento" os tipos já usados;
  - a coluna `emissao` "Emissão" já existe nos legais;
  - "Outros documentos" não tem emissão, embora `OpuraDocument.data_emissao` exista no GED.
- `services/empreendimentoDocumentosService.ts`:
  - `carregarListaPadrao` relê o banco e insere o que falta;
  - `criarLegal` e `atualizarLegal` traduzem o erro 23505 para "já está no checklist";
  - `enviarOutro` e `atualizarOutro` não levam `data_emissao`.

## Itens

### 1. Migration `supabase/migrations/aplicar_20271121910000_empreendimento_documentos_varios_por_tipo.sql`
Antes de criar, conferir todos os nomes da pasta para não repetir o prefixo.
- `DROP INDEX IF EXISTS uq_emp_doc_legal_tipo`. O `idx_emp_doc_legal_empreendimento` já cobre a leitura.
- `DROP CONSTRAINT IF EXISTS chk_emp_doc_legal_tipo` + `ADD CONSTRAINT` com os 19 valores atuais mais 11 novos:
  - `MEMORIAL_INCORPORACAO`, `CND_TRIBUTOS`, `CERTIDOES_JUSTICA`, `CERTIDOES_PROTESTO`;
  - `HISTORICO_TITULOS`, `QUADROS_NBR_12721`, `ATESTADO_IDONEIDADE`, `CONTRATO_PADRAO`;
  - `DECLARACAO_PARCELA_PRECO`, `CERTIDAO_MANDATO`, `DECLARACAO_CARENCIA`.
- Não cria função nem policy, então a REGRA #7 não se aplica.
- É idempotente e aplicada com `db query --linked -f` **antes** do push. O front velho continua funcionando.
- Rollback:
  - recriar o índice único, que falha se já houver duplicados (aí é preciso decidir antes quais apagar);
  - restaurar o CHECK antigo.
- Risco aceito: sem o índice, duas pessoas carregando a mesma lista no mesmo segundo podem duplicar itens. O botão já fica desligado enquanto carrega, e o serviço relê antes de inserir.

**Pronto quando:** a consulta em `pg_indexes` não mostra mais o `uq_emp_doc_legal_tipo`, e `pg_get_constraintdef` lista os 30 valores.

### 2. Tipos e listas: `types/empreendimentoDocumentos.ts`
- `TipoDocumentoLegal` ganha os 11 tipos novos. `TIPOS_DOCUMENTO_LEGAL` vira só o **catálogo**, com rótulo, categoria do GED, órgão e se vence.
- Os 11 tipos novos no catálogo:

  | Tipo | Categoria no GED | Órgão sugerido | Vence |
  |---|---|---|---|
  | `MEMORIAL_INCORPORACAO` | `juridico` | Cartório de RI | não |
  | `CND_TRIBUTOS` | `juridico` | Receita Federal, Sefaz e Prefeitura | sim |
  | `CERTIDOES_JUSTICA` | `juridico` | Justiça Federal e Justiça Estadual | sim |
  | `CERTIDOES_PROTESTO` | `juridico` | Tabelionato de Protesto | sim |
  | `HISTORICO_TITULOS` | `juridico` | Cartório de RI | não |
  | `QUADROS_NBR_12721` | `engenharia` | CREA/CAU | não |
  | `ATESTADO_IDONEIDADE` | `financeiro` | Instituição financeira | não |
  | `CONTRATO_PADRAO` | `juridico` | — | não |
  | `DECLARACAO_PARCELA_PRECO` | `juridico` | — | não |
  | `CERTIDAO_MANDATO` | `juridico` | Tabelionato de Notas | não |
  | `DECLARACAO_CARENCIA` | `juridico` | — | não |

- Novo `LISTAS_PADRAO: ListaPadrao[]`, com `{ id: 'GERAL' | 'INCORPORACAO', rotulo, descricao, baseOrdem, itens: { tipo, titulo? }[] }`:
  - **Geral (ciclo do empreendimento):** os 18 de hoje, na mesma ordem, com `baseOrdem` 0, de modo que o `sort_order` continue 10…180.
  - **Incorporação (Lei 4.591/64, art. 32):** os 15 na ordem do pedido, com `baseOrdem` 1000.
    - Usa um `titulo` próprio da lista em cada item. Os títulos seguem o texto do pedido, com duas correções:
      - 3.7: "Histórico dos títulos de propriedade do imóvel (últimos 20 anos)";
      - 3.13: "Declaração em que se defina a parcela do preço (art. 39, II, Lei 4.591/64)".
    - Os quatro reaproveitados são `ESCRITURA` ("Título de propriedade do terreno"), `CERTIDOES_IMOVEL` ("Certidões do imóvel"), `APROVACAO_PROJETO` ("Projeto arquitetônico de construção") e `ALVARA_CONSTRUCAO` ("Alvará de construção").

### 3. Regra pura: `utils/empreendimentoDocumentos.ts`
- `faltantesDaListaPadrao(existentes, base)` vira `faltantesDaLista(listaId, existentes, base)`, com estas regras:
  - entra o item cujo **tipo ainda não existe** no checklist, de qualquer origem;
  - o título vem de `item.titulo ?? rótulo do catálogo`;
  - `sort_order = baseOrdem + (i+1)*10`.
- Com isso:
  - carregar a mesma lista duas vezes não duplica nada;
  - a Incorporação depois da Geral traz 11 itens, porque os quatro em comum já estão lá;
  - uma 2ª escritura acrescentada à mão não atrapalha a carga.

**Pronto quando** os testes em `__tests__/empreendimentoDocumentos.test.ts` passam:
- os testes que já existem, adaptados para `faltantesDaLista('GERAL', …)`, sem mudar o que esperam;
- Incorporação com checklist vazio traz 15 itens, com os títulos do pedido e o `sort_order` a partir de 1010;
- Incorporação depois da Geral traz 11;
- as duas listas são idempotentes;
- todo tipo do catálogo cai numa categoria do GED;
- o teste "batem com o CHECK" passa a ler a migration nova.

### 4. Serviço: `services/empreendimentoDocumentosService.ts`
- `carregarListaPadrao(e)` vira `carregarLista(e, listaId)`: relê o banco e insere o que falta, como hoje.
- Sai a tradução do 23505 em `criarLegal` e `atualizarLegal`. Sem o índice único, esse código ficaria morto.
- `enviarOutro` e `atualizarOutro` passam a levar `data_emissao` na meta. No `atualizarOutro`, um campo vazio grava `null`, pela mesma lição do `atualizarNoGed`: `undefined` é omitido e o valor antigo ficaria.

### 5. Tela: `components/empreendimento/DocumentosEmpreendimentoTab.tsx`
- **Vários por tipo:**
  - o "+ Documento" oferece todos os tipos, em `<optgroup>` "Lista geral", "Incorporação (Lei 4.591/64)" e "Outro", e os tipos comuns às duas listas aparecem uma vez;
  - se o tipo escolhido já existe no checklist, aparece sob o Título a dica "Já há N '<rótulo>' no checklist; use um título que diferencie (ex.: Escritura – lote 12)".
- **Carregar lista padrão:**
  - o botão abre um Sheet `md` "Carregar lista padrão" com as duas listas em opções de rádio;
  - cada opção mostra o nome, a descrição e "N de M ainda não estão no checklist", e abaixo a lista dos itens que vão entrar;
  - o botão de confirmar diz "Adicionar N documentos". Fica desligado com o motivo quando a lista escolhida já está completa;
  - o botão da toolbar só fica desligado quando as duas listas estão completas, com o motivo no `title`.
- **Data de emissão:**
  - nos legais, o rótulo da coluna `emissao` vira "Data de emissão" e o campo do Sheet também;
  - em "Outros documentos", a coluna `emissao` "Data de emissão" entra depois de Tipo, com `sortValue`, e o Sheet de envio e edição ganha o campo `type="date"`;
  - em "Outros", a validade não pode ser anterior à emissão, a mesma regra que os legais já têm;
  - as larguras são reajustadas para as duas tabelas caberem em 1600 px sem rolagem lateral (legais: Documento 250→235, Data de emissão 125; outros: Documento 300→280, Categoria 190→170). A medida final é feita no navegador.

**Pronto quando** `check-ui-standard.sh` passa no `.tsx`.

## Verificação
1. `node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit` limpo.
2. `npx vitest run __tests__/empreendimentoDocumentos.test.ts __tests__/segurancaMigrations.test.ts __tests__/migrationsPrefixo.test.ts __tests__/orgContextGuard.test.ts`.
3. Rodar `bash scripts/check-ui-standard.sh components/empreendimento/DocumentosEmpreendimentoTab.tsx` e o `check-org-selector-guard.sh`. Ler antes o guia inteiro (REGRA #1) e listar o CHECKLIST DE APLICAÇÃO no relatório.
4. App local (Playwright, `index_harness_navegador`), num empreendimento de teste, apagando os dados de teste no fim e conferindo com uma consulta:
   - Carregar a lista Incorporação: entram 15 itens com os títulos certos. Abrir o Sheet de novo mostra a lista completa e o botão desligado com o motivo.
   - Carregar a lista Geral depois: entram 14, porque 4 já estão no checklist.
   - "+ Documento" › Escritura uma 2ª vez: grava, e a dica de título repetido aparece.
   - Em Outros, enviar com data de emissão: a coluna mostra a data, e `opura_documents.data_emissao` no banco é igual. Apagar a emissão grava NULL.
   - Coluna "Data de emissão" nas duas tabelas, sem rolagem lateral em 1600 px.
5. Migration aplicada antes do push. Depois: PR → CI → eu faço o merge → `conferir-producao.sh` → memória atualizada.

## Estado

- [x] 1. Migration aplicada em 21/11 (`db query -f`): `uq_emp_doc_legal_tipo` = 0 em `pg_indexes`, e o CHECK tem 30 valores.
- [x] 2. Tipos e `LISTAS_PADRAO`
- [x] 3. `faltantesDaLista` e testes (50 verdes nos 4 arquivos)
- [x] 4. Serviço: `carregarLista`, sem o 23505, e `data_emissao` em Outros
- [x] 5. Tela: Sheet de escolha da lista, `<optgroup>`, dica de tipo repetido e coluna/campo "Data de emissão"
- [x] Verificação no app real (Playwright, 21/11, "003 - Miguel Louzada", que não tinha checklist nem GED). Resultado:
  - Incorporação: 15 itens com os títulos do pedido, `sort_order` 1010…1150. Ao reabrir, "Lista completa" desligado com o motivo;
  - Geral depois: 14 itens (4 em comum não repetiram). Total 29, e o botão da toolbar fica desligado com o motivo;
  - "+ Documento" › Escritura uma 2ª vez: a dica "Já há 1 'Escritura do terreno'…" aparece e o item grava (30);
  - Outros com emissão 01/11/2026: a coluna mostra a data. A validade anterior à emissão é recusada. Apagar a emissão grava `opura_documents.data_emissao` = NULL (conferido no banco);
  - Larguras: a tabela de legais rolava 6 px (a barra vertical come a área). Documento 235 → 225, e a medida passou a 1274 = 1274. Outros: 1282 = 1282;
  - console: nenhum erro;
  - dados de teste apagados (o documento do GED pela própria tela, o checklist por SQL), conferido por consulta: 0 itens, 0 documentos, 0 arquivos.
- Desvio do plano: com a lista escolhida já completa, o botão do Sheet diz "Lista completa" (desligado), em vez de "Adicionar 0 documentos".
- Os cabeçalhos "Data de emissão", "Categoria no GED" e "Enviado em" quebram em duas linhas. Para caber numa linha, a coluna precisaria de ~180 px e a tabela passaria a rolar na horizontal. O guia não tem regra sobre isso, então ficou assim.
- [ ] Publicação e prova de produção
