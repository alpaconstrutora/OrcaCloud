# Torres & Unidades — reorganização da aba

## Pedido original

> incorporacao > empreendimento > torres e unidades: veja print. Esta confuso com campos sem uma ordem. sem separacao clara, levando o usuário a ter dificuldade de entender a tela

Sessão `543e09d6-8444-454c-8681-3fa9f9a59a7b` · 14/10/2026, por volta das 19h. O pedido veio com um print da aba
Comercial › Empreendimentos › Torres & Unidades, com uma torre expandida.

## O que estava errado

A aba empilhava blocos sem título nem hierarquia:

- **Terreno** tinha rótulos de 10 px. O botão dizia "Adicionar Terreno", mas fazia UPDATE no empreendimento.
- **Nova torre** era uma linha de 3 inputs **sem rótulo**, colada embaixo do Terreno.
- **Torre expandida** mostrava, em sequência:
  - Pavimentos dentro de uma caixa azul, com rótulos de 10 px.
  - Um formulário de unidade com **13 campos sem rótulo** em 3 linhas.
  - Um acordeão tracejado "Gerar unidades automaticamente".
  - A tabela.
- **Dois "gerar unidades"** tinham efeitos opostos, um em cada seção. O de Pavimentos apagava e recriava as unidades. O do acordeão acrescentava.
- **Terreno aparecia em branco** nas telas de Viabilidade e Planta IA. Elas montam o mesmo `TowerEditor` sem passar o empreendimento, então a seção mostrava dado falso.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 14/10 | Onde fica o formulário de nova unidade | **Painel lateral (Sheet)**, reaproveitando os campos do Sheet que já existe em Características Adicionais |
| 14/10 | Os dois geradores | **Manter os dois, com nomes explícitos** |
| 14/10 | Terreno | **Continua na aba, como 1ª seção** |

Decisões de desenho derivadas, cada uma com o porquê:

- **Os dois geradores ficam lado a lado na seção Unidades.** A confusão vinha justamente de haver um "gerar" em cada seção. O destrutivo confirma citando quantas unidades serão substituídas.
- **"Gerar em série" virou Sheet**, não acordeão. São 10 campos para criar registros, o caso de painel lateral do UI_PATTERNS §3.
- **Pavimentos continua com formulário inline.** É uma entrada repetida em sequência (subsolo, térreo, tipo ×N, cobertura), o caso "um formulário" do §30. Abrir um Sheet por linha quebraria o ritmo.
- **Nova torre virou Sheet.** É o mesmo gesto de "Nova unidade", com botão na linha do título. Depois de criada, a torre já abre expandida, porque o próximo passo é cadastrar os pavimentos.
- **Um só botão azul sólido por linha de título (§17).** Os geradores usam `variant="secondary"`.
- **`SecaoTitulo` virou componente.** O título §30 aparece 6 vezes nesta frente, e o problema da tela era cada cópia ter derivado para outro estilo.

## Plano

Um item por arquivo. Cada item diz o que muda e como sei que terminou.

1. **Este arquivo.**
   - **Pronto quando:** o pedido literal está no topo e o Estado é atualizado item a item.
2. **`components/ui/SecaoTitulo.tsx`** (novo)
   - **O que muda:** ícone + `h3 text-sm font-semibold` + `resumo?` + `acoes?`, em `border-b border-gray-100 pb-3`, conforme o §30.
   - **Pronto quando:** está em uso em Terreno, Torres, Pavimentos e Unidades, e nas duas seções do Sheet de Características.
3. **`components/empreendimento/UnitFormFields.tsx`** (novo)
   - **O que muda:**
     - `UnitFormValues`, `emptyUnitFormValues`, `unitFormFromRecord`, `unitFormToPayload` e `FLOOR_TIPO_LABEL`.
     - O componente com os 13 campos rotulados, mais "Torre" quando receber `towers`.
   - **Pronto quando:** o tsc passa e `FLOOR_TIPO_LABEL: Record` só existe aqui.
4. **`__tests__/unitFormToPayload.test.ts`** (novo)
   - **O que testa:** vazio vira `undefined`/`null`, o nome é aparado, `total_area` está certo e a ida e volta não perde dado.
   - **Pronto quando:** está verde no vitest.
5. **`components/empreendimento/CaracteristicasAdicionaisTab.tsx`**
   - **O que muda:**
     - O Sheet de unidade passa a usar `UnitFormFields`.
     - Os títulos de seção viram `SecaoTitulo`.
     - Ganha `dirty`.
     - O botão vira "Salvar unidade".
   - **Pronto quando:** Nova e Editar unidade mostram os mesmos campos e salvam.
6. **`components/empreendimento/FloorEditor.tsx`**
   - **O que muda:**
     - Sai o gerador e entra `onFloorsChange`.
     - O cabeçalho vira `SecaoTitulo`.
     - O formulário segue o §30, com rótulos e "Adicionar pavimento".
     - Adicionar e editar mexem no array local, sem `load()`.
     - No `tfoot`, sai o `font-bold`.
     - O toast passa a vir do provider.
   - **Pronto quando:** este grep volta vazio:
     ```
     text-\[10px\]|generateUnitsFromFloors|onUnitsRegenerated
     ```
7. **`components/empreendimento/UnitEditor.tsx`**
   - **Removidos:** o formulário de 13 campos e o acordeão.
   - **Linha do título "Unidades":** "Gerar a partir dos pavimentos (N)", "Gerar em série" e "Nova unidade".
   - **Sheets:** Nova unidade e Gerar em série.
   - **Sem `load()` depois de ações.**
   - **Pronto quando:** este grep volta vazio:
     ```
     genOpen|border-dashed|buildPayload|await load()
     ```
8. **`components/empreendimento/TowerEditor.tsx`**
   - **O que muda:**
     - A raiz passa a `space-y-8`.
     - Terreno ganha título §30 e "Salvar terreno". Só aparece com `empreendimento` e ressincroniza quando o empreendimento muda.
     - Nova torre vira Sheet.
     - Saem `unitKeyByTower` e o toast local.
     - Os pavimentos de cada torre chegam ao UnitEditor.
   - **Pronto quando:** este grep volta vazio:
     ```
     unitKeyByTower|Adicionar Terreno|text-\[10px\]
     ```
9. **`components/torres/EstudoTorresUnidades.tsx`**
   - **O que muda:** só um comentário, dizendo por que o Terreno não aparece ali.
10. **`docs/ui_ux_guia_unificado.md` §30**
    - **O que muda:** uma linha apontando o `SecaoTitulo`.

`EmpreendimentoDetail.tsx` e `TorreCard.tsx` não são tocados. O `TorreCard` também é usado em `ImovibBlocksTypologyTab`.

## Estado

Em 14/10/2026 os 10 itens foram feitos e verificados na frente `feat/torres-unidades-reorganizacao`.

**Publicado em 15/10/2026 no commit `708c9ed7`.** A prova veio de fora:

- **Domínio:** serve o commit carimbado `708c9ed`.
- **Chunk:** `TowerEditor-DvPs9qIp.js` traz "Gerar a partir dos pavimentos", "Salvar terreno", "Gerar unidades em série" e "Adicionar pavimento".
- **Textos antigos:** "Adicionar Terreno" e "Gerar unidades automaticamente" sumiram do chunk.
- **CI:** o check-run `ci` do commit terminou com `success`.

- [x] 1. plano
- [x] 2. SecaoTitulo
- [x] 3. UnitFormFields
- [x] 4. teste do payload (5 casos, verde)
- [x] 5. CaracteristicasAdicionaisTab
- [x] 6. FloorEditor (grep do critério vazio)
- [x] 7. UnitEditor (grep do critério vazio)
- [x] 8. TowerEditor (grep do critério vazio)
- [x] 9. EstudoTorresUnidades
- [x] 10. guia §30

Acréscimos feitos durante a execução:

- **Os três painéis novos montam o conteúdo só quando abertos.** O `Sheet` fechado mantém os filhos no DOM e o leitor de tela alcança os campos invisíveis (memória `sheet-mantem-filhos-montados-fechado`).
- **"Salvar terreno" grava `null` no campo apagado.** Com `undefined`, o valor antigo voltava depois de salvar. O botão agora só liga com alteração, então esse caso aparecia.
- **Harness `docs/spikes/torres-unidades/`.** Tem `index.html`, `main.tsx` e `passeio.mjs`, com o PostgREST servido em memória. São 47 portões e todos passaram.

## Fora do escopo

- Barra de edição em lote do UnitEditor (§10).
- Unificar os dois geradores num só.
- Edição inline de unidade na tabela e do cabeçalho da torre.
- `TorreCard`/`TorreTotais`: o "Total geral" em `font-black uppercase` é compartilhado com a Viabilidade e fica como dívida.
- Migrar `ContractModal.tsx` para `SecaoTitulo`.
- §25 "editar não fecha" no Sheet de Características.

## Verificação

1. Rodar o script de padrão de UI nos arquivos `.tsx` tocados. Esperado: exit 0.
   ```
   bash scripts/check-ui-standard.sh <arquivos>
   ```
2. Rodar o tsc com heap alto e ler o exit por grep.
   ```
   npx tsc --noEmit -p .
   ```
3. Rodar o teste novo.
   ```
   npx vitest run __tests__/unitFormToPayload.test.ts
   ```
4. Rodar o harness com o servidor da frente no ar. Esperado: 47/47 portões e exit 0.
   ```
   node docs/spikes/torres-unidades/passeio.mjs http://127.0.0.1:<porta> <pasta-dos-prints>
   ```
5. Conferir na tela, em 1600 px e 390 px:
   - Terreno, Nova torre, Pavimentos, os dois geradores e Nova unidade.
   - As telas de estudo (Viabilidade e Planta IA), que devem ficar sem Terreno.
   - Características Adicionais, para pegar regressão.
