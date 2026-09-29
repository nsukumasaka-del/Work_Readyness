package com.bonlist.careerbridge;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(ApkInstallerPlugin.class);
    registerPlugin(NativeBrowserPlugin.class);
    super.onCreate(savedInstanceState);
    // Draw edge-to-edge; the web UI applies CSS safe-area insets to its controls.
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
  }
}
