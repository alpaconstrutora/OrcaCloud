# Tributos: um lugar só — Configurações do Sistema › Tributos e Impostos

## Pedido original

> Esta bagunçado. Vamos concentrar em apenas um local, que é no Configurações do Sistema > tributos e impostos. Inclusive recursos humanos > Configurações Fiscais

(24/11/2026)

## Como estava (conferido no código e no banco em 24/11)

| Tela | Tabela | Quem usava |
|---|---|---|
| Configurações › Tributos e Impostos › Geral | `tax_settings` | só Venda de Ativo |
| Configurações › … › INSS | `tax_inss_brackets` | só Locação |
| Configurações › … › PIS / COFINS | `tax_pis_rates` / `tax_cofins_rates` | Locação |
| RH › Configurações › Config. Fiscais › INSS / IRRF / FGTS | `inss_brackets` / `irrf_brackets` / `fgts_config` | Folha; o IRRF também na Locação |

Problemas encontrados:
- O INSS estava cadastrado duas vezes, com as mesmas faixas.
- A opção "Aplica a: Locação" da aba Geral não era lida por nenhum código.
- As cinco tabelas oficiais só aceitavam leitura no banco, então os botões Editar, Novo e Excluir do RH não gravavam nada.

## Decisões do usuário

1. Tudo em Configurações do Sistema › Tributos e Impostos.
2. Só superadmin edita as tabelas oficiais.
3. A aba Geral passa a se chamar "Venda de Ativos".

## Itens

- [x] 1. **Menu único.** Tributos e Impostos passa a ter as folhas Venda de Ativos, INSS, IRRF, FGTS, PIS e COFINS.
  - RH › Config. Fiscais sai do menu. O endereço antigo `labor-fiscal` abre a folha INSS, pela chave `settings_active_leaf` em `utils/folhaDeConfiguracoes.ts`.
  - `components/LaborFiscalSettings.tsx` vira `components/settings/TabelaFiscalSettings.tsx`, com uma tabela por folha.
  - PIS e COFINS eram duas telas idênticas e viram uma só (`components/settings/AliquotaPorExercicioSettings.tsx`).
  - Saem `InssBracketsSettings`, `inssBracketsService`, `PisRatesSettings` e `CofinsRatesSettings`.
  - **Pronto quando:** `SettingsMenuCelular.test.tsx` prova a abertura direta na folha INSS e que um pedido desconhecido é ignorado. tsc e check-ui-standard sem erros. ✅ Falta conferir na tela.
- [x] 2. **Uma tabela de INSS.** A locação passa a ler `inss_brackets` pela data da parcela (`fiscalService.getINSSBrackets`), convertendo a alíquota de fração para %.
  - O corte em 01/01/2024 mantém o resultado de antes: 36 parcelas de 2023, todas pagas, não ganham INSS novo. `tax_inss_brackets` fica no banco, sem uso.
  - **Pronto quando:** `tributoInssLocacaoTabelaUnica.test.ts` passa (2025 → 7,5%; acima da última faixa → maior teto; 2023 → sem INSS; PIS/COFINS iguais), e os testes de tributo pago e de DARF continuam verdes. ✅
- [x] 3. **Gravação só para superadmin.** Feita pela migration `aplicar_20271124200000_tabelas_fiscais_superadmin_grava.sql`, com policies de INSERT/UPDATE/DELETE que checam `is_superadmin()` nas cinco tabelas.
  - A migration também revoga TRUNCATE de authenticated e a gravação de anon.
  - Na tela, quem não é superadmin vê os botões desligados, com o motivo.
  - Quando o banco recusa, o serviço agora avisa. Antes, o RLS devolvia 0 linhas sem erro e a tela dizia "atualizada".
  - **Pronto quando:** `segurancaMigrations` verde ✅ e `pg_policies` com as 3 policies novas em cada tabela depois de aplicada (aplicação depende do OK do usuário).
- [x] 4. **Aba Venda de Ativos.** Saem a coluna e as opções "Aplica a". O aviso amarelo e o subtítulo dizem que a lista vale só para Venda de Ativos.

- [x] 5. **Seletor de ano começa no primeiro ano da tabela** (pedido de 24/11/2026: *"pesquise crie as tabelas de IRRF de anos anteriores de 2023"*).
  - As tabelas já existiam: o IRRF de 01/04/2015 a 30/04/2023 está no banco e confere com a Lei 13.149/2015. O seletor é que começava fixo em 2023 e as escondia. Agora começa no primeiro ano cadastrado (`fiscalService.primeiroAnoDaTabela`).
  - Não foram criadas tabelas anteriores a 04/2015, porque nenhum dado precisa delas: a 1ª parcela de locação com IRRF é de 12/2016, a folha começa em 11/2025 e o pró-labore em 05/2026.
  - **Pronto quando:** tsc e check-ui-standard sem erros. ✅ Falta conferir na tela.

## Achados à parte (não mexidos)

- A tabela de INSS da folha para **2023** tem as faixas de **2025** (1ª faixa até R$ 1.518,00). Não conferi na fonte oficial; falta o usuário confirmar.
- "Base de Cálculo" e "Regra de Retenção" da aba Venda de Ativos não são lidas por nenhum cálculo (`taxPayableService` não usa `base_calculo` nem `regra_retencao`).
- O INSS incide hoje sobre toda locação com locador PJ. Falta confirmar com a contabilidade.
