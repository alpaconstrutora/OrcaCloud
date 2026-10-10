# Mapa Regulatório dentro da Planta Inteligente

## Pedido original

Sessão de 10/10/2026, 07:35:

> mover incorporacao > mapa regulatorio para dentro do mover incorporacao > planta inteligente
> continue

(Não havia trabalho anterior registrado para este pedido — nenhuma frente, plano ou
estado de trabalho; o "continue" foi lido como "pode seguir".)

## Leitura do pedido

Hoje o menu **Incorporação** tem dois itens separados: *Mapa Regulatório* (cadastro do
mapa de zoneamento por cidade) e *Planta Inteligente* (lista de plantas + editor). O
editor já consome o Mapa Regulatório (painel de zona urbanística, recuos e limites), então
o cadastro passa a morar dentro da tela da Planta, como aba.

## Decisões

- **Aba, não item de menu.** A tela da Planta ganha `TabsBar` (§19.1) com *Plantas* e
  *Mapa Regulatório*. A aba é persistida por usuário (`usePersistedState`).
- **Título muda com a aba** (§19.1/§20): cada aba é dona do próprio `<h1>`; a barra de
  abas entra entre título e KPIs pelo `tabsSlot` (§19.3) no `RegulatoryMapModule`.
- **A permissão continua a mesma.** O Mapa Regulatório exigia `canViewImovib` /
  `incorporacao`; a Planta não tem trava. A aba só aparece para quem tinha acesso ao
  Mapa Regulatório — o `AppRouter` calcula com o MESMO `isModuleAllowed` do guard de
  rota (extraído para fora do efeito, sem duplicar a regra).
- **O endereço antigo não quebra.** `regulatory-maps` (URL, `orca_activeView` salvo no
  navegador, busca rápida do menu) redireciona para `blueprint` com a aba Mapa
  Regulatório aberta, via `navigateToFocus` (o deep-link transitório do store).

## Itens

1. **`AppRouter`: `isModuleAllowed` fora do efeito** — o guard de rota passa a chamar a
   função extraída; comportamento idêntico. *Pronto quando:* tsc limpo e o guard
   continua redirecionando as mesmas rotas.
2. **`AppRouter`: rota `regulatory-maps` vira redirecionamento** para `blueprint` com
   foco na aba; `BlueprintModule` recebe `podeVerMapaRegulatorio`. *Pronto quando:*
   abrir `?view=regulatory-maps` (ou a busca rápida) cai na Planta, aba Mapa Regulatório.
3. **`BlueprintModule`: barra de abas** Plantas | Mapa Regulatório, aba persistida,
   consome o `viewFocus`. *Pronto quando:* trocar de aba troca título e conteúdo; recarregar
   mantém a aba; sem permissão a barra não aparece.
4. **`RegulatoryMapModule`: `tabsSlot`** entre título e KPIs. *Pronto quando:* a ordem
   na tela é título → abas → KPIs → tabela.
5. **`Layout`: item "Mapa Regulatório" sai do menu Incorporação.** *Pronto quando:* o
   menu não lista o item; Planta Inteligente fica ativa com a aba aberta.
6. **Textos que apontavam "Incorporação › Mapa Regulatório"** passam a dizer
   "Planta Inteligente › Mapa Regulatório". *Pronto quando:* `grep` não acha o caminho antigo.
7. **Verificação** — `check-ui-standard.sh` nos arquivos tocados, `orgContextGuard`,
   tsc, testes da Planta, conferência na tela, publicar.

## Estado

- Itens 1–6: feitos.
  - Textos trocados: `PainelZonaUrbanistica.tsx` (aviso "mapa sem zona" e cabeçalho) e
    `ImportRegulatoryZonesModal.tsx` ("Cadastre em Incorporação → Planta Inteligente, aba
    Mapa Regulatório").
  - A busca rápida do menu (`Layout.tsx`, lista de comandos) mantém o id
    `regulatory-maps` — o redirecionamento do item 2 é quem a leva à aba.
- Item 7 (verificação):
  - `check-ui-standard.sh`: limpo em `BlueprintModule`, `RegulatoryMapModule` e
    `PainelZonaUrbanistica`. Em `ImportRegulatoryZonesModal` acusa o `useState` da cidade
    (linha 22) — pré-existente, é a exceção §3.1 (estado de modal de escolha); só o texto
    mudou ali.
  - `orgContextGuard`: 14/14. Typecheck: exit 0, zero erros.
  - Teste novo `__tests__/components/BlueprintModuleAbaMapaRegulatorio.test.tsx` (4/4):
    troca de aba troca título e conteúdo e persiste; ordem título → abas → KPIs; sem
    permissão não há barra nem mapa, mesmo com a aba salva; `viewFocus` do endereço
    antigo abre a aba e é consumido.
  - Harness `docs/spikes/aba-mapa-regulatorio/` (tela real, REST do Supabase
    interceptado só para leitura, escrita abortada; sidebar de 256 px + gutter `p-6`):
    10/10 — h1 por aba; ordem título → abas → KPIs → tabela; título → abas = 24 px e
    abas → KPIs = 12 px (§20.1); recarregar mantém a aba; sem permissão não há barra;
    0 escritas; 0 erros de página.
    - A foto mostrou o botão primário em alturas diferentes nas duas abas (37 px no
      mapa, 24 px nas plantas): o cabeçalho da Planta passou ao mesmo
      `md:items-center` do Mapa — o portão agora confere a mesma altura.
  - Suíte inteira: 7897 = 7863 + 34 pendentes, 0 falhas; 769 arquivos = 769 no disco.
  - Passeio na tela com login: **não feito** — exige a senha do usuário de leitura.
