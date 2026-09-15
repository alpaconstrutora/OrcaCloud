# Pré-dimensionamento elétrico com hipóteses declaradas — PLANO (item 6)

## Pedido original

> Quais pendências / lacunas você recomenda atacarmos ?
> Comece por 3 e na sequência faça um plano para o 6

O item 6 da lista que propus em 13/09/2026:

> **Pré-dimensionamento elétrico com hipóteses declaradas** — corrente por
> circuito (VA ÷ V), seção mínima pela tabela da 5410, disjuntor coerente com a
> seção, queda de tensão estimada. Deixamos fora por ser "projeto com ART", mas
> a topografia mostrou o caminho aceitável: *pré-dimensionamento com hipóteses
> escritas + fluxo de emissão pelo responsável técnico*.

O item 3 (tipo do ambiente no IFC) foi feito antes deste plano — `3075323f`.

## Status de implementação — 13/09/2026

Respostas do usuário ao §8: *"1. vou testar · 2. enviado as Tabelas 36, 40,
42 e 47 · 3. uma tabela de projeto executivo com disciplina"*.

| fatia | estado | onde |
|---|---|---|
| F1 corrente de projeto | ✅ | `Circuito.ligacao` (kernel 0.27.0 → **0.28.0**), `correnteDeProjetoA` |
| F2 seção mínima | ✅ | Tabelas **36, 40, 42, 47 transcritas do PDF** (páginas citadas no código; pontos conferidos em teste), `secaoMinima` com f_temp × f_agrup |
| F3 disjuntor | ✅ | `disjuntorSugeridoA` (IB ≤ In ≤ Iz), "usar sugerido" na tela |
| F4 queda de tensão | ✅ | `quedaDeTensaoPct` com L **pelos eletrodutos** (caminho mais longo a partir do quadro) ou **estimado** — dito |
| F5 DR | ✅ | `Circuito.protecaoDR`, regra **5.1.3.2.2** na conferência (banheiro, cozinha/serviço, varanda, chuveiro) |
| F6 quadro/alimentador | ✅ | `Quadro.ligacao/tensaoV/alimentadorM` (kernel **0.28.0 → 0.29.0**); `preDimensionarQuadroCompleto`: carga por grupo, **demanda como hipótese nomeada** (padrão "sem demanda (1,00)"), IB/seção/disjuntor geral do alimentador, **queda da origem = alimentador + pior terminal** (6.2.7.1, limite 5 %), balanceamento R/S/T só em quadro trifásico (FN sem fase fica FORA e é dito). Bloco "Alimentação" sob a tabela de cada quadro |
| F7 emissão com ART | ✅ | migration `aplicar_20270921000018` **aplicada e conferida de fora**: `blueprint_study_eletrica` (hipóteses por estudo — saíram do navegador) e `blueprint_study_projeto_executivo.disciplina` (`TERRAPLENAGEM` \| `ELETRICA`, índice de rascunho por estudo+disciplina). `verificacoesEletricas` (responsável, ART, dados completos, cada regra da 5410, cada circuito, cada quadro), `hashDaBaseEletrica` = canônico do desenho + hipóteses, `memorialEletrico` em PDF. Hook e service da topografia reusados com `disciplina` |
| F8 prancha | ✅ | **Conferido: a exportação não desenhava NENHUM símbolo elétrico.** Nova prancha "Elétrica" no painel de versões (PDF/PNG/DXF): `utils/blueprintPranchaEletrica.ts` (`desenharEletrica`) — símbolos NBR 5444 em mm de papel por cima da planta (tomada = triângulo vazio/meio/cheio por cota; interruptor por variante; LD; luz com potência; eletroduto contínuo ou **tracejado no piso** com traços dos condutores e `Ø25 #2,5`; quadro), rótulo `SIGLA · C1` e letra de comando. **Segunda folha** com quadro de cargas por quadro (IB, seção decl./mín., disjuntor decl./sug., ΔV, DR, achados em vermelho), linha do alimentador, hipóteses e legenda **só das famílias presentes**. PDF = 2 páginas; PNG = 2 arquivos (`-quadro-de-cargas`); DXF = camadas `PLANTA-ELETRICA` / `PLANTA-ELETRICA-TEXTO` + quadro de cargas em texto abaixo da planta. Sem `eletrica`, a planta arquitetônica sai byte a byte igual (teste) |
| F9 eletroduto | ✅ | `ocupacaoDoEletroduto` / `ocupacaoDoTrecho` (53 / 31 / 40 %, 6.2.11.1.6) com **diâmetro externo do condutor e interno do eletroduto como hipótese** (`diametroExternoCondutorMm`, `diametroInternoEletrodutoMm` — catálogo típico, em `HipotesesEletricas`, ainda sem edição na tela); regra **6.2.11.1.6** na Conferência NBR 5410 (onze regras) sugerindo o Ø comercial seguinte; linha "Ocupação do eletroduto" no painel do trecho elétrico |

**F8–F9 — o que os testes/harness pegaram antes de publicar**: harness
`docs/spikes/prancha-eletrica/` (A3 1:50, os dois canvases, olhado): potência
da LD por cima do rótulo e haste do interruptor por cima de "Int · C1" —
potência foi para baixo e haste para a esquerda; catálogo de diâmetros
declarado depois de `HIPOTESES_PADRAO` (TDZ) — reordenado.

**F6–F7 — o que os testes/harness pegaram antes de publicar**: `AddQuadro` não gravava os campos novos (só o `SetQuadroProps`) — o teste F6 caiu; o memorial escrevia "2.5 mm²" com ponto — o teste do memorial caiu; a soma de queda 6.2.7.1 tinha de ser alimentador **+** pior terminal (um cenário do teste estourava o terminal sozinho e foi refeito). Harness com C1 certo, C2 errado, alimentador de 10 m e a emissão com 3 pendências — olhado.

**Na tela**: sob cada circuito, a linha de declarações (tensão, ligação, DR —
tensão **não tinha campo nenhum** até aqui, o que deixava 9.5.3.1/9.5.3.3
sempre "não avaliado") e a linha do pré-dimensionamento: IB, seção mínima,
In sugerido, ΔV, achados em vermelho com o item da norma, "usar sugerido".
Painel recolhível de hipóteses. Regra **PRE-DIM** na Conferência NBR 5410.

**Achados do harness antes de publicar**: a linha nova alargava a tabela e
cortava a coluna Carga (`table-fixed` + larguras no cabeçalho); números com
ponto nas mensagens (agora vírgula).

**Verificação**: `blueprintEletricaDimensionamento` 23/23 (inclui os pontos
das tabelas contra o PDF) · `blueprintNbr5410DrEPreDim` 6/6 ·
`PainelEletricaPreDim` 5/5 · goldens 7/7 (neutras em 0.27.0 antes do bump) ·
suíte 4.009 · build OK · harness olhado (quadro com C1 correto e C2 errado).

---

O texto abaixo é o plano original, mantido como foi escrito.

---

## 1. A fronteira — a mesma da topografia

Hoje o módulo **soma e confere**: quadro de cargas soma VA declarados; a
Conferência NBR 5410 lê o que foi declarado (tipo do ambiente, potência,
circuito, tensão, disjuntor, seção) e acusa o que fere a norma. Ele **não
calcula** seção, disjuntor nem queda de tensão — "somar é registro, decidir é
projeto".

A topografia (fases 7 e 17) mostrou como cruzar essa linha sem mentir:

1. **pré-dimensionamento com hipóteses declaradas e editáveis** — métodos de
   manual, com os números que a tela cita (`blueprintTopografiaDimensionamento.ts`);
2. **emissão executiva pelo responsável técnico** — nome, conselho, registro,
   ART/RRT; verificações refeitas com os fatores de norma; registro **imutável**
   amarrado ao hash da base (`blueprint_study_projeto_executivo`,
   `blueprintTopografiaExecutivo.ts`).

Aqui é o mesmo desenho: o software **propõe e verifica** pela NBR 5410, com
toda hipótese escrita ao lado do número; o responsável **decide e assina**. A
tela chama de **pré-dimensionamento**, nunca de "dimensionamento".

## 2. O que já existe e é reaproveitado

| já existe | onde | serve para |
|---|---|---|
| `Circuito { tipo, tensaoV, disjuntorA, secaoMm2 }` | kernel | os DECLARADOS que serão confrontados com o calculado |
| `Terminal.potenciaW` (rótulo VA), `tipoEletrico` | kernel | carga por circuito; separar iluminação / tomada / força |
| `Trecho.circuitoId`, `condutores`, `comprimentoDoTrecho` (caminho em L) | kernel / `blueprintRede` | **comprimento do circuito** para a queda de tensão |
| `quadroDeCargas()` | kernel | soma por circuito e por quadro — ganha as colunas novas |
| `conferirNbr5410()` (8 regras) | `blueprintNbr5410.ts` | recebe as regras novas (5.3.4.1, 6.2.7, 5.1.3.2.2, Tab. 47) |
| `SpaceLabel.tipoDeAmbiente` | kernel | banheiro / cozinha-serviço → DR obrigatório |
| `blueprint_study_terraplenagem` (premissas em JSONB) | banco | molde da tabela de hipóteses |
| `blueprint_study_projeto_executivo` + `blueprintTopografiaExecutivo.ts` | banco / utils | molde do fluxo de emissão com ART |

## 3. As fatias

Cada fatia é publicável sozinha e útil sozinha. Ordem = dependência.

### F1 — Corrente de projeto por circuito (IB)

- `Circuito.ligacao`: **`FN` | `FF` | `FFF`** (fase-neutro, fase-fase,
  trifásico). Campo novo no kernel, omitido quando ausente (padrão `FN`);
  bump `0.27.0 → 0.28.0` pelo ritual das goldens.
- IB = S ÷ V (FN e FF); IB = S ÷ (√3 · V) (FFF). S = soma dos VA declarados
  do circuito. **Sem fator de potência**: a potência já entra em VA
  (aparente) — foi por isso que W virou VA na fatia 2.
- **Sem fator de demanda no circuito terminal**: a norma dimensiona o
  circuito pela carga que ele pode alimentar. Demanda entra só no quadro (F6).
- Saída: coluna **IB** no quadro de cargas; ponto sem potência continua
  marcado — a soma é incompleta e a coluna diz "≥".

### F2 — Seção mínima do condutor

Três exigências, a maior vence, cada uma com a referência escrita:

1. **por uso** (NBR 5410 Tabela 47): iluminação 1,5 mm²; força/tomadas
   2,5 mm² — o `tipoEletrico` dos pontos do circuito decide o grupo;
2. **por capacidade de corrente** (Tabela 36 — cobre, isolação PVC 70 °C,
   método de instalação **B1** = eletroduto embutido em alvenaria, o caso de
   toda a rede que desenhamos): 2 condutores carregados para FN/FF, 3 para
   FFF. Iz ≥ IB ÷ (f_temp · f_agrup);
3. **fatores de correção declarados**: temperatura ambiente (Tabela 40,
   padrão 30 °C → 1,00) e agrupamento (Tabela 42, padrão 1 circuito por
   eletroduto → 1,00). O agrupamento pode ser **derivado do desenho** quando
   dois trechos de circuitos diferentes ocupam o mesmo eletroduto — fica
   como melhoria; na F2 é hipótese editável.

Saída: **seção calculada** ao lado da declarada; declarada menor que a
calculada → falta na conferência (nova regra "6.2.5 / Tab. 36+47").

⚠️ **As tabelas serão transcritas da norma, não de memória.** Os valores que
eu citaria de cabeça (B1/PVC/2 cond.: 1,5→17,5 A; 2,5→24; 4→32; 6→41; 10→57;
16→76; 25→101; 35→125) batem com o que conheço, mas antes de publicar peço
que você cole as Tabelas 36, 40, 42 e 47 — ou confiro contra o texto que
tiver. Um número errado aqui sai "plausível" numa prancha.

### F3 — Disjuntor coerente (5.3.4.1)

- Regra: **IB ≤ In ≤ Iz** (e I2 ≤ 1,45 · Iz, atendida por disjuntor
  DIN curva B/C — hipótese declarada).
- Catálogo comercial declarado: 6, 10, 16, 20, 25, 32, 40, 50, 63 A.
- **In sugerido** = menor In do catálogo com IB ≤ In ≤ Iz. Sugerido, não
  gravado: o campo `disjuntorA` continua sendo o que o projetista declara;
  o botão "usar sugerido" preenche e a origem fica registrada
  ("sugerido pela 5.3.4.1 em …").
- Conferência: declarado fora da faixa → falta, com os três números.

### F4 — Queda de tensão (6.2.7)

- ΔV% = 2 · ρ · L · IB ÷ (S · V) · 100 (FN/FF); √3 · ρ · L · IB ÷ (S · V) · 100 (FFF).
  ρ do cobre a 70 °C **declarado** (padrão 0,0217 Ω·mm²/m — hipótese editável,
  com a alternativa 1/56 a 20 °C).
- **L = comprimento do circuito até o ponto mais distante**: caminho mais
  longo a partir do quadro pelos eletrodutos do circuito (`comprimentoDoTrecho`
  em L, já com prumadas). Quando a rede do circuito não está ligada ao quadro
  (trechos soltos), cai para a **distância em planta do quadro ao ponto mais
  distante + cotas** e a tela diz "estimado sem eletroduto" — nunca um número
  calado.
- Limite **declarado**: 4 % no circuito terminal (padrão); 5 % / 7 % da
  origem conforme alimentação por rede pública / transformador próprio —
  hipótese do quadro (F6).
- Saída: coluna **ΔV %**; acima do limite → falta, com a seção que atenderia.

### F5 — Proteção DR (5.1.3.2.2)

- `Circuito.protecaoDR: boolean | null` (kernel, no mesmo bump da F1).
- Obrigatório (30 mA) para circuito que alimenta **tomada em banheiro,
  cozinha/serviço, área externa** ou **chuveiro/aquecedor** — o
  `tipoDeAmbiente` da fatia 1 e o `LIGACAO_DIRETA` da fatia 3 já dizem quais.
- Conferência: obrigatório e não declarado → falta; declarado `false` onde
  é obrigatório → falta com a referência.

### F6 — Quadro e alimentador

- **Demanda** por quadro: fator de demanda por grupo de carga (iluminação,
  TUG, força), **padrão 1,00** (sem demanda) e presets editáveis — a tabela
  de demanda é da concessionária, não da 5410, e por isso entra como
  hipótese nomeada ("preset: NT da concessionária X"), nunca como verdade
  do software.
- Corrente do alimentador, seção pela mesma F2, disjuntor geral pela F3,
  ΔV do alimentador pelo comprimento declarado (o quadro de medição não
  está no desenho).
- FFF: **balanceamento de fases** — cada circuito FN ganha a fase
  (`R|S|T`) declarada; a tela mostra a carga por fase e avisa desequilíbrio
  > 10 % (aviso, não falta).

### F7 — Emissão executiva com ART (o molde da topografia)

- Reusar `blueprint_study_projeto_executivo` com uma coluna
  **`disciplina TEXT NOT NULL DEFAULT 'TERRAPLENAGEM'`** (`'ELETRICA'` aqui)
  e o índice parcial de rascunho refeito por `(study_id, disciplina)` —
  um fluxo de emissão, N disciplinas.
- Hipóteses do estudo em `blueprint_study_eletrica` (JSONB, molde da
  terraplenagem): ρ, temperatura, agrupamento, catálogo de disjuntores,
  limites de ΔV, presets de demanda, curva do disjuntor.
- Emitir exige: responsável (nome, conselho, registro, ART), **zero faltas**
  na conferência 5410 e no pré-dimensionamento, ponto sem potência = zero.
  Registro **imutável**, amarrado ao `snapshotHash` + hash das hipóteses;
  mudou o desenho, a emissão deixa de valer e a tela diz.
- **Memorial em PDF**: quadro de cargas completo (IB, seção calc./decl.,
  In sugerido/decl., ΔV, DR, fase), hipóteses, verificações com a
  referência de norma, carimbo do RT.

### F8 — Prancha elétrica (a lacuna que apontei e não conferi)

- Conferir se a exportação PDF/DXF leva os símbolos elétricos, a **legenda**
  e o **quadro de cargas** em tabela. O que faltar entra aqui: legenda dos
  símbolos usados (NBR 5444), quadro de cargas como tabela na folha, lista
  de circuitos por eletroduto.

### F9 — Taxa de ocupação do eletroduto (6.2.11.1.6) — opcional

- 53 % (1 condutor), 31 % (2), 40 % (3 ou mais). Com `bitolaMm` do trecho,
  `condutores` e a seção do circuito, a conferência acusa eletroduto
  subdimensionado e sugere o Ø comercial seguinte. Pequeno e útil.

## 4. Onde cada coisa mora

| camada | arquivo |
|---|---|
| cálculo puro | **`utils/blueprintEletricaDimensionamento.ts`** (novo): tabelas da norma como constantes nomeadas com a referência, `correnteDeProjeto`, `secaoMinima`, `disjuntorSugerido`, `quedaDeTensao`, `comprimentoDoCircuito`, `demandaDoQuadro`, `ocupacaoDoEletroduto` |
| hipóteses | `HIPOTESES_PADRAO` no mesmo arquivo + `blueprint_study_eletrica` (JSONB) |
| conferência | regras novas em `blueprintNbr5410.ts` |
| tela | colunas no `PainelEletrica`; painel "Hipóteses do pré-dimensionamento" (recolhido, como o da topografia); "usar sugerido" por circuito |
| emissão | `utils/blueprintEletricaExecutivo.ts` (molde do `…TopografiaExecutivo.ts`), aba Elétrica no painel de projeto executivo |
| kernel | `Circuito.ligacao`, `Circuito.protecaoDR`, `Circuito.fase` — omitidos quando ausentes; **um** bump (0.28.0) para os três |

## 5. Prova de cada fatia

| fatia | portão |
|---|---|
| F1 | IB de 1.270 VA em 127 V = 10,0 A; FFF 220 V com 7.620 VA = 20,0 A; ponto sem potência marca "≥" |
| F2 | 2,5 mm² B1/PVC/2 cond. = 24 A; circuito de iluminação de 8 A pede 1,5 (uso), de tomadas pede 2,5 (uso vence a corrente); 30 A pede 6 mm²; f_agrup 0,8 sobe um degrau |
| F3 | IB 18 A, Iz 24 A → In 20 A; declarado 25 A com Iz 24 → falta com os três números |
| F4 | 20 m, 2,5 mm², 10 A, 127 V → ΔV bate com a conta manual a 1 %; rede solta → "estimado sem eletroduto" |
| F5 | TUG em banheiro sem DR → falta; com `protecaoDR: true` → cala |
| F6 | demanda 1,00 = soma; preset reduz; desequilíbrio 30 % → aviso |
| F7 | emitir com falta aberta é recusado; emitido e desenho alterado → "emissão não vale para esta revisão" |
| todas | goldens neutras com os campos no lugar ANTES do bump; harness com um quadro de 6 circuitos olhado em screenshot; editor real com escritas bloqueadas |

## 6. Tamanho

| fatias | dias |
|---|---|
| F1–F4 (o núcleo: IB, seção, disjuntor, ΔV) | 2 |
| F5–F6 (DR, demanda, fases) | 1 |
| F7 (emissão com ART + memorial) | 1,5 |
| F8–F9 (prancha, eletroduto) | 1 |
| **total** | **4–6 dias**, publicável fatia a fatia |

## 7. O que continua FORA, por decisão

- **Curto-circuito e seletividade** (Icc, curvas de disparo, coordenação) —
  exige dados da concessionária e do transformador que o desenho não tem.
- **SPDA** (NBR 5419) e aterramento — outra norma, outro módulo.
- **Motores** (fator de serviço, partida) — a residência que a 5410 §9 trata
  não os tem; entram quando o produto for para o industrial.
- **Verdade da concessionária** (demanda, padrão de entrada) — sempre preset
  nomeado, nunca embutido.

## 8. O que eu peço antes de começar

1. **Você testar a NBR 5410 à mão** (item 1 da lista) — o pré-dimensionamento
   se apoia nos mesmos dados (tipo do ambiente, potência, circuito); se o
   fluxo de declarar estiver ruim, o cálculo herda o problema.
2. **As Tabelas 36, 40, 42 e 47 da NBR 5410** coladas (ou o PDF) — para
   transcrever, não lembrar.
3. Confirmar o molde da emissão: **um** `blueprint_study_projeto_executivo`
   com `disciplina`, ou tabela própria da elétrica. Recomendo o primeiro.

## Atualização (15/09/2026) — catálogo de disjuntores = série comercial

Pedido: *"os disjuntores são comercialmente fabricados nas seguintes correntes:
10A, 16A, 20A, 25A, 32A, 40A, 50A, 63A, 73A, 80A, 100A, 125A, 160A, 200A"*.

- `HIPOTESES_PADRAO.catalogoDeDisjuntoresA` = `10, 16, 20, 25, 32, 40, 50, 63,
  70, 80, 100, 125, 160, 200`. Sai o 6 A (o pré-dim sugeria "In 6 A" para
  circuitos pequenos); entram 125/160/200 para o geral de quadros grandes.
  **Hipótese registrada:** o "73 A" da mensagem entrou como **70 A** (corrente
  fabricada; 73 não existe em catálogo) — trocar em `blueprintEletricaDimensionamento.ts`
  se for outro valor.
- `hipotesesDaColuna` passa a **ignorar** o catálogo gravado na coluna e usar
  sempre o padrão: a tela não edita a lista, e os estudos que já tinham salvo
  hipóteses congelavam a lista antiga com 6 A. Mesmo tratamento que as tabelas
  de diâmetro (F9). Consequência honesta: emissões existentes passam a "base
  alterada" (o hash inclui as hipóteses).
- Testes: memorial "sugerido 6 A" → "10 A"; catálogo exato; IB 1,3 A → 10 A;
  IB 150 A → 160 A; coluna com `[6, 10, 16]` → padrão.
- **Consequência no cálculo:** com o menor disjuntor em 10 A, `secaoMinima`
  ganhou o critério `DISJUNTOR` — a seção mínima tem de conduzir o menor
  disjuntor da série ≥ IB (5.3.4.1, In ≤ Iz), não só IB. Iluminação em 1,5 mm²
  com 7 circuitos agrupados (Iz 9,45 A) passa a ter mínimo 2,5 mm². Quando a
  seção DECLARADA não admite disjuntor nenhum, a sugestão vira o par completo
  (seção calculada + disjuntor dela) e "usar sugerido" grava os dois. Provado
  no app: os 9 circuitos do estudo de teste com "In 10 A"; nenhum "6 A" nem
  "nenhum cabe na seção".
