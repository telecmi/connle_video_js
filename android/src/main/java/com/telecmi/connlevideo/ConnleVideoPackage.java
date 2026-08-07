package com.telecmi.connlevideo;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.Collections;
import java.util.List;

/** No JS-facing modules — this package exists so React Native autolinking
 *  includes the library (whose real work is the init ContentProvider). */
public class ConnleVideoPackage implements ReactPackage {
    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext ctx) {
        return Collections.emptyList();
    }

    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext ctx) {
        return Collections.emptyList();
    }
}
