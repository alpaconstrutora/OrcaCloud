# Registro de contratos: Número do Contrato · Nova versão de documento com acento

## Pedido original

Sessão 98df7c3d, 27/11/2026:

> comercial > locação > Gestão de Unidades:
> 1. A tabela Registro de contratos tem duas colunas Id e Código. Substitua as duas por uma chamada Número do Contrato e traga o número do contrato de cada
>
> 2. comercial > locação > Gestão de Unidades > Gerenciar Negociação > Contrato > documento > drawer Nova versão: Erro ao subir documento
> index-BPvMmNjh.js:697
> POST https://oxedkknreghxrgenyjiu.supabase.co/storage/v1/object/documents/contra…-84c2-b8ed3c2f7cea/1795821659632-CONTRATO_LOCA%C3%87%C3%83O_-_Ivana_r1.pdf 400 (Bad Request)

## Itens

1. **Coluna Número do Contrato** (`components/RentalsModule.tsx`). As colunas ID (uuid
   cortado) e Código saem. Entra "Número do Contrato" na primeira posição, com
   `contracts.number` buscado por `deal_id`. O campo da negociação
   (`commercial_deals.contract_number`) está vazio em 9 das 10 locações (conferido no banco
   em 27/11) e por isso não serve.
   - Negociação sem contrato gerado mostra "Sem contrato".
   - A busca procura pelo número.
   - O card da visão em grade troca "#ID" pelo número.

   **Pronto quando:**
   - `rentalsRegistroContratosNumero.test.ts` verde ✅;
   - em produção, a tabela do 006 mostra "CTL-006-012-0001".
2. **Chave do Storage sem acento** (`services/contractDocumentVersionService.ts`).
   - **Reproduzido** em 27/11: um envio com a chave `…/teste-LOCAÇÃO.pdf` recebeu
     `400 InvalidKey` e nada foi gravado.
   - Correção: `storagePathFor` passa a usar o `sanitizeFileName` que já existia
     (`utils/storageUtils.ts`, também usado por boletos e recibos). O nome exibido da versão
     continua o original, com acento.
   - O mesmo defeito existia em `nfeService` (NF-e) e em `partnerService` (anexo do
     parceiro), que mandavam `file.name` cru; os dois foram corrigidos.

   **Pronto quando:** `documentoVersaoChaveSemAcento.test.ts` falha sem a correção e passa
   com ela ✅.

Verificação: `tsc` limpo, `check-ui-standard` sem achados, 186 testes relacionados verdes ✅.
