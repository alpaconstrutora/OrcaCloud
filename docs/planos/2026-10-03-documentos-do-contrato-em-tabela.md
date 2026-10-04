# Documentos do contrato em tabela — abas §19.1 + ajuste de colunas §6.1.2

## Pedido original

> Transformar em tabela e aplicar o padrão ui_ux_guia_unificado.md no toolbar de abas + botão de ajuste de colunas

Sessão: 96c7e92a-06fb-4a92-b248-08960e4208ee · 2026-10-03, noite — logo depois
de publicar `docs/planos/2026-10-03-emissao-documento-unico.md` (aba Emissão
com o painel de documentos único).

## Interpretação (registrada para conferência)

A barra de abas do contrato (Resumo … Emissão) já segue o §19.1. O que não
seguia o guia era o bloco de documentos da aba Emissão: uma pilha de cartões —
um por versão — e mais um card por aditivo empilhado embaixo. Leitura do pedido:

- **"transformar em tabela"** → as versões viram `StandardTable` (§6.10);
- **"toolbar de abas"** → Contrato / Aditivo N viram abas `TabsBar` acopladas
  à tabela (`toolbarTop`, mesmo arranjo de `blueprint/TelaLegislacao.tsx`), em
  vez de cards empilhados;
- **"botão de ajuste de colunas"** → engrenagem de colunas + autofit
  `MoveHorizontal` (§6.1.2), que o `StandardTable` já embute.

## Plano

1. **`components/contracts/DocumentVersionsPanel.tsx`** — lista de cartões →
   `StandardTable`: colunas Versão · Documento · Situação · O que mudou ·
   Origem · Data; busca escopada pelo dono; ações §9 (Emitir em texto azul,
   abrir, editar, excluir com `useConfirm`; excluir desabilitado com o motivo
   no `title` quando emitida/em assinatura). O formulário "Adicionar versão"
   sai de cima da tabela e vira `Sheet` "Nova versão" aberto pelo botão
   primário §17 da toolbar; "Renomear" vira `Sheet` "Editar versão" (nome +
   o que mudou). Prop nova `toolbarTop` para as abas do pai.
   *Pronto quando:* a lista renderiza `<table>` com o botão
   "Ajustar largura das colunas ao conteúdo" e nenhum card por versão.
2. **`components/contracts/ContractDocumentsTab.tsx`** — cards empilhados →
   `TabsBar bare` no `toolbarTop` (Contrato + um por aditivo, com contagem de
   versões); aditivo ativo mostra descrição/status/vigência abaixo das abas.
   *Pronto quando:* existe uma tabela só, e trocar de aba troca as linhas.
3. **`DealModal`** (Negociação › Contrato › Documentos) usa o mesmo painel e
   herda a tabela — conferir que nada quebrou lá.
4. **Verificação** — `check-ui-standard.sh`, `tsc`, teste novo, suíte,
   conferência visual só leitura.

## Estado

- [x] 1 · DocumentVersionsPanel em tabela — `StandardTable`, Sheets "Nova
      versão"/"Editar versão"; excluir desabilitado diz o motivo (title no span,
      porque botão desabilitado não recebe hover)
- [x] 2 · ContractDocumentsTab com abas — `TabsBar bare` no `toolbarTop`, com
      contagem; aditivo ativo mostra descrição · status · vigência
- [~] 3 · DealModal — compila e usa o mesmo componente (herda a tabela, sem
      abas); NÃO conferido na tela (exige negociação de locação com contrato)
- [x] 4 · Verificação
  - `tsc` limpo; `check-ui-standard.sh` limpo nos 2 arquivos
  - trava `__tests__/components/ContractDocumentosTabela.test.tsx`: 3/3 falham
    no código antigo, 3/3 passam no novo
  - suíte: 7257 = 7223 passou + 34 pulados, 0 falha (JSON conferido)
  - build: 1ª tentativa caiu com segfault do Node no tsc (139, intermitente
    conhecido); 2ª e 3ª ok
  - visual (`c:/tmp/pwtest/contrato-documentos-tabela.js`, só leitura, versões e
    aditivo injetados na LEITURA): 1 tabela, abas "Contrato N (3)" e
    "Aditivo AD-001 (1)", 7 cabeçalhos, botão de ajuste presente, troca de aba
    troca as linhas, Sheet abre; 0 escritas, 0 erros de console
  - o print mostrou 2 defeitos, corrigidos: "Arquivo enviado" quebrava em 2
    linhas na Origem (150 → 170 px); seletor de arquivo nativo ("Choose File")
    trocado por botão "Escolher arquivo" + nome do arquivo
  - registrado, não alterado: o ajuste ao conteúdo estica coluna de texto
    longo até o teto do `useResizableColumns` e a tabela pode passar do card
    (rolagem horizontal) — é o comportamento do §6.1.2 no app inteiro
