package com.bonlist.careerbridge;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;

@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {
  private static final String APK_MIME = "application/vnd.android.package-archive";
  private static final long DOWNLOAD_TIMEOUT_MS = 8 * 60 * 1000L;
  private final Handler handler = new Handler(Looper.getMainLooper());
  private BroadcastReceiver downloadReceiver;
  private Runnable downloadPoll;
  private long activeDownloadId = -1L;

  @PluginMethod
  public void installApk(PluginCall call) {
    try {
      Uri apkUri = Uri.parse(call.getString("url", ""));
      if (!"https".equalsIgnoreCase(apkUri.getScheme()) || apkUri.getHost() == null) {
        call.reject("The APK download URL must use HTTPS.");
        return;
      }

      Context context = getContext();
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
          && !context.getPackageManager().canRequestPackageInstalls()) {
        Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:" + context.getPackageName()));
        settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(settings);
        call.resolve(new JSObject().put("started", false).put("permissionRequired", true));
        return;
      }

      if (activeDownloadId != -1L) {
        call.resolve(new JSObject().put("started", true).put("downloadId", activeDownloadId));
        return;
      }

      DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
      File directory = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
      if (manager == null || directory == null || (!directory.exists() && !directory.mkdirs())) {
        call.reject("Android could not prepare the APK download location.");
        return;
      }

      File apkFile = new File(directory, "BonList-update.apk");
      if (apkFile.exists() && !apkFile.delete()) {
        call.reject("Android could not replace the previous APK download.");
        return;
      }

      DownloadManager.Request request = new DownloadManager.Request(apkUri)
          .setTitle("BonList update")
          .setDescription("Downloading the latest BonList Android release")
          .setMimeType(APK_MIME)
          .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
          .setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, apkFile.getName());
      long downloadId = manager.enqueue(request);
      activeDownloadId = downloadId;
      long startedAt = System.currentTimeMillis();

      downloadReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context receiverContext, Intent intent) {
          if (DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())
              && intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L) == downloadId) {
            checkDownload(manager, downloadId, apkFile, startedAt);
          }
        }
      };
      try {
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          // DownloadManager sends this broadcast from outside this app.
          context.registerReceiver(downloadReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
          context.registerReceiver(downloadReceiver, filter);
        }
      } catch (Exception error) {
        manager.remove(downloadId);
        clearDownload(context);
        call.reject("Android could not monitor the APK download.", error);
        return;
      }

      downloadPoll = new Runnable() {
        @Override public void run() {
          if (activeDownloadId != downloadId) return;
          checkDownload(manager, downloadId, apkFile, startedAt);
          if (activeDownloadId == downloadId) handler.postDelayed(this, 1000L);
        }
      };
      handler.post(downloadPoll);
      call.resolve(new JSObject().put("started", true).put("downloadId", downloadId));
    } catch (Exception error) {
      call.reject("Could not start the BonList APK download: " + error.getMessage(), error);
    }
  }

  private void checkDownload(DownloadManager manager, long downloadId, File apkFile, long startedAt) {
    if (activeDownloadId != downloadId) return;
    int status;
    int reason;
    long received;
    long total;
    try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(downloadId))) {
      if (cursor == null || !cursor.moveToFirst()) {
        failDownload("Android lost the APK download request.");
        return;
      }
      status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
      reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
      received = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
      total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
    } catch (Exception error) {
      failDownload("Could not read APK download status: " + error.getMessage());
      return;
    }

    if (status == DownloadManager.STATUS_FAILED) {
      failDownload("APK download failed (Android reason " + reason + ").");
      return;
    }
    if (status == DownloadManager.STATUS_SUCCESSFUL) {
      openInstaller(downloadId, apkFile);
      return;
    }
    if (System.currentTimeMillis() - startedAt > DOWNLOAD_TIMEOUT_MS) {
      manager.remove(downloadId);
      failDownload("APK download timed out. Check your connection and try again.");
      return;
    }
    if (total > 0) {
      notifyListeners("apkDownloadProgress", new JSObject()
          .put("percent", Math.min(99, Math.round(received * 100.0 / total))));
    }
  }

  private void openInstaller(long downloadId, File apkFile) {
    Context context = getContext();
    try {
      if (!apkFile.isFile() || apkFile.length() < 1024) {
        throw new IllegalStateException("The downloaded APK is empty or incomplete.");
      }
      try (FileInputStream input = new FileInputStream(apkFile)) {
        if (input.read() != 'P' || input.read() != 'K') {
          throw new IllegalStateException("The download is not an APK file.");
        }
      }
      PackageInfo packageInfo = context.getPackageManager().getPackageArchiveInfo(apkFile.getAbsolutePath(), 0);
      if (packageInfo == null || !context.getPackageName().equals(packageInfo.packageName)) {
        throw new IllegalStateException("The downloaded APK is not a BonList update.");
      }

      Uri contentUri = FileProvider.getUriForFile(context,
          context.getPackageName() + ".fileprovider", apkFile);
      Intent installer = new Intent(Intent.ACTION_VIEW);
      installer.setDataAndType(contentUri, APK_MIME);
      installer.setClipData(ClipData.newRawUri("BonList update", contentUri));
      installer.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
      context.startActivity(installer);
      notifyListeners("apkDownloadComplete", new JSObject().put("started", true).put("downloadId", downloadId));
      clearDownload(context);
    } catch (Exception error) {
      failDownload("Android could not open the APK installer: " + error.getMessage());
    }
  }

  private void failDownload(String message) {
    notifyListeners("apkInstallError", new JSObject().put("message", message));
    clearDownload(getContext());
  }

  private void clearDownload(Context context) {
    activeDownloadId = -1L;
    if (downloadPoll != null) handler.removeCallbacks(downloadPoll);
    downloadPoll = null;
    if (downloadReceiver != null) {
      try { context.unregisterReceiver(downloadReceiver); }
      catch (IllegalArgumentException ignored) { }
      downloadReceiver = null;
    }
  }
}
