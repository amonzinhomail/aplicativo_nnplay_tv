# Publicar no Cloudflare (grátis, sem VPS)

Resultado: o site em `https://nn-play-tv.SEU-USUARIO.workers.dev` (ou no seu domínio), com `/admin`,
banners, upload de imagens e atualização do YouTube **quando alguém entra no site**.

## Como funciona a atualização
- A cada visita, o Worker olha a data do conteúdo guardado. Se passou de **10 min** (configurável em
  Admin > Configurações), ele atualiza pelo YouTube **em segundo plano**: quem entrou recebe o conteúdo
  guardado na hora (~70 ms) e os próximos já veem o novo.
- Resultado: no máximo 1 atualização a cada 10 min, não importa quantas visitas. Cada atualização usa
  ~24 unidades da cota do YouTube (limite grátis: 10.000/dia → no pior caso ~3.500/dia).
- Reforço: uma tarefa agendada atualiza a cada 6 h, mesmo sem visitas.
- Se o YouTube falhar, o site continua com o último conteúdo salvo e só tenta de novo depois de 2 min.

## Passo a passo (uma vez)

### 1. Contas e chaves
1. Crie uma conta grátis em https://dash.cloudflare.com/sign-up
2. **Chave do YouTube:** Google Cloud Console > crie um projeto > "APIs e serviços" > ative a
   **YouTube Data API v3** > Credenciais > Criar credenciais > Chave de API. Em "Restrições de API",
   restrinja a chave **somente** à YouTube Data API v3.

### 2. Preparar o projeto (no seu computador)
Na pasta `cloudflare`:

```bash
npm install
npx wrangler login                          # abre o navegador para autorizar
npx wrangler kv namespace create NN_KV      # mostra um "id": copie
```
Abra `wrangler.toml` e troque `COLE_AQUI_O_ID_DO_KV` pelo id mostrado.

### 3. Segredos (senha do admin e chave do YouTube)
```bash
npx wrangler secret put ADMIN_PASSWORD      # cole uma senha longa (mín. 12 caracteres)
npx wrangler secret put YOUTUBE_API_KEY     # cole a chave do YouTube
```
Os segredos ficam guardados no Cloudflare, fora do código.

### 4. Publicar
```bash
npm run deploy
```
O comando mostra o endereço do site. Depois:
1. Abra `https://SEU-ENDERECO/admin/` e entre com a senha.
2. Aba **YouTube > Atualizar agora** (o 1º carregamento do conteúdo leva ~10 s).
3. Abra o site e confira.

> Se pular o passo 2, o primeiro visitante é quem espera os ~10 s da primeira busca.

## Dia a dia (tudo pelo /admin)
| Quero... | Onde |
|---|---|
| Trocar/ordenar/ativar banners e enviar imagens | Aba **Banners** |
| Trocar nome, logo, fuso, stream ao vivo (.m3u8) | Aba **Configurações** |
| Escolher quais playlists aparecem, a ordem e a capa de cada uma | Aba **Configurações > Playlists** |
| Mudar de quanto em quanto tempo atualiza | Aba **Configurações > Atualizar ao entrar a cada** |
| Ver se a última atualização deu certo / forçar agora | Aba **YouTube** |

Depois de salvar configurações, as mudanças de playlists aparecem após **Atualizar agora** (ou na próxima
atualização automática). Banners, marca e capas valem em até ~30 s.

## Atualizar o código do site
Quando eu (ou você) alterar `index.html`, `style.css` ou `app.js` na pasta de cima, rode `npm run deploy` de novo.
Os dados (banners, configurações, imagens) ficam no KV e **não** são apagados.

## Testar no seu computador antes
Crie `.dev.vars` (não vai para o git) com:
```
ADMIN_PASSWORD=uma-senha-de-teste-longa
YOUTUBE_API_KEY=sua-chave
```
e rode `npm run dev` → http://127.0.0.1:8787

## Limites do plano grátis (confira os números atuais no Cloudflare)
- Requisições do Worker por dia (tem um teto diário; arquivos estáticos do site não contam).
- KV: leituras/escritas por dia. O Worker guarda respostas em memória por 30 s para economizar leituras.
- 50 chamadas externas por execução: o Worker usa ~24, e por isso o limite é de **20 playlists**.
- Se um dia o tráfego passar do grátis, o plano pago do Workers é barato e não exige mudar nada.
Referência: https://developers.cloudflare.com/workers/platform/limits

## Segurança
- A chave do YouTube e a senha ficam só nos segredos do Cloudflare (nunca no navegador nem no código).
- Login: cookie assinado com uma chave aleatória guardada no KV (não derivada da senha), HttpOnly, SameSite=Strict,
  Secure em HTTPS, 8 h de validade. **Sair** (ou trocar a senha) invalida todas as sessões. Bloqueio de 1 min após
  5 senhas erradas por IP e checagem de origem nas alterações (anti-CSRF).
- Navegador: CSP, HSTS, `nosniff` e `Permissions-Policy` (arquivo `public/_headers`); a biblioteca hls.js é
  carregada com verificação de integridade (SRI); respostas do painel nunca ficam em cache.
- Recomendado (grátis, no painel do Cloudflare): uma regra de **Rate limiting/WAF** em `/api/admin/login` e, se
  quiser autenticação forte (2 fatores), o **Cloudflare Access** na frente de `/admin`.
- Upload: só PNG/JPG/WEBP/GIF reais, até 5 MB. Links que não sejam http(s) ou caminhos do site são descartados.
- **Se a chave do YouTube já foi colada em algum chat ou arquivo compartilhado, apague-a no Google Cloud e crie outra.**

## Problemas comuns
| Sintoma | Causa provável |
|---|---|
| `/admin` diz "ADMIN_PASSWORD não configurada" | Faltou `npx wrangler secret put ADMIN_PASSWORD` (ou senha < 12 caracteres). |
| Aba YouTube mostra "chave não configurada" | Faltou `npx wrangler secret put YOUTUBE_API_KEY`. |
| "YouTube API 403 ... quota" | Cota diária esgotada; volta no dia seguinte. Aumente o intervalo de atualização. |
| "YouTube API 400/403 ... API key not valid / restrictions" | Chave errada, ou restrita a outro serviço/site. Restrinja só à YouTube Data API v3. |
| Playlist não aparece | O título não é igual ao do YouTube (maiúsculas e acentos não importam, o resto sim). Veja os avisos na aba YouTube. |
| Stream ao vivo não toca | O servidor do stream precisa liberar CORS para o seu endereço. |

## Direitos de uso
Logo, artes, nomes e o stream ao vivo pertencem ao NN Play. Publique-os apenas com autorização do titular.
