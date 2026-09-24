package com.bonlist.careerbridge;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(ApkInstallerPlugin.class);
    super.onCreate(savedInstanceState);
    // Keep WebView content below the status / navigation bars on all screen sizes.
    WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
  }
}
