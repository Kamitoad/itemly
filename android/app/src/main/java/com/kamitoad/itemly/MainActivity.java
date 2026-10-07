package com.kamitoad.itemly;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackupDocumentsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
