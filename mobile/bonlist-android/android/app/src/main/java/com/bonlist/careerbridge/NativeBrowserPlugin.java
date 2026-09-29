package com.bonlist.careerbridge;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeBrowser")
public class NativeBrowserPlugin extends Plugin {
  @PluginMethod
  public void open(PluginCall call) {
    String url = call.getString("url");
    if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
      call.reject("A valid HTTP(S) URL is required.");
      return;
    }

    getActivity().runOnUiThread(() -> {
      try {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        getActivity().startActivity(intent);
        call.resolve();
      } catch (ActivityNotFoundException error) {
        call.reject("No system browser is available.", error);
      } catch (Exception error) {
        call.reject("Could not open the system browser.", error);
      }
    });
  }
}
