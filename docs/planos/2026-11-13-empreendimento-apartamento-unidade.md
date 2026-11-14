# Empreendimento tipo Apartamento Residencial → aba "Unidade" sem terreno

## Pedido original

> Empreendimento cujo o tipo for apartamento residencial, subsitituir torres e unidades para unidade como quando tipo é casa residencia. Porem sem o terreno. Apenas unidade.

Sessão: Claude Code (VS Code) · 13/11/2026.

## Contexto

- A aba de unidades do empreendimento é decidida por `empreendimento_types.estrutura`, nunca pelo slug (`aplicar_20271109900000`, plano `2026-11-09-empreendimento-unidade-unica.md`).
- Casa Residencial é `IMOVEL_UNICO`: a aba "Unidade" mostra a seção **Terreno** e o formulário da unidade.
- Apartamento Residencial estava `TORRES`, nas 4 cópias por organização. Os 3 empreendimentos desse tipo (012 Edifício Ferraz, 013 Bento Jacinto, 001 Edifício Portinari) tinham 0 torres, 0 pavimentos e 0 unidades, então nada ficou para trás.

## Decisão

Quarta estrutura, `UNIDADE_AUTONOMA` ("Unidade sem terreno (apartamento, sala)"):
- mesma aba "Unidade" e mesmo formulário do `IMOVEL_UNICO`, **sem** a seção Terreno;
- por baixo, a mesma torre implícita com 1 unidade, então Espelho de Vendas, Comercial, Condomínio e Portal seguem iguais;
- fica disponível em Configurações › Tipos para qualquer tipo futuro do mesmo jeito (sala comercial etc.), sem código novo.

## Itens

- [x] `supabase/migrations/aplicar_20271113100000_empreendimento_tipo_unidade_autonoma.sql`: o CHECK aceita `UNIDADE_AUTONOMA`; `UPDATE` pelo **nome** "Apartamento Residencial", só onde ainda era `TORRES`. Sem policy nem função.
  **Pronto:** aplicada em 13/11 e conferida: 4 tipos Apartamento Residencial = `UNIDADE_AUTONOMA`; Casa (4) e Chácara (1) = `IMOVEL_UNICO` e Lote (4) = `LOTE`, intocados.
  Aplicar antes do código não quebra nada: o código antigo trata estrutura desconhecida como `TORRES`.
- [x] `utils/empreendimentoTipos.ts`: tipo, opção no seletor de Configurações, e `ehEstrutura` derivado da lista. Antes era uma lista à mão que esqueceria o valor novo.
- [x] `utils/empreendimentoUnidadeUnica.ts`: `EstruturaUnidadeUnica`, `temTerrenoProprio`, e torre implícita com nome de reserva "Unidade".
- [x] `components/empreendimento/UnidadeUnicaEditor.tsx`: a seção Terreno só aparece com `temTerrenoProprio`.
- [x] `services/brokerPortalService.ts`: o mapeamento da estrutura vinda do RPC reconhece todas as da lista. Antes, valor novo virava `TORRES`; o Portal só pergunta "é LOTE?", então o efeito era nulo, mas o valor ficava errado.
- [x] `components/EmpreendimentoTypesSettings.tsx`: a dica do campo cita a opção nova.
- [x] Testes:
  - `UnidadeUnicaEditor.test.tsx`: apartamento sem Terreno, salvar grava só a unidade e não toca o empreendimento;
  - `empreendimentoUnidadeUnica.test.ts`: `ehUnidadeUnica`, `temTerrenoProprio`, `estruturaDoTipo` reconhece o valor gravado.

Caça a quem estreita o valor (memória "valor novo num enum"):
- `grep` de `IMOVEL_UNICO`, `estrutura ===` e `'LOTE' | 'IMOVEL_UNICO'` em `.ts`/`.tsx`;
- no banco, `prosrc ILIKE '%IMOVEL_UNICO%'`: nenhuma função; `fn_broker_portal_lote_do_predio` só compara `<> 'LOTE'`.

Os demais (`EspelhoVendas/LocacoesTab`, `BrokerDevelopments`, `empreendimentoService.loteDoPredio`) só perguntam "é LOTE?", e o apartamento não é.

## Fora do escopo

- Card "Terreno" da Visão Geral do empreendimento: continua aparecendo para todos os tipos. O pedido foi sobre a aba de unidades.
- O formulário da unidade é o da casa (sem Pavimento/Posição), como pedido ("como quando tipo é casa residencial").

## Verificação

1. `vitest` dos dois testes acima + `tabelaDePrecosColunas`, `segurancaMigrations`, `migrationsPrefixo`, `orgContextGuard`: 6 arquivos, 52 testes ✓.
2. `tsc --noEmit` limpo; `check-ui-standard.sh` limpo nos `.tsx` tocados.
3. No app (só leitura), num empreendimento Apartamento Residencial: aba **"Unidade"** (não "Torres & Unidades"), com o formulário da unidade e sem "Terreno"; abrir não grava.
4. Publicação: push em `main`, depois `conferir-producao.sh`.
