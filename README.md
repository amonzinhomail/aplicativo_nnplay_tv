# NN Play TV: mapa do projeto

O site (`index.html`, `style.css`, `app.js`) é **um só**. Cada pasta abaixo é uma forma de publicá-lo.

| Quero... | Use | Guia |
|---|---|---|
| Testar no meu computador (Node) | `node server.js` (pasta raiz) | — |
| Hospedagem comum (cPanel, PHP) | pasta `php/` → `tv-php.zip` | [php/INSTALAR.md](php/INSTALAR.md) |
| Grátis, sem servidor (Cloudflare) | pasta `cloudflare/` | [cloudflare/DEPLOY-CLOUDFLARE.md](cloudflare/DEPLOY-CLOUDFLARE.md) |
| VPS com Docker | `Dockerfile`, `docker-compose.yml` | [DEPLOY.md](DEPLOY.md) |
| App de TV Android (WebView que se atualiza sozinho) | pasta `android/` | [android/ANDROID.md](android/ANDROID.md) |

Controle remoto (D-pad) e botão Voltar: [D-PAD.md](D-PAD.md).

## Onde editar o quê
- **Visual e comportamento do site:** `index.html`, `style.css`, `app.js` (valem para todas as versões; rode o `build` da pasta escolhida depois).
- **Conteúdo:** pelo `/admin` (PHP, Cloudflare, Node) ou em `android/web/app-config.js` (app).
- **Painel /admin do PHP e do Cloudflare:** `cloudflare/public/admin/` (o PHP é gerado a partir dele por `php/build.js`).
- **Lógica do YouTube:** `cloudflare/src/youtube.js` (o app Android é gerado a partir dela); o PHP tem a sua em `php/inc/youtube.php`.

## Antes de publicar qualquer versão
- Troque a chave do YouTube que foi compartilhada no chat e use uma nova, restrita à YouTube Data API v3.
- Confirme com o NN Play a autorização de uso do logo, das artes, dos nomes e do stream da Rádio NN.
