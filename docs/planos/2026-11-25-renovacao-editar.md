# Renovação: botão Editar (= substituir o aditivo)

## Pedido original

Sessão 98df7c3d, 25/11/2026, com print da aba Locações › Renovações (CTL-006-012-0001):

> renovão não tem botão editar em acoes

Decisão do usuário, na mesma sessão (pergunta: "ao clicar em Editar e salvar com outro
fim de vigência, valor ou dia de vencimento, o que deve acontecer com o aditivo?"):

> Substituir (Recomendado) — o AD-002 vira Cancelado e fica no histórico, e nasce o
> AD-003 com os dados novos. Mesmo comportamento do Editar do Reajuste (#728).

## O que havia

- Fila Locações › Renovações (`RentalRenewals.tsx`): Ver contrato, Renovar, Excluir, Encerrar.
- Negociação › Contrato › Renovações (`ContractRenewalsPanel.tsx`), Histórico: só Desfazer.
- Nenhum caminho para corrigir uma renovação salva além de desfazer e renovar de novo.

## Itens

1. **`services/contractRenewalService.ts`** — `replaceAddendumRenewal(addendumId, opts)`:
   confere (aprovado, é a última renovação do contrato, nenhuma parcela do aditivo paga
   ou conciliada, fim > início) ANTES de desfazer; depois `undoAddendumRenewal` +
   `renewByAddendum` com `substituindo` (descrição "substitui o AD-00X"). Regra pura
   `motivoParaNaoEditarAditivo` usada também pela tela. `previewRenewal` aceita
   `substituindo`: contrato como era antes do aditivo.
   **Pronto quando:** `__tests__/renovacaoEditarSubstitui.test.ts` verde (ordem
   prévia→desfaz→gera; recusas sem desfazer nada; falha no meio diz o que fazer). ✅
2. **`services/contractService.ts`** — `ultimoVencimentoDaSerie(contrato, excetoAditivoId)`:
   série sem as parcelas marcadas com o aditivo (as sem marca continuam).
   **Pronto quando:** teste do filtro em `renovacaoAditivoContinuaSerie.test.ts` verde. ✅
3. **`components/rentals/ContractRenewalsPanel.tsx`** — Editar (lápis) no Histórico, no
   último aditivo aprovado; desligado com o motivo nos outros. O formulário vira "Editar
   renovação AD-00X", preenchido com o aditivo, sem a escolha da via, com aviso do que
   acontece, "Cancelar edição" e "Salvar alterações". Prop `editarAditivoId` abre já em edição.
   **Pronto quando:** em produção, CTL-006 › Editar AD-002 mostra início 23/03/2019,
   30 parcelas, a 1ª em 10/05/2019 (prova que a série ignora as parcelas do AD-002).
4. **`components/rentals/RentalRenewals.tsx`** — lápis na coluna Ações quando há
   renovação (mesma condição do Excluir); leva à negociação já editando o aditivo
   (`RentalsModule.openDealForContract(id, aditivoId)` → `DealModal.editarRenovacaoId`).
   Renovação por contrato novo: desligado, com o motivo. Coluna Ações 260→370 px e
   `whitespace-nowrap` ("Ver contrato" quebrava em duas linhas no print).
   **Pronto quando:** em produção, o lápis aparece na linha do CTL-006 e abre a
   negociação em Contrato › Renovações com o formulário em edição.

## Conferência em produção (#737, de1de78)

Só leitura, cancelando sem salvar: lápis na linha do CTL-006 ✅, abre "Editar renovação
AD-002" ✅, início 23/03/2019 ✅, a 1ª em 10/05/2019 ✅ (a série ignora as parcelas do
AD-002), via escondida ✅, lápis do histórico desligado com o motivo ✅, cancelar volta a
"Nova renovação" ✅, 0 escritas, 0 erros. ❌ **Fim veio 22/09/2022 (o AD-002 vai até
22/09/2021) e 42 parcelas em vez de 30**: a prévia da Nova renovação, pedida ao abrir,
chegava depois de Editar preencher o formulário e trocava o fim pelo padrão de +12 meses.

5. **Correção — prévia atrasada** (`ContractRenewalsPanel.tsx`): só vale a prévia do último
   pedido (contador), e o preenchimento automático só toca campo vazio no momento da
   resposta. **Pronto quando:** `__tests__/components/renovacaoEditarPreviaAtrasada.test.tsx`
   falha sem a correção (recebe 2022-09-22) e passa com ela ✅; em produção o fim aparece
   22/09/2021 e 30 parcelas.

## Fora

- Renovação por **novo contrato** não ganha edição (mesma lacuna de datas da #733,
  e nenhum contrato renovado por essa via no banco).
- Não salvei nenhuma edição no CTL-006 para testar — é dado real; a conferência em
  produção para no formulário preenchido.
