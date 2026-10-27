# Ordem das unidades no pavimento: automática e manual (27/10/2026)

## Pedido original

> "veja que a divisão das unidades se dão de forma irregular. Está baseada na área de cada um deles?"
>
> (resposta: sim — a irregularidade vinha das fileiras, primeira metade × segunda metade, e da ordem do cadastro)
>
> "1. Temos que fazer uma ordenação de duas maneiras, automática como você está sugerindo e manual."

Seguimento da PR #207 (cada unidade de cada pavimento na massa). A elevação do pavimento (item 2 do mesmo pedido)
vai numa PR própria, com migration.

## O que estava errado (Garden Cambuhy, dados de produção)

- **Fileiras desiguais:**
  - Com 4 unidades, o andar virava duas fileiras: a 1ª metade da lista numa, a 2ª na outra.
  - Na Torre A, 101 = 127 m² e 102 = 127 m² caíam juntas (254 m²); 103 = 81 m² e 104 = 81 m² na outra (162 m²).
    Uma fileira ficava com 61 % do andar.
- **Ordem do cadastro:**
  - O 3º andar da Torre A vem 303, 204, 201, 202 (`sort_order` 12–15); os outros andares têm `sort_order` 0.
  - As fileiras trocavam de lado e as divisas não se alinhavam com o 2º andar.

## Decisões do usuário

- **Duas maneiras:**
  - automática, como sugerido (pelo número, fileiras equilibradas pela área);
  - manual.
- **A manual mora no Empreendimento:** `empreendimento_units.sort_order`, mudado em Torres e Unidades. É uma ordem
  só, que a Planta e o resto do sistema seguem.

## Mudança

1. **`utils/empreendimentoOrdemDasUnidades.ts` (puro, novo):**
   - `compararNaOrdemDoEmpreendimento`: `sort_order`, e no empate o nome com número.
   - `compararPorNumero`: pela coluna, os dois últimos dígitos, então 101/201/301 caem no mesmo lugar. Nome sem
     número vai para o fim.
   - `moverNaOrdem` (seta) e `ordemPorNumero` (botão) devolvem só os `sort_order` que mudam. Eles renumeram o
     pavimento a partir do menor valor quando o cadastro tem empates (o Garden tem andares inteiros com 0).
2. **`fatiasPorArea(anel, pesos, fileiras)`:**
   - `'ORDEM'` (padrão, o de antes): 1ª metade numa fileira, 2ª na outra. É o que a pessoa arrumou no
     Empreendimento.
   - `'EQUILIBRADAS'`: cada unidade, na ordem, vai para a fileira com menos área até ali (com vaga).
   - A fatia k continua sendo a unidade k.
   - `arrumarUnidades(unidades, modo)` dá a ordem e as fileiras de cada modo.
3. **Planta:**
   - Preferência `vista3dUnidadesNoPavimento` (AUTOMATICA | EMPREENDIMENTO, padrão AUTOMATICA), no catálogo de
     exibição. Fica por usuário, no banco.
   - O 3D e a lista do painel seguem a escolha.
   - O painel do bloco ganha "Automática | Ordem do Empreendimento", com o que cada uma faz.
4. **Torres e Unidades (`UnitEditor`):**
   - Setas ↑↓ por unidade.
   - "Ordenar por número" por pavimento.
   - Desligados com o motivo quando a tabela está ordenada por outra coluna, na ponta, ou já em ordem.
   - No empate do ordenamento, a tabela usa a ordem do pavimento.
5. `estruturaDaTorre` usa a mesma comparação da aba.

## Verificação

- **Testes:**
  - `empreendimentoOrdemDasUnidades` (9);
  - `blueprintUnidadesNoPavimento` (+6);
  - painel (+1);
  - `UnitEditorOrdemDoPavimento` (4);
  - catálogo de preferências.
- **Mecânicas:** tsc; check-ui-standard; `BlueprintEditor.test.tsx` sozinho; CI.
- **Produção, Garden:**
  - Em "Automática", a Torre A sai com 101+103 numa fileira e 102+104 na outra, 208 m² cada, e o 3º andar alinha
    com o 2º.
  - Em "Ordem do Empreendimento", a massa segue as setas da aba.
