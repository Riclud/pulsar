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
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.hardware.fingerprint.FingerprintManager;
import android.os.CancellationSignal;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;
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
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.List;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

public class PulsarActivity extends QtActivity {
    private static final String SECURE_KEY_ALIAS = "pulsar_secure";
    private static final String SECURE_PREFERENCES = "pulsar_secure";
    private static final String SECURE_CIPHER = "AES/GCM/NoPadding";
    private static final String BIOMETRIC_KEY_PREFIX = "pulsar_biometric_";
    private static final String BIOMETRIC_PREFERENCES = "pulsar_biometric";

    private static final int PICK_FILES_REQUEST = 0x504b;
    private static final int PERMISSION_REQUEST = 0x504d;
    private static final int SCAN_REQUEST = 0x5351;
    private static final String SCANNER_CLASS = "com.pulsar.host.ScannerActivity";

    private String scanToken;

    private static native void notifyBack();

    private static native void filesPicked(String json);

    private static native void fileExported(boolean ok);

    private static native void permissionResult(String name, boolean granted);

    private static native void notificationClicked(String token);

    private static native void intentReceived(String json);

    private static native void messageResult(String token, boolean accepted);

    private static native void biometricResult(String token, String value);

    private static native void queryResult(String token, String value);

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

    private SecretKey secureKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");

        store.load(null);

        if (store.containsAlias(SECURE_KEY_ALIAS)) {
            return (SecretKey) store.getKey(SECURE_KEY_ALIAS, null);
        }

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");

        generator.init(new KeyGenParameterSpec.Builder(
                SECURE_KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build());

        return generator.generateKey();
    }

    private SharedPreferences securePreferences() {
        return getSharedPreferences(SECURE_PREFERENCES, MODE_PRIVATE);
    }

    public boolean secureAvailable() {
        try {
            secureKey();

            return true;
        } catch (Exception error) {
            return false;
        }
    }

    public boolean secureSet(String key, String value) {
        try {
            Cipher cipher = Cipher.getInstance(SECURE_CIPHER);

            cipher.init(Cipher.ENCRYPT_MODE, secureKey());

            byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            String stored = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":"
                    + Base64.encodeToString(encrypted, Base64.NO_WRAP);

            return securePreferences().edit().putString(key, stored).commit();
        } catch (Exception error) {
            return false;
        }
    }

    public String secureGet(String key) {
        String stored = securePreferences().getString(key, null);

        if (stored == null) {
            return null;
        }

        try {
            String[] parts = stored.split(":", 2);
            Cipher cipher = Cipher.getInstance(SECURE_CIPHER);

            cipher.init(Cipher.DECRYPT_MODE, secureKey(),
                    new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));

            byte[] decrypted = cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP));

            return new String(decrypted, StandardCharsets.UTF_8);
        } catch (Exception error) {
            return null;
        }
    }

    public boolean secureRemove(String key) {
        return securePreferences().edit().remove(key).commit();
    }

    public boolean biometricAvailable() {
        try {
            if (Build.VERSION.SDK_INT >= 30) {
                BiometricManager manager = getSystemService(BiometricManager.class);

                return manager != null && manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                        == BiometricManager.BIOMETRIC_SUCCESS;
            }

            if (Build.VERSION.SDK_INT >= 29) {
                BiometricManager manager = getSystemService(BiometricManager.class);

                return manager != null && manager.canAuthenticate() == BiometricManager.BIOMETRIC_SUCCESS;
            }

            FingerprintManager fingerprints = getSystemService(FingerprintManager.class);

            return fingerprints != null && fingerprints.isHardwareDetected() && fingerprints.hasEnrolledFingerprints();
        } catch (Exception error) {
            return false;
        }
    }

    private SharedPreferences biometricPreferences() {
        return getSharedPreferences(BIOMETRIC_PREFERENCES, MODE_PRIVATE);
    }

    // The key only works right after a strong biometric check, and a newly enrolled
    // fingerprint invalidates it, so the secret cannot be read without the owner.
    private SecretKey newBiometricKey(String alias) throws Exception {
        KeyGenParameterSpec.Builder spec = new KeyGenParameterSpec.Builder(
                alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setUserAuthenticationRequired(true)
                .setInvalidatedByBiometricEnrollment(true);

        if (Build.VERSION.SDK_INT >= 30)
            spec.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");

        generator.init(spec.build());

        return generator.generateKey();
    }

    private SecretKey biometricKey(String alias) throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");

        store.load(null);

        return (SecretKey) store.getKey(alias, null);
    }

    public boolean biometricRemove(String name) {
        try {
            KeyStore store = KeyStore.getInstance("AndroidKeyStore");

            store.load(null);
            store.deleteEntry(BIOMETRIC_KEY_PREFIX + name);
        } catch (Exception error) {
            // A missing entry is the state we want anyway.
        }

        return biometricPreferences().edit().remove(name).commit();
    }

    private interface CipherStep {
        String run(Cipher cipher) throws Exception;
    }

    private void promptWithCipher(String token, Cipher cipher, String title, String cancel, CipherStep step) {
        runOnUiThread(() -> {
            try {
                BiometricPrompt prompt = new BiometricPrompt.Builder(this)
                        .setTitle(title)
                        .setNegativeButton(cancel, getMainExecutor(), (dialog, which) -> biometricResult(token, null))
                        .build();

                prompt.authenticate(new BiometricPrompt.CryptoObject(cipher), new CancellationSignal(), getMainExecutor(),
                        new BiometricPrompt.AuthenticationCallback() {
                            @Override
                            public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                                try {
                                    biometricResult(token, step.run(result.getCryptoObject().getCipher()));
                                } catch (Exception error) {
                                    biometricResult(token, null);
                                }
                            }

                            @Override
                            public void onAuthenticationError(int code, CharSequence message) {
                                biometricResult(token, null);
                            }
                        });
            } catch (Exception error) {
                biometricResult(token, null);
            }
        });
    }

    public void biometricSeal(String token, String name, String value, String title, String cancel) {
        try {
            String alias = BIOMETRIC_KEY_PREFIX + name;

            biometricRemove(name);

            Cipher cipher = Cipher.getInstance(SECURE_CIPHER);

            cipher.init(Cipher.ENCRYPT_MODE, newBiometricKey(alias));

            promptWithCipher(token, cipher, title, cancel, (ready) -> {
                byte[] encrypted = ready.doFinal(value.getBytes(StandardCharsets.UTF_8));
                String stored = Base64.encodeToString(ready.getIV(), Base64.NO_WRAP) + ":"
                        + Base64.encodeToString(encrypted, Base64.NO_WRAP);

                return biometricPreferences().edit().putString(name, stored).commit() ? "ok" : null;
            });
        } catch (Exception error) {
            biometricResult(token, null);
        }
    }

    public void biometricOpen(String token, String name, String title, String cancel) {
        String stored = biometricPreferences().getString(name, null);

        if (stored == null) {
            biometricResult(token, null);
            return;
        }

        try {
            String[] parts = stored.split(":", 2);
            Cipher cipher = Cipher.getInstance(SECURE_CIPHER);

            cipher.init(Cipher.DECRYPT_MODE, biometricKey(BIOMETRIC_KEY_PREFIX + name),
                    new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));

            promptWithCipher(token, cipher, title, cancel, (ready) -> {
                byte[] decrypted = ready.doFinal(Base64.decode(parts[1], Base64.NO_WRAP));

                return new String(decrypted, StandardCharsets.UTF_8);
            });
        } catch (KeyPermanentlyInvalidatedException error) {
            biometricRemove(name);
            biometricResult(token, null);
        } catch (Exception error) {
            biometricResult(token, null);
        }
    }

    // ScannerActivity ships only in apps that ask for "scanner", so it is looked up by name.
    public boolean scannerAvailable() {
        try {
            Class.forName(SCANNER_CLASS);

            return getPackageManager().hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY);
        } catch (ClassNotFoundException error) {
            return false;
        }
    }

    public void scanCode(String token, String title, String cancel) {
        runOnUiThread(() -> {
            try {
                Intent intent = new Intent(this, Class.forName(SCANNER_CLASS));

                intent.putExtra("title", title);
                intent.putExtra("cancel", cancel);

                // A second scan request ends the first one as cancelled.
                if (scanToken != null)
                    queryResult(scanToken, null);

                scanToken = token;
                startActivityForResult(intent, SCAN_REQUEST);
            } catch (Exception error) {
                queryResult(token, null);
            }
        });
    }

    public void showMessageDialog(String token, String title, String text) {
        runOnUiThread(() -> new AlertDialog.Builder(this)
                .setTitle(title)
                .setMessage(text)
                .setPositiveButton(android.R.string.ok, (dialog, which) -> messageResult(token, true))
                .setNegativeButton(android.R.string.cancel, (dialog, which) -> messageResult(token, false))
                .setOnCancelListener((dialog) -> messageResult(token, false))
                .show());
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
        if (requestCode == SCAN_REQUEST) {
            String token = scanToken;
            String value = resultCode == RESULT_OK && data != null ? data.getStringExtra("value") : null;

            scanToken = null;

            if (token != null)
                queryResult(token, value);

            super.onActivityResult(requestCode, resultCode, data);
            return;
        }

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

    public void exportFile(String path, String name, long modifiedAT) {
        new Thread(() -> {
            boolean ok = false;

            try {
                String mime = mimeType(name);

                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues values = new ContentValues();

                    values.put(MediaStore.Downloads.DISPLAY_NAME, name);
                    values.put(MediaStore.Downloads.MIME_TYPE, mime);
                    values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);

                    // MediaStore stamps the write time on the file, so the entry stays pending
                    // until the original time is set on the file itself.
                    values.put(MediaStore.MediaColumns.IS_PENDING, 1);

                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);

                    if (uri != null) {
                        try (InputStream input = new FileInputStream(path);
                             OutputStream output = getContentResolver().openOutputStream(uri)) {
                            if (output != null) {
                                copy(input, output);
                                ok = true;
                            }
                        }

                        if (modifiedAT > 0) keepModified(uri, modifiedAT);

                        ContentValues done = new ContentValues();

                        done.put(MediaStore.MediaColumns.IS_PENDING, 0);
                        getContentResolver().update(uri, done, null, null);
                    }
                } else {
                    File directory = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);

                    directory.mkdirs();

                    File target = new File(directory, name);

                    try (InputStream input = new FileInputStream(path);
                         OutputStream output = new FileOutputStream(target)) {
                        copy(input, output);
                        ok = true;

                        if (modifiedAT > 0) target.setLastModified(modifiedAT);
                    }
                }
            } catch (Exception ignored) {
            }

            fileExported(ok);
        }).start();
    }

    private void keepModified(Uri uri, long modifiedAT) {
        try (Cursor cursor = getContentResolver().query(uri, new String[] { MediaStore.MediaColumns.DATA }, null, null, null)) {
            if (cursor == null || !cursor.moveToFirst()) return;

            String file = cursor.getString(0);

            if (file != null) new File(file).setLastModified(modifiedAT);
        } catch (Exception ignored) {
            // Without a file path the download keeps the time it was written.
        }

        ContentValues values = new ContentValues();

        values.put(MediaStore.MediaColumns.DATE_MODIFIED, modifiedAT / 1000);

        try {
            getContentResolver().update(uri, values, null, null);
        } catch (Exception ignored) {
            // Some providers refuse DATE_MODIFIED; the file time set above still holds.
        }
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
