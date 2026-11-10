package nc.tv.live;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.util.SparseIntArray;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.annotation.OptIn;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

import org.json.JSONObject;

/**
 * NC TV pour Android TV / Google TV.
 *
 * Même application web que sur Tizen (assets/www), affichée dans une WebView
 * transparente posée au-dessus d'un lecteur ExoPlayer. Le JavaScript pilote le
 * lecteur via l'objet "Android" (play / stop / exit) et reçoit ses événements via
 * NativePlayer.onEvent(...). Les touches de la télécommande sont traduites en
 * codes Tizen pour que le JavaScript n'ait rien à changer.
 */
@OptIn(markerClass = UnstableApi.class)
public class MainActivity extends Activity {
    private static final String TAG = "NcTv";
    private static final String DEFAULT_UA =
            "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

    // Touche Android -> code de touche Tizen attendu par js/main.js
    private static final SparseIntArray KEYS = new SparseIntArray();
    static {
        KEYS.put(KeyEvent.KEYCODE_DPAD_UP, 38);
        KEYS.put(KeyEvent.KEYCODE_DPAD_DOWN, 40);
        KEYS.put(KeyEvent.KEYCODE_DPAD_LEFT, 37);
        KEYS.put(KeyEvent.KEYCODE_DPAD_RIGHT, 39);
        KEYS.put(KeyEvent.KEYCODE_DPAD_CENTER, 13);
        KEYS.put(KeyEvent.KEYCODE_ENTER, 13);
        KEYS.put(KeyEvent.KEYCODE_NUMPAD_ENTER, 13);
        KEYS.put(KeyEvent.KEYCODE_BUTTON_A, 13);
        KEYS.put(KeyEvent.KEYCODE_GUIDE, 13);          // touche Guide -> mosaïque
        KEYS.put(KeyEvent.KEYCODE_BACK, 10009);
        KEYS.put(KeyEvent.KEYCODE_CHANNEL_UP, 427);
        KEYS.put(KeyEvent.KEYCODE_CHANNEL_DOWN, 428);
        KEYS.put(KeyEvent.KEYCODE_PAGE_UP, 427);
        KEYS.put(KeyEvent.KEYCODE_PAGE_DOWN, 428);
        KEYS.put(KeyEvent.KEYCODE_INFO, 457);
        KEYS.put(KeyEvent.KEYCODE_MEDIA_FAST_FORWARD, 417);
        KEYS.put(KeyEvent.KEYCODE_MEDIA_NEXT, 10233);
        KEYS.put(KeyEvent.KEYCODE_MEDIA_PLAY, 415);
        KEYS.put(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, 10252);
        for (int i = 0; i <= 9; i++) {
            KEYS.put(KeyEvent.KEYCODE_0 + i, 48 + i);
            KEYS.put(KeyEvent.KEYCODE_NUMPAD_0 + i, 48 + i);
        }
    }

    private final Handler ui = new Handler(Looper.getMainLooper());
    private WebView web;
    private ExoPlayer player;
    private boolean playingSent = false;
    private boolean started = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        PlayerView playerView = new PlayerView(this);
        playerView.setUseController(false);
        playerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
        playerView.setShutterBackgroundColor(Color.BLACK);
        playerView.setFocusable(false);

        player = new ExoPlayer.Builder(this).build();
        playerView.setPlayer(player);
        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_BUFFERING) {
                    send("buffering", null);
                } else if (state == Player.STATE_READY) {
                    send("ready", null);
                    if (!playingSent) {
                        playingSent = true;
                        send("playing", null);
                    }
                } else if (state == Player.STATE_ENDED) {
                    send("ended", null);
                }
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                Log.w(TAG, "Erreur lecteur", error);
                send("error", error.getErrorCodeName());
            }
        });

        web = new WebView(this);
        web.setBackgroundColor(Color.TRANSPARENT);
        web.setFocusable(false);
        web.setFocusableInTouchMode(false);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        // L'app web appelle des API sans en-têtes CORS (comme sur Tizen) : autorisé
        // depuis une page locale.
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        // Page conçue en 1920x1080 : on la met à l'échelle de l'écran.
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                Log.d(TAG, "[js] " + m.message());
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "Android");

        root.addView(playerView, new FrameLayout.LayoutParams(-1, -1));
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        hideSystemUi(root);

        web.loadUrl("file:///android_asset/www/index.html");
    }

    private void hideSystemUi(View v) {
        v.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    /** Envoie un événement du lecteur au JavaScript. */
    private void send(String type, String detail) {
        String arg = detail == null ? "null" : JSONObject.quote(detail);
        js("window.NativePlayer && NativePlayer.onEvent('" + type + "', " + arg + ")");
    }

    private void js(String code) {
        ui.post(() -> { if (web != null) web.evaluateJavascript(code, null); });
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int code = KEYS.get(event.getKeyCode(), -1);
        if (code < 0) return super.dispatchKeyEvent(event); // volume, Home, etc.
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            js("document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:" + code + "}))");
        }
        return true;
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (started) js("window.__appVisible && __appVisible()");
        started = true;
    }

    @Override
    protected void onStop() {
        js("window.__appHidden && __appHidden()");
        player.stop();
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        player.release();
        web.destroy();
        web = null;
        super.onDestroy();
    }

    /** Fonctions appelées depuis le JavaScript (objet "Android"). */
    private class Bridge {
        @JavascriptInterface
        public void play(String url, String ua) {
            ui.post(() -> {
                DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
                        .setUserAgent(ua != null && !ua.isEmpty() ? ua : DEFAULT_UA)
                        .setAllowCrossProtocolRedirects(true)
                        .setConnectTimeoutMs(15000)
                        .setReadTimeoutMs(15000);
                MediaItem.Builder item = new MediaItem.Builder().setUri(url);
                if (url.contains(".m3u8")) item.setMimeType(MimeTypes.APPLICATION_M3U8);
                playingSent = false;
                player.setMediaSource(new DefaultMediaSourceFactory(http).createMediaSource(item.build()));
                player.prepare();
                player.setPlayWhenReady(true);
            });
        }

        @JavascriptInterface
        public void stop() {
            ui.post(() -> {
                player.stop();
                player.clearMediaItems();
            });
        }

        @JavascriptInterface
        public void exit() {
            ui.post(MainActivity.this::finish);
        }
    }
}
