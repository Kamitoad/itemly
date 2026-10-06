package com.kamitoad.itemly;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** User-selected documents only; never requests broad storage permissions. */
@CapacitorPlugin(name = "BackupDocuments")
public class BackupDocumentsPlugin extends Plugin {
    private static final long MAX_BYTES = 100L * 1024 * 1024;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private boolean busy = false;

    private File cacheFile(String name) throws IOException {
        if (name == null || !name.matches("itemly-backup-[a-f0-9-]{36}\\.json")) throw new IOException("Invalid backup filename");
        File root = getContext().getCacheDir().getCanonicalFile();
        File file = new File(root, name).getCanonicalFile();
        if (!root.equals(file.getParentFile())) throw new IOException("Invalid backup path");
        return file;
    }

    private synchronized boolean reserve(PluginCall call) {
        if (busy) { call.reject("Eine Dateiauswahl ist bereits geöffnet."); return false; }
        busy = true;
        return true;
    }

    private synchronized void release() { busy = false; }

    @PluginMethod
    public void save(PluginCall call) {
        if (!reserve(call)) return;
        try {
            File file = cacheFile(call.getString("cacheName"));
            if (!file.isFile() || file.length() < 1 || file.length() > MAX_BYTES) throw new IOException("Invalid backup size");
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/json");
            intent.putExtra(Intent.EXTRA_TITLE, "itemly-backup-" + java.time.LocalDate.now() + ".json");
            startActivityForResult(call, intent, "saveResult");
        } catch (Exception error) {
            release();
            call.reject("Die Sicherung konnte nicht zum Speichern geöffnet werden.", error);
        }
    }

    @PluginMethod
    public void open(PluginCall call) {
        if (!reserve(call)) return;
        try {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
            startActivityForResult(call, intent, "openResult");
        } catch (Exception error) {
            release();
            call.reject("Die Dateiauswahl konnte nicht geöffnet werden.", error);
        }
    }

    private Uri selected(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK) {
            release();
            JSObject value = new JSObject(); value.put("cancelled", true); call.resolve(value);
            return null;
        }
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (uri == null || !"content".equals(uri.getScheme())) {
            release(); call.reject("Die gewählte Datei ist nicht verfügbar."); return null;
        }
        return uri;
    }

    // Stream outside the UI thread; enforce the limit even for unknown provider sizes.
    private byte[] copy(InputStream input, OutputStream output) throws Exception {
        if (input == null) throw new IOException("Document is unavailable");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[65536];
        long size = 0;
        int count;
        while ((count = input.read(buffer)) != -1) {
            size += count;
            if (size > MAX_BYTES) throw new IOException("Backup exceeds 100 MB");
            digest.update(buffer, 0, count);
            if (output != null) output.write(buffer, 0, count);
        }
        if (size == 0) throw new IOException("Empty backup");
        if (output != null) output.flush();
        return digest.digest();
    }

    @ActivityCallback
    private void saveResult(PluginCall call, ActivityResult result) {
        if (call == null) { release(); return; }
        Uri uri = selected(call, result);
        if (uri == null) return;
        io.execute(() -> {
            try {
                File source = cacheFile(call.getString("cacheName"));
                byte[] expected;
                try (InputStream input = new FileInputStream(source);
                     OutputStream output = getContext().getContentResolver().openOutputStream(uri, "w")) {
                    if (output == null) throw new IOException("Document is not writable");
                    expected = copy(input, output);
                }
                try (InputStream input = getContext().getContentResolver().openInputStream(uri)) {
                    if (!Arrays.equals(expected, copy(input, null))) throw new IOException("Export verification failed");
                }
                JSObject value = new JSObject(); value.put("cancelled", false); call.resolve(value);
            } catch (Exception error) {
                // ACTION_CREATE_DOCUMENT creates a new document, never overwrites one.
                try { DocumentsContract.deleteDocument(getContext().getContentResolver(), uri); } catch (Exception ignored) { }
                call.reject("Die Sicherung wurde nicht erfolgreich gespeichert. Bitte versuche es erneut (maximal 100 MB).", error);
            } finally { release(); }
        });
    }

    @ActivityCallback
    private void openResult(PluginCall call, ActivityResult result) {
        if (call == null) { release(); return; }
        Uri uri = selected(call, result);
        if (uri == null) return;
        io.execute(() -> {
            File target = null;
            try {
                String name = "itemly-backup-" + UUID.randomUUID() + ".json";
                target = cacheFile(name);
                try (InputStream input = getContext().getContentResolver().openInputStream(uri);
                     OutputStream output = new FileOutputStream(target)) {
                    copy(input, output);
                }
                JSObject value = new JSObject(); value.put("cancelled", false); value.put("cacheName", name); call.resolve(value);
            } catch (Exception error) {
                if (target != null) target.delete();
                call.reject("Die Sicherung konnte nicht gelesen werden. Wähle eine JSON-Datei mit maximal 100 MB.", error);
            } finally { release(); }
        });
    }

    @Override
    protected void handleOnDestroy() { io.shutdown(); }
}
