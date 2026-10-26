# Planta Inteligente — construir pelos dados do Empreendimento (Casa + Massa)

## Pedido original

> incorporação > planta inteligente: construir atraves dos dados importador de incorporação > empreendimento

> verifique se casa automatica faz isso

Sessão: 31b737ae-236b-4eef-9b15-3842d0f3affa · 25/10/2026

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 25/10/2026 | O que a Planta deve construir a partir dos dados do Empreendimento? (Casa e Massa / só Casa em 1 clique / só Massa pelas torres / outro importador) | **Casa e Massa** |

## O que já existia (verificado no `origin/main` 1290af3a)

- **Casa automática** já lia do Empreendimento vinculado: o lote pela ficha (só pelo botão "Criar lote pela
  ficha" em Dados do lote), a zona única aplicada sozinha, a UF para o CUB e o programa pela unidade
  escolhida à mão no seletor (`programaCurtoDaUnidade`; a F15 devolve a casa para essa unidade). Eram 4–5
  passos em duas telas, e a unidade não era escolhida sozinha nem quando havia uma só.
- **Gerar massa** partia do **Produto** do estudo, com tipologias e mix digitados ou tirados de semente
  de mercado. Não lia as Torres & Unidades; a ponte só ia Planta → Empreendimento
  (`services/massaEmpreendimentoSync.ts`).
- Não existe tela "importador" no Empreendimento. A fonte é o que mora nele: ficha do terreno, zonas e
  Torres & Unidades.

## Plano

### Parte A — Produto da massa pelas Torres & Unidades

1. **`utils/blueprintProdutoDoEmpreendimento.ts`** (novo, puro): `produtoDoEmpreendimento(torres, atual)`.
   - Ficam fora as unidades com `blueprint_massa_chave` (nasceram da massa; reimportar seria laço) e com
     `blueprint_lote_uid` (lotes do loteamento). As duas exclusões aparecem nos avisos.
   - Agrupamento por `typology`, ou por `"<n> dorm."` quando não há tipologia.
   - `uso` é COMERCIAL quando o texto casa com sala/loja/comercial.
   - `dormitorios` é a moda; área privativa e vagas são médias; a proporção é a contagem no uso; o preço
     é a média de price ÷ área.
   - `metaUnidades` é o total de unidades. Sem unidades, vale `floors_count × units_per_floor`, dito no aviso.
   - Padrão, hipóteses e financeiro vêm do atual. O padrão só muda se a tipologia o nomeia (R8/R16-B/N/A).
   - Sem nada aproveitável: `produto: null` com o motivo.
   - **Pronto quando:** `__tests__/blueprintProdutoDoEmpreendimento.test.ts` passa.
2. **`hooks/useUnidadesDoEmpreendimento.ts`** (novo): carrega as torres com unidades
   (`getById(..., { includeChildren: true })`), com a flag `vivo` contra setState depois de desmontar.
   A Casa e o Produto usam o mesmo hook.
   - **Pronto quando:** o editor deixa de ter o carregamento próprio da Casa e a suíte do editor passa.
3. **`components/blueprint/TelaProduto.tsx`**: botão "Importar do Empreendimento".
   - Desligado, diz o motivo.
   - Com tipologias, confirma antes de substituir (`useConfirm`).
   - Mostra os avisos.
   - **Pronto quando:** o teste de componente cobre desligado com motivo e substituir com confirmação, e
     `check-ui-standard.sh` passa.
4. **`components/blueprint/BlueprintEditor.tsx`**: com o vinculado e o Produto vazio já carregado,
   preenche sozinho uma vez por abertura e avisa. Produto com conteúdo nunca é sobrescrito sozinho.
   - **Pronto quando:** a conferência no app mostra o Produto preenchido igual às unidades.

### Parte B — Casa em um clique

5. **`utils/blueprintCasaPeloEmpreendimento.ts`** (novo, puro): `passosDaCasaPeloEmpreendimento(...)`
   devolve LOTE/ZONA/UNIDADE/GERAR, cada um com estado FEITO/FAZER/PERGUNTAR/FALTA e motivo.
   - A profundidade ambígua da ficha vira PERGUNTAR.
   - Programa mexido não escolhe unidade sozinho.
   - **Pronto quando:** `__tests__/blueprintCasaPeloEmpreendimento.test.ts` passa.
6. **`components/blueprint/TelaCasaAutomatica.tsx`**: bloco "Dados do Empreendimento" com os passos e o
   botão "Construir pelo Empreendimento".
   - O botão fica desligado quando há FALTA e diz o quê.
   - Executa os FAZER e para no PERGUNTAR.
   - "Lançar" continua manual.
   - **Pronto quando:** o teste de componente passa e `check-ui-standard.sh` passa.
7. **`components/blueprint/BlueprintEditor.tsx`**:
   - `lancarLote` é extraído do `onLancar` do lote digitado (uma função só).
   - O lote retangular sai da ficha. A orientação não está na ficha, então fica o padrão e um aviso.
   - A unidade única é escolhida sozinha quando o programa é o padrão.
   - O gerar é encadeado por efeito depois do lote.
   - **Pronto quando:** a conferência no app gera a prévia num clique.

### Fora do escopo (dito, não feito)

- Número de torres e de pavimentos como restrição da varredura do Gerar massa. Só a meta entra.
- Casa para várias unidades (condomínio de casas).
- Orientação e coordenadas do lote: a ficha não tem esses dados.

## Mudanças de rumo durante a execução (25/10/2026)

- **Item 7, `lancarLote`:** a função não foi extraída do `onLancar` do lote digitado. O botão usa o mesmo núcleo, `comandosDoLote`, mas sem os efeitos de tela do painel (confirmar a substituição, enquadrar). Como o botão só lança quando o pavimento ainda não tem lote, não há substituição a confirmar.
  - Prova: o teste "lançado no desenho…" em `blueprintCasaPeloEmpreendimento.test.ts` lança e mostra que `motivoParaNaoGerar` fica nulo, com a FRENTE vindo junto.
- **Itens 5 e 7, unidades elegíveis da Casa:** a Casa continua oferecendo todas as unidades, como o seletor da F15. Na Casa, lote do loteamento É unidade (uma casa por lote). A exclusão de massa e loteamento vale só para o Produto (Parte A).

## Estado

- [x] 1 — `utils/blueprintProdutoDoEmpreendimento.ts` + 10 testes
- [x] 2 — `hooks/useUnidadesDoEmpreendimento.ts`; o efeito próprio da Casa no editor saiu
- [x] 3 — TelaProduto: botão, motivo, confirmação, avisos (`__tests__/components/TelaProdutoImportar.test.tsx`, 5 testes)
- [x] 4 — preenchimento automático do Produto vazio no editor (conferido no app, item 3 abaixo)
- [x] 5 — `utils/blueprintCasaPeloEmpreendimento.ts` + 13 testes
- [x] 6 — TelaCasaAutomatica: bloco de passos e botão (4 testes novos em `TelaCasaAutomatica.test.tsx`)
- [x] 7 — editor: construir encadeado (conferido no app, itens 1 e 2 abaixo)

### Conferência no app real (25/10/2026)

Roteiro: `c:/tmp/pwtest/conferencia-pelo-emp.cjs`, com login do agente-leitura e escrita autorizada ("Sim, crie e apague"). Usou um Empreendimento descartável (ficha 12 × 30, unidade "Casa 07" 3Q R1-N) e uma planta vazia vinculada a ele, no dev server da frente. Todos os 13 portões passaram:

1. Na tela da Casa, a unidade única entrou sozinha (dormitórios = 3). O lote apareceu como "o botão faz" (12,00 × 30,00 m). A zona apareceu como "aviso" (o Empreendimento não tem zona).
2. Um clique em "Construir pelo Empreendimento" lançou o lote de 360 m² e gerou a prévia; o passo do lote virou "feito".
3. O Produto, que estava vazio, foi preenchido sozinho: tipologia "3Q R1-N", 150 m², 2 vagas, mix 100 % e meta 1. O botão Importar ficou ligado.
4. O produto ficou gravado no estudo.
5. Limpeza: estudo ARQUIVADO, Empreendimento e torres apagados (0 e 0, conferido no banco). Nenhum erro de página, console ou HTTP.


## Verificação

1. Rodar os testes novos e os de componente tocados; ler a saída antes do push.
2. `bash scripts/check-ui-standard.sh` nos `.tsx` tocados.
3. PR de rascunho → CI verde → merge.
4. Conferência no app real, com planta descartável e só leitura no Empreendimento.
5. `conferir-producao.sh` com o texto novo.
