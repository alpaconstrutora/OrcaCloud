# Central de Clientes — as quatro pendências do polish

## Pedido original

> corrigir:
> Achados fora do escopo, que não mexi:
> 1. Em Contas a Receber, no tema escuro, as linhas vencidas ficam com fundo cinza-claro sob texto claro. Já era assim antes.
> 2. O avisos do Impeccable sobre a fonte "DM Sans" no index.css e sobre a borda lateral em TableUtils.tsx apontam para linhas que esta frente não tocou.
> Ainda pendente da série da crítica:
> 3. "Cobrar em Contas a Receber" abre a tela, mas sem filtrar pelo cliente.
> 43 O contrato do Reginaldo está com R$ 1.000, mas tem R$ 12.000 faturados.

Sessão `1880c008-dd77-4f94-9d0d-2c1d01ed5ec4` · 28/10/2026, logo após o #229.

## 1. Tinta translúcida no tema escuro

`bg-red-50/30` (linha vencida) e as ~200 linhas com `hover:bg-blue-50/50` viravam cinza-claro sobre o
escuro: tinta clara × opacidade sobre `#171a22`. No `.theme-midnight`, `bg-<matiz>-50/N` (e o hover)
vira a tinta escura do mesmo matiz (`rgba(<tom 400>, .10/.14)`), para red, rose, orange, amber,
emerald, green, blue, indigo e purple. Texto colorido escuro NO MESMO elemento (`text-blue-700
bg-blue-50/30`, 31 lugares) clareia junto. Selo de fundo sólido (`bg-red-50`, sem `/N`) fica igual.

## 2. Avisos do Impeccable — exceções registradas, não defeitos

- **DM Sans**: é a fonte dos portais Cliente/Investidor/Fornecedor/Corretor/Credor no celular
  (`.portal-mobile-font`, desde 18/06/2026). O `DESIGN.md` é o design system do Portal do
  Colaborador, que usa só Inter — documentar DM Sans lá seria errado. `ignore-value
  design-system-font "DM Sans"` com o motivo em `.impeccable/config.json`.
- **side-tab em `TableUtils.tsx`**: é o indicador de 2 px de "solte aqui" ao arrastar coluna
  (`before:w-0.5` só durante `dragOver`), não acento de cartão. `ignore-value side-tab "*"` só neste arquivo.
- De quebra: comentário da regra DM Sans no `index.css` com travessão corrompido ("â€”") e dizendo
  só "Portal do Cliente" — corrigido.

## 3. "Cobrar em Contas a Receber" já no cliente

A navegação do app é estado, não URL. Usa o deep-link que já existe (`navigateToFocus(view, ref,
source)`, o mesmo das notificações → `CONTA_RECEBER`): a Central, com um cliente no topo, manda
`VENCIDOS_DO_CLIENTE` com o id dele (= `party_id` do título — conferido: 362/362 títulos casam com
`clients.id`). Em "Todos os clientes" continua só abrindo a tela.

Contas a Receber, ao receber: limpa busca, status, período, ano/mês e filtro avançado guardados (a
lição do #233 — "Ver tarifas" abria vazio por filtro antigo) e recorta só os VENCIDOS daquele cliente,
de qualquer período. Recorte não persistido; aviso `role="status"` com "Mostrar todos os títulos".

## 4. "Contratado" do Reginaldo — a CONTA estava errada, não o dado

CTL-010-0001 é locação mensal: 36 parcelas de R$ 1.000 (36 títulos, R$ 36.000). Em contrato
recorrente `current_value` é a PARCELA; `fn_opura_cliente_kpis` somava `current_value` como total.
Migration `aplicar_20271028900000`: recorrente conta parcela × `payment_installments`. Simulação
(leitura): muda 7 clientes — Reginaldo 1.000 → 36.000, Igreja Universal 4.556 → 136.680, Filtrelec
1.300 → 46.800, Dynamis 1.500 → 54.000, Fernanda 1.000 → 36.000, Murilo 800 → 28.800, Ivana
1.100 → 26.400. Card: "valor total (locação: todas as parcelas)".

**Achado de cadastro:** a Defensoria (CTL-010-0002) estava com ciclo "Anual" e 1 parcela, mas tem
vigência 25/05/2020–25/05/2025 e 60 títulos mensais de R$ 3.000 (R$ 180.000). Usuário escolheu
**"Corrigir p/ Mensal, 60x"**: `UPDATE` só nesse contrato (travado nos valores antigos), sem gatilho
que reaja a ciclo/parcelas; locação original é faturada pela negociação, então nenhuma parcela nasce.

## Estado

- [x] 3 — navegador: Central › Reginaldo › "Cobrar" com busca antiga `xyz-filtro-antigo` guardada →
  Contas a Receber com busca vazia, 14 títulos só do Reginaldo, Vencidos R$ 14.000 (= "vencido
  R$ 14.000" do gráfico da Central em Posição de hoje), aviso do recorte.
- [x] 1 — navegador: linhas vencidas em tinta vermelha escura no "Escuro Total".
- [x] 4 — **"Liberado"**: migration aplicada (`db query -f`); 1 sobrecarga, `anon` sem EXECUTE; RPC
  devolve Reginaldo 36.000 (1 contrato) e Defensoria 180.000 após o ajuste do cadastro.

## Verificação

`tsc` 0, `check-ui-standard` limpo nas duas telas, `migrationsPrefixo.test` 3/3, suíte inteira, navegador.
