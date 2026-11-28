# OpenWA + worker — instalação na máquina do escritório

Plano: `docs/planos/2026-11-23-whatsapp-openwa-piloto-pedido.md` (Task 9).

O que roda aqui, num **WSL2 Ubuntu dedicado** com **Docker Engine próprio**:

| Serviço  | O que faz | Rede |
| -------- | --------- | ---- |
| `openwa` | Gateway do WhatsApp (OpenWA, build do commit 5eaadd39 — 0.31.x —, motor Baileys, SQLite) | porta **só em `127.0.0.1:2785`** (painel/QR local) |
| `redis`  | Fila do OpenWA (é ela que dá retentativa ao webhook) | rede interna, sem porta, sem saída |
| `worker` | Liga **para fora** no Supabase (campainha Realtime + Edge Function `whatsapp-openwa-worker`), pega a fila, envia pelo OpenWA e reporta | sem porta |

Nada fica exposto à internet. A única entrada é o webhook do OpenWA, que **sai** daqui
para `https://oxedkknreghxrgenyjiu.supabase.co/functions/v1/whatsapp-openwa-webhook`.

> ⚠️ **Nunca rode duas cópias com a mesma sessão** (outra máquina, outro WSL, um
> `docker run` de teste). Duas conexões com o mesmo número derrubam uma à outra e podem
> levar o WhatsApp a desconectar ou banir o número. Antes de mudar de máquina, pare esta.

> ⚠️ **O OpenWA endereça a sessão pelo ID (UUID), não pelo nome.** O nome é `opura`; o id
> sai do `POST /api/sessions`. O worker acha o id pelo nome sozinho, mas o banco precisa
> saber o id (passo 8) — é ele que o webhook traz em `sessionId`.

---

## 1. Preparar o WSL

No PowerShell do Windows (como administrador):

```powershell
wsl --install -d Ubuntu-24.04 --name openwa   # distro só para isto
```

A senha do usuário Linux não aparece enquanto se digita (nem asteriscos) — digitar e Enter.

Se colar no terminal do WSL chegar com `^[[200~` na frente, desligar o "bracketed paste"
(digitar, não colar): `echo 'set enable-bracketed-paste off' >> ~/.inputrc && bind -f ~/.inputrc`.

Dentro do WSL (`wsl -d openwa`), ligar o systemd (o Docker e o cron precisam) **e manter o
usuário padrão** (o `tee` sem `-a` substitui o arquivo; sem `[user]` a distro passa a abrir
como root):

```bash
printf '[boot]\nsystemd=true\n[user]\ndefault=%s\n' "$USER" | sudo tee /etc/wsl.conf
```

Sair e no PowerShell: `wsl --shutdown`; conferir com
`wsl -d openwa -- bash -c "whoami; systemctl is-system-running"` (usuário + `running`).

**Manter o WSL ligado com o Windows** — sem isso a distro desliga sozinha quando nenhum
processo a segura, e o número cai. No **PowerShell como administrador** (o terminal do
VS Code não serve: "Acesso negado"). Logon S4U = roda sem ninguém entrar na conta e sem
guardar senha:

```powershell
$p    = New-ScheduledTaskPrincipal -UserId (whoami) -LogonType S4U -RunLevel Highest
$acao = New-ScheduledTaskAction -Execute "wsl.exe" -Argument "-d openwa --exec /bin/sleep infinity"
$gat  = New-ScheduledTaskTrigger -AtStartup
$conf = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "OpenWA WSL" -Action $acao -Trigger $gat -Settings $conf -Principal $p -Force | Out-Null
Start-ScheduledTask -TaskName "OpenWA WSL"
```

(O Docker sobe pelo systemd e os containers têm `restart: unless-stopped`.)

## 2. Instalar o Docker Engine (não o Docker Desktop)

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"   # sair e entrar de novo no WSL
```

## 3. Copiar a pasta e criar o `.env`

Copiar `infra/openwa/` do repositório para dentro do WSL (ex.: `~/openwa`), **fora** de
`/mnt/c` (o SQLite e a sessão não podem morar no disco do Windows):

```bash
mkdir -p ~/openwa && cp -r /mnt/c/<caminho-do-repo>/infra/openwa/. ~/openwa/
cd ~/openwa
cp .env.example .env && chmod 600 .env
```

Preencher no `.env`:

- `API_MASTER_KEY` — `openssl rand -hex 32` (chave ADMIN, só para os comandos abaixo).
- `OPENWA_WEBHOOK_SECRET` — o **mesmo** valor do secret `OPENWA_WEBHOOK_SECRET` da Edge
  Function `whatsapp-openwa-webhook`.
- `WA_WORKER_SECRET` — o **mesmo** valor do secret `WA_WORKER_SECRET` da Edge Function
  `whatsapp-openwa-worker`.
- `SUPABASE_ANON_KEY` — chave pública do projeto (a `sb_publishable_…` serve para a campainha).
- `OPENWA_API_KEY` — deixar vazio por enquanto (passo 6).
- `OPENWA_DIGEST` — passo 4.

Os 2 segredos, gerados uma vez e gravados nos dois lados sem aparecer na tela (PowerShell,
na pasta do repositório; `gravar-segredos.sh` recebe os valores por `WSLENV` — pipe do
PowerShell para o WSL põe BOM, e `Read-Host` dentro de bloco colado chega vazio):

```powershell
wsl -d openwa -- cp /mnt/c/<caminho-do-repo>/infra/openwa/gravar-segredos.sh /home/<usuario>/openwa/
function New-Segredo { $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); ($b | % { $_.ToString('x2') }) -join '' }
$env:WA_W = New-Segredo; $env:WA_H = New-Segredo; $env:WSLENV = "WA_W:WA_H"
npx supabase secrets set "WA_WORKER_SECRET=$env:WA_W" "OPENWA_WEBHOOK_SECRET=$env:WA_H"
wsl -d openwa --exec bash /home/<usuario>/openwa/gravar-segredos.sh
Remove-Item Env:WA_W, Env:WA_H, Env:WSLENV -ErrorAction SilentlyContinue
```

Conferir que batem sem expor: `npx supabase secrets list` mostra o SHA-256 de cada valor;
no WSL, `grep '^WA_WORKER_SECRET=' .env | cut -d= -f2- | tr -d '\n' | sha256sum` deve dar o mesmo.

> Comando para o WSL a partir do Windows: `wsl -d openwa -- bash -c '…$VAR…'` expande o `$`
> antes de chegar ao bash. Usar `wsl -d openwa --exec bash script.sh` ou `bash -s` com heredoc.

## 4. Fixar a imagem (digest)

A imagem é sempre por **digest**, nunca por tag. O registro é `ghcr.io/rmyndharis/openwa`;
as tags **não têm "v"** (`0.31.0`, `0.32.0`, `latest`) e cada commit do `main` tem a sua
(7 caracteres do SHA). A tag de versão e a de commit podem ser imagens diferentes — conferir
de qual commit a imagem saiu no rótulo `org.opencontainers.image.revision`:

```bash
docker buildx imagetools inspect ghcr.io/rmyndharis/openwa:5eaadd3 --format '{{json .Manifest.Digest}}'
```

Colocar no `.env`: `OPENWA_DIGEST=sha256:...` (com o prefixo `sha256:`).

**Digest em uso (24/11/2026):** `sha256:b49439b6ef1847aa8321d0adc2356a900eccf7ac498ee462b04fc9cd893df00e`
= build do commit `5eaadd39` (o código conferido no design). A tag `0.31.0` é outro build
(commit `7933167`, 21/11) e **não** é esta imagem.

Opcional (recomendado): fixar também a base do worker —
`docker buildx imagetools inspect node:22-alpine` → `WORKER_NODE_IMAGE=node:22-alpine@sha256:...`.

## 5. Subir

```bash
docker compose config >/dev/null && docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:2785/api/health/ready
```

Enquanto `OPENWA_API_KEY` estiver vazio o worker só avisa no log
(`docker compose logs worker`) e espera — não reinicia em laço.

## 6. Criar a sessão e a chave do worker

```bash
set -a; . ./.env; set +a
OW=http://127.0.0.1:2785/api

# Sessão "opura" — guardar o "id" da resposta.
curl -fsS -X POST "$OW/sessions" -H "X-API-Key: $API_MASTER_KEY" \
  -H 'Content-Type: application/json' -d '{"name":"opura","config":{"linkPreview":false}}'
SID=$(curl -fsS "$OW/sessions?name=opura" -H "X-API-Key: $API_MASTER_KEY" | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["id"])')
echo "$SID"

# Chave OPERATOR do worker, só para esta sessão. O "apiKey" aparece UMA vez.
curl -fsS -X POST "$OW/auth/api-keys" -H "X-API-Key: $API_MASTER_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"worker-opura\",\"role\":\"operator\",\"allowedSessions\":[\"$SID\"]}"
```

Colocar o `apiKey` em `OPENWA_API_KEY` no `.env` e recriar o worker:
`docker compose up -d --force-recreate worker` (só `up -d` **não** recriou o worker depois
de mudar o `.env` — conferido na instalação). O log deve mostrar "sessão do OpenWA encontrada
pelo nome" e "campainha assinada".

## 7. Registrar o webhook

```bash
set -a; . ./.env; set +a
curl -fsS -X POST "$OW/sessions/$SID/webhooks" -H "X-API-Key: $API_MASTER_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"url\":\"https://oxedkknreghxrgenyjiu.supabase.co/functions/v1/whatsapp-openwa-webhook\",
       \"events\":[\"message.received\",\"message.ack\",\"message.failed\",\"session.status\",\"session.disconnected\"],
       \"secret\":\"$OPENWA_WEBHOOK_SECRET\"}"
```

SSRF: `WEBHOOK_SSRF_PROTECT` fica no padrão (ligado). Ele só recusa destino em
loopback/rede privada/link-local/metadata; a URL do Supabase é pública, então **não**
é preciso mexer em `SSRF_ALLOWED_HOSTS` (conferido no `.env.example` do OpenWA v0.31.0).

## 8. Ligar a sessão ao banco

O webhook chega com `sessionId` = id da sessão, e a Edge Function confere contra
`wa_conexoes.sessao_remota` (hoje `'opura'`, a linha inicial). Trocar pelo id — **quem
aplica é o usuário** (nunca `db push`):

```sql
UPDATE public.wa_conexoes SET sessao_remota = '<SID>' WHERE sessao_remota = 'opura';
```

O `db query` não imprime nada para UPDATE; conferir com
`SELECT sessao_remota, estado, visto_em FROM public.wa_conexoes` (`visto_em` atualiza a cada minuto).

Sem isso o webhook responde 403 e o "estou vivo" do worker responde 404 (o worker avisa
no log com o texto "wa_conexoes.sessao_remota precisa ser o id da sessão do OpenWA").

## 9. Parear o número

```bash
curl -fsS -X POST "$OW/sessions/$SID/start" -H "X-API-Key: $API_MASTER_KEY"
```

No navegador do Windows abrir `http://127.0.0.1:2785` (o WSL2 repassa o localhost), entrar
com a `API_MASTER_KEY`, abrir a sessão `opura` e ler o QR no celular do número
(WhatsApp → Aparelhos conectados → Conectar aparelho). Quando a sessão ficar `ready`, a
tela do app mostra "conectado" em até 1 min.

Conferir: `docker compose logs -f worker` — deve aparecer "campainha assinada" e nenhum
texto, telefone ou chave.

## 10. Backup diário de `./dados`

`./dados/openwa` guarda a sessão pareada (perder = parear de novo) e o SQLite;
`./dados/redis`, a fila. Backup diário, 7 cópias, **fora do WSL**. O OpenWA fica parado
alguns segundos para o SQLite sair consistente.

```bash
sudo tee /usr/local/bin/openwa-backup >/dev/null <<'EOF'
#!/bin/sh
set -eu
cd /home/<usuario>/openwa
DEST=/mnt/c/OpenWA-backup
mkdir -p "$DEST"
docker compose stop worker openwa redis
tar -czf "$DEST/openwa-dados-$(date +%F).tar.gz" dados || true
docker compose start redis openwa worker
ls -1t "$DEST"/openwa-dados-*.tar.gz | tail -n +8 | xargs -r rm -f
EOF
sudo chmod 700 /usr/local/bin/openwa-backup
echo '30 3 * * * root /usr/local/bin/openwa-backup' | sudo tee /etc/cron.d/openwa-backup
```

O arquivo tem a credencial da sessão: a pasta `C:\OpenWA-backup` deve ser acessível só
pelo usuário do escritório. Restaurar: `docker compose down`, apagar `dados/`, extrair o
`.tar.gz` mais recente na pasta, `docker compose up -d`.

## 11. Atualizar o OpenWA

1. Ler as notas da versão nova (mudança de variável ou de API).
2. Backup manual: `sudo /usr/local/bin/openwa-backup`.
3. Resolver o digest da tag nova (passo 4) e trocar `OPENWA_DIGEST` no `.env`.
4. `docker compose pull openwa && docker compose up -d`.
5. Testar: `curl -fsS http://127.0.0.1:2785/api/health/ready`, sessão `ready` no painel,
   enviar um pedido de teste e ver o "aceita" no app.
6. Deu errado: voltar o `OPENWA_DIGEST` anterior e `docker compose up -d`; se o banco foi
   migrado pela versão nova, restaurar o backup do passo 2.

Atualizar este arquivo e o `docker-compose.yml` no repositório com o digest novo.

## Referência rápida

| Comando | Para quê |
| ------- | -------- |
| `docker compose ps` | estado dos 3 serviços |
| `docker compose logs -f worker` | ciclos, envios (só id da fila e status HTTP) |
| `docker compose restart worker` | reiniciar só o worker |
| `docker compose down` | parar tudo (os dados ficam em `./dados`) |
