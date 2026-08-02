# PLANO — Academia ÒPURA (Treinamento e Desenvolvimento)

> Submódulo de **Recursos Humanos › Treinamentos** (`labor-trainings`).
> Status: **Etapa 1 (Fundação) em implementação**. Etapas 2 e 3 especificadas, não implementadas.
> Última revisão: 2026-08-02.

---

## 1. Por que este plano existe

O submódulo Treinamentos do RH hoje é um **livro de registro**: alguém digita
"fulano fez NR-35 em 12/03, nota 8" e anexa um PDF. Isso responde *"o que foi
registrado"*, mas não responde *"a pessoa aprendeu?"* nem *"quem ainda deve
fazer?"*.

A Academia ÒPURA transforma isso num **LMS corporativo integrado ao RH** — não
uma biblioteca de vídeos. O valor está em garantir aprendizagem, comprovar
treinamento obrigatório numa fiscalização e conectar capacitação a cargo,
função, obra e competência.

### Objetivos

- Centralizar treinamentos internos e obrigatórios.
- Trilhas por cargo, função, obra e empresa.
- Registrar evidência de participação **e** de aprendizagem.
- Controlar validade, reciclagem e vencimento.
- Identificar lacunas de competência.
- Apoiar a integração de novos colaboradores.
- Manter histórico permanente no perfil funcional.

### Regra de produto que não se negocia

**"Vídeo aberto" não é "treinamento realizado".** A conclusão depende de
critérios configuráveis por versão — percentual efetivamente assistido, nota
mínima em avaliação, e/ou aceite formal — e a decisão é **sempre do servidor**,
nunca do cliente.

---

## 2. Arquitetura — treinamento é entidade única

`training_courses` continua sendo **a** entidade Treinamento, compartilhada por
RH, SESMT, gestor e obra. Cada área vê e administra o mesmo treinamento conforme
sua permissão. Não existe cadastro paralelo.

`employee_trainings` continua sendo **a** fonte única de "treinamento
realizado" — é ela que alimenta `portal_employee_summary`, os KPIs de RH, os
alertas de vencimento e a conformidade do SESMT. A Academia **escreve de volta**
nela ao concluir, com `origem = 'ACADEMIA'`.

```
training_courses (1)─(N) academy_course_versions ─(N) academy_modules ─(N) academy_lessons
                              │                                            └─(N) academy_materials
                              ├─(N) academy_questions / academy_assessments
                              └─(N) academy_assignments ─(N) academy_enrollments
                                                              ├─(N) academy_lesson_progress
                                                              ├─(N) academy_access_logs
                                                              ├─(N) academy_attempts ─(N) academy_attempt_answers
                                                              └─(1) academy_certificates
                                                                     │
                              employee_trainings (registro legal) ◄──┘
```

Cadeia canônica:
**Treinamento → versão → módulos → aulas → materiais → atribuições → acessos →
avaliações → conclusão → certificado.**

O registro manual presencial que existe hoje **não muda**: continua entrando em
`employee_trainings` com `origem = 'MANUAL'`.

### Versionamento — publicar não altera o passado

Publicar a v2 **arquiva** a v1 e cria futuro; não toca em nenhuma matrícula,
progresso ou certificado da v1. Se o procedimento mudou, quem concluiu a v1
recebe uma matrícula nova de **reciclagem** na v2, e a evidência da v1
permanece intacta e auditável. Os critérios de conclusão ficam congelados na
versão: mudar "nota mínima 7 → 8" não pode invalidar retroativamente quem já
passou sob a regra antiga.

---

## 3. Etapas

### Etapa 1 — Fundação (em implementação)

| Item | Entrega |
|---|---|
| Conteúdo | Treinamento → versão → módulos → aulas → materiais |
| Aulas | `VIDEO_UPLOAD` (bucket privado), `VIDEO_LINK` (incorporado), `PDF`, `AUDIO`, `IMAGEM`, `TEXTO` |
| Atribuição | Por colaborador, cargo, função, equipe, obra ou toda a organização |
| Progresso | Por aula, com retomada do ponto exato, tempo mínimo e bloqueio de avanço rápido |
| Histórico | Log append-only de acesso (abertura, heartbeat, pausa, download, aceite, avaliação, emissão) |
| Avaliação | Banco de questões, múltipla escolha / múltipla resposta / V-F, sorteio, embaralhamento, tentativas, nota mínima |
| Conclusão | Critérios configuráveis por versão, decididos no servidor |
| Certificado | PDF com número único, QR e rota pública de validação |
| Alertas | Pendência, prazo, vencimento de NR e reciclagem automática (cron diário) |
| Painéis | Colaborador, gestor e RH |
| Canais | App logado **e** Portal do Colaborador (`/portal?token=`) |

### Etapa 2 — Operação corporativa

Trilhas de aprendizagem encadeadas (admissão → integração → segurança → função
→ obra → reciclagem) · Turmas presenciais com lista de presença, QR Code e
assinatura eletrônica · Matriz de obrigatoriedade por função · Certificados
externos apresentados pelo colaborador, com aprovação · Comentários e dúvidas
por aula · Avaliação prática registrada pelo instrutor · Relatórios de
conformidade · Integração com onboarding e competências.

### Etapa 3 — Inteligência e escala

Plano de Desenvolvimento Individual ligado a `pdi_items` · Recomendação por
lacuna de competência · Avaliação de retenção pós-treinamento · Geração de
perguntas a partir do material por IA · Transcrição e busca dentro das aulas ·
Indicadores de efetividade · Aplicativo móvel e acesso offline controlado ·
Gamificação (opcional, só depois de haver volume real de usuários).

---

## 4. Papéis e permissões

Permissão base: `canViewLabor` (ver) e `canEditLabor` (administrar), como o
resto do RH.

| Papel | O que faz |
|---|---|
| Administrador | Configura o módulo inteiro |
| RH / T&D | Cria conteúdo, versões, trilhas e turmas |
| SESMT | Controla os treinamentos de segurança e a conformidade de NR |
| Instrutor | Publica aulas, responde dúvidas, avalia (Etapa 2) |
| Gestor | Acompanha a equipe e atribui treinamentos |
| Colaborador | Faz os treinamentos e consulta os certificados |
| Auditor | Só evidências e relatórios |
| Prestador / terceirizado | Só os treinamentos exigidos, pelo portal (Etapa 2) |

---

## 5. Integrações com o ÒPURA

Cadastro de colaboradores (`employees`) · Cargos e funções (`org_roles`,
`org_funcoes`) · Equipes (`labor_teams`) e alocação em obra
(`employee_allocations`) · Avaliação de desempenho e PDI (`evaluation_*`,
`pdi_items`) · SST e documentos regulatórios · Notificações e tarefas · Portal
do Colaborador · Diário de obra (DDS) · Gestão de equipamentos, exigindo
habilitação válida para operar (Etapa 2).

---

## 6. Limitações assumidas (não prometer o que não dá)

1. **Não há DRM.** A signed URL de 15 minutos pode ser capturada por quem tem
   acesso legítimo. Mitigação parcial: expiração curta, `controlsList="nodownload"`
   e marca d'água com a matrícula. Se o requisito for impedir cópia, a resposta
   honesta é que não dá com esta arquitetura.
2. **Certificado do sistema não substitui exigência legal.** Determinadas NRs
   exigem conteúdo, carga horária, instrutor habilitado e condições
   específicas. O sistema organiza e comprova a evidência; não presume que
   qualquer vídeo gera certificado legalmente válido.
3. **`public.notifications` tem policy legada `FOR ALL TO public USING (true)`
   e não tem `organization_id`** — na prática, qualquer autenticado lê tudo.
   Por isso os alertas da Academia **não** contêm nota, percentual, CPF ou NR
   sensível: só "Você tem o treinamento X pendente até DD/MM". Corrigir essa
   policy é dívida própria, fora do escopo da Etapa 1.
4. **RPCs de portal legados** (`portal_get_trainings`, `portal_employee_summary`)
   recebem `employee_id` cru e são grantados a `anon` — enumerável. Os RPCs da
   Academia recebem **`p_token`**, nunca `p_employee_id`. Corrigir os legados é
   dívida separada (o `LaborPortal.tsx` inteiro depende deles).
5. **Retenção de `academy_access_logs`: 18 meses**, coerente com o prazo de
   fiscalização. É a tabela de maior volume (heartbeat a cada 30s); nunca
   habilitar Realtime nela.

---

## 7. Antifraude de progresso

Vetores reais e a defesa correspondente, toda no servidor:

| Vetor | Defesa |
|---|---|
| `video.currentTime = duration` | `maior_posicao_segundos` — salto à frente não credita quando `permite_avanco_rapido = FALSE` |
| `playbackRate = 16` | clamp: cada heartbeat credita no máximo 60s |
| Heartbeat em loop | intervalo real entre heartbeats < 20s é descartado |
| Marcar aula concluída pelo cliente | conclusão é decidida exclusivamente pelo RPC |
| Gabarito no payload | as opções trafegam sem a coluna `correta`; correção 100% server-side |

O `academy_access_logs` completo é a evidência que sustenta a conclusão numa
fiscalização.

---

## 8. Referências de implementação

- Plano detalhado da Etapa 1 (DDL, RPCs, ordem de execução, verificação):
  `C:\Users\altai\.claude\plans\clever-twirling-babbage.md`
- Migrations: `supabase/migrations/20270850000000_*` a `20270850000008_*`
- Serviços: `services/academyService.ts`, `academyPortalService.ts`,
  `academyCertificadoService.ts`, `trainingsService.ts`
- Tipos: `types/academy.ts`
- UI: `components/LaborTrainings.tsx` (container) + `components/academy/`
- Edge Function: `supabase/functions/academy-portal-media/`
