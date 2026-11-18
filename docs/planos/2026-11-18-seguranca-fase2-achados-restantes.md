# Segurança, fase 2: resolver os achados que ficaram abertos (18/11/2026)

## Pedido original

> Resolver todos

Sessão: `ef9d394e-216b-4a82-8e74-8476ec75f63b`, 18/11/2026.

Responde à lista de pendências do fim da fase 1
(`docs/planos/2026-11-16-aplicar-patches-claude-security.md`):

- bucket `documents` público (F9);
- `bi-narrative` sem deploy;
- `ANTHROPIC_API_KEY` ausente em produção;
- SMTP próprio no Auth;
- os 20 achados sem patch;
- os achados novos que os revisores viram.

Relatório e notas de cada achado (fora do git):
`C:\D\frentes\security-scan\CLAUDE-SECURITY-20261115-005039\patches\F<n>.md`. A nota de cada
achado sem patch descreve o que a revisão rejeitou e o desenho que pediu. Cada PR abaixo
segue esse desenho.

## Decisões

| Data | Pergunta | Resposta |
|---|---|---|
| 18/11 | F14/F59: título já aprovado cujo valor sobe para faixa de alçada maior volta para aprovação? | **Sim, volta.** |
| 18/11 | F11/F55: quem pode receber o relatório de BI por e-mail? | **Só membros da organização.** Fecha em parte: o cadastro é auto-confirmado (`enable_confirmations = false`), então dá para criar conta com o e-mail de outra pessoa. Fecha de vez quando a confirmação de e-mail for ligada, o que depende do SMTP da fase 0. |
| 18/11 | F70: HTML de usuário exibido no app | **Conter e rolar.** Todo HTML sanitizado fica preso no próprio quadro (`contain: paint`), com rolagem interna quando o conteúdo é largo. |
| 18/11 | F75: token do WhatsApp Cloud API | **Por organização, no servidor.** Guardado no Vault (mesmo modelo de `aplicar_20271017300000_asaas_conta_gateway.sql`), configurado só por gestor, envio pela Edge Function, sem o `VITE_WA_ACCESS_TOKEN` no build. |
| 18/11 | `bi-narrative` | Publicar (está incluída no "todos"). Só funciona depois da `ANTHROPIC_API_KEY`. |

## Fase 0: infraestrutura (feita pelo usuário, sem código)

- **0a. `ANTHROPIC_API_KEY`.** Nenhuma chave de IA está configurada em produção. Hoje não
  funcionam `bi-narrative`, `doc-gen-ia`, `pedido-fast`, `planta-ia` e `read-matricula`.
  Comando: `npx supabase secrets set ANTHROPIC_API_KEY=… --project-ref oxedkknreghxrgenyjiu`.
- **0b. SMTP próprio no Auth, pelo Resend.** O Resend já funciona: 60 e-mails de cobrança
  enviados em 60 dias, nenhuma falha.
  - Onde configurar: Authentication › Emails › SMTP Settings, com host `smtp.resend.com`,
    porta 465, usuário `resend` e, como senha, a chave do Resend.
  - Remetente: um endereço do domínio já verificado no Resend, o mesmo de `REPORT_FROM_EMAIL`.
  - Depois disso, subir o limite de e-mails em Authentication › Rate Limits.
- **0c. Deploy da `bi-narrative`**, depois da 0a.

## PRs

Cada PR é uma frente própria (REGRA #8). As migrations são `aplicar_…`, aplicadas pelo
usuário com `db query -f`, nunca com `db push`. Cada PR tem uma faixa de prefixo própria para
não colidir. O maior prefixo na `main` hoje é `20271117980300`.

| PR | Achados | Prefixo | Natureza |
|---|---|---|---|
| **A. Autorização no banco** | 8 RPCs DEFINER sem autorização (`hire_candidate`, `create_vacation_period`, `close_labor_diary`, `consolidate_evaluation_cycle`, `esocial_create_batch`, `esocial_generate_s2200`, `esocial_get_dashboard`, `sst_indicators`); `payroll_audit_logs` USING (true); `employees_org_access` sem WITH CHECK separado; `sos_manage` (WITH CHECK exige a org dona do fornecedor) e **F72** (`pix_quote` aceita compartilhamento de fornecedor) | `202711189110xx` | migrations + 1 function |
| **B. Caminhos assinados por service role** | **F54** (guarda antes dos dois assinadores, com trim linear); **F53**, parte de travessia: guarda em `supplier-portal-download` e `*-portal-recibo-download`; `navigation-cache` sem URL com `?token=` | `202711189120xx` | functions + migration |
| **C. Corretor não é membro** | **F5, F6, F7**: sai o ramo `broker_profiles`-por-e-mail de `is_org_member`, `minhas_orgs_membro`, `is_org_member_de` e das cópias DEFINER; aba Saúde servida por RPCs que espelham a RLS; quem é da casa e só está cadastrado como corretor ganha linha em `organization_members` antes | `202711189130xx` | migrations + front |
| **D. HTML contido** | **F70**: `contain: paint` + rolagem em todo sink de `sanitizeHtml`; `check-xss-sinks.sh` passa a exigir isso | — | front |
| **E. SheetJS** | **F64, F74**: `xlsx` 0.20.3 pelo CDN da SheetJS, com o lockfile | — | dependência |
| **F. Bucket `documents` privado + F9** | **F9** (fotos e documentos de RH em `organization-assets` por registro, como `labor-documents`); bucket `documents` vira privado, e a leitura passa a usar URL assinada | `202711189140xx` | migrations + front + migração de objetos |
| **G. Alçada no servidor** | **F14, F59**: `approval_status` só muda pela RPC de aprovação; o título volta para aprovação quando o valor sobe de faixa | `202711189150xx` | migrations |
| **H. Relatório de BI por e-mail** | **F11, F55**: destinatário precisa ser membro da organização; o HTML é montado no servidor a partir da narrativa guardada pela `bi-narrative` | `202711189160xx` | function + migration |
| **I. WhatsApp no servidor** | **F75** | `202711189170xx` | migration + function + front |
| **J. SSRF** | **F63, F66**: primeiro, provar que `Deno.resolveDns` funciona no runtime; depois, guarda por IP resolvido e mensagem de erro fixa | — | functions |
| **K. Caminho preso à organização** | **F53**, parte do vínculo com a organização: mover os anexos dos condomínios 007 e 010 (`scripts/condominio-mover-anexos.mjs`) e só então exigir que o caminho seja da organização do registro | `202711189180xx` | script + migration |
| **L. Permissão por módulo no servidor** | **F13, F17**: é mudança de desenho, que será desenhada com o usuário antes de começar | — | desenho |

### Ordem

1. Fase 0 (usuário), em paralelo a tudo.
2. A, B, C, D e E em paralelo. São independentes e não tocam os mesmos arquivos.
3. F, G, H, I e J.
4. K, que depende de mover arquivos em produção.
5. L, com desenho próprio.

"Pronto" = código na `main` **e** a parte de banco/function no ar, provado de fora (como
na fase 1).

## Estado

- [x] 4 decisões de produto tomadas (18/11)
- [ ] Fase 0: chave de IA, SMTP e deploy da `bi-narrative` (usuário)
- [ ] A · [ ] B · [ ] C · [ ] D · [ ] E
- [ ] F · [ ] G · [ ] H · [ ] I · [ ] J
- [ ] K
- [ ] L
