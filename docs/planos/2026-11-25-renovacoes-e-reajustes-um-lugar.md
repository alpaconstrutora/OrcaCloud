# Locações: renovações num lugar só, reajustes num lugar só

## Pedido original

Sessão 98df7c3d, 25/11/2026:

> o fluxo ficou extremamente confuso.
> as renovações e reajustes ficaram na tela da Gestão de Unidades e em Gerenciar Negociação > contratos tambem temos aba renovações com os dados das renovações e aba documentos com os documentos das renovações.
> Mesmo assunto em dois lugares diferentes. Sugiro concentrar em um local para renovações e um local para reajustes. O que voce acha?

Proposta respondida na sessão: renovações e reajustes ficam em **Gestão de Unidades**,
lado a lado e com o mesmo jeito de trabalhar; a negociação mantém só as condições do
contrato e mostra um resumo. Resposta do usuário:

> escreva o plano

## Como está hoje (conferido no código e no banco em 25/11/2026)

| Assunto | Gestão de Unidades (`RentalsModule`) | Gerenciar Negociação › Contrato e Assinatura (`DealModal`) |
|---|---|---|
| Reajustes | aba **Reajustes**: A decidir + Histórico, Ver/Editar/Excluir (`RentalReajustes`, `RentalReajustesHistorico`) | só as **condições**: Periodicidade, Índice, Avisar antes do reajuste (sub-aba Dados do contrato) |
| Renovações | aba **Renovações**: fila + Histórico, Ver/Editar/Excluir (`RentalRenewals`, `RentalRenovacoesHistorico`); **Renovar e Editar levam para a negociação** | sub-aba **Renovações** (`ContractRenewalsPanel`): formulário de renovar + histórico do contrato com Editar/Excluir |
| Documentos | — | sub-aba **Documentos**: versões do documento **do contrato** (`DocumentVersionsPanel ownerType="CONTRACT"`) |

Achados que entram no plano:

- **Documento de aditivo de locação não tem tela.** A sub-aba Documentos lista só o
  contrato. O painel por aditivo (`ContractDocumentsTab`, abas Contrato | AD-00X) vive em
  `ContractDetailView`, que é tela de Suprimentos/Serviços, não de Locações. No banco: 6
  versões de documento de locação, **todas do contrato**, nenhuma de aditivo. A emissão
  por modelo (`EmitDocumentModal`) só emite para o contrato (`ownerType: 'CONTRACT'`).
- `components/rentals/RenewContractSheet.tsx` (412 linhas) não tem nenhum uso e ainda
  aplica reajuste na renovação (`applyReajuste`), o que vai contra a decisão de 24/11
  ("renovar ≠ reajustar").
- O aviso diário de vencimento (`daily-rental-renewal-alerts`) leva para
  `/rentals?tab=renewals&contract=<id>`, ou seja, já aponta para a Gestão de Unidades.

## Como fica

**Reajustes:** já estão num lugar só. Nada muda na operação; a negociação continua com
as condições (índice, periodicidade, aviso) porque elas são regras do contrato, não a
operação do reajuste.

**Renovações:** tudo em **Gestão de Unidades › Renovações**:
- **A renovar:** Renovar abre uma **gaveta ali mesmo** (o formulário de hoje), sem sair
  da tela.
- **Histórico:** Ver / Editar / Excluir. Editar abre a mesma gaveta em modo edição.
- **Ver** de uma renovação por aditivo mostra os dados **e os documentos do aditivo**
  (anexar PDF, enviar para assinatura, acompanhar).

**Negociação › Contrato e Assinatura:**
- a sub-aba **Renovações sai**;
- **Dados do contrato** ganha uma linha só de leitura com a situação da vigência
  (ex.: *"Vigência até 22/09/2021 · última renovação AD-004 · próximo reajuste
  05/11/2020"*) e o atalho **"Renovações e reajustes em Gestão de Unidades"**;
- **Documentos** fica só com os documentos do próprio contrato.

## Itens

1. **Gaveta de renovação** — novo `components/rentals/RenovacaoSheet.tsx`, com o
   formulário que hoje está em `ContractRenewalsPanel` (via, início, fim/prazo, valor,
   periodicidade, dia, índice, observações, aviso do que vai acontecer). Dois modos:
   renovar (`renewByAddendum` / `renewContract`) e editar (`replaceAddendumRenewal`).
   Leva junto as proteções já feitas: só vale a prévia do último pedido (#739), e a
   recusa quando há reajuste depois do aditivo (serviço, #739). Pronto quando:
   - teste de componente cobre renovar e editar, incluindo a prévia atrasada (o teste
     `renovacaoEditarPreviaAtrasada` passa a montar a gaveta);
   - `check-ui-standard` sem achados.
2. **Fila e Histórico abrem a gaveta** — em `RentalRenewals.tsx` e
   `RentalRenovacoesHistorico.tsx`, Renovar e Editar abrem `RenovacaoSheet` em vez de
   abrir a negociação; "Ver contrato" continua abrindo a negociação. Saem
   `onEditRenewal`, `openDealForContract(id, aditivoId)`, `renovacaoParaEditar`
   (`RentalsModule`) e `editarRenovacaoId` (`DealModal`). Pronto quando: em produção,
   Renovar e Editar no CTL-006 abrem a gaveta na própria aba, sem abrir a negociação
   (conferência só lendo, cancelando sem salvar).
3. **Documentos do aditivo no Ver** — `RenovacaoRegistroSheet` ganha a seção
   "Documentos do aditivo" com `DocumentVersionsPanel ownerType="ADDENDUM"` (anexar
   PDF, assinatura, portal: o que o painel já faz para o contrato). Pronto quando:
   - o Ver do AD-004 mostra a seção vazia com o caminho para anexar;
   - teste de componente confere que o painel recebe `ownerType="ADDENDUM"` e o id do
     aditivo.
4. **Negociação sem a sub-aba Renovações** — em `DealModal.tsx` saem a sub-aba e o
   `ContractRenewalsPanel`. `initialTab='contrato'` passa a abrir em "Dados do
   contrato". "Dados do contrato" ganha a linha de situação e o atalho para Gestão de
   Unidades › Renovações. `ContractRenewalsPanel.tsx` é apagado depois que o formulário
   estiver na gaveta (item 1). Pronto quando:
   - nenhum import de `ContractRenewalsPanel` sobra no código;
   - o CTL-006 na negociação mostra "Vigência até 22/09/2021 · última renovação AD-004 ·
     próximo reajuste 05/11/2020";
   - `abasPeloTeclado` e os testes de DealModal verdes.
5. **Apagar `RenewContractSheet.tsx`** (sem uso, e aplica reajuste na renovação).
   Pronto quando: `git grep RenewContractSheet` sem resultado e `tsc` limpo.
6. **Guia e memória** — registrar a regra "renovação e reajuste se operam em Gestão de
   Unidades; a negociação só mostra a situação" (`docs/ui_ux_guia_unificado.md`, onde
   couber, ou só o plano + memória se o guia não tiver seção de fluxo). Pronto quando:
   o texto existe e cita este plano.

## Decisão do usuário (25/11/2026)

Pergunta: gerar o documento do aditivo por modelo (.docx), como "Gerar Documento do
Contrato", entra neste plano? Resposta:

> Uma decisão sua antes do item 3: incluir

3b. **Gerar o documento do aditivo por modelo** — o que já existe e é reaproveitado:
   - o catálogo de campos tem o grupo **Aditivo** (`services/docxFieldCatalog.ts`: número,
     descrição, início/fim da nova vigência, fim anterior, novo valor e por extenso,
     valor anterior, índice, fator, aprovação);
   - `ResolveContext.addendum` já existe;
   - o contexto de locação vem de `buildRentalResolveContext` (o mesmo da minuta do
     contrato).

   O que muda: `EmitDocumentModal` ganha a prop `addendum`. Com ela:
   - grava a versão com `ownerType: 'ADDENDUM'`, `ownerId` do aditivo e `kind: 'ADITIVO'`;
   - nomeia o documento como "CTL-006-012-0001 - Aditivo AD-004 ao Contrato de Locação";
   - põe o aditivo no contexto.

   Na gaveta Ver da renovação, o botão **"Gerar documento do aditivo"** abre o modal, e
   o PDF gerado entra na lista de documentos do aditivo (item 3). "Modelos de documento"
   abre a mesma tela de modelos (`DocxTemplateManager`) a partir da Gestão de Unidades.
   Pronto quando:
   - teste do modal: com `addendum`, a versão é gravada como ADDENDUM/ADITIVO no aditivo
     certo; sem `addendum`, nada muda (CONTRACT/MINUTA);
   - teste do catálogo: os campos `addendum.*` resolvem com os dados do AD-004
     (23/03/2020, 22/09/2021, R$ 5.832,48 e por extenso);
   - em produção: abrir o modal do AD-004, conferir a lista de modelos e fechar sem
     gerar (gerar grava uma versão; só com o seu OK).

## Andamento

- **PR 1 (itens 1, 2, 4, 5), 25/11/2026:**
  - código e testes prontos: `renovacaoEditarPreviaAtrasada` monta a gaveta (falha sem a
    proteção da prévia atrasada e passa com ela ✅); `renovacoesUmLugar` (fila abre a
    gaveta em Renovar e Editar, Ver contrato abre a negociação, linha de situação com
    atalho ✅);
  - `ContractRenewalsPanel.tsx` e `RenewContractSheet.tsx` apagados, sem nenhum uso no
    código ✅;
  - `tsc` limpo, `check-ui-standard` sem achados nos 6 arquivos tocados, 160 testes
    relacionados verdes ✅;
  - conferido em produção (#746, 481ff4c), só lendo e cancelando: Renovar abre a gaveta
    na própria aba (início 23/09/2021, 12 parcelas, a 1ª em 10/11/2021), Editar o AD-004
    abre em edição (23/03/2020 a 22/09/2021, R$ 5.832,48, 18 parcelas), a negociação não
    abre; Ver contrato abre a negociação com as sub-abas só Dados do contrato |
    Documentos e a linha "Vigência até 22/09/2021 · última renovação AD-004 · próximo
    reajuste 05/11/2020" com atalhos; 0 gravações, 0 erros ✅. Itens 1, 2, 4 e 5
    concluídos.
  - observação: na mesma tela, o campo Fim da Vigência DA NEGOCIAÇÃO mostra 22/03/2019
    (os 30 meses originais) — é a vigência da negociação, não a do contrato. Pode
    confundir ao lado da linha de situação; fora deste plano.
- **PR 2 (itens 3, 3b e 6), 25/11/2026:**
  - `EmitDocumentModal` com `addendum`: grava ADDENDUM/ADITIVO no aditivo, nome
    "CTL-006-012-0001 - Aditivo AD-004 ao Contrato de Locação", aditivo no contexto;
    sem ele nada muda ✅ (`gerarDocumentoDoAditivo.test.tsx`, mais os 3 testes antigos
    do modal verdes);
  - catálogo: `addendum.*` resolve com o AD-004 ✅. ⚠️ Achado fora do plano: o
    `valorPorExtenso` escreve "cinco mil **e** oitocentos e trinta e dois" (o certo é
    "cinco mil oitocentos e trinta e dois"); vale para as minutas também. Não corrigido aqui;
  - Ver da renovação: "Documentos do aditivo" com `DocumentVersionsPanel
    ownerType=ADDENDUM`, Gerar documento do aditivo (desligado no cancelado, com o motivo) e
    Modelos de documento ✅ (`renovacaoDocumentosDoAditivo.test.tsx`);
  - storage: o caminho `contract-addendums/<aditivo>/` já é aceito pela função aplicada
    `documents_objeto_da_minha_org` (conferido no banco) ✅;
  - item 6: guia §18.1 "Uma operação, um lugar" + memória ✅;
  - `tsc` limpo, `check-ui-standard` sem achados, 188 testes relacionados verdes ✅;
  - falta: conferência em produção (abrir o Ver do AD-004 e o modal, fechar sem gerar).

## Ordem de entrega

- **PR 1:** itens 1, 2, 4 e 5 (a renovação muda de lugar).
- **PR 2:** itens 3 e 3b (documentos do aditivo).
- Item 6 no fim.

## Pedido de 25/11/2026: os três achados da conferência

Os três achados foram apresentados ao usuário (vigência da negociação × do contrato;
extenso "cinco mil e oitocentos"; locador herdado do empreendimento). Resposta:

> Corrija todos

7. **Vigência original na negociação** (`DealModal.tsx`, `SituacaoDaVigencia.tsx`): contrato
   renovado → os campos viram "Início/Fim da Vigência original" e uma frase diz até quando
   o contrato foi prorrogado e por qual aditivo. O que é gravado não muda (a divergência é
   legítima — `vigenciaParaOContrato`, #682). Pronto quando:
   - `situacaoDaVigenciaOriginal.test.tsx` verde ✅;
   - em produção o CTL-006 mostra "Fim da Vigência original" e "prorrogado até 22/09/2021
     (AD-004)".
8. **Extenso** (`services/docxFieldCatalog.ts`): o "e" entre os grupos só entra antes de grupo
   menor que cem ou centena redonda; milhão/bilhão redondo vira "de reais". Vale para
   contratos, aditivos e recibos. Pronto quando: `valorPorExtenso.test.ts` verde ✅ — e o
   `reciboRecebimento.test.ts`, que cravava o erro ("mil e duzentos e trinta e quatro"), foi
   corrigido ✅.
9. **Locador herdado do empreendimento** (`services/empresaDoEmpreendimento.ts`, nova): uma
   função só (unidade → torre → empreendimento), usada pelo locador dos documentos (a
   consulta antiga pedia `empreendimento_units.empreendimento_id`, que não existe) e pelo
   regime tributário (`taxPayableService`, que já fazia certo). Medido antes no banco:
   **0 dos 9 contratos de locação mudam de locador** hoje. Pronto quando:
   `empresaDoEmpreendimento.test.ts` verde ✅ e, em produção, a geração do aditivo do CTL-006
   sem o 400 em `empreendimento_units`.

Verificação: `tsc` limpo, `check-ui-standard` sem achados, 1.003 testes relacionados verdes ✅.

## Fora

- Reajuste: nenhuma mudança de fluxo.
- Renovação por **novo contrato** continua com o defeito de datas registrado na #733
  (nenhum caso no banco).
