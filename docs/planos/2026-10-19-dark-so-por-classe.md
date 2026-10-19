# `dark:` do Tailwind só por classe — não pelo modo escuro do sistema

## Pedido original
Contexto (a pergunta que eu fiz, ao entregar a gaveta "Gerar pelo modelo" — plano
`2026-10-19-gerar-pelo-modelo-padrao.md`):
> Quer que eu aplique a linha global?
>
> (outros 9 componentes com o mesmo defeito de `dark:` … uma linha no `index.css` desligaria todos de uma vez,
> mas muda a aparência dessas telas para quem usa o sistema em modo escuro)

Resposta do usuário, sessão c7448b3f · 19/10/2026:
> aplicar a linha global

## O problema (medido)
No Tailwind v4, sem `@custom-variant dark`, a variante `dark:` é a media query
`@media (prefers-color-scheme: dark)` — segue o **modo escuro do Windows/navegador do usuário**, não um
tema do app. Compilado o Tailwind do projeto com e sem a linha:

| | CSS gerado para `dark:bg-gray-800` |
|---|---|
| hoje (sem a linha) | `@media (prefers-color-scheme: dark) { … }` |
| com a linha | `&:where(.dark, .dark *) { … }` — só vale dentro de um elemento com a classe `dark` |

Efeito: a gaveta "Gerar pelo modelo" (corrigida em outro PR) mostrava valor branco sobre fundo branco para
quem usa o sistema escuro. Mais **10 arquivos** têm `dark:` e sofrem do mesmo: `ServicesOpportunityDetail` (63),
`ServicesProposal` (28), `ServicesVisit` (23), `ServicesBudget` (23), `BIReportScheduler` (16),
`ServicesPipelineConfigModal` (15), `ServicesWonModal` (14), `ServicesOpportunityModal` (11),
`ServicesEngineeringPicker` (10) e `utils/solicitacaoCompra.ts` (mapa de cores de status).

## Correção de uma afirmação anterior
Eu disse "o app não tem tema escuro". Impreciso: o app TEM o modo **"Escuro Total"** (`.theme-midnight`,
botão de lua da barra lateral, `Layout.tsx`), mas ele é feito por **sobrescritas globais de classes neutras**
no `index.css` (84 regras: `.theme-midnight .bg-white { … }`) e **não depende de `dark:`**; os modos
"claro"/"escuro" da barra lateral só trocam a barra. O que não existe é um tema escuro ligado à variante
`dark:`. Nenhum código liga uma classe `dark` (nem lê o esquema do sistema para isso — o `Layout` lê
`prefers-color-scheme` só para o modo "auto" da barra lateral).

Por que o Escuro Total não é afetado: as sobrescritas ganham em especificidade (`.theme-midnight .bg-white`
= 0,2,0 contra um utilitário `dark:` = 0,1,0) e, para quem usa o sistema claro (a maioria), os `dark:` já
nunca valiam. Depois da mudança todos passam a ter o mesmo comportamento desses.

## Decisões
| Data | Pergunta | Resposta |
|---|---|---|
| 19/10/2026 | Aplicar a variante por classe `.dark` no `index.css` (desliga todos)? | Sim, "aplicar a linha global". |
| 19/10/2026 | Atrelar `dark:` ao `.theme-midnight` (ligaria as classes no Escuro Total)? | **Não feito**: não é o que foi aprovado, e ligaria 10 arquivos que ninguém revisou nesse modo. Fica como possibilidade. |

## Andamento
- [x] 1. Teste de regressão `__tests__/darkSoPorClasse.test.ts` — 2 dos 4 testes FALHAM sem a linha (os outros dois são o controle negativo e a checagem de que nada liga a classe `dark`) e os 4 passam com ela
- [x] 2. `index.css`: `@custom-variant dark (&:where(.dark, .dark *));` logo depois do `@import "tailwindcss"`
- [x] 3. Guia §33 reescrito (título, o que é verdade sobre o Escuro Total, dívida resolvida, contagem real: 210 classes em 10 arquivos) — empilhado na branch do PR da gaveta, que cria a §33
- [ ] 4. Verificação — 4 de 5:
  - [x] CSS do build real: publicado hoje tem 1 bloco `@media (prefers-color-scheme: dark)` (todas as regras `dark:`); o build novo tem **0**, e as 57 regras `dark:` passam a depender de `:where(.dark, .dark *)`.
  - [x] Tela de detalhe da oportunidade (CRM Serviços; a de mais `dark:`), sistema claro × escuro, só leitura: publicado = **159.013 pixels diferentes (9,94%)** (título invisível, painéis azul-marinho soltos); código novo = **0**. (Antes eu tinha medido outras duas telas que deram 0 nos DOIS lados — controle sem sensibilidade, descartado.)
  - [x] Para quem usa o sistema CLARO nada mudou: tema padrão e Escuro Total, publicado × novo = 0 pixels de diferença.
  - [x] Escuro Total (`sidebar_theme=midnight`): antes 718 px (0,04%) de diferença claro×escuro, agora 0; a tela continua coerente e legível.
  - [ ] Suíte inteira e CI em Linux.

## Plano

### 1. Teste — `__tests__/darkSoPorClasse.test.ts`
- Lê o `index.css` REAL, extrai a linha `@custom-variant dark …`, compila `@import "tailwindcss"` + essa linha com
  `@tailwindcss/node` e gera `dark:bg-gray-800`: tem de sair `.dark` e **não** `prefers-color-scheme`.
- Controle negativo no mesmo teste: sem a linha, sai `prefers-color-scheme` (prova que o teste enxerga o defeito).
- **Pronto quando:** falha antes do passo 2 e passa depois.

### 2. `index.css`
- **O que muda:** uma linha, logo depois de `@import "tailwindcss";`, com comentário curto do porquê.
- **Pronto quando:** o CSS de produção não tem `prefers-color-scheme: dark` vindo de `dark:`.

### 3. Guia §33
- A §33 (do PR da gaveta) diz "o app só tem tema claro" e lista a dívida como pendente. Passa a dizer o que é
  verdade: a variante é por classe, o Escuro Total é outro mecanismo, a dívida está resolvida.

### 4. Verificação
- CSS publicado hoje × CSS do build novo (contagem de `prefers-color-scheme: dark`).
- Tela afetada (CRM Serviços) com `colorScheme: dark` × `light`: idêntica depois.
- Escuro Total (`sidebar_theme=midnight`) numa dessas telas antes × depois.
