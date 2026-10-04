# Contratos › aba Emissão — um lugar só para o documento do contrato

## Pedido original

> suprimentos > contratos > aba emissao: analisar possivel duplicidade entre Status & Contrato Assinado e Versões da Minuta

Sessão: 96c7e92a-06fb-4a92-b248-08960e4208ee · 2026-10-03, noite

Depois da análise (resposta abaixo, em "Diagnóstico"), perguntei se os documentos
moram na aba Emissão ou em outro lugar — o commit `818c1419` tinha tirado o
painel novo de versões do detalhe do contrato justamente por espalhar o assunto.

> Emissão é o correto

(mesma sessão, 2026-10-03)

## Diagnóstico (o que a análise achou)

A aba Emissão tinha **dois uploads para o mesmo arquivo**, sem ligação:

| | "Status & Contrato Assinado" | "Versões da Minuta" |
|---|---|---|
| Grava em | `contracts.signed_contract_url` | `contracts.minuta_versions` (JSONB, direto) |
| Aparece | sempre | só com status `Minuta` |

- O `SignaturePanel` mandava para o ZapSign o arquivo do campo "Contrato
  Assinado (GED)" — ou seja, o campo guardava o arquivo **a assinar**, e o
  usuário subia o mesmo PDF duas vezes (versão + GED).
- `MinutaVersionsPanel` é o escritor LEGADO: `contractService.addMinutaVersion`
  está marcado "não usar em código novo"; a fonte da verdade é a tabela
  `contract_document_versions`, e o JSONB é projeção reescrita por
  `_syncMinutaMirror`. Com os dois em uso, versão criada pelo painel antigo
  some na próxima projeção (contrato `001` já tinha as duas representações).
- O significado real de `signed_contract_url` é o que o webhook do
  `sign-contract` grava: o **PDF assinado devolvido pelo ZapSign**.

Banco em 2026-10-03: 43 contratos; 2 com GED, 2 com `minuta_versions`, 5 com
linhas em `contract_document_versions`.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-10-03 | Documentos do contrato moram na aba Emissão ou em outro lugar? | "Emissão é o correto" |

## Plano

1. **`components/ContractModal.tsx`** — a seção `status_documento` perde o
   upload "Contrato Assinado (GED)" e passa a se chamar "Status do contrato".
   Vale para o drawer de criar/editar também (contrato novo ainda não tem id
   para ter versão; o documento entra pela aba Emissão depois de criado).
   *Pronto quando:* `grep "Contrato Assinado (GED)"` não acha nada e o
   `handleFileUpload` órfão saiu.
2. **`components/ContractDetailView.tsx`, aba Emissão** — troca o
   `MinutaVersionsPanel` (legado, só no status `Minuta`) por
   `ContractDocumentsTab` (tabela nova, contrato + aditivos, sempre visível).
   *Pronto quando:* a aba mostra o painel em qualquer status e o componente
   `MinutaVersionsPanel` não existe mais no arquivo.
3. **Assinatura usa a versão, não o GED** — `onSend` pega a versão emitida mais
   recente do contrato (`contractDocumentVersionService.listByOwner`); sem
   versão emitida, avisa "Emita uma versão…". O PDF assinado
   (`signed_contract_url`, gravado pelo webhook) aparece só-leitura no card de
   assinatura. *Pronto quando:* nenhum `fetch(contract.signed_contract_url)`
   resta no envio.
4. **"Emitir Contrato (.docx)" grava a versão** — `persistVersion` ligado no
   `EmitDocumentModal` da aba Emissão, e o painel recarrega
   (`onVersionSaved`). *Pronto quando:* gerar pelo modelo cria um rascunho
   `v{n}` no painel sem subir o arquivo à mão.
5. **Testes/verificação** — `check-ui-standard.sh` nos arquivos tocados,
   `tsc`, suíte de contratos.

## Estado

- [x] 1 · ContractModal sem GED — também o select de status passou a meia
      linha (§30: campo curto não ocupa a linha inteira)
- [x] 2 · Emissão com ContractDocumentsTab — `MinutaVersionsPanel` apagado
- [x] 3 · Assinatura pela versão emitida — PDF assinado só-leitura no card
- [x] 4 · .docx vira versão (`persistVersion` + `onVersionSaved`)
- [x] 5 · Verificação
  - [x] `tsc` limpo; `check-ui-standard.sh` limpo nos 2 arquivos; `check-xss-sinks.sh` limpo
  - [x] trava `__tests__/components/ContractEmissaoDocumentoUnico.test.tsx`:
        4/4 falham no código antigo, 4/4 passam no novo (o caso do drawer
        precisou ser SEM PDF — com PDF o bloco antigo não tinha input e o
        teste passava no código antigo)
  - [x] suíte inteira + build — 7254 = 7220 passou + 34 pulados, 0 falha (JSON conferido); `npm run build` ok
  - [x] conferência visual (`c:/tmp/pwtest/contrato-emissao.js`, só leitura,
        contrato CTS-018-104-0001, 1600×1000): status → documentos → assinatura,
        sem GED e sem "Versões da Minuta", 1 input de arquivo (o do painel),
        link do PDF assinado presente, 0 escritas, 0 erros de console.
        O print mostrou "Assinatura Eletrônica" duas vezes no card (rótulo
        antigo dentro do SignaturePanel) — removido o de dentro.

## Fora do escopo (registrado, não feito)

- **Dado legado, sem migração:** contrato `007` (PDF assinado no GED) continua
  visível como "Contrato assinado" no card de assinatura. `CTS-018-104-0001`
  tem um GED que é um extrato bancário e um rascunho de minuta só no JSONB
  (dados de teste) — o rascunho deixa de aparecer na tela; limpeza só com
  combinação explícita (escrita no banco).
- Métodos legados `contractService.addMinutaVersion/...` ficam (o comentário
  deles já proíbe uso novo).
- Rótulo "Minuta (visível ao cliente)" do status: o portal só mostra versão
  **emitida**; ajustar o texto é decisão de produto à parte.

## Verificação

Abrir Suprimentos › Contratos › um contrato › Emissão: um bloco de status, um
bloco de documentos (contrato + aditivos), o card de assinatura. Subir versão,
emitir, conferir no Portal do Cliente/Parceiro.
