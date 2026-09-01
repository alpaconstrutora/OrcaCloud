# Planta Inteligente — sobreposição entre componentes

## Pedido original

> veja print que ao criar um pilar onde ja existe parede criada os dois componentes ficar se sopropondo.
> Ao criar um componente e que sobrepoe um outro . emitir um aviso ao usuário se ele quer desfazer ou se ele quer subtrair o volume de um componente ou do outro componente

Sessão: `173a7f9b-72cd-49d6-972f-e29192178ac2` · 2026-09-01
(print: vista 3D com um pilar atravessando uma parede)

### Decisão pedida ao usuário no mesmo dia

*"Quando o usuário escolher 'subtrair o volume de um componente', o que deve
acontecer com a peça que cede?"* → **Descontar no quantitativo**: o volume
sobreposto é abatido da peça escolhida no cálculo; a geometria fica como está,
porque no 3D as duas de fato ocupam o mesmo espaço — pilar embutido é normal na
obra. Funciona nos dois sentidos e corrige o pagamento em dobro.

## O que a investigação achou antes de qualquer código

A imagem era o sintoma. **O quantitativo contava o volume duas vezes.** A área
da parede saía de `comprimento × altura − vãos`, sem desconto nenhum de
estrutura (`quantities.ts`), e o volume do pilar era somado à parte. Existia
desconto de pilar na área de PISO desde 31/08, mas nada na alvenaria.

No caso do relato — parede 4,00 × 2,80 × 0,15 m com pilar 20×40 embutido no eixo
— são **0,084 m³** pagos duas vezes.

## Decisões

| Pergunta | Decisão |
|---|---|
| O modelo guarda o quê? | A **decisão** (`cedeSobreposicao`), nunca o volume. Volume gravado ficaria obsoleto ao mover o pilar — e desconto obsoleto não some da tela, vira número plausível. |
| Quem decide o desempate? | Marcados os dois, cede a **PAREDE** — convenção do orçamento (compra-se bloco pela área líquida). Sem regra escrita, o desconto dependeria da ordem da lista. |
| Ninguém marcado | **Nada muda no número**, e a disputa aparece em `sobreposicoes[]` com `quemCede: 'NINGUEM'`. Resolver em silêncio seria pior: o número sairia plausível. |
| Parede × parede | **Fora.** Duas paredes dividem a mitra em todo canto; acusar aqui encheria a planta de avisos. |
| Laje sobre parede | **Fora** pelo teste vertical: laje na cota 2,80 não cruza a parede 0–2,80. Mesma coisa para estaca enterrada. |
| A fôrma encolhe? | **Não.** A face embutida continua sendo cofrada — é o que segura o concreto até a cura. |

## Plano

### 1. Geometria · `utils/blueprintKernel/sobreposicao.ts` ✅

`sobreposicoesDe` / `sobreposicoesDoModelo` / `areaComum`. Recorte de
Sutherland–Hodgman com **faca convexa** (o sujeito pode ser côncavo — laje em L).
Parede entra pelo corpo SEM mitra; peça circular vira polígono de 24 lados, e
essa aproximação nunca toca o volume próprio da peça.

**Pronto quando:** `__tests__/blueprintSobreposicao.test.ts` passa (12 casos).

### 2. Modelo e comando ✅

`cedeSobreposicao?: boolean` em `Wall` e `Structural`; comando
`SetCedeSobreposicao` (um só para as duas famílias — a pergunta é a mesma).
`false` **apaga** a chave em vez de gravá-la.

Canônico emite a chave só quando `true`. **KERNEL_VERSION 0.9.0 → 0.10.0.**

⚠️ Os 6 goldens mudaram de hash. Antes de tocar neles, a prova que o próprio
arquivo exige: com a string de versão revertida para 0.9.0, os **sete** testes
voltaram a passar byte a byte — ou seja, a chave nova não aparece em desenho que
não cede nada. Só então os hashes foram atualizados, com o registro no changelog
do arquivo.

### 3. Quantitativo ✅ · `quant-1.4.0 → 1.5.0`

Parede: desconto chega em volume e vira área de face dividindo pela espessura —
derivar mantém `face × espessura = volume` exato. Peça: volume abatido, fôrma
intacta, fórmula anotada. Nenhum dos dois cede mais do que tem.

**Pronto quando:** a trava "MUDOU A FÓRMULA? A VERSÃO TEM QUE SUBIR" passa com
1.5.0 e os casos do item 1 conferem os números.

### 4. Aviso na criação · `components/blueprint/ModalSobreposicao.tsx` ✅

Modal central (`UI_PATTERNS` §2: decisão pontual, não precisa da tela de trás),
primitiva `Modal` do app, `dismissable={false}`. Quatro saídas: **Desfazer ·
Manter os dois · Descontar do concreto · Descontar da alvenaria**. A opção da
alvenaria some quando não há parede envolvida.

Bloco de contexto com o volume disputado (§6.2 — decisão que mexe em valor mostra
o que a sustenta).

**Pronto quando:** `__tests__/components/ModalSobreposicao.test.tsx` passa (6).

### 5. Detecção no editor ✅

`recemCriado` → efeito → `sobreposicoesDe`. O efeito existe porque `editor.run`
agenda o estado, não devolve o modelo: perguntar na hora acharia zero sempre.
"Desfazer" usa `editor.undo()`; "descontar da alvenaria" marca **todas** as
paredes atravessadas, não só a primeira.

### 6. Decisão reversível ✅

`ControleDeSobreposicao` nos painéis da parede e da peça, visível só quando há
disputa. Sem ele, a linha de Quantitativos mandaria "escolha quem cede" sem
lugar onde escolher.

**Pronto quando:** `__tests__/components/blueprintSobreposicaoUI.test.tsx` passa
(3) — seleção pela lista de Componentes, que é DOM, não canvas.

### 7. Lista em Quantitativos ✅

Seção "Sobreposição entre peças", em âmbar quando ninguém cedeu.

### 8. Conferência visual · `docs/spikes/sobreposicao/` ✅

⚠️ **A primeira medição aprovou um rótulo visivelmente cortado.** Ela media
contra `[role=dialog]`, que é o invólucro `inset-0` — todo botão cabe dentro
dele. Quem denunciou foi o print: "Desfazer pilar" saía 71 px para fora do
painel em `size="xl"`. Corrigido o seletor (`[role=dialog] > div.relative`), o
número apareceu, e o modal foi para `2xl` com `whitespace-nowrap`.

## Segunda rodada — o desenho (01/09/2026, depois do primeiro deploy)

> acabei de testar e no 3d a parede e o pilar continuam sobrepostos

Correto, e era o combinado: a opção escolhida corrigia o NÚMERO, não a imagem.
Conferido no banco antes de responder — o estudo `99d7a8be` estava salvo com
kernel 0.10.0 e com `cedeSobreposicao` marcado dos dois lados, ou seja, o
desconto tinha sido aplicado.

### 9. O desenho passa a seguir a mesma decisão ✅

A parede que **cede o volume** cede também o espaço no desenho:
`faixaDaEstruturaNaParede` devolve onde o concreto atravessa, em coordenada
local do perfil, e o 3D abre ali um vão — **a mesma mecânica de porta e janela**,
que aquele perfil já tinha (`THREE.Path` em `shape.holes`, sem CSG).

- `furosEstruturais` é lista SEPARADA de `furos`: aquelas são aberturas, têm
  `openingId` e `kind`, e um pilar embutido não é uma porta sem batente;
- só o `Blueprint3DViewer` consome esse perfil — conferido antes de mexer;
- **o inverso não tem desenho**: quando quem cede é o CONCRETO, a parede fica
  inteira. Um pilar menos uma fatia de parede não é mais um retângulo, e o
  modelo não sabe representar essa forma.

⚠️ **O que o print revelou, e nenhum teste diria:** com o pilar do relato
(40 cm) numa parede de 15 cm, cortar a parede **não muda a silhueta** — o
concreto é maior que o vão e o cobre por inteiro. As duas capturas saíram
idênticas pixel a pixel, e isso não é o corte falhando: é a câmera não tendo
como ver um buraco atrás de uma peça maior que ele. A prova exigiu uma cena com
o pilar MAIS FINO que a parede (`?cena=pilar&fino=1`), onde o antes mostra
parede maciça e o depois mostra o pilar dentro do nicho.

O ganho no caso do usuário é outro: as arestas da parede param de atravessar o
concreto.

**Pronto quando:** os 5 casos novos em `blueprintSobreposicao.test.ts` passam e
as duas capturas de `?fino=1` diferem.

## Resultado

Nove itens concluídos em 01/09/2026. `npx tsc --noEmit` limpo; suíte **2132
passando** (29 testes novos); `check-ui-standard.sh` limpo nos seis `.tsx`
tocados.

## Pendências conhecidas

- **Fluxo ponta a ponta no app real** (criar o pilar sobre a parede clicando no
  canvas) não foi exercitado: a skill `rodar-app` exige a senha do agente de
  leitura, que não fica gravada. O que foi exercitado em jsdom é o caminho da
  lista de Componentes; o modal foi conferido isolado e em print.
- **Elevação e exportações** (PDF/DXF/IFC) não abrem o vão do concreto — só o
  3D consome `perfilDaParedeComVaos`. As outras têm caminho próprio.
- **Criar PAREDE sobre pilar** não dispara o aviso — só a criação de peça
  estrutural passa pela detecção.
- **Duas lajes côncavas** sobrepostas não têm área calculada (faca não convexa):
  `areaComum` devolve 0 e nenhum desconto é inventado.
