# Contrato › Financeiro em cards e nova ordem das abas

## Pedido original

> 1. Separe os cards da mesma maneira que foi implementado na aba resumo (veja print). cards aba dados gerais: Valores, Condições de Pagamento, Centro de Custo e Orçamento, Retenção de Garantia
> 2. Mover as abas:
> 2.1. aba Financeiro para ao lado do itens do contrato
> 2.2. aba medicoes para ao lado do financeiro
>
> (com print da aba Resumo do contrato CTS-010-036-0002: "Salvar alterações" na barra do
> topo e cada bloco no seu card)

Sessão 75841d62-8ffb-4424-aa94-4d65426f215e · 17/10/2026.

Referência: a aba Resumo (commits efb34146 e 5bdda9b8) — `ContractModal` com `cardPorSecao` e
`barraDeAcoes`, 12px entre os cards.

## Itens

### 1. Financeiro › Dados Gerais em cards
- **O que muda:** o `ContractModal` embutido liga `cardPorSecao` + `barraDeAcoes` (Valores,
  Condições de Pagamento, Centro de Custo e Orçamento, cada um num card; Salvar na barra do
  topo, logo depois das sub-abas Dados Gerais/Parcelas). Retenção de Garantia vira card no
  mesmo desenho (cabeçalho com ícone, "Liberar Retenção" no cabeçalho, com o motivo quando
  desligado). 12px entre os cards só em Dados Gerais. Guia §30 atualizado.
- **Como sei que terminou:** typecheck; `check-ui-standard.sh`; conferência visual logada.
- **Status:** ✅ conferido no build da frente (Playwright logado, só leitura, 0 escritas, 0 erros): os 4 blocos em card próprio, Salvar na barra com `form=` do formulário, 12px medidos entre os 4 cards. A medição pegou 24px antes de Retenção: no Tailwind v4 o `space-y` do form dava margem ao bloco principal porque o rodapé vazio (Salvar foi por portal) seguia sendo o último filho — o form não leva space-y quando o rodapé está vazio (vale também para o Resumo).

### 2. Ordem das abas
- **O que muda:** Resumo, Itens do Contrato, **Financeiro**, **Medições**, Execução & Entrega,
  Riscos & Conformidade, Aditivos, Penalidades, Avaliação, Emissão.
- **Como sei que terminou:** conferência visual da barra de abas.
- **Status:** ✅ conferido: Resumo | Itens do Contrato | Financeiro | Medições (M/F) | Execução & Entrega | Riscos & Conformidade | Aditivos | Penalidades | Avaliação | Emissão
