package br.com.nnplay.tv

import android.annotation.SuppressLint
import android.app.Activity
import android.content.pm.ApplicationInfo
import android.graphics.Color
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader

/**
 * Tela única: um WebView que abre o site empacotado dentro do APK (pasta assets).
 * O WebViewAssetLoader entrega os arquivos em https://appassets.androidplatform.net/, sem abrir porta nem servidor:
 * o site roda como se estivesse hospedado, e o "modo cliente" (boot.js) busca e guarda as playlists sozinho.
 */
class MainActivity : Activity() {

    private companion object {
        const val HOST = "appassets.androidplatform.net"
        const val START_URL = "https://$HOST/index.html"
        const val TAG = "NNPlayTV"
    }

    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemBars()

        val debuggable = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        if (debuggable) WebView.setWebContentsDebuggingEnabled(true)

        // "/" -> pasta assets do APK (onde o build-web.js coloca o site)
        val assets = WebViewAssetLoader.Builder()
            .setDomain(HOST)
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#0C0E12"))
            isFocusable = true
            isFocusableInTouchMode = true

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true                       // localStorage: guarda o conteúdo no aparelho
                mediaPlaybackRequiresUserGesture = false       // o player toca sem precisar de um toque
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                allowFileAccess = false
                allowContentAccess = false
                cacheMode = WebSettings.LOAD_DEFAULT
            }

            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    assets.shouldInterceptRequest(request.url)

                // A página principal nunca troca para outro endereço (o site não tem links externos).
                // Quadros internos (o player do YouTube) seguem livres.
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                    request.isForMainFrame && request.url.host != HOST

                override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                    Log.w(TAG, "WebView encerrado pelo sistema; recriando a tela")
                    recreate()
                    return true
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                    Log.d(TAG, "${m.message()} (${m.sourceId()}:${m.lineNumber()})")
                    return true
                }
                override fun onPermissionRequest(request: PermissionRequest) = request.deny() // sem câmera/microfone
            }

            // Permite ao site (app.js) fechar o app quando o Voltar é apertado na tela inicial.
            addJavascriptInterface(Bridge(), "AndroidTV")
        }
        setContentView(web)
        web.requestFocus()

        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl(START_URL)
    }

    /** Exposto ao JavaScript como AndroidTV.exit(). */
    private inner class Bridge {
        @JavascriptInterface
        fun exit() = runOnUiThread { finish() }
    }

    // Voltar do controle: o site decide (fecha player/busca ou, na tela inicial, chama AndroidTV.exit()).
    // Se o site ainda não carregou, apenas fecha o app.
    @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
    override fun onBackPressed() {
        web.evaluateJavascript("(typeof TV !== 'undefined') ? (TV.back(), 'ok') : 'nao'") { r ->
            if (r == null || !r.contains("ok")) finish()
        }
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        hideSystemBars()
    }

    override fun onPause() {
        web.onPause()
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onDestroy() {
        (web.parent as? android.view.ViewGroup)?.removeView(web)
        web.destroy()
        super.onDestroy()
    }

    @Suppress("DEPRECATION")
    private fun hideSystemBars() {
        window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE)
    }
}
