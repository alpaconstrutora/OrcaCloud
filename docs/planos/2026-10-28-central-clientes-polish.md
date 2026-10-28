# Central de Clientes — acabamento (`/impeccable polish`)

## Pedido original

> /impeccable critique analise e dados > Central de Clientes

Sessão `1880c008-dd77-4f94-9d0d-2c1d01ed5ec4` · 28/10/2026. Crítica 2 (23/40), escopo **"Tudo"**, ordem
**"um de cada vez"**, depois **"siga em frente"**. 5º comando (1º #218, 2º #220, 3º #223, 4º #224).
Respostas do polish: **"Corrigir no tema (Recomendado)"** e **"Vencido logo após o nome (Recomendado)"**.

## O que muda

1. **Ordem de cobrança nas tabelas** — colunas: nome · Vencido · Atraso máx. · Em aberto · Faturado ·
   Recebido · Recebido do faturado · Lançamentos. No celular (e com zoom de 200%) o Vencido era a 5ª
   coluna, fora da tela. Chaves `centralCliente:porCliente:v2` / `porObra:v2`: a ordem salva na chave
   antiga prenderia todo mundo na ordem velha (o merge de colunas só encaixa coluna NOVA).
2. **Ordenação anunciada** — `StandardTable`/`useTableColumns` ganham `defaultSort` (só vale sem
   preferência salva). As linhas já vinham "de quem mais deve para quem menos deve", mas o cabeçalho
   dizia `aria-sort="none"`, sem ícone; agora Vencido ↓.
3. **Leitor de tela** — campo de busca da `StandardTable` com nome (`aria-label` do placeholder sem
   "…"); `SegmentedProgress` lia o percentual duas vezes (texto + `role="img"`) → quadradinhos
   `aria-hidden`.
4. **Tema "Escuro Total"** (`.theme-midnight`, no tema, para o app inteiro):
   `bg-gray-50/50|60|80` (fundo recuado), `bg-gray-200` (trilho vazio — quadradinhos quase brancos),
   divisórias no seletor do Tailwind v4 (`> :not(:last-child)`; as regras antigas eram do v3),
   vermelho de texto solto `text-red-600|700` → `#f87171` (o red-700 dava ~2,6:1; selo com fundo
   próprio fica como está), Recharts (grade, cursor, eixo, rótulo das barras, tooltip branco escurece).
   Controles do topo com `text-gray-900` explícito (herdavam a cor e não entravam no remapeamento).
5. **Celular (390 px)** — cabeçalho do gráfico com `flex-wrap` (o alternador espremia o título a uma
   palavra por linha); eixo X com rótulo curto (A vencer · 1–30 · 31–60 · 61–90 · +90) abaixo de
   520 px de gráfico — a legenda embaixo mantém o rótulo inteiro.

## Fora do escopo (achado, não mexido)

- Contas a Receber no escuro: linha vencida usa `bg-red-50/30` (cor de marca, não remapeada) — fundo
  acinzentado claro sob texto claro. Já era assim antes desta frente.
- Chip "Cliente: …" da Central (`bg-blue-50`) continua claro no escuro — cor de marca, por desenho do tema.

## Estado

- [x] navegador (127.0.0.1:3140, tema escuro ligado na raiz): cabeçalhos "Cliente | Vencido↓ | Atraso
  máx. | Em aberto | Faturado | Recebido | …"; 1ª linha R$ 466.622,84 → R$ 421.428,58 → …; busca
  "Buscar cliente"/"Buscar obra"; grade `rgba(255,255,255,.06)`, tooltip `#232733`, eixo e rótulo
  `#949bab`, vermelho `#f87171`; gaveta do extrato (Reginaldo, "— Sem obra") escura com divisórias
  discretas.
- [x] 390 px (iframe da mesma tela): Vencido logo após o nome; cabeçalho do gráfico em 2 linhas;
  eixo curto. Tela larga mantém o rótulo inteiro.
- [x] Contas a Receber no escuro: vermelho solto `#f87171`, `bg-gray-200` só em divisórias de 1 px.
- Observação: abrir a tela com HMR depois de trocar `storageKey` grava o estado antigo na chave nova
  (o `useState` inicial sobrevive ao HMR) — num carregamento normal a chave `:v2` nasce vazia.

## Verificação

`tsc` 0 (com `--max-old-space-size=8192`: sem ele o Node 24 aborta por heap), `check-ui-standard`
limpo, suíte inteira, navegador.
