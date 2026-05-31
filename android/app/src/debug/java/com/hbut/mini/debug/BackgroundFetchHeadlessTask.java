package com.hbut.mini.debug;

import android.content.Context;

import com.transistorsoft.tsbackgroundfetch.BGTask;

public class BackgroundFetchHeadlessTask {
    private final com.hbut.mini.BackgroundFetchHeadlessTask delegate =
            new com.hbut.mini.BackgroundFetchHeadlessTask();

    public void onFetch(Context context, BGTask task) {
        delegate.onFetch(context, task);
    }
}
