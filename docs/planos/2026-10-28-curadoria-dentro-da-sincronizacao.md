# Curadoria dentro da Sincronização (28/10/2026)

## Pedido original

> "avalie novamente a aba curadoria. me parece que nao tem funcao ou que pode ser absorvida por outra aba"

Decisão do usuário: **absorver na Sincronização**. Foram oferecidas também "esconder quando vazia" e "deixar como
está".

## Avaliação

- **Função:** a Curadoria guarda os conflitos dos envios da Sincronização: massa, loteamento e terreno da Planta.
  - Um campo que o cadastro já tem com outro valor não é sobrescrito. Ele vira proposta, para aprovar (valor da
    origem) ou rejeitar (mantém o do empreendimento).
  - É a proteção contra um envio apagar o que foi digitado.
- **Uso:** `empreendimento_field_proposals` tinha **0 linhas** em produção em 28/10/2026, em todos os
  empreendimentos e em qualquer situação. Nada é apagado ao rejeitar, então isso significa que nunca houve conflito.
- **Sobreposição:**
  - todo conflito nasce na aba Sincronização, que já mostrava "N aguardando decisão na Curadoria" e mandava o usuário
    para outra aba;
  - as decisões já ficam no Histórico (`empreendimento_audit_logs`).

## Mudança

1. **`EmpreendimentoDetail`:**
   - a aba "Curadoria" sai do menu;
   - o contador de pendentes vai para a aba "Sincronização";
   - no fim da Sincronização entra o bloco **Curadoria**, com título, resumo ("N conflito(s) a decidir") e a mesma
     lista e as mesmas ações em lote;
   - o bloco só aparece quando o empreendimento já teve alguma proposta (`countAll`). Só decididas: o bloco fica, para
     consultar.
2. **`empreendimentoProposalService.countAll`** (novo): conta as propostas em qualquer situação.
3. **Textos que diziam "aba Curadoria":**
   - na Sincronização passam a dizer "na Curadoria, no fim desta aba";
   - na Planta (envio ao empreendimento, Estudo de Massa) passam a dizer "Curadoria (aba Sincronização do
     empreendimento)".
4. A regra de proteção (conflito vira proposta, nada é sobrescrito) **não muda**.

## Verificação

- **Testes:**
  - `EmpreendimentoDetailCuradoria` (4): sem aba, sem bloco quando vazia, contador na Sincronização com bloco, e só
    decididas;
  - suítes de sincronização e Curadoria;
  - `SyncCenterTabArquitetura` com o texto novo.
- **Mecânicas:** tsc; check-ui-standard.
