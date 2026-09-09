package stream.zkas.wallet;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;
import stream.zkas.wallet.security.SecureVaultPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SecureVaultPlugin.class);
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }
}
