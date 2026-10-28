# App Android TV (WebView que se atualiza sozinho)

O site fica **dentro do APK**. Ao abrir, o app mostra o conteúdo guardado e, quando está vencido, busca as
playlists no YouTube por conta própria e guarda no aparelho. Não precisa de hospedagem para o site nem para as playlists.

## Como funciona
1. **Abertura:** usa o conteúdo guardado no aparelho. Na primeira vez (ou se limpar os dados) usa o **snapshot**
   que veio no APK (`web/snapshot.json`), então abre na hora, sem tela vazia e sem esperar rede.
2. **Atualização:** 6 s depois de abrir, se houver chave e o conteúdo tiver mais de `refreshMinutes` (padrão 6 h), o app
   busca no YouTube e guarda. **O novo conteúdo aparece na próxima abertura** (a tela atual não muda de repente).
   Se a busca falhar, tenta de novo só depois de 10 min.
3. **Banners:** vêm de um arquivo JSON remoto (`bannersUrl`), esperando no máximo 2,5 s. Se ele estiver fora do ar,
   usa o último que guardou; sem nenhum, usa os do APK.
4. **Sem servidor:** o `WebViewAssetLoader` entrega os arquivos do APK em `https://appassets.androidplatform.net/`.
   Não abre porta de rede; nada fica acessível de fora do aparelho.

## Configurar (arquivo `web/app-config.js`)
| Campo | O que é |
|---|---|
| `youtubeApiKey` | Chave da YouTube Data API v3. Não escreva aqui: passe por `YOUTUBE_API_KEY` ao montar (abaixo). Sem chave o app usa só o snapshot. |
| `channel`, `playlists`, `maxShorts`, `maxPerPlaylist` | Canal e quais playlists aparecem (ordem, capa ou "sem capa"). |
| `refreshMinutes` | Idade máxima do conteúdo guardado antes de buscar de novo. |
| `bannersUrl` | Endereço do JSON de banners (modelo em `web/banners.sample.json`). |
| `brand`, `live`, `defaultBanners` | Nome, stream ao vivo e banners que vão no APK. |

Depois de editar: `node build-web.js` (ou use o Android Studio, que não roda esse passo: rode-o antes).

## Compilar o APK
**Pelo Android Studio:** abra a pasta `android`, aguarde a sincronização, `Build > Build APK(s)`.

**Pela linha de comando** (como eu fiz neste computador):
```bash
cd android
YOUTUBE_API_KEY=sua-chave node build-web.js          # monta o site dentro do app (a chave entra no APK)
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
gradle assembleDebug                                  # gera app/build/outputs/apk/debug/app-debug.apk
```
Sem a variável `YOUTUBE_API_KEY`, o APK funciona só com o snapshot.

**Atualizar o snapshot** (para o app novo já vir com o conteúdo recente): `YOUTUBE_API_KEY=... node tools/make-snapshot.mjs`
e depois monte de novo.

## Instalar na TV (para testar)
1. Na TV: Configurações > Sobre > toque várias vezes em "Build" para ativar o modo desenvolvedor; ative "Depuração USB/ADB".
2. No computador: `adb connect IP_DA_TV:5555` e `adb install app-debug.apk`.
3. O app aparece na tela inicial com o banner do NN Play.

## Gerar o pacote assinado e publicar na Play Store
O projeto já tem uma chave de assinatura (`signing/` + `keystore.properties`; **faça backup**: sem ela você não atualiza o app).
```bat
release.bat 1 1.0                         :: sem chave do YouTube (usa só o snapshot)
release.bat 2 1.1 SUA_CHAVE_DO_YOUTUBE    :: versionCode 2, versão 1.1, app que se atualiza sozinho
```
Gera `release\NNPlayTV-<versão>-<código>.aab` (para a Play) e `.apk` (para instalar direto). O `versionCode` tem de crescer a cada envio.
Passo a passo completo (conta, declarações, TV, testes, política de privacidade): **[PLAY-STORE.md](PLAY-STORE.md)**.
Sem o Android Studio, o `gradlew.bat` do projeto compila sozinho; com o Studio, o projeto já exige JDK 17 no Gradle (`gradle/gradle-daemon-jvm.properties`).

## Cota do YouTube (leia antes de distribuir)
A cota grátis (10.000 unidades/dia) é **do projeto da chave e dividida entre todos os aparelhos**. Cada atualização gasta
~24 unidades, então cabem ~400 atualizações por dia no total.

| `refreshMinutes` | No máx. por aparelho/dia | Aparelhos com uso contínuo que cabem na cota |
|---|---|---|
| 360 (padrão) | 4 atualizações (~96 un.) | ~100 |
| 720 | 2 (~48 un.) | ~200 |
| 1440 | 1 (~24 un.) | ~400 |

Na prática, muitos aparelhos abrem o app poucas vezes por dia, então cabe mais. Se a cota acabar, os aparelhos continuam
funcionando com o conteúdo guardado (só deixam de atualizar até o dia seguinte). Para muitos aparelhos, o ideal é um servidor
central (as versões Cloudflare ou PHP) que busca uma vez e todos leem dele.

## Segurança
- **A chave dentro do APK não é segredo:** qualquer pessoa pode abrir o APK e lê-la. Restrinja-a no Google Cloud:
  *Restrições de API* = somente YouTube Data API v3; *Restrições de aplicativo* = **Referenciadores HTTP**
  `https://appassets.androidplatform.net/*`. A restrição "app Android" (pacote + SHA-1) **não funciona** aqui, porque quem
  chama o YouTube é o JavaScript do WebView, não o código Android. O referenciador só dificulta uso casual (pode ser falsificado);
  o limite real é a cota. Se a chave vazar, apague-a e crie outra.
- O WebView bloqueia conteúdo sem HTTPS, acesso a arquivos do aparelho, câmera e microfone, e qualquer navegação para
  fora do site. O app não pede permissão alguma além de internet.
- O objeto `AndroidTV` exposto ao JavaScript só tem `exit()`.
- Logo, artes e stream pertencem ao NN Play: publique-os apenas com autorização.

## Banners remotos
Publique o JSON em qualquer lugar com HTTPS **que libere CORS** (`Access-Control-Allow-Origin: *`): GitHub Pages e
`raw.githubusercontent.com` liberam. As imagens podem ser URLs `https://` ou os arquivos do APK (`/seed/...`).

## Problemas comuns
| Sintoma | Causa provável |
|---|---|
| Playlists não atualizam | Sem chave no APK, cota esgotada ou conteúdo ainda dentro do prazo. Veja o logcat (`adb logcat -s NNPlayTV`). |
| Player do YouTube mostra erro 153 | O YouTube exige um endereço de origem válido; testamos o site com origem https, mas confirme num aparelho real. |
| Banners remotos não aparecem | O servidor do JSON não libera CORS, ou o JSON está fora do formato. |
| Quer forçar atualização | Limpe os dados do app (Configurações > Apps > NN Play) ou reduza `refreshMinutes`. |
| Voltar não sai do app | Só sai na tela inicial; dentro do player/busca fecha uma tela por vez. |

## Samsung (Tizen) e LG (webOS)
Os mesmos arquivos de `app/src/main/assets` servem de base para um app web empacotado (Tizen `.wgt`, webOS). Não testei
nessas plataformas: lá o site roda sob `file://` e o player do YouTube e o CORS podem se comportar diferente.
