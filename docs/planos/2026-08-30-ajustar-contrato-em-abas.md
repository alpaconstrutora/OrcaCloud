# Ajustar Contrato — do modal para abas no ContractDetailView

## Pedido original

Sessão de 2026-08-30. Mensagens do usuário, transcritas literalmente.

**1ª mensagem (pedido anterior, já entregue e deployado no commit `119ed2d`):**

> suprimentos < Gestão de Contratos < modal Ajustar Contrato:
> 1. ao clicar em confirmar ajustes, não saia do modal, voltar coloque Salvar e sair, e outro Salvar e permanece no modal

**2ª mensagem (o pedido deste plano):**

> converter o modal "Ajustar Contrato" em abas, ao lado da aba faturas de consumo

**Respostas do usuário às perguntas de esclarecimento (AskUserQuestion):**

- *"O formulário de ajuste deve virar UMA aba ou ser dividido em VÁRIAS abas no
  trilho?"* → **"Várias abas (seções divididas)"**
- *"O `ContractDetailView` é compartilhado por Suprimentos, Serviços e Vendas. A
  aba de ajuste deve aparecer em quais?"* → **"Todos os domínios"**

---

## Contexto (estado antes da mudança)

- O formulário de ajuste vive em `components/ContractModal.tsx` — um drawer
  lateral (`fixed inset-0` + painel `max-w-5xl` deslizando da direita), com
  layout de 2 colunas (main 2/3 + sidebar 1/3).
- `components/ContractDetailView.tsx` é a tela de detalhe do contrato, com
  trilho de abas §19.1. A aba **Faturas de Consumo** (`utility_bills`) só existe
  quando `contract.is_recurring` é verdadeiro — nesse caso o trilho tem só 2
  abas (Visão Geral + Faturas de Consumo). Para contrato não-recorrente há 9
  abas (Visão Geral … Emissão).
- O botão "Editar" do detalhe (`ContractDetailView.tsx:1217`) chama a prop
  `onEdit`. No fluxo de Suprimentos, `AppRouter.tsx:925` implementa esse
  `onEdit` **fechando a tela de detalhe** (`setSelectedContractId(null)`) e
  abrindo o drawer. É exatamente essa perda de contexto que o pedido ataca.
- `UI_PATTERNS.md` §3 já prescreve a direção: "Orçamento / **contrato** / DRE →
  Página completa (rota/view dedicada)", e §2 (eixo 2) "Muito / multi-etapa /
  **multi-aba** → página dedicada". O drawer é o legado.

### As 8 seções do formulário e o agrupamento aprovado

| Seção do formulário | Linhas (antes) | Aba destino |
|---|---|---|
| Identificação do Contrato | 641–920 | **Identificação** |
| Escopo do Serviço (só `isOutgoing`) | 922–977 | **Identificação** |
| Partes e Execução (só `isOutgoing`) | 979–1106 | **Identificação** |
| Valores e Classificação | 1108–1223 | **Valores e Pagamento** |
| Condições de Pagamento | 1225–1475 | **Valores e Pagamento** |
| Locação (só `nature === 'Locação'`) | 1477–1523 | **Valores e Pagamento** |
| Centro de Custo e Orçamento | 1525–1655 | **Vínculos e Obra** |
| Identificação da Obra | 1657–1685 | **Vínculos e Obra** |
| Cronograma (coluna lateral) | 1690–1732 | **Vínculos e Obra** |
| Exposição Financeira + Salvar (col. lateral) | 1731–1810 | rodapé fixo, todas |

---

## Abordagem

**Não extrair o formulário para um arquivo novo.** `ContractModal.tsx` tem ~1810
linhas, das quais ~1200 são JSX com estado, efeitos e handlers fortemente
acoplados. Extrair significaria mover tudo isso e arriscar o fluxo de criação,
que funciona hoje. Em vez disso, o próprio `ContractModal` ganha um **modo de
renderização**:

- `variant?: 'drawer' | 'inline'` (default `'drawer'` — comportamento atual
  intacto)
- `section?: ContractFormSection` — qual grupo renderizar quando `inline`

O JSX **não se move**. Só ganha:
1. wrappers condicionais `{showGroup('x') && ...}` em cada seção;
2. `className` condicional nos 4 elementos de cromo (overlay, painel, `<form>`,
   colunas);
3. `{!inline && ...}` no cabeçalho do drawer e no backdrop.

Assim há uma única fonte da verdade para o formulário, e o modo drawer (criação,
e edição a partir da lista) continua byte-a-byte equivalente.

---

## Itens

### 1. `components/ContractModal.tsx`

**O que muda:**
- Exportar `export type ContractFormSection = 'identificacao' | 'valores' | 'vinculos'`.
- Novas props opcionais `variant` e `section` na interface `ContractModalProps`.
- `const inline = variant === 'inline'` e `const showGroup = (g: ContractFormSection) => !inline || section === g`.
- Envolver as 8 seções + Cronograma com `showGroup(...)`, preservando as
  condições que já existem (`isOutgoing`, `formData.nature === 'Locação'`).
- Cromo condicional: sem overlay/backdrop/cabeçalho/`max-w-5xl` quando `inline`;
  `<form>` empilha em bloco em vez de `flex-row`; a coluna lateral vira barra de
  rodapé (Exposição Financeira à esquerda, ação de salvar à direita).
- Em `inline`, o rodapé mostra **um** botão "Salvar alterações" — "Salvar e
  Sair" não faz sentido numa aba. O par "Salvar e Permanecer"/"Salvar e Sair"
  do commit `119ed2d` permanece **só** no modo drawer.

**Como sei que terminou:**
- `npx tsc --noEmit` limpo.
- Abrir o drawer de **criação** (Suprimentos › Gestão de Contratos › novo
  contrato) e confirmar que está visualmente idêntico ao de antes, com o botão
  "Efetuar Cadastro", e que salva.
- `bash scripts/check-ui-standard.sh components/ContractModal.tsx` com exit 0.

### 2. `components/ContractDetailView.tsx`

**O que muda:**
- Extrair o union de `activeTab` para um `type ContractDetailTab`, acrescentando
  `'edit_identificacao' | 'edit_valores' | 'edit_vinculos'` (o union está
  duplicado hoje nas linhas 165 e 1151).
- Acrescentar as 3 abas ao trilho, **nos dois ramos** (recorrente e
  não-recorrente), depois das existentes — no ramo recorrente elas caem logo ao
  lado de "Faturas de Consumo", que é o pedido literal.
- Renderizar `<ContractModal variant="inline" section={...} isOpen>` numa única
  posição do JSX para as 3 abas, de modo que a instância (e portanto o estado do
  formulário) **sobreviva à troca entre elas**.
- `onSubmit` chama `contractService.updateContract(contract.id, data)` e faz
  `setContract(updated)` — mesmo padrão já usado nas linhas 1313/1318/1323.
- O botão "Editar" da toolbar passa a levar para a aba
  `edit_identificacao` em vez de chamar `onEdit` (que fechava a tela).

**Como sei que terminou:**
- `npx tsc --noEmit` limpo.
- Num contrato **recorrente**: trilho mostra Visão Geral · Faturas de Consumo ·
  Identificação · Valores e Pagamento · Vínculos e Obra.
- Num contrato **não-recorrente**: as 3 abas aparecem depois de "Emissão".
- Editar um campo na aba Identificação, trocar para Valores e Pagamento e voltar
  → **o valor digitado continua lá** (instância preservada).
- Salvar → o cabeçalho do detalhe (título/valor) reflete o novo dado sem recarga
  da tela.

### 3. Migração para a escala compacta §16 + rótulos §21 — APROVADA e FEITA

Estava listada abaixo como dívida a combinar. Ao ver o resultado, o usuário
respondeu **"sim"** (2026-08-30) e a migração entrou neste mesmo trabalho.

**O que mudou em `ContractModal.tsx`:**
- Campos: `px-6 py-4`/`px-5 py-3.5` → `px-3 h-9`; `pl-14 pr-6 py-4` → `pl-9 pr-3 h-9`
  (com os ícones `absolute left-6` → `left-3` e sufixos `right-6` → `right-3`);
  textarea → `px-3 py-2` (altura fixa não se aplica).
- Radius: `rounded-2xl`/`rounded-xl`/`rounded-lg` → `rounded-[6px]` em controle,
  `rounded-[10px]` em container; `rounded-[24px]`/`rounded-[32px]` → `rounded-[10px]`.
- Foco: `focus:ring-4` → `focus:ring-2`.
- §21: `text-form-label … uppercase tracking-widest` → `text-xs font-semibold
  text-slate-500`; títulos de seção → `text-sm font-semibold text-gray-900`
  (sentence case); removida a caixa alta forçada por CSS de legendas e chips.
- §17: os botões de salvar deixaram de ser blocos `py-5 uppercase tracking-[0.2em]`
  e viraram `h-9 px-3.5 rounded-[6px] text-[13px]`.

**Única exceção mantida:** o campo **UF** conserva `uppercase` — a sigla é
maiúscula por natureza e o próprio valor é gravado com `.toUpperCase()`
(análogo à exceção de sigla do §21).

**Como sei que terminou:** `check-ui-standard.sh` exit 0; a busca por
`rounded-2xl|rounded-xl|rounded-lg|px-6 py-4|text-form-label|uppercase` no
arquivo retorna **apenas** a linha do campo UF; conferido em print nas três abas.

### 4. Dívida que ficou (fora deste plano)

A migração do item 3 mudou **também o modo drawer** (criação de contrato, e
edição a partir da lista em Serviços/Vendas), porque o JSX é compartilhado —
era o objetivo, mas significa que essas telas mudaram de aparência sem terem
sido o alvo do pedido. Verifiquei as três abas embutidas em print; **o drawer de
criação não foi reverificado visualmente** após a migração de escala.

Continuam na escala antiga, e não foram tocados: `ContractScopeManager.tsx` e
`ContractGuaranteeModal.tsx`, abertos de dentro deste formulário. Aparecem com o
visual antigo sobre o novo — pendentes, não "N/A" (§16).

---

## Registro de execução

- 2026-08-30 — plano criado a partir do pedido acima.
- 2026-08-30 — itens 1 e 2 implementados. `npm run ci` verde (typecheck, 1975
  testes, build). Verificado no navegador com Playwright contra o app real: as
  três abas aparecem ao lado de "Faturas de Consumo" num contrato recorrente, o
  rodapé (Exposição/Retenção + salvar) aparece nas três, e o texto digitado
  sobrevive à troca de aba.
  - Duas "falhas" da primeira rodada eram **defeito do teste**, não do app:
    (a) `innerText` devolve o texto já transformado por `uppercase`, então
    comparar com a caixa original dava falso negativo; (b) o seletor
    `input[type=text]` pegava o campo NÚMERO, que tem máscara de 3 dígitos e
    truncava o texto de teste — parecia "estado perdido" e não era.
- 2026-08-30 — item 3 (escala §16 + rótulos §21) aprovado pelo usuário e
  aplicado. `check-ui-standard.sh` exit 0, `npm run ci` verde de novo, e as três
  abas reconferidas em print.
