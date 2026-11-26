# Condomínio — Assembleias e votações (híbrida, voto pelo Portal do Cliente, ata gerada)

## Pedido original

Sessão `bef90ec4-4d31-470b-a193-71ce97673653` · 25/11/2026.

> comercial > condomínio: verifique se esta implementado aseembleias e votacoes

(Resposta: não existe — só a categoria "Assembleia" de aviso, a categoria "Ata" de
documento e a votação do Portal do Investidor, que é outro domínio.)

> Começcepelo plano.
> As perguntas a decidir primeiro:
> 1. por onde se vota: Portal do Cliente > Condomino
> 2. Cada Condômino vota por unidadepor unidade
> 3. Sai ata gerada pelo sistema.

> O que encontrei e pesa no desenho:
> 1. ok
> 2. Vou cadastrar os que faltam no condominios.
> 3.  exigir login para votar
> 5. ok
> 6. Seguir a leu
>
> Pergunta: existe uma assembleia real puxando esse pedido? Sim
> Em qual condomínio e para quando? Condom;inio Bella Vista. Prazo para este mês.
> Vesão: ainda nao temos. Pode sugerir um texto.

> Híbrida

> Va de A, faça plano paça implementar B e escreva o desenho com as regras

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 25/11 | Por onde o condômino vota? | **Portal do Cliente › Condomínio** |
| 25/11 | Unidade de voto | **Uma cédula por unidade** (quem tem 3 unidades vota 3 vezes) |
| 25/11 | Ata | **Gerada pelo sistema**, gravada em Documentos › Ata |
| 25/11 | Unidade sem proprietário cadastrado | O usuário **cadastra os que faltam** (não é código) |
| 25/11 | Link sem senha pode ser repassado | **Exigir login para votar** |
| 25/11 | Peso do voto / inadimplente | **Seguir a lei** (CC 1.352 par. único: fração ideal, salvo convenção; CC 1.335 III: só vota quem está quite) |
| 25/11 | Caso real | **Condomínio Bella Vista, assembleia neste mês** |
| 25/11 | Convenção | **Ainda não há**; pediu sugestão de texto (Anexo A) |
| 25/11 | Formato | **Híbrida**: portal + presencial lançado pelo gestor |
| 25/11 | Quem conduz | **A** = gestor pelo app agora; **B** = síndico pelo Portal do Síndico, planejado como fase seguinte |
| 25/11 | Data e pauta do Bella Vista | **A agendar quando o app estiver funcionando** — sem prazo; a fase A entra inteira |
| 25/11 | Jurídico antes ou em paralelo? | **Construir com as regras propostas; o jurídico revisa em paralelo** |
| 25/11 | Voto antecipado conta como presença? | Usuário pediu recomendação → **sim** (R5/R6). Se o jurídico vetar: aceitar voto só em INSTALADA — muda uma checagem e o edital, não a estrutura |
| 25/11 | Presencial × portal | Usuário pediu recomendação → **vale o último, nos dois sentidos**, com confirmação do gestor ao substituir (R7) |
| 26/11 | Inadimplência: nenhum rateio do app tem cobrança gerada hoje | **Aviso + marcar à mão** (Task A10) |
| 26/11 | Condomínio de teste da A9 não pode ser excluído (trava) | **Apagar por script**, desligando a trava só nessa operação |
| 26/11 | Aplicar e publicar a fase A | **Sim**, após as correções da revisão final e a A10 |
| 26/11 | Fase B: envio de ata/procuração pelo síndico (o único envio do Portal do Síndico grava no armazenamento do Financeiro) | **Função nova e própria de documentos do condomínio pelo síndico** (`sindico-portal-documentos`), mesma checagem de login/mandato |
| 26/11 | Portal do Síndico aberto pelo app (administradora) bloqueava a aba Assembleias | **Conduz ali pela porta do gestor** (`operacoesDoGestor`), a mesma da aba do app — regra do usuário de 25/10: "nao faz o menor sentido bloquear o portal do condominio na visão do app. Deve ter a mesma funcionalidade da visão do sindico." A porta do síndico (modo 'sessao') segue só dele |

## Por que existe

O Bella Vista vai realizar uma assembleia real assim que o app estiver pronto, e o app não
tem como convocar, colher voto, apurar nem lavrar ata. Hoje isso seria feito fora do
sistema (papel, WhatsApp), sem registro de quem votou nem prova de convocação.

**Pronto = a assembleia do Bella Vista acontecer pelo caminho do usuário**: gestor
convoca no app → condôminos veem e votam no Portal do Cliente com login → na reunião o
gestor lança presença e votos de quem está na sala → encerra → ata em PDF aparece em
Documentos e no portal. Teste com dado fictício não fecha o pedido.

## Estado

- [x] Desenho aprovado pelo usuário (25/11/2026)
- [x] Fase A: 10 de 10 — A1–A8 + A10 revisadas; migrations 860000/860100/860200 aplicadas 26/11; PR #767 (ce4c3c3) no ar
- [x] A9 — prova de ponta a ponta em produção (26/11), condomínio de teste: voto pelo portal, procurador com arquivo, instalação em 1ª (100%), substituição do voto do portal com confirmação, encerramento REJEITADO (empate), ata PDF em Documentos e no portal; dados de teste apagados por script (decisão do usuário)
  - defeito achado na prova e corrigido à parte: link de convite/redefinição perdia a sessão (PR #768, `docs/planos/2026-11-26-link-de-acesso-sessao-perdida.md`)
- [ ] Fase A fecha de verdade com a assembleia real do Bella Vista
- [x] B1 — porta do síndico (migration 20271126860000 aplicada 26/11; Edge Function `sindico-portal-documentos` publicada 26/11: 401 sem cabeçalho e com chave anon, 403 sessão que não é do síndico, 200 OPTIONS)
- [x] B2 — aba Assembleias no Portal do Síndico (+ Financeiro com a sessão do link, decisão do usuário 26/11)
- [x] B3 — PR #773 (1e9ad3a) no ar; prova em produção (26/11) com a síndica de teste logada pelo convite (link já corrigido): criou, convocou (evento papel SINDICO), presença 201 na sala e 202 por procurador com arquivo pela `sindico-portal-documentos` (OUTRO, fora do portal, autor na descrição), instalou em 1ª (100%), votos da sala, encerrou REJEITADO, ata ATA visível com 'instalada por TESTE Síndica Portal (SINDICO)'; dados de teste apagados por script
- [x] Fase B: 3 de 3
- [ ] Ajuste: administradora conduz a assembleia no Portal do Síndico aberto pelo app (porta do gestor), sem o aviso "conduza pelo app" — testes falham no código anterior e passam no novo; tsc 0; PR + CI + publicação
