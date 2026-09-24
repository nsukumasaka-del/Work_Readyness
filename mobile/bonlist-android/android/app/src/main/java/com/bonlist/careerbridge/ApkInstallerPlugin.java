package com.bonlist.careerbridge;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {
  private static final String APK_MIME = "application/vnd.android.package-archive";
  private BroadcastReceiver downloadReceiver;

  @PluginMethod
  public void installApk(PluginCall call) {
    String url = call.getString("url", "");
    Uri apkUri = Uri.parse(url);
    if (!"https".equalsIgnoreCase(apkUri.getScheme()) || apkUri.getHost() == null) {
      call.reject("The APK download URL must use HTTPS.");
      return;
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
        && !getContext().getPackageManager().canRequestPackageInstalls()) {
      Intent settings = new Intent(
          Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
          Uri.parse("package:" + getContext().getPackageName()));
      settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(settings);
      JSObject result = new JSObject();
      result.put("started", false);
      result.put("permissionRequired", true);
      call.resolve(result);
      return;
    }

    DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
    if (manager == null) {
      call.reject("Android could not start the APK download.");
      return;
    }

    try {
      if (downloadReceiver != null) {
        try { getContext().unregisterReceiver(downloadReceiver); } catch (IllegalArgumentException ignored) { }
      }
      DownloadManager.Request request = new DownloadManager.Request(apkUri)
          .setTitle("BonList update")
          .setDescription("Downloading the latest BonList Android release")
          .setMimeType(APK_MIME)
          .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
          .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "BonList-update.apk");
      long downloadId = manager.enqueue(request);

      downloadReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
          if (!DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())
              || intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L) != downloadId) return;
          Uri downloaded = manager.getUriForDownloadedFile(downloadId);
          try { context.unregisterReceiver(this); } catch (IllegalArgumentException ignored) { }
          if (downloaded == null) {
            notifyListeners("apkInstallError", new JSObject().put("message", "APK download failed. Please try again."));
            return;
          }
          Intent installer = new Intent(Intent.ACTION_VIEW);
          installer.setDataAndType(downloaded, APK_MIME);
          installer.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
          try {
            context.startActivity(installer);
            notifyListeners("apkDownloadComplete", new JSObject().put("started", true));
          } catch (Exception error) {
            notifyListeners("apkInstallError", new JSObject().put("message", "Android could not open the package installer."));
          }
        }
      };
      IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        getContext().registerReceiver(downloadReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
      } else {
        getContext().registerReceiver(downloadReceiver, filter);
      }
      JSObject result = new JSObject();
      result.put("started", true);
      result.put("downloadId", downloadId);
      call.resolve(result);
    } catch (Exception error) {
      call.reject("Could not download the BonList APK.", error);
    }
  }
}
