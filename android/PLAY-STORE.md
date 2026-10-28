# Publicar na Google Play (Android TV)

Tudo que o app precisa já está pronto neste projeto. Este guia mostra o que fazer na Play Console.
> As regras da Play mudam com frequência. Onde o guia diz "confira", veja o valor atual na própria Play Console.

## 0. Antes de tudo: quem pode publicar
O app usa o **nome, o logo, as artes e o stream do NN Play**. A política da Play contra falsificação de identidade e de
propriedade intelectual exige que o app seja publicado **pelo titular dessa marca ou com autorização por escrito dele**.
Sem isso, o app pode ser reprovado ou removido depois (e a conta, penalizada). Guarde a autorização.

## 1. O que já está pronto
| Item | Onde |
|---|---|
| **AAB assinado** (é este que a Play pede) | `release/NNPlayTV-1.0-1.aab` |
| APK assinado (instalar direto na TV) | `release/NNPlayTV-1.0-1.apk` |
| Ícone 512×512 | `store-assets/icon-512.png` |
| Banner de TV 1280×720 | `store-assets/tv-banner-1280x720.png` |
| Imagem de destaque 1024×500 | `store-assets/feature-graphic-1024x500.png` |
| 4 capturas de TV 1920×1080 | `store-assets/screenshots-tv/` |
| Modelo de política de privacidade | `PRIVACIDADE-modelo.md` |

O app não tem chave do YouTube dentro (usa só o conteúdo que veio no APK). Para ele se atualizar sozinho, gere o pacote com a
sua chave: `release.bat 2 1.1 SUA_CHAVE` (veja a seção 8 e o `ANDROID.md`).

## 2. A chave de assinatura (importante)
A chave está em `signing/nnplay-upload.jks`, com a senha em `keystore.properties` (na pasta `android`).

| | |
|---|---|
| Alias | `nnplay-upload` |
| Titular | `CN=NN Play, OU=App Android TV, O=NN Play, C=BR` |
| Validade | 10.000 dias (~27 anos) |
| **SHA-256** | `45:DD:5A:B8:F8:A8:D4:C4:E2:F8:72:11:86:E7:4A:92:ED:5F:AE:B9:92:0B:EC:D2:2F:DF:28:0C:83:A6:9D:D3` |
| SHA-1 | `0E:BC:4D:B1:89:39:3D:97:9B:F7:E1:3C:9D:5F:EF:61:43:DB:AC:EA` |

**FAÇA BACKUP AGORA** dos dois arquivos (`signing/nnplay-upload.jks` e `keystore.properties`) num lugar seguro e privado
(gerenciador de senhas, nuvem privada, pen drive guardado). Não envie por chat/e-mail, não publique no GitHub.
Sem eles você não consegue assinar atualizações.

**Use o Play App Signing** (a Play oferece ao criar o app; é o padrão para apps novos): a chave acima vira só a
**chave de upload**. O Google guarda a chave final de assinatura e re-assina o app. Vantagem: se você perder a chave de upload,
é possível pedir à Play para trocá-la. Sem o App Signing, perder a chave significa nunca mais atualizar o app.

## 3. Conta de desenvolvedor
1. Acesse https://play.google.com/console e crie a conta (taxa única em dólar; confira o valor atual).
2. Faça a verificação de identidade. Para conta de **organização** (empresa), costuma pedir o número D-U-N-S.
3. Atenção: contas **pessoais** novas costumam ter que fazer um **teste fechado** com um mínimo de testadores por
   14 dias antes de poder publicar em produção (confira o número atual). Contas de organização geralmente não têm essa exigência.

## 4. Criar o app
Play Console > **Criar app**:
- Nome: `NN Play` (veja se está disponível) · Idioma: Português (Brasil) · **App** (não jogo) · **Gratuito**.
- Aceite as declarações e o **Play App Signing**.

## 5. Preencher as declarações (menu "Painel" > "Configurar seu app")
| Seção | O que marcar |
|---|---|
| **Política de privacidade** | Obrigatória: publique o texto de `PRIVACIDADE-modelo.md` numa página pública (site, GitHub Pages) e cole o endereço. |
| **Acesso ao app** | Todo o conteúdo é acessível sem login. |
| **Anúncios** | O app **não** tem anúncios. |
| **Classificação de conteúdo** | Responda o questionário (conteúdo é jornalismo/esporte/rádio; sem violência explícita produzida pelo app). Notícias podem tratar de temas sensíveis: responda com honestidade. |
| **Público-alvo** | 13 anos ou mais (não é app infantil). |
| **Segurança dos dados** | O app **não coleta dados pessoais por conta própria**. Mas ele exibe o player do YouTube, que pode coletar dados (YouTube/Google). Declare isso conforme as perguntas e cite o YouTube como serviço de terceiros. |
| **Apps de notícias** | Se aparecer, declare que o app exibe conteúdo de notícias do canal do NN Play. |
| **Categoria** | "Notícias e revistas" ou "Vídeo players e editores". |

## 6. Ficha da loja (Presença na loja > Ficha principal)
- Descrição curta (até 80 caracteres) e completa (até 4.000): descreva o app. Não prometa o que ele não faz.
- **Ícone:** `store-assets/icon-512.png` · **Imagem de destaque:** `store-assets/feature-graphic-1024x500.png`
- **Fator de forma TV:** ative em Configuração do app > Fatores de forma. Envie o **banner de TV** (1280×720) e as
  **capturas de tela de TV** (1920×1080), de `store-assets/`.
- Novas capturas, se quiser: com a TV/emulador ligada, `adb exec-out screencap -p > captura.png`.

### Requisitos de qualidade para TV (já atendidos)
Lançador de TV (`LEANBACK_LAUNCHER`) ✓ · banner de TV ✓ · não exige tela de toque ✓ · navegação completa pelo controle (D-pad) ✓ ·
botão Voltar funciona e sai do app na tela inicial ✓ · sem permissões além de internet ✓.
> O app instala também em celular/tablet (a interface é de TV). Para limitar **só a TV**, mude no `AndroidManifest.xml`
> `android.software.leanback` para `android:required="true"` e gere um novo pacote.

## 7. Enviar o app (do teste à produção)
1. Menu **Teste e lançamento > Teste interno > Criar versão**. Envie `release/NNPlayTV-1.0-1.aab`.
   (Teste interno: até 100 testadores, sem revisão demorada. Adicione os e-mails da lista de testadores.)
2. Instale em uma TV real pelo link de teste e valide: abre, navega com o controle, toca vídeo e a rádio ao vivo, Voltar sai.
3. Se a sua conta exigir, faça o **Teste fechado** pelo tempo e número de testadores pedidos.
4. **Produção > Criar versão** (ou "Promover versão"), envie para revisão. A primeira revisão pode levar dias.

## 8. Publicar atualizações
A Play exige que o `versionCode` **cresça a cada envio**. Para gerar a próxima versão (com a sua chave do YouTube dentro):
```bat
release.bat 2 1.1 SUA_CHAVE_DO_YOUTUBE
```
Isso monta o site, compila, assina e cria `release\NNPlayTV-1.1-2.aab`. Envie esse arquivo numa nova versão.
Sem a chave, o app usa só o conteúdo que veio dentro (snapshot). Para atualizar o snapshot antes:
`set YOUTUBE_API_KEY=...` e `node tools/make-snapshot.mjs`.

**Chave do YouTube no app (lembrete):** ela fica legível dentro do APK. Restrinja-a no Google Cloud (somente YouTube Data API v3 e
referenciador `https://appassets.androidplatform.net/*`) e lembre que a cota é dividida entre todos os aparelhos.

## 9. Regras do YouTube
O app usa a **YouTube Data API** e o **player incorporado** do YouTube. Você aceitou os Termos dos Serviços de API do YouTube ao criar
a chave. Em geral, o app/política de privacidade deve **informar que usa os Serviços de API do YouTube** e **linkar**
https://www.youtube.com/t/terms e https://policies.google.com/privacy (o modelo de política já inclui). Não esconda nem
altere o player do YouTube.

## 10. Checklist final
- [ ] Autorização por escrito do NN Play guardada
- [ ] Backup do `signing/nnplay-upload.jks` e do `keystore.properties` em dois lugares
- [ ] Chave do YouTube antiga apagada; nova chave restrita
- [ ] Política de privacidade publicada e linkada
- [ ] Teste interno validado numa TV real
- [ ] Declarações (anúncios, dados, classificação, público) preenchidas
- [ ] Banner de TV, ícone e capturas enviados

## Outras lojas
- **Samsung (Tizen) e LG (webOS):** têm lojas e pacotes próprios (não é o mesmo APK). Os arquivos de `app/src/main/assets`
  servem de base, mas não testei nessas plataformas.
- **Instalar sem loja:** `adb install release/NNPlayTV-1.0-1.apk` (modo desenvolvedor na TV).
