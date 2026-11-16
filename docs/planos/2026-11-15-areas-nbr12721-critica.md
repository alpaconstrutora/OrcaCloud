# Áreas NBR 12721 — correções da crítica `/impeccable critique` (20/40)

## Pedido original

> /impeccable critique incroporação > empreendimento > Áreas NBR 12721

Sessão `6a967948-2ebb-4fea-81e4-2625b2789d09` · 15/11/2026. Crítica com dois avaliadores
(revisão de design + detector/navegador) sobre o Garden real, só olhando — nota **20/40**.
Snapshot: `.impeccable/critique/2026-11-15T23-57-35Z__components-blueprint-telaareasnbr12721-tsx.md`.

Respostas do usuário às perguntas da crítica (mesma sessão):

| Pergunta | Resposta |
|---|---|
| Qual P1 atacar primeiro? | **Travas e Ctrl+Z (harden)** |
| Como os quadros devem aparecer na tela? | **Igual ao documento** — cabeçalho em dois níveis com os grupos da norma, "(n)" em cada coluna, total por coluna |
| Pode mexer na estrutura de abas? | **Pode reorganizar** |
| Tamanho da rodada | **Tudo** — os 5 prioritários e as observações menores |

Pedido seguinte, literal:

> toda a sequencia

(= `/impeccable harden` → `clarify` → `shape` → `distill` → `layout` → `polish`, na ordem da crítica.)

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 15/11/2026 | Abrir o Garden real para a crítica? | "Garden real, só olhar" — escritas bloqueadas + hash das linhas antes/depois (idênticos) |
| 15/11/2026 | Brief do `shape` (trilha + F5, faixa de etapas + prévia, pendências com Resolver, abas em 2 grupos, quadros da norma, travas) | **Confirmo o brief** |
| 15/11/2026 | Classificação × Ambientes declarados no grupo Entrada | **Separadas** |

## Brief confirmado (shape)

1. **Quem e para quê:** engenharia/responsável técnico da incorporação (e o jurídico que aprova)
   fechando os Quadros I, II e IV-B e as frações que vão ao memorial e ao cartório. Modo Operate.
2. **Topo:** vindo do Empreendimento, trilha "‹Empreendimento› › Áreas NBR 12721" e a seta volta
   à ficha dele; o endereço guarda a tela (F5 fica nela). Faixa de **etapas**: Rascunho → Versão
   publicada → Técnica → Jurídica → No Empreendimento, com a próxima ação; **Baixar prévia**
   (PDF/XLSX) do rascunho marcada "Prévia — não publicada".
3. **Pendências sempre à vista** (sai a aba): bloqueantes primeiro, com nome/pavimento/unidade e a
   frase do conserto, botão **Resolver**; avisos e "a classificar" abaixo. KPIs "—" com cálculo
   bloqueado; "Unidades 0" com ambiente privativo vira alerta com "Criar unidades".
4. **Abas em dois grupos:** Entrada (Classificação · Ambientes declarados · Acessórios ·
   Hipóteses) | Quadros (Quadro I · Quadro II · Quadro IV-B · Frações). Título muda com a aba.
5. **Quadros iguais ao documento** (`utils/nbr12721/documento.ts`): dois níveis, "(n)", total
   por coluna, primeira coluna fixa.
6. **Classificação:** coluna Ambiente fixa, clique na linha abre o drawer, Shift+clique, filtro
   "só a classificar", "Classificar" com o nome do ambiente no nome acessível.
7. **Travas:** confirmação de "Aplicar sugestões" com resumo por classe e Δ da área equivalente,
   aviso de 0 unidades, aviso com Desfazer; drawer em lote com "valores diferentes" grava só o que
   mudou; "Voltar a 'a classificar'" confirma; Ctrl+Z não age em campo de texto; hipóteses
   digitadas sobrevivem à troca de aba.
8. **Fora:** o motor e os números; publicar/aprovar continuam no painel Versões (só polish).

## Plano (um item por arquivo; o que muda · como sei que terminou)

### harden
- [x] **`components/blueprint/BlueprintEditor.tsx`** — Ctrl+Z / Ctrl+Shift+Z ignoram
  INPUT/TEXTAREA/SELECT/contentEditable (como o Ctrl+D já fazia).
  · Pronto: teste com Ctrl+Z dentro de um `<input>` não chama `undo`; fora dele chama.
- [x] **`components/blueprint/TelaAreasNbr12721.tsx`** — (a) "Aplicar sugestões" pede
  confirmação (`useConfirm`) com a contagem por classe e a área equivalente antes → depois;
  com 0 unidades e ambientes que deveriam ser privativos, a confirmação avisa e oferece ir a
  Unidades; (b) depois de aplicar/classificar, aviso "N classificados · Desfazer" (o Desfazer
  chama o `undo` do editor); (c) drawer em lote: campo com valores diferentes mostra "valores
  diferentes" e só grava o que o usuário mudou; (d) "Voltar a 'a classificar'" confirma;
  (e) "Classificar" de uma linha não apaga a seleção em lote; cancelar não deixa a barra de lote
  com 1 item; (f) rascunho das hipóteses sobrevive à troca de aba.
  · Pronto: testes de componente para (a)–(f).

### clarify
- [x] **`utils/nbr12721/pendenciasLegiveis.ts`** (novo) — pendência → {o quê, onde (ambiente ·
  pavimento · unidade), como resolver, alvo do "Resolver"}; código interno só como dado.
  · Pronto: teste unitário com a pendência de coeficiente (MOTOR_007) e a de sugestão.
- [x] **`components/blueprint/TelaAreasNbr12721.tsx`** — faixa de pendências sempre visível com
  "Resolver"; plurais sem "(s)"; cabeçalho do drawer com o(s) nome(s) do(s) ambiente(s); estados
  vazios dos quadros com botão; KPIs "—" quando bloqueado.
  · Pronto: teste "a pendência diz o nome do ambiente e o Resolver abre o drawer com ele".

### shape (percurso)
- [x] **`components/empreendimento/EmpreendimentoDetail.tsx`** — o botão leva `&origem=<id>`
  no link da Planta.
- [x] **`components/empreendimento/EmpreendimentoModule.tsx`** — `#/empreendimentos?id=<id>` abre
  a ficha do empreendimento (link direto, que não existia).
- [x] **`components/blueprint/BlueprintModule.tsx`** — o endereço guarda `tela=` enquanto a tela
  está aberta (F5 volta nela); lê `origem` e repassa ao editor.
- [x] **`components/blueprint/BlueprintEditor.tsx`** — cabeçalho da tela NBR: trilha com o nome do
  empreendimento e a seta voltando a ele; trilha "Planta Inteligente · …" com contraste AA;
  repassa à tela abrir o painel Versões / a tela Unidades.
- [x] **`components/blueprint/EtapasNbr12721.tsx`** (novo) + **`services/blueprintSnapshotNbr12721Service.ts`**
  — faixa de etapas a partir das versões com quadro congelado e das aprovações; próxima ação.
- [x] **`utils/nbr12721/documento.ts`** + **`services/nbr12721ExportService.ts`** — documento de
  **prévia** do rascunho (sem hash, marcado "Prévia — não publicada") para PDF/XLSX.
  · Pronto (percurso): teste do link direto; teste da faixa de etapas por situação; prévia no
  teste do documento; e conferência no navegador (F5 fica na tela; seta volta à ficha).

### distill
- [x] **`components/ui/TabsBar.tsx`** — grupos de abas opcionais (rótulo do grupo + divisória);
  contador com contraste AA.
- [x] **`components/blueprint/TelaAreasNbr12721.tsx`** — 8 abas em Entrada | Quadros, Pendências
  sai de aba; título (h2) por aba.
  · Pronto: teste das abas por grupo; `abasPeloTeclado` continua verde.

### layout
- [x] **`components/ui/StandardTable.tsx`** — opcionais `gruposDeColunas` (cabeçalho em dois
  níveis) e `colunaFixa` (§6.13.1); para todos: nome acessível nas caixas de seleção e
  Shift+clique (§10.1).
- [x] **`components/blueprint/TelaAreasNbr12721.tsx`** — quadros com as colunas do documento,
  grupos, "(n)", total por coluna, Pavimento/Unidade fixa; Classificação com Ambiente fixa,
  linha clicável, filtro "só a classificar".
  · Pronto: testes do StandardTable (grupos, fixa, Shift+clique) + Quadro I com 17 colunas e
  total por coluna; conferência no navegador a 1440 e 1280.

### polish
- [x] **`components/ui/KpiCard.tsx`** — cartão com `onClick` alcançável pelo teclado (botão).
- [x] **`components/blueprint/SecaoNbr12721DaVersao.tsx`** — sem caixa alta, ≥ 12px, contraste AA.
- [x] **`components/empreendimento/EmpreendimentoDetail.tsx`** — botões do cabeçalho sem quebrar
  linha; rótulos da Visão Geral com contraste AA.
- [x] **`components/blueprint/TelaAreasNbr12721.tsx`** — "— sem dona" legível; contraste dos
  placeholders que carregam significado; checagens do guia.
  · Pronto: `check-ui-standard.sh` nos arquivos tocados, `tsc`, suíte dos arquivos tocados,
  detector `impeccable` e prints a 1440/1280 conferidos.

## Estado

15/11/2026: harden 2/2 · clarify 2/2 · shape 6/6 · distill 2/2 · layout 2/2 · polish 4/4.

Desvios do plano, registrados:
- A faixa de etapas não virou arquivo próprio (`EtapasNbr12721.tsx`): é `FaixaDeEtapas` dentro de
  `TelaAreasNbr12721.tsx`, com a regra pura em `utils/nbr12721/etapas.ts` (testada) e a leitura em
  `blueprintSnapshotNbr12721Service.situacaoDoDocumento`.
- `SecaoNbr12721DaVersao.tsx`: o título em caixa alta FICOU — é o vocabulário de todas as seções do
  painel Versões e está no BASELINE deliberado de `rotuloSemCaixaAltaGuard` (cabeçalhos dos painéis
  laterais da Planta); trocar só um deixaria o painel inconsistente. O hash `font-mono text-[10px]` é o
  §27. Os textos de 11px e o "pendente" a 2,5:1 foram corrigidos.
- Distill, depois da 1ª conferência visual: sai o 4º cartão ("Cálculo bloqueado", repetia a faixa de
  pendências); com algo bloqueando, "a confirmar" e avisos ficam recolhidos ("Mostrar também…"); a aba
  "Ambientes declarados" virou "Declarados" (o título da aba diz o nome inteiro) para as abas caberem
  numa linha a 1280.
- Encontrado e NÃO mexido (fora do escopo): o diálogo de `useConfirm` (`ui/modal.tsx`) não liga o título
  ao `aria-labelledby` — o diálogo não tem nome acessível no app inteiro.

Verificação feita:
- Ctrl+Z: teste novo no `BlueprintEditor.test.tsx`, provado nos dois sentidos (falha sem a guarda).
- Testes: `TelaAreasNbr12721.test.tsx` (18), `nbr12721PendenciasEEtapas.test.ts` (9),
  `StandardTableNiveisFixaShift.test.tsx` (3) + travas e vizinhos (507/507 na 1ª rodada).
- `check-ui-standard.sh` limpo nos 10 `.tsx` tocados; `tsc --noEmit` 0 erros.
- Navegador, frente local contra produção, Garden só leitura (escritas e renovação de token bloqueadas,
  hash das linhas do estudo idêntico antes/depois): trilha "011 - Garden Cambuhy › Áreas NBR 12721",
  F5 fica na tela, seta volta à ficha, pendência "Varanda de entrada · Térreo" com Resolver, tabela
  cabendo em 1.122 px a 1440, 1280 sem rolagem lateral. Harness temporário (prédio de teste em memória,
  sem rede) para os quadros com números: dois níveis, "(n)", total, coluna fixa ao rolar, drawer em lote
  com "valores diferentes", confirmação das sugestões e aviso com Desfazer; 390 px sem rolagem lateral.

## Verificação

1. `npx vitest run __tests__/components/TelaAreasNbr12721.test.tsx __tests__/components/StandardTable*.test.tsx …`
2. `bash scripts/check-ui-standard.sh <cada .tsx tocado>` · `npx tsc --noEmit -p .`
3. Navegador (frente local, Garden só leitura com hash das linhas antes/depois): caminho
   Empreendimento → Áreas NBR 12721 → F5 → seta volta; pendência → Resolver; quadros a 1440/1280.
