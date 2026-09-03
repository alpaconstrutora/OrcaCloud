# Portal do Cliente — nova aba "Dados da Unidade"

## Pedido original

> **Usuário, 2026-09-03 (sessão `856f188e-e1b1-439f-8f57-d4475a7fe60d`), transcrito literalmente:**
>
> portal do cliente: Criar nova aba: Dados da Unidade

## Leitura do pedido (o que foi assumido, e por quê)

O pedido tem uma frase. O que ela **não** diz é de qual unidade se trata — e o
portal já tem duas noções de "unidade" convivendo:

| Noção | Onde vive | Já tem aba? |
|---|---|---|
| Unidade de **condomínio** (o prédio onde a pessoa mora/ocupa) | `unit_occupancies` → `empreendimento_units` | ✅ aba **Condomínio** (2026-09-01) |
| Unidade **negociada** (o imóvel que a pessoa comprou ou alugou) | `commercial_deals` → `commercial_properties` | ❌ **não existe** |

A segunda é o buraco. O comprador de um apartamento e o locatário de uma sala
não têm hoje **nenhuma** tela no portal que mostre a ficha do próprio imóvel:
metragem, fração ideal, pavimento, matrícula, características, endereço. O
Financeiro mostra as parcelas, Contratos mostra o contrato — a coisa em si,
não. É essa a aba que está sendo criada.

Conferido no banco antes de decidir (2026-09-03):

```
type   | status         | qtd | clientes | unidades de empreendimento vinculadas
RENTAL | COMPLETED      |  9  |    8     | 0
SALE   | IN_NEGOTIATION |  1  |    1     | 1
SALE   | PENDING        |  5  |    4     | 5
SALE   | RESERVA        |  1  |    1     | 1
```

Duas consequências de projeto, não opinião:

1. **A fonte primária é `commercial_properties`, não `empreendimento_units`.**
   Os 8 clientes de locação têm imóvel sem unidade de empreendimento vinculada.
   Uma RPC que partisse de `empreendimento_units` devolveria vazio para todos
   eles — a aba abriria bonita dizendo "nenhuma unidade" a quem tem três.
2. `empreendimento_units` entra como **enriquecimento** (fração ideal, área real
   NBR, torre, empreendimento), via `commercial_property_id`, quando existe.

## Decisões tomadas

- **Escala visual antiga (`rounded-[2.5rem]`), não a compacta do §16.** O guia
  diz que a compacta é padrão único, e diz também "não misturar as duas escalas
  dentro da mesma tela". O Portal do Cliente inteiro está na escala antiga —
  inclusive a aba `Condomínio`, criada anteontem. Um card compacto entre duas
  abas de 2.5rem lê como bug, não como padrão. **Migrar o portal inteiro é item
  separado e continua pendente** (§16 ❌, não N/A).
- **Entra nos presets de Vendas e Locação.** Diferente da aba `Condomínio`, que
  foi deixada fora do preset de propósito (nem todo locatário é condômino), todo
  cliente de venda/locação tem, por definição, um imóvel negociado. Preset é
  fallback: quem já configurou `clients.portal_tabs` à mão não é afetado.
- **Duas RPCs, como no Condomínio.** O portal tem três entradas e só uma usa
  token. `commercial_deals`/`commercial_properties` têm RLS `is_org_member`, e o
  cliente logado não é membro da organização: pela via normal receberia zero
  linhas **sem erro**. Erro engolido virando número plausível é o defeito que
  este repositório mais coleciona.
- **Valor mensal de locação = `installment_value`, nunca `value`.** `value` é o
  total do contrato; a confusão entre os dois já custou duas rodadas de correção
  em Locações. Multi-unidade rateia por `unit.value / deal.value`.
- **Pavimento: `0` é TÉRREO.** `NULLIF(floor, 0)` faria o térreo virar "—".
  Dormitórios/banheiros/vagas, ao contrário, caem em `specs` quando a coluna é
  `0` — regra oposta na mesma linha.
- **O que a aba NÃO mostra:** comissão de corretor, dados de outros
  compradores, e o checklist interno de documentos. Nada disso é do cliente.

## Itens

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `supabase/migrations/aplicar_20270918000027_portal_cliente_dados_da_unidade.sql` | 3 funções: `fn_unidade_payload_for_client` (interna), `client_portal_get_unidade` (token/anon), `client_portal_get_unidade_for_client` (autenticado) | Bloco de conferência da própria migration retorna `rpcs_novas=3`, `anon_le_unidade=true`, `anon_NAO_pode_por_id=false` |
| 2 | `services/clientPortalService.ts` | Tipos `PortalUnidadeNegociada`/`PortalUnidades` + `UNIDADES_VAZIO` + `getUnidadesByToken`/`getUnidadesForClient` | `npm run typecheck` limpo; as duas funções espelham o par do Condomínio |
| 3 | `components/client/UnidadeTab.tsx` | Componente novo da aba (arquivo próprio, não mais 300 linhas em `ClientArea.tsx`) | Renderiza card por unidade com identificação, áreas, características, endereço, registro e negociação; loading e vazio explícitos (§11/§12) |
| 4 | `components/ClientArea.tsx` | `'unidade'` no union de `activeTab`, em `ALL_TABS`, no efeito de carga e no `render` | Aba aparece na barra desktop, na barra inferior mobile e no sheet "Mais"; admin vê com o olho de visibilidade |
| 5 | `utils/clientCategory.ts` | `'unidade'` nos presets `VENDAS` e `LOCACAO` | `__tests__/clientCategory.test.ts` passa com as asserções novas |
| 6 | `__tests__/portalUnidade.test.ts` | Testa os dois helpers puros que erram em silêncio: rateio do aluguel mensal e fração ideal em % | `npx vitest run __tests__/portalUnidade.test.ts` verde |

## Estado

- [x] Item 1 — migration escrita
- [x] Item 2 — service
- [x] Item 3 — componente
- [x] Item 4 — wiring no ClientArea
- [x] Item 5 — presets
- [x] Item 6 — testes
- [x] **Migration APLICADA no banco** (2026-09-03). Conferência:
      `rpcs_novas=3`, `anon_le_unidade=true`, `anon_NAO_pode_por_id=false`,
      `anon_NAO_pode_interna=false`
- [x] Verificado no navegador (link público real, `serviceWorkers:'block'`),
      dois casos: locação multi-unidade (Defensoria, 3 salas) e venda
      (Aline / 011 - Garden Cambuhy). Sem erro de console, sem HTTP ≥ 400.
- [ ] Deploy — **não feito**: a árvore de trabalho tem mudanças de outra frente
      (blueprint 3D junções, fiscal). Commit/deploy é decisão do usuário.

## Dois defeitos que só a tela mostrou

Os dois passavam em typecheck, em teste e no `check-ui-standard`. Registrados
porque são exatamente a classe "erro engolido virando número plausível".

1. **`R$ 1.517,26/ano` num aluguel mensal.** A primeira versão derivava o
   sufixo de período de `billing_cycle`. No banco, 2 dos 9 contratos de locação
   estão marcados `Anual` com 36 e 60 parcelas — 36 anos de locação não existe;
   o campo está misturando "frequência de faturamento" com "unidade do valor".
   `installment_value` é, por definição do tipo `PropertyDeal`, o valor MENSAL.
   O sufixo virou `/mês` fixo, e `billing_cycle` aparece como campo próprio,
   rotulado "Periodicidade de faturamento".
2. **Parede de traços.** Imóvel de locação não tem `empreendimento_units`
   vinculada, então "Características" saía com quatro `—` e "Registro do imóvel"
   com três. Seção sem nenhum campo preenchido agora não renderiza; campo vazio
   DENTRO de seção que sobreviveu continua com o traço (ali ele informa que o
   cadastro tem o campo em branco).
