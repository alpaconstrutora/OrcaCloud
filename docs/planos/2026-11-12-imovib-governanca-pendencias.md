# Imovib — pendências da governança (depois da Fase 10)

> Frente `feat/imovib-governanca-pendencias`, a partir de `main` em 67e18f12 (Fase 10 no ar, PR #392).
> Execução: um PR. Marcar cada item em **Estado** com o commit.

## Pedido original

A Fase 10 do plano `docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md` terminou com cinco
pontos deixados para depois. A resposta listou os cinco e ofereceu abrir uma frente:

> abra uma frente com esses pontos
>
> Sessão: 21a9ea95-c34e-43cc-8a0f-7d21ef9ed2a0 · 2026-11-12

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-11-12 | Apagar um estudo apaga junto as versões congeladas (imutáveis). O que fazer? | **Bloquear:** estudo com versão congelada não pode ser apagado; o aviso diz por quê. Estudo sem versão continua podendo ser apagado. |
| 2026-11-12 | Guardar os indicadores do momento do parecer e avisar quando os números de hoje diferirem? | **Sim, guardar e avisar.** |

## Itens

**1. Data e autor da versão gravados pelo banco.** Hoje o INSERT em `imovib_study_versions` aceita
`created_at` e `created_by` vindos da tela (dá para gravar data retroativa ou outro autor). Gatilho
`BEFORE INSERT` grava `now()` e `auth.uid()`. Como sei que terminou: no banco, um INSERT como
`authenticated` com `created_at` de 2020 sai com a data de agora (transação desfeita).

**2. Quem registrou o parecer amarrado ao usuário logado.** Hoje `recommended_by` é texto da tela.
Coluna `recommended_by_user_id`; gatilho `BEFORE UPDATE` em `imovib_studies`, só quando o parecer ou a
justificativa mudam: grava `auth.uid()`, `now()` e o nome do membro na organização do estudo
(`organization_members`: nome, senão e-mail). Parecer limpo zera quem, quando e os números.

**3. Estudo com versão congelada não se apaga.** A chave de `imovib_study_versions.study_id` passa de
`ON DELETE CASCADE` a `RESTRICT`; o serviço traduz o erro ("Este estudo tem versões congeladas e não
pode ser apagado"). Como sei: no banco, DELETE de estudo com versão falha (transação desfeita).

**4. Mês corrente no Acompanhamento.** O mês de hoje ainda está em curso: a linha diz "(em curso)" e
não mostra desvio (o realizado está pela metade).

**5. Parecer: limpar e guardar os números do momento.** "Não registrado" passa a ser escolhível (limpa
o parecer). Coluna `recommendation_snapshot` (VGV, VPL, TIR, margem, exposição) gravada junto com o
parecer; o cartão mostra "Dado com VPL X e TIR Y" e avisa quando os números de hoje mudaram.

**Segurança (REGRA #7).** A função do Portal do Investidor tira do `row_to_json(s)` as colunas internas;
as duas colunas novas (`recommendation_snapshot`, `recommended_by_user_id`) entram na lista.

## Estado

5 de 5. Migration `aplicar_20271112950000_imovib_governanca_pendencias.sql` aplicada em 12/11 com OK do
usuário (*"Pode aplicar"*). Provado no banco como `authenticated`, dentro de um bloco desfeito (nada
gravado): versão com data de 2020 e outro autor saiu com a data de hoje e o usuário logado; apagar o
Garden com versão → bloqueado (23503); parecer enviado como "Fulano Forjado" saiu com o nome do membro
no cadastro e o id do usuário. A checagem da RLS das tabelas filhas compara o **e-mail** do token
(`auth.jwt()->>'email'`): a prova precisa do e-mail nos claims.

- [x] 1 Data e autor da versão pelo banco — gatilho `trg_imovib_versao_carimbo`.
- [x] 2 Autor do parecer pelo banco — gatilho `trg_imovib_parecer_autor` (só quando parecer ou justificativa mudam; sem `auth.uid()` não mexe); coluna `recommended_by_user_id`.
- [x] 3 Estudo com versão não se apaga — FK `RESTRICT`; `deleteStudy` traduz o 23503; a listagem mostra a mensagem do serviço.
- [x] 4 Mês corrente em curso — `emCurso` em `compararComRealizado`; a linha diz "(em curso)" e o desvio fica "—".
- [x] 5 Parecer: limpar e números do momento — "Não registrado" + parecer gravado = "Limpar parecer"; `recommendation_snapshot` gravado com o parecer; o cartão mostra "Dado com VPL X e TIR Y" e avisa quando os números de hoje mudaram. "Salvar Premissas" não manda as colunas novas.

Conferido: suíte do Imovib 68 arquivos, 672/672; `tsc` 0; `check-ui-standard` sem violação; navegador
(Garden, só leitura): parecer e Acompanhamento abrem, 0 escritas, 0 erros de console.
