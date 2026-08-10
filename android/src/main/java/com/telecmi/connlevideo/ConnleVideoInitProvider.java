package com.telecmi.connlevideo;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.util.Log;

/**
 * Initializes LiveKit's Android audio device module before
 * Application.onCreate — the ContentProvider auto-init mechanism (same as
 * Firebase). Reflection keeps this library free of a compile-time dependency
 * on @livekit/react-native's classes; the method is @JvmStatic @JvmOverloads,
 * so setup(Context) exists. Idempotent-safe: an app that ALSO calls
 * LiveKitReactNative.setup(this) manually (e.g. one that already integrates
 * the voice stack) just re-runs the same initialization.
 */
public class ConnleVideoInitProvider extends ContentProvider {

    private static final String TAG = "ConnleVideoInit";

    @Override
    public boolean onCreate() {
        Context context = getContext();
        if (context == null) return false;
        try {
            Class<?> livekit = Class.forName("com.livekit.reactnative.LiveKitReactNative");
            livekit.getMethod("setup", Context.class)
                   .invoke(null, context.getApplicationContext());
            Log.i(TAG, "LiveKitReactNative.setup() done (SDK auto-init)");
        } catch (Throwable t) {
            // Never take the app down from an init provider.
            Log.w(TAG, "LiveKit auto-init failed: " + t);
        }
        try {
            // Purge orphaned incoming-call notifications (ongoing +
            // process-death mid-ring = stuck forever otherwise).
            Class<?> notif = Class.forName("io.wazo.callkeep.IncomingCallNotification");
            notif.getMethod("cancelAll", Context.class)
                 .invoke(null, context.getApplicationContext());
        } catch (Throwable ignored) { }
        return true;
    }

    @Override public Cursor query(Uri uri, String[] p, String s, String[] a, String o) { return null; }
    @Override public String getType(Uri uri) { return null; }
    @Override public Uri insert(Uri uri, ContentValues values) { return null; }
    @Override public int delete(Uri uri, String s, String[] a) { return 0; }
    @Override public int update(Uri uri, ContentValues v, String s, String[] a) { return 0; }
}
