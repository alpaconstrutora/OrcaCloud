# Ambiente: uso do cômodo × disciplinas (o cartão deixa de ser da elétrica)

## Pedido original

> incorporacao < planta inteligente < painel lateral ambiente (veja print): parece que o
> ambiente ficou misturado com eletrica. Ambiente nao esta vinculado a apenas eletrica, mas
> tambem hidraulica, climatizazacao etc. Avalie

Sessão `59c128e3-484a-4b0f-a522-94d85c0d07de` · 14/10/2026.

O print mostra o cartão de cada ambiente (seção Ambientes do painel lateral) com: `Tipo` (A
classificar), "NBR 5410: classifique o ambiente para conferir o mínimo de tomadas.", a linha
de Iluminação em VA, "Completar pela norma", "2 tomadas neste ambiente · Distribuir" — e só
depois Unidade, Área/Perímetro, Piso/forro e "Liga-se a".

Pedido seguinte, no mesmo dia, depois da avaliação (F1 = tela, F2 = modelo):

> 1. Antes de mexer, eu abriria uma frente nova a partir do main e registraria o plano em
>    docs/planos/: ok.
> 2. Faço só a F1 ou as duas (F1 e depois F2)? as duas (F1 e depois F2)

## Diagnóstico (lido em `origin/main` @ `dee77095`)

1. **Tela.** O cartão chama `controlesDeTomadas(a)` (`BlueprintEditor.tsx`), a mesma função da
   gaveta "Tomadas pela NBR 5410" (ribbon › Instalações). Tudo da elétrica — conferência
   9.5.2, luz de teto, Completar pela norma, Distribuir — aparece no cartão do ambiente; a
   hidráulica e a climatização não aparecem.
2. **Modelo.** O único "tipo" do ambiente é `SpaceLabel.tipoDeAmbiente`, que o kernel define
   como *"a divisão que a NBR 5410 usa"*: 5 baldes (`BANHEIRO`, `COZINHA_SERVICO`, `VARANDA`,
   `SALA_DORMITORIO`, `OUTRO`). ~20 módulos leem esse campo, e os que precisam de mais do que
   5 baldes adivinham pelo NOME — o que o próprio comentário do kernel proíbe:
   - hidráulica: cozinha × área de serviço por `/serv|lavand/` no nome; o lavabo só pode ser
     `BANHEIRO` e recebe o kit com chuveiro;
   - climatização: `usoDoAmbiente(nome, tipo)` — nome primeiro (sala × dormitório muda a carga);
   - departamentos: regex de nome primeiro.
3. **O vocabulário fino já existe** e se perde na gravação: `USOS_DO_AMBIENTE` (13 usos) em
   `utils/blueprintPrograma.ts`, com `FICHA_DO_USO[uso].tipoNbr5410`. O gerador, a planta da
   unidade e o rastreio CONHECEM o uso e gravam só o tipo NBR 5410.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 14/10/2026 | Abrir frente e registrar plano antes de mexer? | ok |
| 14/10/2026 | Só F1 (tela) ou F1 e depois F2 (modelo)? | as duas, F1 e depois F2 |

## Decisões de desenho (minhas, registradas para conferência)

- **O uso é a fonte; o tipo NBR 5410 é derivado.** `SpaceLabel.uso?` guarda o uso (13
  valores). Com uso declarado, `tipoDeAmbiente` é SEMPRE `TIPO_NBR5410_DO_USO[uso]` —
  invariante do kernel. O campo `tipoDeAmbiente` continua gravado: os ~15 consumidores que só
  precisam dos 5 baldes da norma não mudam, e o estudo antigo (tipo sem uso) segue válido.
- **Estudo antigo** (tipo sem uso): o seletor mostra o tipo antigo como opção "(antigo)" até o
  usuário escolher um uso. Nada é migrado em silêncio.
- **Comandos.** `NameSpace`, `PlaceSpaceLabel(s)` e `SetSpaceLabelProps` aceitam `uso`. Uso
  presente → tipo derivado (tipo explícito divergente = erro). Só tipo → o uso que não bate
  com ele cai (volta ao modo antigo, dito).
- **Cartão do ambiente = identidade do cômodo.** Nome, uso, unidade, área/perímetro,
  piso/forro, ligações. Cada disciplina vira UMA linha de situação, que abre a gaveta dela:
  Elétrica (tomadas/iluminação 9.5.2), Hidráulica (kit de pontos), Climatização (uso da carga
  térmica). Distribuir/Completar ficam só na gaveta de tomadas.

## Plano

### F1 — o cartão do ambiente (tela)

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| F1.1 | `components/blueprint/BlueprintEditor.tsx` | O cartão do ambiente deixa de chamar `controlesDeTomadas`; fica com o seletor de classificação + linhas por disciplina. A gaveta "Tomadas" mantém `controlesDeTomadas` inteiro. | No cartão não há "Completar pela norma", "Distribuir" nem a linha de VA; na gaveta Tomadas há. Teste de componente cobre os dois. |
| F1.2 | `components/blueprint/SituacaoDoAmbiente.tsx` (novo) | Linhas "Elétrica · Hidráulica · Climatização" com o estado de cada uma e botão que abre a gaveta da disciplina. | Teste de componente: estados atende/falta/sem classificação, e o clique chama a abertura da gaveta certa. |
| F1.3 | `__tests__/components/BlueprintEditor.test.tsx` | Testes que procuravam os controles de tomadas no cartão passam a procurá-los na gaveta. | Suíte do editor verde. |
| F1.4 | prova no app | Abrir a Planta, seção Ambientes, ver o cartão novo; clicar em cada linha abre a gaveta. | Print do cartão. |

### F2 — o uso no modelo (kernel 0.101.0 → 0.102.0)

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| F2.1 | `utils/blueprintKernel/model.ts` | `USOS_DO_AMBIENTE`/`UsoDoAmbiente` passam a morar no kernel, com `TIPO_NBR5410_DO_USO`; `SpaceLabel.uso?`; invariante (uso válido; tipo = derivado do uso). | Teste de kernel: uso inválido e tipo divergente recusados. |
| F2.2 | `utils/blueprintKernel/commands.ts` | `uso` em `NameSpace`, `PlaceSpaceLabel(s)`, `SetSpaceLabelProps`; cópia de grupo leva o uso. | Testes: uso grava e deriva o tipo; só tipo derruba uso divergente; renomear não mexe no uso; Ctrl+Z. |
| F2.3 | `utils/blueprintKernel/canonical.ts` | `uso` no canônico só quando há (hash de desenho antigo só muda pela versão); leitura de volta. | Teste ida-e-volta; goldens só mudam pela string da versão. |
| F2.4 | `utils/blueprintKernel/units.ts` | `KERNEL_VERSION` 0.102.0 com a nota do bump. | Testes de kernel/goldens passam com a string antiga antes do bump (registrar a contagem). |
| F2.5 | `utils/blueprintPrograma.ts` | Reexporta o uso do kernel; `FICHA_DO_USO[...].tipoNbr5410` vem de `TIPO_NBR5410_DO_USO`; `usoDoAmbiente` aceita o uso declarado (vence nome e tipo). | Teste: declarado vence o nome. |
| F2.6 | `utils/blueprintPontosHidraulicos.ts` | `kitDoAmbiente` lê o uso: ÁREA DE SERVIÇO → kit de serviço, LAVABO → kit novo (vaso + lavatório, sem chuveiro). Sem uso, a heurística antiga. | Testes: lavabo sem chuveiro; serviço pelo uso mesmo com nome "Ambiente 3". |
| F2.7 | `utils/blueprintClimatizacaoAmbientes.ts`, `utils/blueprintCargaTermica.ts`, `components/blueprint/PainelClimatizacao.tsx` | O contexto do ambiente leva o uso declarado; ele vence o nome. | Teste: "Ambiente 1" declarado DORMITORIO usa o padrão do dormitório. |
| F2.8 | `utils/blueprintDepartamentos.ts` | Sugestão lê o uso declarado antes do nome. | Teste. |
| F2.9 | `utils/blueprintGerador.ts`, `utils/blueprintPlantaDaUnidade.ts`, `utils/blueprintRastrear.ts` | Gravam o `uso` que já conhecem (o tipo sai derivado). | Testes do gerador: etiqueta nasce com uso. |
| F2.10 | `components/blueprint/BlueprintEditor.tsx` | O seletor do cartão (F1) passa a ser "Uso" (13 opções, agrupadas); mostra o tipo NBR 5410 derivado como informação. Estudo antigo: opção "(antigo)". | Teste de componente; prova no app. |
| F2.11 | bundle da planta-api | `node scripts/build-planta-api-kernel.mjs` como ÚLTIMO passo; `plantaApi.test.ts` na re-rodada. | `plantaApi.test.ts` verde. |

## Estado

- [x] F1.1 — cartão sem `controlesDeTomadas`; `seletorDoTipo` separado (cartão + gaveta Tomadas)
- [x] F1.2 — `utils/blueprintSituacaoDoAmbiente.ts` (11 testes) + `SituacaoDoAmbiente.tsx` (1 teste)
- [x] F1.3 — teste novo no editor ("Cartão do ambiente (14/10/2026)…"); `BlueprintEditor.test.tsx` + `DistribuirTomadas.test.tsx` 269/269; `tsc` rc=0; `check-ui-standard.sh` sem violação nos dois `.tsx`
- [x] F1.4 — prova no app (autorizada 14/10): `c:/tmp/pwtest/conferencia-ambiente-uso.cjs`, dev server
  da frente, planta descartável criada pelo serviço e ARQUIVADA no fim (status conferido). 18/18 portões:
  cartões sem Completar/Distribuir/VA; três disciplinas; desenho antigo mostra "(antigo)"; "Ambiente 2"
  declarado dormitório = climatizado pelo uso; troca para Lavabo → "kit lavabo: 0 de 5 pontos" e gaveta sem
  chuveiro; cada linha abre a sua gaveta; a de Tomadas diz "Na NBR 5410 conta como: banheiro"; sem erro de
  página/console/HTTP. O print achou dois defeitos que os testes não pegavam — "faltam 1 tomada" e o texto
  cortado com reticências no painel estreito — corrigidos (concordância + quebra de linha) e a prova repetida.
- [x] F2.1 — `USOS_DO_AMBIENTE`, `TIPO_NBR5410_DO_USO`, `SpaceLabel.uso?`, invariante, `classificacaoDoAmbiente` (regra única)
- [x] F2.2 — `uso` em `NameSpace`/`PlaceSpaceLabel(s)`/`SetSpaceLabelProps` via `aplicarClassificacao`; cópia de grupo leva o uso
- [x] F2.3 — canônico: `uso` só quando há; ida e volta testada
- [x] F2.4 — 0.102.0. Antes do bump, string em 0.101.0: 4.563 testes de blueprint/planta passaram (4.588 = 4.563 + 25 pulados). Depois: as 6 falhas dos goldens foram só de hash, uma vez cada; hashes e nota atualizados; 23 testes com a string da versão atualizados
- [x] F2.5 — Programa reexporta o vocabulário do kernel; `FICHA_DO_USO[u].tipoNbr5410` montado de `TIPO_NBR5410_DO_USO`; `usoDoAmbiente(nome, tipo, declarado)`
- [x] F2.6 — kit pelo uso; kit novo LAVABO (vaso + lavatório); teste "o USO declarado decide"
- [x] F2.7 — `ContextoDoAmbiente.uso` em `premissasDoAmbiente`, carga térmica e `PainelClimatizacao`
- [x] F2.8 — `sugerirDepartamento(nome, tipo, uso)` — o uso vence o nome
- [x] F2.9 — gerador (3 pontos), planta da unidade e rastreio gravam `uso`; teste no `blueprintGeradorContorno`
- [x] F2.10 — seletor "Uso" (13 opções) no cartão e na gaveta Tomadas; desenho antigo mostra "(antigo — escolha o uso)"; a gaveta diz "Na NBR 5410 conta como…"; teste do editor troca para lavabo e vê "kit lavabo: 0 de 5 pontos"
- [x] F2.11 — bundle regerado depois da última edição de kernel (`node scripts/build-planta-api-kernel.mjs`)

Fora do escopo (registrado, não feito): o IFC exporta só o tipo NBR 5410 (`SpaceKind`), não o uso;
`PainelAcabamentos` agrupa "do mesmo tipo" pelo tipo NBR 5410.

## Verificação

- `npx tsc --noEmit` (exit lido por grep) e a suíte de blueprint/planta.
- `bash scripts/check-ui-standard.sh` nos `.tsx` tocados.
- Prova no app: Planta › seção Ambientes — cartão sem controles de tomada, linhas por
  disciplina abrindo as gavetas; seletor de uso gravando e a hidráulica lançando o kit de
  lavabo sem chuveiro.
