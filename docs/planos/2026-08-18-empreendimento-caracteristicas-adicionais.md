# Incorporação › Empreendimento — aba "Características Adicionais"

## Pedido original

> incorporação < empreendimento:
> 1. Caso o empreendimento seja do tipo edifício comercial, uma nova aba a ser criada e
> ficará visivel chamada características adcionais. com uma tabela. Aplicar o padrão
> ui_ux_guia_unificado.md + botão de ajuste automático de largura de colunas na tabelas.
> essa tabela mostra as mesmas informações da aba torres e unidadas porém com colunas
> adicionais com possibilidade de criar novo, excluir, editar e duplicar. Abaixo dois
> exemplos para comerçarmos
> 1.1. Acessibilidade: seletor (Elevador; Rampas; escada)
> 1.2. Comunicação visual: (Espaco compartilhado; espaço privativo; sem comunicação visual
>
> Sessão atual · 2026-08-18

## Decisões tomadas com o usuário

| Pergunta | Resposta |
|---|---|
| Gatilho de visibilidade da aba | Pelo catálogo — cada característica declara a quais tipos de empreendimento se aplica (`applies_to_tipos`); a aba aparece quando há ≥1 característica aplicável ao tipo do empreendimento aberto. Confirmado: já existe o tipo "Edifício Comercial" no catálogo `empreendimento_types` (não é preciso criar um tipo novo de sistema). |
| Modelo de armazenamento das características | Catálogo configurável no banco (2 tabelas: catálogo + valor por unidade), não colunas fixas nem JSONB solto — 3ª/4ª/10ª característica entram pela tela, sem migration. |
| Escopo da tabela nova | Mesmas unidades de `empreendimento_units` — criar/excluir/duplicar ali mexe na unidade de verdade e reflete em Torres & Unidades e no Espelho de Vendas. |
| Onde cadastrar o catálogo | Configurações do Sistema › Categorias (nova tela ao lado de "Tipos de Empreendimento"), mesmo padrão de `EmpreendimentoTypesSettings.tsx`. |
| Acessibilidade aceita mais de um valor? | Sim — múltipla escolha (`MULTI_SELECT`). Comunicação Visual é escolha única (`SELECT`). O catálogo suporta os dois tipos de seletor desde o início. |

## Plano

1. **Migration** `supabase/migrations/aplicar_20270905000029_empreendimento_unit_characteristics.sql` — tabelas `empreendimento_unit_characteristics` (catálogo) e `empreendimento_unit_characteristic_values` (valor por unidade, `values TEXT[]`), RLS por organização (sem `anon`), trigger de herança de `organization_id` a partir da unidade, seed de Acessibilidade + Comunicação Visual aplicadas a todo tipo com `motor_category='commercial'` de cada organização.
   **Feito quando:** aplicada manualmente no SQL Editor do Supabase e o bloco de conferência (BLOCO 9) retorna os valores esperados.

2. **Tipos** `types/empreendimento.ts` — `UnitCharacteristicInputType`, `UnitCharacteristicOption`, `EmpreendimentoUnitCharacteristic(+Insert/Update)`, `EmpreendimentoUnitCharacteristicValue`, `UnitCharacteristicsRow`.
   **Feito.**

3. **Correção de apoio** `services/empreendimentoService.ts` — `UNIT_COLS` não trazia a coluna `suites` (existe no banco desde 20270218000002, mas nunca voltava do `select`). Acrescentada.
   **Feito.**

4. **Service** `services/empreendimentoUnitCharacteristicService.ts` (novo) — CRUD do catálogo + `listValuesForUnits`/`setValues`/`copyValues` para os valores por unidade.
   **Feito.**

5. **Tela de catálogo** `components/EmpreendimentoUnitCharacteristicsSettings.tsx` (novo) + wiring em `components/Settings.tsx` (`cat-caracteristicas-unidade`, sob Categorias Gerais).
   **Feito.**

6. **Aba nova** `components/empreendimento/CaracteristicasAdicionaisTab.tsx` (novo) — tabela única com todas as unidades de todas as torres (ao contrário do accordion por torre de Torres & Unidades), toolbar acoplada §5.2 (busca + `ColumnConfigButton` + botão de autofit `MoveHorizontal` + botão primário), colunas físicas + 1 coluna por característica do catálogo, painel lateral (`Sheet`) para criar/editar, duplicar e excluir com atualização local do estado (§22, sem recarregar a tabela inteira).
   **Feito.**

7. **Montagem condicional** `components/empreendimento/EmpreendimentoDetail.tsx` — carrega `listCharacteristics(effectiveOrgId, { tipo: e.tipo })`; a aba só entra no trilho quando o resultado não é vazio.
   **Feito.**

## Estado

- [x] Migration escrita **e aplicada** no Supabase pelo usuário (2026-08-18) — BLOCO 9 confirmado: `tabelas=2, com_rls=2, policies_catalogo=4, policies_valores=4, anon_policies=0, fks=2, trigger_org=1, seed_acessibilidade=4` (4 = nº de organizações que já tinham tipo comercial no catálogo no momento do seed — todos os valores batem com o esperado)
- [x] Tipos TS
- [x] Correção do `suites` em `UNIT_COLS`
- [x] Service do catálogo/valores
- [x] Tela de catálogo em Configurações + wiring
- [x] Aba "Características Adicionais" (tabela + toolbar + autofit + CRUD)
- [x] Montagem condicional na tela de detalhe do Empreendimento
- [x] `npx tsc --noEmit` limpo no projeto inteiro
- [x] `scripts/check-ui-standard.sh` sem violação nos 4 arquivos tocados/criados
- [x] `__tests__/migrationsPrefixo.test.ts` e `__tests__/orgContextGuard.test.ts` passando
- [ ] **Verificação manual na tela** (ver seção abaixo) — ainda não executada: falta login real neste ambiente. Banco já está pronto (migration aplicada); o roteiro de 9 passos abaixo pode ser conferido diretamente no app agora

## Verificação

**Mecânica (executada):**
```bash
npx tsc --noEmit
bash scripts/check-ui-standard.sh components/empreendimento/CaracteristicasAdicionaisTab.tsx components/EmpreendimentoUnitCharacteristicsSettings.tsx components/empreendimento/EmpreendimentoDetail.tsx components/Settings.tsx
npx vitest run __tests__/migrationsPrefixo.test.ts __tests__/orgContextGuard.test.ts
```
Todos passaram. Também confirmado que o Vite dev server transforma os 3 arquivos novos/alterados sem erro de parse (`curl` direto nas rotas de módulo do dev server, HTTP 200 nos três).

**Manual — pendente:**
1. ~~Aplicar a migration~~ — feito em 2026-08-18, BLOCO 9 conferido (ver Estado acima).
2. Abrir um empreendimento do tipo **Edifício Comercial** → a aba "Características Adicionais" deve existir; abrir um Vertical → não deve existir.
3. Tabela deve listar todas as unidades de todas as torres, com coluna Torre — conferir contra o total do rodapé de Torres & Unidades.
4. Buscar por nome; ordenar por Priv. m²; esconder uma coluna pela engrenagem; arrastar uma borda de cabeçalho; clicar no botão de ajuste automático (`MoveHorizontal`) e confirmar que as colunas se ajustam ao conteúdo e preenchem o container sem scroll lateral.
5. Recarregar a página (F5) e confirmar que busca, colunas visíveis, ordem, ordenação e larguras persistiram.
6. Marcar Acessibilidade = Elevador + Escada numa unidade e Comunicação Visual = Espaço privativo; salvar; recarregar; valores devem continuar lá.
7. Duplicar uma unidade → a cópia deve trazer o físico e as características, com status comercial zerado.
8. Excluir uma unidade pela aba → deve sumir aqui e em Torres & Unidades, e aparecer na aba Histórico.
9. Em Configurações › Categorias › Características de Unidade, criar uma 3ª característica aplicada a Edifício Comercial → deve virar coluna nova na aba (ao reabrir a aba).
