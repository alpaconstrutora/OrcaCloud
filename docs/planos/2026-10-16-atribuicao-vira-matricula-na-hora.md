# Atribuição vira matrícula na hora (NR-18 do Altair não aparecia no portal)

## Pedido original

Sessão `61edd96c-0bd1-4786-b550-a4ff23a33593` · 16/10/2026, com prints do Portal de Treinamentos
(Catálogo vazio), do catálogo de gestão e da aba Atribuições:

> Verifique por que a treinamento NR18 atribuido ao altair nao aparece no portal dele

Diagnóstico devolvido e resposta do usuário à proposta ("criar a matrícula na hora ao salvar a
atribuição e ao publicar a versão"):

> sim

## Diagnóstico (medido no banco)

- Atribuições de NR-18 para "Altair" (TERCEIRO, altairprosa@gmail.com) e "Altair Pereira da Rosa"
  criadas às 15:11; versão 1 publicada às 15:15; **nenhuma matrícula** de NR-18.
- Atribuição só virava matrícula em `generate_academy_alerts` (cron `daily-academy-alerts`, 08:15 UTC)
  ou "Processar agora", e só contra versão PUBLICADA — nada rodou depois da publicação.
- Simulação em `BEGIN … ROLLBACK` como Altair: o processamento criaria as 2 matrículas.
- O print do portal era da aba **Catálogo**, que só lista cursos "Abertos para inscrição" —
  treinamento atribuído aparece em **Meus treinamentos**.

## Plano

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `supabase/migrations/aplicar_20271016300000_academy_matricula_na_hora.sql` | `fn_academy_materializar_atribuicao` (mesma regra do cron) + gatilho ADIADO ao salvar atribuição ativa + gatilho ADIADO ao publicar versão (todas as atribuições ativas do curso) + regularização das atribuições pendentes | prova em ROLLBACK; aplicada; matrículas de NR-18 existem |

Gatilho adiado (constraint trigger, roda no fim da transação) porque `fn_academy_publish_version`
cria RECICLAGEM e migra matrículas abertas DEPOIS de marcar a versão PUBLICADA; rodando na hora,
a matrícula de atribuição nasceria antes e a migração deixaria de levar o progresso.

## Estado

- [x] Prova em `BEGIN … ROLLBACK`: salvar a atribuição → 1 matrícula; republicar a v1 → 2 matrículas (ATRIBUICAO, prazo +30 dias)
- [x] Aplicada (16/10/2026). Gatilhos `trg_academy_atribuicao_matricula` e `trg_academy_versao_publicada_matricula` presentes, adiados. Regularização criou as matrículas de NR-18 de "Altair" e "Altair Pereira da Rosa" (NAO_INICIADO, prazo 15/11/2026).
- [x] Conferido pelo caminho do portal (JWT simulado de altairprosa@gmail.com): `academy_portal_user_list_enrollments` devolve NR-18.
- O processamento diário continua: alcança quem entra depois no cargo/equipe/obra.
