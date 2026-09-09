# Compartilhar a planta com o cliente, de dentro do editor

## Pedido original

> botão de compartilhar

No contexto imediato: a pendência declarada em
`2026-09-09-status-planta-inteligente-bim.md`, tabela D —

> **Botão de compartilhar a planta com o cliente** dentro do editor | a função
> existe e a escrita está provada; escolher o cliente pede uma tela, e o caminho
> por Documentos já funciona

## O que já existia, e por que não bastava

`services/blueprintGedService.ts` tem **as duas** funções desde 08/09:
`publicarNoGed` (usada pelo painel) e `compartilharComCliente` (**sem nenhum
chamador na aplicação** — só testes). O painel de versões publica no GED e
termina com a frase:

> Publicar **não** mostra nada ao cliente: para isso, compartilhe o documento no
> Portal, que é uma decisão à parte.

A frase está certa e mandava a pessoa para outro módulo. Quem acabou de publicar
a revisão 7 tinha de sair da planta, abrir Documentos, achar os arquivos certos
entre todos os da obra — dois deles, porque a cobertura vai junto — e
compartilhar. **O passo mais fácil de errar era achar os arquivos**, e errar ali
significa mandar ao cliente a revisão anterior.

## Decisões

### 1. O botão só existe DEPOIS de publicar, e sobre o que acabou de ser publicado

Não é um botão "compartilhar a planta": é "compartilhar **estes** arquivos".
Isso elimina a etapa de achar o documento — que é exatamente onde o erro mora —
e mantém as duas decisões separadas, como o serviço já documenta: publicar põe
sob controle de revisão, compartilhar põe diante do cliente.

### 2. ⚠️ Trocar de versão APAGA a oferta de compartilhar

O caso que quebra a implementação ingênua: publicar a revisão 3, trocar o seletor
para a revisão 7 e clicar em compartilhar. Os ids guardados são os da 3, a tela
inteira fala da 7, e o cliente recebe a revisão errada **sem nenhum erro**.

O estado de publicação é limpo junto com o `diff`, no mesmo efeito que troca a
versão selecionada.

### 3. A lista de clientes vem da organização do ESTUDO, não do seletor do topo

Aparente violação da REGRA #5, e é o contrário dela. Com "Todas as organizações"
no topo, `useOrgContext` devolve nulo e `listClients(undefined)` traria clientes
de **todas** as organizações — e compartilhar um documento da org A com um
cliente da org B é vazamento entre inquilinos. O documento nasce em
`study.organization_id` (é o que `publicarNoGed` usa); o destinatário tem de ser
da mesma. `listClients(orgId)` já devolve "minha organização OU compartilhado".

### 4. A COBERTURA vai junto

Mesmo motivo de `publicarNoGed`: o `.txt` é o que declara o que o arquivo não
contém, e é o único motivo pelo qual entregar um IFC parcial é honesto. Mandar o
desenho e reter a cobertura faria no Portal o que a publicação evita.

## Arquivos

| arquivo | mudança |
|---|---|
| `components/blueprint/PainelVersoes.tsx` | seção "Compartilhar com o cliente" sob a publicação |
| `__tests__/components/PainelVersoes.test.tsx` | 5 casos, incluindo o da troca de versão |

Nenhuma mudança de serviço, de schema ou de RLS: `compartilharComCliente` e
`sharePortalDocumentsBatch` já existem e já têm a escrita provada.

## Verificação

1. `npx vitest run __tests__/components/PainelVersoes.test.tsx` — o caso da troca
   de versão medido no código DEFEITUOSO antes de aceito.
2. `bash scripts/check-ui-standard.sh components/blueprint/PainelVersoes.tsx`.
3. `npm run build` e a suíte cheia.
