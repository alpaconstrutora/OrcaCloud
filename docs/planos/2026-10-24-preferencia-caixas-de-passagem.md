# Planta › Preferências — caixas de passagem × encaminhamento pela luz do teto

## Pedido original

Sessão `9e26b316`, 24/10/2026 (tarde), com dois prints: a planta Garden após o PR #137 (eletrodutos entrando em
caixas de passagem "CP" nos cantos e no meio das paredes) e o projeto de referência (apartamentos 201/202, sem CP):

> *"em instalacao residencial não se usa caixas de passagens como sugerido no projeto. Mas nao vamos deixar de
> oferecer como solucao ao usuário.
> Incluir em preferencias se ele quer utilizar caixas de passagens ou utilizar prefertencialmente encaminhamentos via
> luz no teto. o usuário escolhe"*

Decisões (mesma sessão):
- *"De cada usuário (Recomendado)"* — a escolha acompanha a pessoa (preferência de escopo USUARIO, como as de
  exibição do PR #128);
- *"Pela luz do teto, sem caixas (Recomendado)"* — padrão para quem ainda não escolheu.

## Contexto

Hoje a escolha existe escondida: caixa de seleção "caixas de passagem automáticas" no painel dos eletrodutos
(`BlueprintEditor.tsx`, `usePersistedState('blueprint:eletrodutosCaixas', true)`), só no navegador e LIGADA por
padrão. Ligada, `planejarEletrodutos` (`utils/blueprintEletrodutos.ts`, bloco "E6.3: CAIXAS DE PASSAGEM") corta a
rede e insere CP a cada 15 m ou 270° de curvas (NBR 5410, 6.2.11.1.7; `REGRA_DE_CAIXAS_PADRAO`). Com o encaminhamento
pela luz (PR #137), a caixa da luz de teto, a da tomada e o quadro já são as caixas do trecho — em obra residencial
não se põe CP.

## Abordagem

1. **Preferência do usuário** `planta.lancamento.caixasDePassagem` (escopo USUARIO, tabela `preferencias` — sem
   migration: a CHECK aceita `planta.%`), com duas opções:
   - `PELA_LUZ` — "Preferir o encaminhamento pela luz do teto (sem caixas de passagem)" — **padrão**;
   - `CAIXAS` — "Usar caixas de passagem (NBR 5410: a cada 15 m ou 270° de curvas)".
   Reaproveitar a máquina do PR #128 (mesma query por usuário, contador de gravações, aviso de leitura único,
   otimista com releitura); sem a sessão, fica no navegador.
2. **Onde aparece:** aba **Preferências** da Planta, grupo Elétrica, uma seção "Lançamento" com a escolha (rótulos
   acima). A caixa de seleção do painel dos eletrodutos passa a ler/gravar a MESMA preferência (atalho, como o menu
   Exibir do #128) — uma escolha só, mostrada nos dois lugares.
3. **Sem migração do valor antigo do navegador**: o padrão mudou por decisão do usuário; o antigo era `true` para
   quase todos (o `usePersistedState` grava o padrão na montagem) e migrá-lo desfaria a decisão.
4. **Sem caixas, o plano avisa o que a NBR pediria:** com `PELA_LUZ`, o planejador calcula as caixas como hoje mas
   NÃO as insere; se houver trecho que precisaria de caixa (mais de 15 m ou mais de 270° de curvas entre duas caixas
   — luz, tomada, quadro), sai UM aviso no plano: "N ponto(s) da rede passam de 15 m ou 270° de curvas sem caixa
   (NBR 5410 6.2.11.1.7) — ligue as caixas de passagem nas Preferências ou confira". Nada é escondido.
5. **Quem obedece:** Lançar, Relançar e Refazer do editor (as hipóteses vêm da preferência). A Casa Automática segue
   com as hipóteses próprias dela (fora do escopo; anotar).

**Como sei que terminou:**
- teste do catálogo/hook: padrão `PELA_LUZ`; gravar `CAIXAS` vai ao banco na chave certa e volta na releitura;
- teste da aba: a seção "Lançamento" mostra as duas opções e grava; o checkbox do painel mostra a mesma escolha;
- teste do planejador: com `caixas: null` e uma rede de 20 m reta, nenhum `CAIXA_PASSAGEM` criado e o aviso aparece;
  com a regra, as caixas como hoje;
- teste-trava: nenhum `usePersistedState('blueprint:eletrodutosCaixas'` no editor;
- check-ui sem piorar; tsc 0; CI verde.

## Estado
- [x] implementação + testes
- [ ] revisão
- [ ] PR + CI
- [ ] publicação
