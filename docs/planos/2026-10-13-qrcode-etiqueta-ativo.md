# Etiqueta patrimonial com QR Code real

## Pedido original

> Sessão 3be6bf12-b300-4f07-8c44-5f5b33ef403b · 13/10/2026
>
> Pendências:
>
> 1. Etiquetas impressas com os códigos antigos deixaram de bater. Quem digitar o código velho ainda acha o bem, mas vale reimprimir as etiquetas pela ação "QR Code" do menu: nenhuma etiqueta ja foi impressa, entao, isso deixa de ser pendencia.
> 2. O "QR Code" da etiqueta é só um desenho fixo e não codifica nada; quem identifica o bem é o código impresso em texto. Ficou registrado como pendência, fora deste pedido; Vamos imprementar.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 13/10/2026 | O que acontece ao escanear? | Abre a ficha do ativo no app (após login) |
| 13/10/2026 | Onde gerar a imagem? | No próprio app (pacote `qrcode`), sem serviço externo |

Item 1 do pedido: encerrado — nenhuma etiqueta foi impressa com os códigos antigos.

## Plano

1. **Link do ativo** — `utils/assetQrLink.ts`: `#/opura-assets?ativo=<id>` (o id, não o código: código pode ser renumerado). Pronto quando: `__tests__/assetQrLink.test.ts` verde.
2. **Etiqueta** — `components/AssetQrLabelModal.tsx`: QR em PNG gerado localmente (`qrcode@1.5.4`, correção M), código + nome + organização; impressão numa janela 80 × 50 mm montada por DOM (sem sink de HTML). Substitui o desenho SVG fixo de `OpuraAssetsModule.tsx`. Pronto quando: QR decodifica para o link (jsQR) e `check-xss-sinks` limpo.
3. **Abrir pelo link** — `OpuraAssetsModule.tsx` lê `?ativo=` na montagem e no `hashchange`, abre a ficha em modo leitura (busca por id se o ativo não está na lista do topo) e tira o pedido do endereço. Pronto quando: link sem sessão → login → ficha aberta; link com a tela montada → ficha aberta.

## Estado

- [x] 1 · [x] 2 · [x] 3
- Verificação: tsc 0 erros; `check-ui-standard` e `check-xss-sinks` limpos nos 2 arquivos; Playwright somente leitura (`c:/tmp/pwtest/qrcode-ativo.mjs`): link sem sessão sobreviveu ao login e abriu a ficha; etiqueta com PNG local e link; abrir o link com a tela montada abriu a ficha e limpou o endereço; 0 escritas, 0 erros de página. QR decodificado por jsQR = link exato.
