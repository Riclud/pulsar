package com.pulsar.host;

import android.app.Dialog;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.graphics.Color;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.MediaController;
import android.widget.VideoView;
import android.webkit.MimeTypeMap;
import android.widget.Toast;

import androidx.core.app.NotificationCompat;
import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;
import org.qtproject.qt.android.bindings.QtActivity;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

public class PulsarActivity extends QtActivity {
    private static final int PICK_FILES_REQUEST = 0x504b;
    private static final int PERMISSION_REQUEST = 0x504d;

    private static native void notifyBack();

    private static native void filesPicked(String json);

    private static native void fileExported(boolean ok);

    private static native void permissionResult(String name, boolean granted);

    private static native void notificationClicked(String token);

    private static native void intentReceived(String json);

    private static final String DEFAULT_NOTIFICATION_CHANNEL = "pulsar";
    private static final String NOTIFICATION_TOKEN_EXTRA = "pulsarNotificationToken";

    private Dialog videoDialog;
    private String pendingPermissionName;
    private int nextNotificationID = 1000;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleNotificationIntent(getIntent());
        handleShareIntent(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleNotificationIntent(intent);
        handleShareIntent(intent);
    }

    private void handleShareIntent(Intent intent) {
        if (intent == null)
            return;

        final String action = intent.getAction();

        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_VIEW.equals(action))
            return;

        JSONObject result = new JSONObject();
        JSONArray files = new JSONArray();

        try {
            if (Intent.ACTION_SEND.equals(action)) {
                String text = intent.getStringExtra(Intent.EXTRA_TEXT);

                if (text != null && !text.isEmpty())
                    result.put("text", text);

                Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);

                if (stream != null) {
                    String path = copyUriToCache(stream);

                    if (path != null)
                        files.put(path);
                }
            } else {
                Uri data = intent.getData();

                if (data != null) {
                    String scheme = data.getScheme();

                    if ("http".equals(scheme) || "https".equals(scheme)) {
                        result.put("url", data.toString());
                    } else {
                        String path = copyUriToCache(data);

                        if (path != null)
                            files.put(path);
                    }
                }
            }
        } catch (Exception ignored) {
        }

        intent.setAction(Intent.ACTION_MAIN);
        intent.setData(null);
        intent.removeExtra(Intent.EXTRA_TEXT);
        intent.removeExtra(Intent.EXTRA_STREAM);

        if (result.length() == 0 && files.length() == 0)
            return;

        try {
            result.put("files", files);
            result.put("action", action == null ? "" : action);
        } catch (Exception ignored) {
        }

        intentReceived(result.toString());
    }

    private void handleNotificationIntent(Intent intent) {
        if (intent == null)
            return;

        String token = intent.getStringExtra(NOTIFICATION_TOKEN_EXTRA);

        if (token == null || token.isEmpty())
            return;

        intent.removeExtra(NOTIFICATION_TOKEN_EXTRA);
        notificationClicked(token);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (videoDialog != null && videoDialog.isShowing()) {
            if (event.getKeyCode() == KeyEvent.KEYCODE_BACK)
                videoDialog.dismiss();

            return true;
        }

        if (event.getKeyCode() != KeyEvent.KEYCODE_BACK)
            return super.dispatchKeyEvent(event);

        if (isKeyboardVisible()) {
            super.dispatchKeyEvent(event);
            return true;
        }

        if (event.getAction() == KeyEvent.ACTION_DOWN)
            notifyBack();

        return true;
    }

    private boolean isKeyboardVisible() {
        if (Build.VERSION.SDK_INT < 30)
            return false;

        WindowInsets insets = getWindow().getDecorView().getRootWindowInsets();

        return insets != null && insets.isVisible(WindowInsets.Type.ime());
    }

    public void showToast(String text) {
        runOnUiThread(() -> Toast.makeText(this, text, Toast.LENGTH_SHORT).show());
    }

    public void openFile(String path) {
        if (mimeType(new File(path).getName()).startsWith("video/")) {
            playVideo(path);
            return;
        }

        runOnUiThread(() -> {
            try {
                File file = new File(path);
                Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".qtprovider", file);
                Intent intent = new Intent(Intent.ACTION_VIEW);

                intent.setDataAndType(uri, mimeType(file.getName()));
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivity(intent);
            } catch (Exception ignored) {
            }
        });
    }

    public void playVideo(String path) {
        runOnUiThread(() -> {
            if (videoDialog != null && videoDialog.isShowing()) return;

            Dialog dialog = new Dialog(this, android.R.style.Theme_Black_NoTitleBar_Fullscreen);
            FrameLayout layout = new FrameLayout(this);
            VideoView view = new VideoView(this);
            MediaController controller = new MediaController(this);

            try {
                Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".qtprovider", new File(path));

                view.setVideoURI(uri);
            } catch (Exception ignored) {
                return;
            }

            controller.setAnchorView(view);
            view.setMediaController(controller);
            view.setOnPreparedListener(player -> view.start());
            view.setOnCompletionListener(player -> dialog.dismiss());

            layout.addView(view, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

            Button close = new Button(this);

            close.setText("×");
            close.setTextSize(22);
            close.setBackgroundColor(Color.TRANSPARENT);
            close.setTextColor(Color.WHITE);
            close.setOnClickListener(v -> dialog.dismiss());

            FrameLayout.LayoutParams closeParams = new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);

            closeParams.gravity = Gravity.TOP | Gravity.END;
            closeParams.setMargins(0, 32, 32, 0);
            layout.addView(close, closeParams);

            dialog.setContentView(layout);
            dialog.setOnDismissListener(d -> videoDialog = null);
            dialog.show();

            videoDialog = dialog;
        });
    }

    public void pickFiles() {
        runOnUiThread(() -> {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);

            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            startActivityForResult(intent, PICK_FILES_REQUEST);
        });
    }

    public void shareText(String text, String title) {
        runOnUiThread(() -> {
            Intent intent = new Intent(Intent.ACTION_SEND);

            intent.setType("text/plain");
            intent.putExtra(Intent.EXTRA_TEXT, text);

            Intent chooser = Intent.createChooser(intent, title != null && !title.isEmpty() ? title : null);

            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(chooser);
        });
    }

    public void shareFile(String path, String mime, String title) {
        runOnUiThread(() -> {
            try {
                File file = new File(path);
                Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".qtprovider", file);
                String type = mime != null && !mime.isEmpty() ? mime : mimeType(file.getName());

                Intent intent = new Intent(Intent.ACTION_SEND);

                intent.setType(type);
                intent.putExtra(Intent.EXTRA_STREAM, uri);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                Intent chooser = Intent.createChooser(intent, title != null && !title.isEmpty() ? title : null);

                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(chooser);
            } catch (Exception ignored) {
            }
        });
    }

    public void setOrientation(String orientation) {
        runOnUiThread(() -> {
            int value;

            switch (orientation) {
                case "portrait":
                case "portrait-up":
                    value = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;
                    break;
                case "portrait-down":
                    value = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_REVERSE_PORTRAIT;
                    break;
                case "landscape":
                case "landscape-left":
                    value = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE;
                    break;
                case "landscape-right":
                    value = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_REVERSE_LANDSCAPE;
                    break;
                default:
                    value = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
                    break;
            }

            setRequestedOrientation(value);
        });
    }

    public void createNotificationChannel(String id, String name, int importance) {
        runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT < 26)
                return;

            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

            if (manager == null || manager.getNotificationChannel(id) != null)
                return;

            manager.createNotificationChannel(new NotificationChannel(id, name, importance));
        });
    }

    public void showNotification(String token, String title, String body) {
        runOnUiThread(() -> {
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

            if (manager == null)
                return;

            if (Build.VERSION.SDK_INT >= 26 && manager.getNotificationChannel(DEFAULT_NOTIFICATION_CHANNEL) == null) {
                manager.createNotificationChannel(new NotificationChannel(
                        DEFAULT_NOTIFICATION_CHANNEL, "Pulsar", NotificationManager.IMPORTANCE_DEFAULT));
            }

            Intent intent = new Intent(this, PulsarActivity.class);

            intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            intent.putExtra(NOTIFICATION_TOKEN_EXTRA, token);

            PendingIntent pending = PendingIntent.getActivity(this, token.hashCode() & 0x7fffffff, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            Notification notification = new NotificationCompat.Builder(this, DEFAULT_NOTIFICATION_CHANNEL)
                    .setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setAutoCancel(true)
                    .setContentIntent(pending)
                    .build();

            manager.notify(nextNotificationID++, notification);
        });
    }

    public void setKeepAwake(boolean enabled) {
        runOnUiThread(() -> {
            if (enabled) {
                getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
        });
    }

    public void requestPermission(String name) {
        if (Build.VERSION.SDK_INT < 23) {
            permissionResult(name, true);
            return;
        }

        final String[] permissions = permissionNames(name);

        if (permissions.length == 0) {
            permissionResult(name, true);
            return;
        }

        boolean allGranted = true;

        for (String permission : permissions) {
            if (checkSelfPermission(permission) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                allGranted = false;
                break;
            }
        }

        if (allGranted) {
            permissionResult(name, true);
            return;
        }

        pendingPermissionName = name;
        runOnUiThread(() -> requestPermissions(permissions, PERMISSION_REQUEST));
    }

    public boolean hasPermission(String name) {
        if (Build.VERSION.SDK_INT < 23)
            return true;

        for (String permission : permissionNames(name)) {
            if (checkSelfPermission(permission) != android.content.pm.PackageManager.PERMISSION_GRANTED)
                return false;
        }

        return true;
    }

    private String[] permissionNames(String name) {
        switch (name) {
            case "camera":
                return new String[] { android.Manifest.permission.CAMERA };
            case "microphone":
                return new String[] { android.Manifest.permission.RECORD_AUDIO };
            case "location":
                return new String[] {
                        android.Manifest.permission.ACCESS_FINE_LOCATION,
                        android.Manifest.permission.ACCESS_COARSE_LOCATION
                };
            case "notifications":
                return Build.VERSION.SDK_INT >= 33
                        ? new String[] { "android.permission.POST_NOTIFICATIONS" }
                        : new String[0];
            case "storage":
                return Build.VERSION.SDK_INT >= 33
                        ? new String[] {
                                "android.permission.READ_MEDIA_IMAGES",
                                "android.permission.READ_MEDIA_VIDEO",
                                "android.permission.READ_MEDIA_AUDIO"
                        }
                        : new String[] { android.Manifest.permission.READ_EXTERNAL_STORAGE };
            default:
                return new String[0];
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode != PERMISSION_REQUEST) {
            super.onRequestPermissionsResult(requestCode, permissions, grantResults);
            return;
        }

        boolean granted = grantResults.length > 0;

        for (int result : grantResults) {
            if (result != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                granted = false;
                break;
            }
        }

        permissionResult(pendingPermissionName != null ? pendingPermissionName : "", granted);
        pendingPermissionName = null;

        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != PICK_FILES_REQUEST) {
            super.onActivityResult(requestCode, resultCode, data);
            return;
        }

        JSONArray paths = new JSONArray();

        if (resultCode == RESULT_OK && data != null) {
            List<Uri> uris = new ArrayList<>();

            if (data.getClipData() != null) {
                for (int index = 0; index < data.getClipData().getItemCount(); index++)
                    uris.add(data.getClipData().getItemAt(index).getUri());
            } else if (data.getData() != null) {
                uris.add(data.getData());
            }

            for (Uri uri : uris) {
                String path = copyUriToCache(uri);

                if (path != null)
                    paths.put(path);
            }
        }

        filesPicked(paths.toString());
        super.onActivityResult(requestCode, resultCode, data);
    }

    private String copyUriToCache(Uri uri) {
        File directory = new File(getCacheDir(), "picked");

        directory.mkdirs();

        File target = new File(directory, System.currentTimeMillis() + "-" + queryName(uri));

        try (InputStream input = getContentResolver().openInputStream(uri);
             OutputStream output = new FileOutputStream(target)) {
            if (input == null) return null;

            byte[] buffer = new byte[8192];
            int read;

            while ((read = input.read(buffer)) > 0) output.write(buffer, 0, read);

            long modified = queryModified(uri);

            if (modified > 0) target.setLastModified(modified);

            return target.getAbsolutePath();
        } catch (Exception ignored) {
            return null;
        }
    }

    public void exportFile(String path, String name) {
        new Thread(() -> {
            boolean ok = false;

            try {
                String mime = mimeType(name);

                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues values = new ContentValues();

                    values.put(MediaStore.Downloads.DISPLAY_NAME, name);
                    values.put(MediaStore.Downloads.MIME_TYPE, mime);
                    values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);

                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);

                    if (uri != null) {
                        try (InputStream input = new FileInputStream(path);
                             OutputStream output = getContentResolver().openOutputStream(uri)) {
                            if (output != null) {
                                copy(input, output);
                                ok = true;
                            }
                        }
                    }
                } else {
                    File directory = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);

                    directory.mkdirs();

                    File target = new File(directory, name);

                    try (InputStream input = new FileInputStream(path);
                         OutputStream output = new FileOutputStream(target)) {
                        copy(input, output);
                        ok = true;
                    }
                }
            } catch (Exception ignored) {
            }

            fileExported(ok);
        }).start();
    }

    private static void copy(InputStream input, OutputStream output) throws Exception {
        byte[] buffer = new byte[8192];
        int read;

        while ((read = input.read(buffer)) > 0) output.write(buffer, 0, read);
    }

    private long queryModified(Uri uri) {
        try (Cursor cursor = getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED);

                if (index >= 0) return cursor.getLong(index);
            }
        } catch (Exception ignored) {
        }

        return 0;
    }

    private String queryName(Uri uri) {
        String name = uri.getLastPathSegment();

        try (Cursor cursor = getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);

                if (index >= 0) name = cursor.getString(index);
            }
        } catch (Exception ignored) {
        }

        if (name == null) return "file";

        return new File(name).getName();
    }

    private String mimeType(String name) {
        int dot = name.lastIndexOf('.');

        if (dot >= 0) {
            String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substring(dot + 1).toLowerCase());

            if (mime != null) return mime;
        }

        return "application/octet-stream";
    }

    @Override
    public void onBackPressed() {
        // Back never finishes the activity.
    }
}
