# Instalar em hospedagem comum (PHP)

Resultado: o site em `https://tv.seudominio.com.br`, com `/admin` (banners, upload, configurações) e
atualização do YouTube **quando alguém entra no site**. Não precisa de Node, Docker, SSH nem cron.

## O que a hospedagem precisa ter
| Requisito | Como conferir |
|---|---|
| **PHP 7.4 ou superior** (8.x é ótimo) | cPanel > "Selecionar versão do PHP" |
| Extensão **curl** ativa (quase sempre vem ligada) | na mesma tela, marque `curl` |
| **HTTPS** (certificado grátis) | cPanel > "SSL/TLS Status" > "Run AutoSSL" |
| Um **subdomínio ou domínio próprio** para o site | veja o passo 1 |
| Pastas com **permissão de escrita** (`data` e `uploads`) | o padrão 755 costuma bastar |

> O site precisa ficar na **raiz** de um domínio ou subdomínio (ex.: `tv.seudominio.com.br`), não numa subpasta
> como `seudominio.com.br/tv`. Os endereços internos começam em `/`.

## Passo a passo
1. **Crie um subdomínio** (cPanel > Domínios): `tv.seudominio.com.br`, com a pasta de destino própria (ex.: `tv`).
   Depois ative o HTTPS dele (AutoSSL).
2. **Envie o pacote:** Gerenciador de Arquivos > abra a pasta do subdomínio > "Carregar" `tv-php.zip` >
   clique com o botão direito no zip > **Extrair**. Os arquivos (`index.html`, `data.php`, pasta `admin`...)
   devem ficar **direto dentro** dessa pasta (não numa pasta dentro dela). Apague o `.zip` depois.
3. **Configure a senha e a chave:** renomeie `config.sample.php` para `config.php`, abra "Editar" e preencha:
   ```php
   define('NN_ADMIN_PASSWORD', 'uma-senha-longa-com-12-ou-mais-caracteres');
   define('NN_YOUTUBE_API_KEY', 'sua-chave-da-youtube-data-api-v3');
   ```
   **Chave do YouTube:** Google Cloud Console > crie um projeto > "APIs e serviços" > ative **YouTube Data API v3** >
   Credenciais > Chave de API. Em "Restrições de API", restrinja **somente** à YouTube Data API v3.
4. **Primeira atualização:** abra `https://tv.seudominio.com.br/admin/`, entre com a senha e vá na aba
   **YouTube > Atualizar agora** (leva ~10 s). Depois abra o site.

Pronto. Na dúvida, o passo 4 é o que faz as playlists aparecerem na primeira vez.

## Como funciona a atualização "ao entrar"
- Cada visita lê o conteúdo guardado (rápido, sem esperar o YouTube).
- Se o conteúdo tem mais de **10 min** (configurável), a página avisa o navegador, que pede a atualização em
  segundo plano. Quem entrou já recebeu o conteúdo guardado; os próximos veem o novo.
- No máximo **1 atualização a cada 10 min**, não importa quantas visitas. Cada uma usa ~24 unidades da cota do
  YouTube (limite grátis: 10.000/dia → no pior caso ~3.500/dia).
- Se o YouTube falhar, o site continua com o último conteúdo salvo e só tenta de novo depois de 2 min.

## Dia a dia (tudo pelo /admin)
| Quero... | Onde |
|---|---|
| Adicionar, apagar, ordenar ou desativar banners; enviar imagens | Aba **Banners** |
| Nome, fuso, stream ao vivo (.m3u8), canal do YouTube | Aba **Configurações** |
| Quais playlists aparecem, a ordem e a capa de cada uma | Aba **Configurações > Playlists** |
| Ver se a última atualização deu certo / forçar agora | Aba **YouTube** |

Banners, marca e capas valem em até ~30 s. Mudanças nas playlists valem após **Atualizar agora** (ou na próxima
atualização automática).

## Backup
Copie a pasta `data` e a pasta `uploads` (Gerenciador de Arquivos > Compactar > baixar). Para restaurar, envie-as de volta.

## Segurança (já incluída)
- Os arquivos de `data/` começam com um bloqueio em PHP: mesmo que o servidor ignore o `.htaccess`, abri-los no navegador
  não mostra nada (nem senha, nem chaves de sessão).
- `config.php` só executa código; abrir no navegador mostra uma página em branco. **Nunca** envie seu `config.php` a ninguém.
- Login: cookie assinado (HttpOnly, SameSite=Strict, Secure em HTTPS), 8 h de validade. **Sair** ou trocar a senha
  encerra todas as sessões. Bloqueio de 1 min após 5 senhas erradas por IP. Alterações só aceitam a própria origem.
- Upload: só PNG/JPG/WEBP/GIF reais, até 5 MB; a pasta `uploads` não executa nada.
- Se a chave do YouTube já foi colada em algum chat ou arquivo compartilhado, **apague-a e crie outra**.

## Problemas comuns
| Sintoma | Causa provável e solução |
|---|---|
| **Erro 500** logo após enviar | O `.htaccess` da raiz usa recursos que a hospedagem bloqueia. Renomeie-o para `.htaccess.off`: o site funciona sem ele (só perde cabeçalhos extras). |
| Login diz "Defina NN_ADMIN_PASSWORD..." | O `config.php` não existe ou a senha tem menos de 12 caracteres. |
| "Não foi possível gravar em data/" | Dê permissão **775** às pastas `data` e `uploads` (Gerenciador de Arquivos > Permissões). |
| Aba YouTube: "chave não configurada" | Falta `NN_YOUTUBE_API_KEY` no `config.php`. |
| "YouTube API 403 ... quota" | Cota diária esgotada: volta no dia seguinte. Aumente o intervalo em Configurações. |
| "YouTube API 400/403 ... key not valid" | Chave errada ou restrita a outro serviço. Restrinja só à YouTube Data API v3. |
| "Falha de rede ao falar com o YouTube" | A extensão **curl** está desligada, ou a hospedagem bloqueia conexões de saída. |
| Playlist não aparece | O título não é igual ao do YouTube (maiúsculas e acentos não importam). Veja os avisos na aba YouTube. |
| Primeira abertura demorou | Normal uma vez só (busca inicial). Use "Atualizar agora" logo depois de instalar. |
| Stream ao vivo não toca | O servidor do stream precisa liberar CORS para o seu endereço. |
| Muitos visitantes "bloqueados" no login | Hospedagem atrás de proxy/CDN: todos aparecem com o mesmo IP. Use senha forte e evite compartilhar o link do /admin. |

## App de TV (WebView)
O app só precisa abrir o endereço `https://tv.seudominio.com.br`. As teclas do controle e o botão Voltar já estão
tratados (veja `D-PAD.md` no projeto principal).

## Direitos de uso
Logo, artes, nomes e o stream da Rádio NN pertencem ao NN Play. Publique-os apenas com autorização do titular.
