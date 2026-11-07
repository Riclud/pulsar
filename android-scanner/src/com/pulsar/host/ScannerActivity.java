package com.pulsar.host;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.TextView;

import androidx.activity.ComponentActivity;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;

import com.google.common.util.concurrent.ListenableFuture;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.PlanarYUVLuminanceSource;
import com.google.zxing.ReaderException;
import com.google.zxing.Result;
import com.google.zxing.common.HybridBinarizer;
import com.google.zxing.qrcode.QRCodeReader;

import java.nio.ByteBuffer;
import java.util.Collections;
import java.util.EnumMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * A full-screen QR scanner: the camera preview with a frame, decoded on device by
 * ZXing. The camera permission is asked the normal way, so the user can allow it
 * only while the app is in use or only this time.
 */
public class ScannerActivity extends ComponentActivity {
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_CANCEL = "cancel";
    public static final String EXTRA_VALUE = "value";

    private static final int CAMERA_REQUEST = 0x5343;

    private final AtomicBoolean finished = new AtomicBoolean(false);
    private final QRCodeReader reader = new QRCodeReader();
    private final Map<DecodeHintType, Object> hints = new EnumMap<>(DecodeHintType.class);

    private ExecutorService analyzer;
    private PreviewView preview;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);

        hints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
        hints.put(DecodeHintType.POSSIBLE_FORMATS, Collections.singletonList(BarcodeFormat.QR_CODE));
        analyzer = Executors.newSingleThreadExecutor();

        setContentView(buildLayout());

        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            startCamera();
            return;
        }

        requestPermissions(new String[] { Manifest.permission.CAMERA }, CAMERA_REQUEST);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);

        if (requestCode != CAMERA_REQUEST)
            return;

        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            startCamera();
            return;
        }

        finishWith(null);
    }

    @Override
    protected void onDestroy() {
        analyzer.shutdown();
        super.onDestroy();
    }

    private int dp(float value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics()));
    }

    private View buildLayout() {
        FrameLayout root = new FrameLayout(this);

        root.setBackgroundColor(Color.BLACK);

        preview = new PreviewView(this);
        root.addView(preview, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(new FrameOverlay(this), new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        TextView title = new TextView(this);
        String text = getIntent().getStringExtra(EXTRA_TITLE);

        title.setText(text == null ? "" : text);
        title.setTextColor(Color.WHITE);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        title.setGravity(Gravity.CENTER);

        FrameLayout.LayoutParams titleParams = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP);

        titleParams.topMargin = dp(72);
        root.addView(title, titleParams);

        Button cancel = new Button(this);
        String label = getIntent().getStringExtra(EXTRA_CANCEL);

        cancel.setText(label == null ? "Cancel" : label);
        cancel.setOnClickListener((view) -> finishWith(null));

        FrameLayout.LayoutParams cancelParams = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);

        cancelParams.bottomMargin = dp(56);
        root.addView(cancel, cancelParams);

        return root;
    }

    private void startCamera() {
        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);

        future.addListener(() -> {
            try {
                ProcessCameraProvider provider = future.get();
                Preview stream = new Preview.Builder().build();
                ImageAnalysis analysis = new ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build();

                stream.setSurfaceProvider(preview.getSurfaceProvider());
                analysis.setAnalyzer(analyzer, this::analyze);
                provider.unbindAll();
                provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, stream, analysis);
            } catch (Exception error) {
                finishWith(null);
            }
        }, ContextCompat.getMainExecutor(this));
    }

    private void analyze(ImageProxy image) {
        try {
            ImageProxy.PlaneProxy plane = image.getPlanes()[0];
            ByteBuffer buffer = plane.getBuffer();
            int stride = plane.getRowStride();
            byte[] luminance = new byte[stride * image.getHeight()];

            buffer.get(luminance, 0, Math.min(buffer.remaining(), luminance.length));

            PlanarYUVLuminanceSource source = new PlanarYUVLuminanceSource(
                    luminance, stride, image.getHeight(), 0, 0, image.getWidth(), image.getHeight(), false);
            Result result = reader.decode(new BinaryBitmap(new HybridBinarizer(source)), hints);

            runOnUiThread(() -> finishWith(result.getText()));
        } catch (ReaderException error) {
            // Most frames hold no readable code yet; the next frame tries again.
        } finally {
            reader.reset();
            image.close();
        }
    }

    private void finishWith(String value) {
        if (!finished.compareAndSet(false, true))
            return;

        Intent data = new Intent();

        if (value != null)
            data.putExtra(EXTRA_VALUE, value);

        setResult(value == null ? RESULT_CANCELED : RESULT_OK, data);
        finish();
    }

    /** Dims the edges and outlines a square where the code should go. */
    private static class FrameOverlay extends View {
        private final Paint shade = new Paint();
        private final Paint border = new Paint(Paint.ANTI_ALIAS_FLAG);

        FrameOverlay(ScannerActivity activity) {
            super(activity);

            shade.setColor(Color.argb(140, 0, 0, 0));
            border.setColor(Color.WHITE);
            border.setStyle(Paint.Style.STROKE);
            border.setStrokeWidth(activity.dp(3));
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float side = Math.min(getWidth(), getHeight()) * 0.7f;
            float left = (getWidth() - side) / 2;
            float top = (getHeight() - side) / 2;

            canvas.drawRect(0, 0, getWidth(), top, shade);
            canvas.drawRect(0, top + side, getWidth(), getHeight(), shade);
            canvas.drawRect(0, top, left, top + side, shade);
            canvas.drawRect(left + side, top, getWidth(), top + side, shade);
            canvas.drawRoundRect(new RectF(left, top, left + side, top + side), 24, 24, border);
        }
    }
}
