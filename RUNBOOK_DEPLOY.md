# Runbook de Deploy - Orcacloud

Este arquivo registra o procedimento seguro de deploy para evitar repeticao dos incidentes de 2026-06-30.

## Regra principal

**O `git push` para `main` já publica.** O projeto tem integração com o GitHub, e
todo push em `main` dispara um build de produção. Push em outra branch vira
preview.

**Depois de empurrar, confirme com o script:**

```bash
bash scripts/publicar-producao.sh
```

Ele **não republica** quando o build do push já entregou o commit — só espera e
confere. Se o build do push não vier (integração desligada, build com erro,
republicação sem commit novo), aí sim ele publica pelo CLI.

Quatro coisas que o comando cru não faz, cada uma nascida de um incidente de
02/09/2026:

1. **recusa se a branch não for `main`, se a árvore estiver suja, se faltar
   commit do remoto ou se houver commit não empurrado.** Foi publicar uma branch
   59 commits atrás de `main` que tirou do ar quantitativo em planilha, editar
   pedido em abas e condomínios no Portal do Cliente;
2. roda tipos, XSS e a suíte antes de subir;
3. **faz `promote` e `alias set` depois do deploy.** Se houve um rollback antes, o
   domínio fica preso na versão revertida: o deploy novo aparece "Ready /
   Production" no painel e o site continua servindo o pacote velho. Pior, o
   `promote` responde **409 "já é o deploy de produção atual"** — ser o deploy de
   produção e ser o que o alias aponta são estados diferentes;
4. **prova o resultado.** Baixa o que o domínio entrega e procura o SHA do commit
   lá dentro (carimbado em `__BUILD_COMMIT__` via `--build-env`).

⚠️ **Não compare o nome do bundle local com o servido.** O Vercel compila na
infraestrutura dele: os arquivos saem com o mesmo tamanho e conteúdo equivalente,
mas hashes diferentes. A primeira versão do script fazia isso e acusou falha numa
publicação correta.

### O portão do build

`vercel.json` → `buildCommand: "npm run verificar:build && vite build"`.

O Vercel só troca o domínio se o build passar, então as verificações ali dentro
são um portão estrutural — versionado e revisável em PR, ao contrário de
configuração de painel. Cobre o buraco de `vite build` não fazer typecheck.

A **suíte de testes não entra**: `__tests__` está no `.vercelignore` para o upload
ficar leve, e ela já roda no GitHub Actions a cada push e no script acima antes de
publicar.

Duas armadilhas que isso revelou, ambas invisíveis enquanto os scripts só rodavam
no Windows:

- **`.sh` precisa estar em LF.** `vercel deploy` envia o *diretório de trabalho*,
  não os blobs do git — não basta o repositório guardar LF. Daí o `.gitattributes`
  com `*.sh text eol=lf`. Com CRLF, o bash do Linux quebra em
  `$'\r': command not found`;
- **`vercel.json` valida chaves desconhecidas.** Não dá para deixar comentário
  como `"_buildCommand"` — a explicação vive aqui.

### Comando cru (só para emergência)

```bash
vercel deploy --prod --scope altairs-projects-aa74deda --yes
```

O `--scope` não é opcional: sem ele, `rollback` e `promote` falham com
*"Deployment belongs to a different team"*, mensagem que não descreve o problema.

Nao use `vercel deploy --prebuilt` para deploy manual rotineiro.

## Por que evitar prebuilt aqui

O app e Vite/React e depende de variaveis publicas de build:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Essas variaveis precisam estar disponiveis durante o build, porque entram no bundle final. Em 2026-06-30, um deploy com artefato prebuilt foi publicado sem essas variaveis no bundle e gerou tela branca com:

```text
Supabase URL and Anon Key are required
```

Tambem houve um deploy com `.vercel/output` antigo. `npm run build` gera `dist`, mas `vercel deploy --prebuilt` usa `.vercel/output`. Portanto, rodar `npm run build` antes de `vercel deploy --prebuilt` nao atualiza o artefato que sera publicado.

## Se prebuilt for realmente necessario

Use somente esta sequencia:

```powershell
vercel build --prod --scope altairs-projects-aa74deda
vercel deploy --prebuilt --prod --archive=tgz --scope altairs-projects-aa74deda --yes
```

Antes de publicar prebuilt, confirme que `.vercel/output` acabou de ser gerado.

## Checklist antes de publicar

```powershell
npm run typecheck
npm run build
```

Verificar encoding em textos de UI sem colar caracteres corrompidos no arquivo:

```powershell
$bad = @(
  [char]0x00C3, # A-tilde usado em mojibake, exemplo: Notifica<bad>...
  [char]0xFFFD  # replacement character
)
Get-ChildItem components,index.css,vite.config.ts,index.tsx -Recurse -File -Include *.ts,*.tsx,*.css |
  ForEach-Object {
    $text = [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8)
    foreach ($pattern in $bad) {
      if ($text.Contains($pattern)) { $_.FullName; break }
    }
  }
```

Observacao: alguns textos corretos em portugues podem conter o caractere A-tilde, por exemplo a palavra NAO com acento. Se houver falsos positivos, olhar a linha manualmente. Mojibake tipico aparece como palavras quebradas parecidas com `Notifica...`, `Intelig...`, `Organiza...`, `Governan...`, `Gest...` ou com o replacement character.

## Checklist depois de publicar

Confirmar deployment ativo:

```powershell
vercel inspect https://orcacloud.vercel.app --scope altairs-projects-aa74deda
```

Confirmar HTML e bundles servidos:

```powershell
$r = Invoke-WebRequest -Uri https://orcacloud.vercel.app -UseBasicParsing
$r.StatusCode
[regex]::Matches($r.Content, 'assets/[^"'']+\.(js|css)') | ForEach-Object { $_.Value } | Sort-Object -Unique
```

Confirmar que o bundle principal tem Supabase e nao tem erro de env:

```powershell
$js = "https://orcacloud.vercel.app/assets/<BUNDLE>.js"
$content = (Invoke-WebRequest -Uri $js -UseBasicParsing).Content
$content -match 'https://[^"'']+\.supabase\.co'
$content.Contains('Supabase URL and Anon Key are required')
```

Confirmar que o bundle principal nao tem mojibake nos textos criticos:

```powershell
$badWords = @('Notifica', 'Intelig', 'Organiza', 'Governan', 'Gest')
foreach ($word in $badWords) {
  $matches = [regex]::Matches($content, "$word.{0,24}") | ForEach-Object { $_.Value }
  $matches
}
$content.Contains([char]0xFFFD)
```

Resultado esperado:

- Supabase URL: `True`
- `Supabase URL and Anon Key are required`: `False`
- nenhum trecho quebrado nos textos criticos
- replacement character: `False`

## PWA e cache

O projeto usa `vite-plugin-pwa`. Se o servidor esta correto mas o navegador ainda mostra versao antiga, suspeitar de service worker/cache local.

Validacao rapida no cliente:

1. Abrir DevTools.
2. Application.
3. Service Workers.
4. Unregister.
5. Storage.
6. Clear site data.
7. Recarregar `https://orcacloud.vercel.app`.

Isso e diagnostico de cache local, nao substitui a validacao do bundle publicado.
