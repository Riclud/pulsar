package com.pulsar.host;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.MediaMetadata;
import android.media.MediaPlayer;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.core.app.NotificationCompat;

import org.json.JSONObject;

public class PulsarMediaService extends Service {
    private static final String CHANNEL_ID = "pulsar_media";
    private static final int NOTIFY_ID = 0x4d45;
    private static final String ACTION_COMMAND = "com.pulsar.host.MEDIA_COMMAND";
    private static final String EXTRA_ACTION = "action";
    private static final String EXTRA_DATA = "data";

    private static native void nativeMediaEvent(String json);

    private MediaPlayer player;
    private MediaSession session;
    private Handler handler;
    private String state = "idle";
    private String source = "";
    private String title = "";
    private String artist = "";
    private float rate = 1f;
    private float volume = 1f;

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            if (player == null || !player.isPlaying())
                return;

            emit();
            handler.postDelayed(this, 500);
        }
    };

    public static void command(Context context, String action, String data) {
        Intent intent = new Intent(context, PulsarMediaService.class);

        intent.setAction(ACTION_COMMAND);
        intent.putExtra(EXTRA_ACTION, action);
        intent.putExtra(EXTRA_DATA, data);

        if (Build.VERSION.SDK_INT >= 26)
            context.startForegroundService(intent);
        else
            context.startService(intent);
    }

    @Override
    public void onCreate() {
        super.onCreate();

        handler = new Handler(Looper.getMainLooper());
        createChannel();

        session = new MediaSession(this, "Pulsar");

        session.setCallback(new MediaSession.Callback() {
            @Override
            public void onPlay() {
                play();
            }

            @Override
            public void onPause() {
                pause();
            }

            @Override
            public void onStop() {
                stop();
            }

            @Override
            public void onSkipToNext() {
                emitCommand("next");
            }

            @Override
            public void onSkipToPrevious() {
                emitCommand("prev");
            }

            @Override
            public void onSeekTo(long position) {
                if (player != null)
                    player.seekTo((int) position);
            }
        });
        session.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForegroundCompat(buildNotification());

        if (intent != null) {
            final String action = intent.getStringExtra(EXTRA_ACTION);
            final String data = intent.getStringExtra(EXTRA_DATA);

            if (action != null)
                control(action, data);
        }

        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        releasePlayer();

        if (session != null) {
            session.setActive(false);
            session.release();
            session = null;
        }

        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void control(String action, String dataJson) {
        JSONObject data = parse(dataJson);

        switch (action) {
            case "open":
                open(data);
                break;
            case "play":
                play();
                break;
            case "pause":
                pause();
                break;
            case "toggle":
                if (player != null && player.isPlaying()) pause();
                else play();
                break;
            case "stop":
                stop();
                break;
            case "seek":
                if (player != null) player.seekTo(data.optInt("position", 0));
                emit();
                break;
            case "rate":
                rate = (float) data.optDouble("rate", 1.0);
                applyRate();
                break;
            case "volume":
                volume = (float) data.optDouble("volume", 1.0);
                if (player != null) player.setVolume(volume, volume);
                break;
            case "metadata":
                title = data.optString("title", title);
                artist = data.optString("artist", artist);
                updateMetadata();
                break;
            case "release":
                releasePlayer();
                stopSelf();
                break;
            default:
                break;
        }

        updateNotification();
    }

    private void open(JSONObject data) {
        releasePlayer();

        source = data.optString("source", "");
        title = data.optString("title", "");
        artist = data.optString("artist", "");

        if (source.isEmpty()) {
            state = "idle";
            emit();
            return;
        }

        player = new MediaPlayer();
        player.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build());

        player.setOnPreparedListener((mp) -> {
            mp.setVolume(volume, volume);
            applyRate();
            mp.start();
            state = "playing";
            updateMetadata();
            emit();
            handler.post(ticker);
            updateNotification();
        });
        player.setOnCompletionListener((mp) -> {
            state = "ended";
            handler.removeCallbacks(ticker);
            emit();
            updateNotification();
        });
        player.setOnErrorListener((mp, what, extra) -> {
            state = "error";
            handler.removeCallbacks(ticker);
            emit();
            return true;
        });

        try {
            player.setDataSource(source);
            player.prepareAsync();
            state = "loading";
            emit();
        } catch (Exception e) {
            state = "error";
            emit();
        }
    }

    private void play() {
        if (player == null)
            return;

        if (state.equals("ended")) player.seekTo(0);

        player.start();
        state = "playing";
        emit();
        handler.post(ticker);
        updateNotification();
    }

    private void pause() {
        if (player != null && player.isPlaying()) player.pause();

        state = "paused";
        handler.removeCallbacks(ticker);
        emit();
        updateNotification();
    }

    private void stop() {
        if (player != null) player.stop();

        state = "stopped";
        handler.removeCallbacks(ticker);
        emit();
        updateNotification();
    }

    private void applyRate() {
        if (player == null || Build.VERSION.SDK_INT < 23)
            return;

        try {
            player.setPlaybackParams(player.getPlaybackParams().setSpeed(rate));
        } catch (Exception ignored) {
        }
    }

    private void releasePlayer() {
        handler.removeCallbacks(ticker);

        if (player == null)
            return;

        try {
            player.reset();
            player.release();
        } catch (Exception ignored) {
        }

        player = null;
        state = "stopped";
    }

    private void updateMetadata() {
        if (session == null)
            return;

        MediaMetadata metadata = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
                .build();

        session.setMetadata(metadata);

        PlaybackState.Builder playback = new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
                        | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_STOP
                        | PlaybackState.ACTION_SEEK_TO | PlaybackState.ACTION_SKIP_TO_NEXT
                        | PlaybackState.ACTION_SKIP_TO_PREVIOUS);

        playback.setState(state.equals("playing") ? PlaybackState.STATE_PLAYING
                : state.equals("paused") ? PlaybackState.STATE_PAUSED : PlaybackState.STATE_STOPPED,
                player != null ? player.getCurrentPosition() : 0, rate);

        session.setPlaybackState(playback.build());
    }

    private void emit() {
        JSONObject data = new JSONObject();

        try {
            data.put("state", state);
            data.put("position", player != null ? player.getCurrentPosition() : 0);
            data.put("duration", player != null ? player.getDuration() : 0);
            data.put("source", source);
            data.put("title", title);
            data.put("artist", artist);
            data.put("rate", rate);
            data.put("volume", volume);
        } catch (Exception ignored) {
        }

        nativeMediaEvent(data.toString());
        updateMetadataPosition();
    }

    private void updateMetadataPosition() {
        if (session == null)
            return;

        PlaybackState.Builder playback = new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
                        | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_STOP
                        | PlaybackState.ACTION_SEEK_TO | PlaybackState.ACTION_SKIP_TO_NEXT
                        | PlaybackState.ACTION_SKIP_TO_PREVIOUS);

        playback.setState(state.equals("playing") ? PlaybackState.STATE_PLAYING
                : state.equals("paused") ? PlaybackState.STATE_PAUSED : PlaybackState.STATE_STOPPED,
                player != null ? player.getCurrentPosition() : 0, rate);

        session.setPlaybackState(playback.build());
    }

    private void emitCommand(String command) {
        JSONObject data = new JSONObject();

        try {
            data.put("command", command);
        } catch (Exception ignored) {
        }

        nativeMediaEvent(data.toString());
    }

    private JSONObject parse(String json) {
        try {
            return json == null || json.isEmpty() ? new JSONObject() : new JSONObject(json);
        } catch (Exception ignored) {
            return new JSONObject();
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < 26)
            return;

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null)
            return;

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Playback", NotificationManager.IMPORTANCE_LOW);

        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, PulsarActivity.class);

        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        PendingIntent content = PendingIntent.getActivity(this, 1, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle(title.isEmpty() ? "Pulsar" : title)
                .setContentText(artist)
                .setContentIntent(content)
                .setOngoing(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .addAction(0, "Pause", serviceAction("pause", 2))
                .addAction(0, "Stop", serviceAction("stop", 3));

        return builder.build();
    }

    private PendingIntent serviceAction(String action, int requestCode) {
        Intent intent = new Intent(this, PulsarMediaService.class);

        intent.setAction(ACTION_COMMAND);
        intent.putExtra(EXTRA_ACTION, action);

        return PendingIntent.getService(this, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void updateNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

        if (manager != null)
            manager.notify(NOTIFY_ID, buildNotification());
    }

    private void startForegroundCompat(Notification notification) {
        if (Build.VERSION.SDK_INT >= 29)
            startForeground(NOTIFY_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else
            startForeground(NOTIFY_ID, notification);
    }
}
