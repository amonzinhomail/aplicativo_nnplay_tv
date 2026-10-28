# Navegação por controle remoto (D-pad)

Tudo está em `app.js` (seção "Controle remoto / D-pad").

## Teclas reconhecidas

| Ação | Teclas |
|---|---|
| Setas | `ArrowUp/Down/Left/Right` (keyCode 37–40) |
| OK | `Enter` (13), DPAD_CENTER do Android (23, 66) |
| Voltar | Samsung Tizen **10009**, LG webOS **461**, Android 4, `Escape`, `Backspace`, `GoBack`, `BrowserBack` |
| Play / Pause / Play-Pause | 415 / 19 / 10252, 179, 85, `MediaPlay*` |
| Parar | 413, `MediaStop` |
| Avançar / Voltar 10 s | 417, 412, 228, 227, 176, 177, `MediaFastForward/Rewind` |

## Como funciona
- **Foco:** todo elemento navegável tem `data-focus` + `tabindex="0"`. A seta escolhe o vizinho mais próximo na direção
  (navegação espacial) e lembra a coluna ao subir/descer. Para tornar algo navegável, basta pôr `data-focus tabindex="0"`.
- **Foco inicial:** no banner de destaque. Ao voltar de uma tela (player, busca), o foco volta ao item de onde você saiu.
- **Player:** o YouTube usa a API oficial (`controls=0`), então as setas **não** ficam presas no iframe.
  OK = pausar/tocar, ←/→ = ∓10 s, ↑ = mostra o botão Voltar. A live (HLS) aceita OK e Voltar.
- **Voltar:** cada tela sobreposta (busca, player) empilha um estado em `history`. Voltar fecha uma tela por vez; na Home
  chama o `exitApp()` (Tizen `exit()`, webOS `platformBack()`, ou `AndroidTV.exit()` se existir).

## Integração com o app nativo (WebView)
O site expõe `window.TV`:

```js
TV.back()      // botão Voltar do app nativo
TV.key('up')   // 'up' | 'down' | 'left' | 'right' | 'enter' | 'back' | 'play' | 'pause' | 'playpause' ...
```

- **Android TV:** no `onKeyDown`/`onBackPressed` chame `webView.evaluateJavascript("TV.back()", null)` (ou `webView.goBack()`,
  que também funciona por causa do histórico). Ative `settings.javaScriptEnabled`, `domStorageEnabled` e
  `mediaPlaybackRequiresUserGesture = false`. Para sair do app: exponha `AndroidTV.exit()` via `addJavascriptInterface`.
- **Samsung Tizen:** adicione o privilégio `http://tizen.org/privilege/tv.inputdevice` no `config.xml` (teclas de mídia).
- **LG webOS:** nada a registrar; o Voltar chega como 461.

## Dicas para TV
- Teste em 1920×1080; as medidas seguem o site original (cards 660×352, títulos 30 px).
- O stream HLS precisa de CORS liberado para o domínio do app (ou use um proxy seu).
