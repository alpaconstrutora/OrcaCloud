# Runbook de Deploy - Orcacloud

Este arquivo registra o procedimento seguro de deploy para evitar repeticao dos incidentes de 2026-06-30.

## Regra principal

Para este projeto, use build remoto da Vercel:

```powershell
vercel deploy --prod --scope altairs-projects-aa74deda --yes
```

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
