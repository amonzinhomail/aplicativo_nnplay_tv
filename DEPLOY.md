# Publicar o site (VPS + Docker + HTTPS)

Resultado: o site em `https://tv.seudominio.com.br` e o painel em `https://tv.seudominio.com.br/admin/`,
com HTTPS automático, banners/uploads que não se perdem e playlists atualizando sozinhas.

## O que você precisa
- Um **VPS** com Ubuntu 22.04/24.04 (1 vCPU e 1 GB bastam). Ex.: Hetzner, Contabo, Hostinger, DigitalOcean.
- Um **domínio** (ou subdomínio) cujo DNS você controle.

## 1. Preparar o servidor (uma vez)
Conecte por SSH (`ssh root@IP_DO_SERVIDOR`) e rode:

```bash
curl -fsSL https://get.docker.com | sh
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

## 2. Apontar o domínio
No painel do seu domínio, crie um registro **A**: `tv` → `IP_DO_SERVIDOR`. Aguarde propagar (minutos).

## 3. Enviar o projeto
Do seu computador (PowerShell), na pasta do projeto, envie só o necessário:

```powershell
scp -r server.js paths.js index.html style.css app.js data.js admin tools uploads seed Dockerfile .dockerignore docker-compose.yml Caddyfile backup.sh .env.example root@IP_DO_SERVIDOR:/opt/tv/
```
(crie a pasta antes: `ssh root@IP_DO_SERVIDOR "mkdir -p /opt/tv"`)

## 4. Configurar e subir
No servidor:

```bash
cd /opt/tv
cp .env.example .env
nano .env        # preencha DOMAIN e ADMIN_PASSWORD (mín. 12 caracteres; gere com: openssl rand -base64 18)
docker compose up -d --build
docker compose logs -f app     # Ctrl+C para sair
```

Em ~1 minuto o Caddy obtém o certificado. Acesse `https://tv.seudominio.com.br/admin/` e entre com a senha do `.env`.

## 5. Dia a dia
- **Banners:** pelo `/admin` (upload, ordem, ativar/desativar). Já sobem os 5 banners atuais.
- **Playlists/Shorts/Próximas transmissões:** atualizam sozinhas a cada `SYNC_HOURS` horas (e 30 s após subir).
  Para forçar agora: `docker compose exec app node tools/sync-youtube.js`.
- **Quais playlists entram:** `tools/sync-config.json` (edite, reenvie e `docker compose up -d --build`).
- **Marca, logo e stream ao vivo:** ficam no `data.js` do volume. Para editar:
  ```bash
  docker compose cp app:/data/data.js ./data.js     # baixa
  nano data.js                                      # edite brand / live
  docker compose cp ./data.js app:/data/data.js     # devolve (vale na hora, sem reiniciar)
  ```
  A atualização do YouTube **preserva** `brand`, `live`, `banners` e as capas que você trocou.
- **Atualizar o código do site:** reenvie os arquivos alterados (passo 3) e rode `docker compose up -d --build`.
  Os dados do volume **não** são apagados.

## 6. Backup
```bash
sh backup.sh                      # cria backups/nn-data-AAAAMMDD-HHMMSS.tar.gz (guarda os 14 últimos)
crontab -e                        # backup diário às 3h:  0 3 * * * cd /opt/tv && sh backup.sh
```
Copie a pasta `backups/` de vez em quando para fora do servidor (seu PC ou outro armazenamento).

Restaurar: `docker compose exec -T app tar -xzf - -C /data < backups/ARQUIVO.tar.gz` e `docker compose restart app`.

## Problemas comuns
| Sintoma | Causa provável |
|---|---|
| Site não abre / certificado inválido | DNS ainda não propagou, ou portas 80/443 fechadas. Veja `docker compose logs caddy`. |
| `app` reinicia sem parar | `ADMIN_PASSWORD` ausente ou com menos de 12 caracteres. Veja `docker compose logs app`. |
| Playlists não atualizam | O YouTube pode bloquear IPs de datacenter. Veja `docker compose logs app` (`[sync] falhou`). O site continua com o último conteúdo salvo. Solução durável: trocar o script pela YouTube Data API v3 (chave gratuita). |
| Stream ao vivo não toca | O servidor do stream precisa liberar CORS para o seu domínio. |
| Esqueci a senha do admin | Troque `ADMIN_PASSWORD` no `.env` e rode `docker compose up -d`. |

## Segurança (já incluso)
HTTPS obrigatório (HSTS), cookie de login `Secure`/`HttpOnly`/`SameSite=Strict`, bloqueio de 1 min após 5 senhas erradas por IP,
upload validado (só imagens reais, 5 MB), links `javascript:` bloqueados, app sem porta exposta (só o Caddy), contêiner sem root.
Use uma senha longa e única, mantenha o servidor atualizado (`apt update && apt upgrade`) e não compartilhe o `.env`.

## Direitos de uso
Logo, artes, nomes e o stream ao vivo pertencem ao NN Play. Publique-os apenas com autorização do titular.
