package com.hbut.mini;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.transistorsoft.tsbackgroundfetch.BGTask;
import com.transistorsoft.tsbackgroundfetch.BackgroundFetch;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.text.SimpleDateFormat;

public class BackgroundFetchHeadlessTask {
    private static final String TAG = "HBUTHeadlessFetch";
    private static final String PREFS_NAME = "CapacitorStorage";
    private static final String DEFAULT_API_BASE = "https://hbut.6661111.xyz/api";
    private static final String CHANNEL_ID = "hbut-default";
    private static final double POWER_ALERT_THRESHOLD = 10.0;

    private static final String KEY_STUDENT_ID = "hbu_bg_student_id";
    private static final String KEY_API_BASE = "hbu_bg_api_base";
    private static final String KEY_ENABLE_GRADE = "hbu_bg_enable_grade";
    private static final String KEY_ENABLE_EXAM = "hbu_bg_enable_exam";
    private static final String KEY_ENABLE_POWER = "hbu_bg_enable_power";
    private static final String KEY_ENABLE_CLASS = "hbu_bg_enable_class";
    private static final String KEY_CLASS_LEAD_MINUTES = "hbu_bg_class_lead_min";
    private static final String KEY_DORM_SELECTION = "hbu_bg_dorm_selection";

    private static final String KEY_GRADE_SIGNATURE = "hbu_bg_headless_grade_signature";
    private static final String KEY_EXAM_DAY = "hbu_bg_headless_exam_day";
    private static final String KEY_EXAM_SIGNATURE = "hbu_bg_headless_exam_signature";
    private static final String KEY_POWER_WAS_LOW = "hbu_bg_headless_power_low";
    private static final String KEY_CLASS_DAY = "hbu_bg_headless_class_day";
    private static final String KEY_CLASS_SENT_IDS = "hbu_bg_headless_class_sent_ids";

    private static final int[] PERIOD_START_MINUTES = {
            0,      // 0 unused
            8 * 60 + 20,  // 1
            9 * 60 + 10,  // 2
            10 * 60 + 15, // 3
            11 * 60 + 5,  // 4
            14 * 60,      // 5
            14 * 60 + 50, // 6
            15 * 60 + 55, // 7
            16 * 60 + 45, // 8
            18 * 60 + 30, // 9
            19 * 60 + 20, // 10
            20 * 60 + 10  // 11
    };

    public void onFetch(Context context, BGTask task) {
        BackgroundFetch backgroundFetch = BackgroundFetch.getInstance(context);
        String taskId = task.getTaskId();
        boolean isTimeout = task.getTimedOut();
        if (isTimeout) {
            backgroundFetch.finish(taskId);
            return;
        }

        try {
            runChecks(context);
        } catch (Exception e) {
            Log.e(TAG, "Headless fetch failed", e);
        } finally {
            backgroundFetch.finish(taskId);
        }
    }

    private void runChecks(Context context) throws Exception {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String studentId = safe(prefs.getString(KEY_STUDENT_ID, ""));
        if (studentId.isEmpty()) return;

        String apiBase = safe(prefs.getString(KEY_API_BASE, DEFAULT_API_BASE));
        if (apiBase.isEmpty()) apiBase = DEFAULT_API_BASE;
        if (apiBase.endsWith("/")) apiBase = apiBase.substring(0, apiBase.length() - 1);

        boolean enableGrade = "1".equals(safe(prefs.getString(KEY_ENABLE_GRADE, "1")));
        boolean enableExam = "1".equals(safe(prefs.getString(KEY_ENABLE_EXAM, "1")));
        boolean enablePower = "1".equals(safe(prefs.getString(KEY_ENABLE_POWER, "1")));
        boolean enableClass = "1".equals(safe(prefs.getString(KEY_ENABLE_CLASS, "1")));

        if (enableGrade) {
            checkGrade(context, prefs, apiBase, studentId);
        }
        if (enableExam) {
            checkExam(context, prefs, apiBase, studentId);
        }
        if (enablePower) {
            checkPower(context, prefs, apiBase, studentId);
        }
        if (enableClass) {
            checkClassReminder(context, prefs, apiBase, studentId);
        }
    }

    private void checkGrade(Context context, SharedPreferences prefs, String apiBase, String studentId) {
        try {
            JSONObject payload = new JSONObject();
            payload.put("student_id", studentId);
            JSONObject resp = postJson(apiBase + "/v2/quick_fetch", payload);
            if (!resp.optBoolean("success", false)) return;

            JSONArray grades = resp.optJSONArray("data");
            String signature = buildGradeSignature(grades);
            String prev = safe(prefs.getString(KEY_GRADE_SIGNATURE, ""));

            if (!prev.isEmpty() && !prev.equals(signature)) {
                sendNotification(context, "成绩有更新", "检测到成绩变化，请打开 Mini-HBUT 查看详情。");
            }
            prefs.edit().putString(KEY_GRADE_SIGNATURE, signature).apply();
        } catch (Exception e) {
            Log.w(TAG, "checkGrade failed: " + e.getMessage());
        }
    }

    private void checkExam(Context context, SharedPreferences prefs, String apiBase, String studentId) {
        try {
            JSONObject payload = new JSONObject();
            payload.put("student_id", studentId);
            payload.put("semester", "");
            JSONObject resp = postJson(apiBase + "/v2/exams", payload);
            if (!resp.optBoolean("success", false)) return;

            JSONArray exams = resp.optJSONArray("data");
            if (exams == null) exams = new JSONArray();
            String tomorrow = getTomorrowKey();

            List<String> tomorrowRows = new ArrayList<>();
            for (int i = 0; i < exams.length(); i++) {
                JSONObject item = exams.optJSONObject(i);
                if (item == null) continue;
                String examDate = safe(item.optString("exam_date", item.optString("date", "")));
                if (!tomorrow.equals(examDate)) continue;
                String course = safe(item.optString("course_name", ""));
                String examTime = safe(item.optString("exam_time", item.optString("start_time", "")));
                String location = safe(item.optString("location", ""));
                tomorrowRows.add(course + "|" + examDate + "|" + examTime + "|" + location);
            }

            Collections.sort(tomorrowRows);
            String signature = tomorrowRows.size() + ":" + Integer.toHexString(tomorrowRows.toString().hashCode());
            String prevDay = safe(prefs.getString(KEY_EXAM_DAY, ""));
            String prevSig = safe(prefs.getString(KEY_EXAM_SIGNATURE, ""));

            if (!tomorrowRows.isEmpty() && (!tomorrow.equals(prevDay) || !signature.equals(prevSig))) {
                if (tomorrowRows.size() == 1) {
                    String courseName = tomorrowRows.get(0).split("\\|")[0];
                    sendNotification(context, "考试提醒", "明天有考试：" + courseName);
                } else {
                    sendNotification(context, "考试提醒", "明天共有 " + tomorrowRows.size() + " 门考试，请提前准备。");
                }
            }

            prefs.edit()
                    .putString(KEY_EXAM_DAY, tomorrow)
                    .putString(KEY_EXAM_SIGNATURE, signature)
                    .apply();
        } catch (Exception e) {
            Log.w(TAG, "checkExam failed: " + e.getMessage());
        }
    }

    private void checkPower(Context context, SharedPreferences prefs, String apiBase, String studentId) {
        try {
            String rawSelection = safe(prefs.getString(KEY_DORM_SELECTION, "[]"));
            JSONArray room = new JSONArray(rawSelection);
            if (room.length() != 4) return;

            JSONObject payload = new JSONObject();
            payload.put("area_id", safe(room.optString(0)));
            payload.put("building_id", safe(room.optString(1)));
            payload.put("layer_id", safe(room.optString(2)));
            payload.put("room_id", safe(room.optString(3)));
            payload.put("student_id", studentId);

            JSONObject resp = postJson(apiBase + "/v2/electricity/balance", payload);
            if (!resp.optBoolean("success", false)) return;

            double quantity = parseDouble(resp.optString("quantity", ""));
            boolean isLow = quantity >= 0 && quantity < POWER_ALERT_THRESHOLD;
            boolean wasLow = prefs.getBoolean(KEY_POWER_WAS_LOW, false);

            if (isLow && !wasLow) {
                String quantityText = quantity >= 0 ? String.format("%.2f", quantity) : safe(resp.optString("quantity", "--"));
                sendNotification(context, "电费不足提醒", "当前剩余电量 " + quantityText + " 度，已低于 10 度。");
            }
            prefs.edit().putBoolean(KEY_POWER_WAS_LOW, isLow).apply();
        } catch (Exception e) {
            Log.w(TAG, "checkPower failed: " + e.getMessage());
        }
    }

    private void checkClassReminder(Context context, SharedPreferences prefs, String apiBase, String studentId) {
        try {
            int leadMinutes = parseIntSafe(prefs.getString(KEY_CLASS_LEAD_MINUTES, "30"), 30);
            if (leadMinutes < 5) leadMinutes = 5;
            if (leadMinutes > 120) leadMinutes = 120;

            JSONObject payload = new JSONObject();
            payload.put("student_id", studentId);
            JSONObject resp = postJson(apiBase + "/v2/schedule/query", payload);
            if (!resp.optBoolean("success", false)) return;

            JSONArray courses = resp.optJSONArray("data");
            if (courses == null || courses.length() == 0) return;

            JSONObject meta = resp.optJSONObject("meta");
            int currentWeek = parseIntSafe(meta == null ? "" : meta.optString("current_week", "1"), 1);
            int weekday = getTodayWeekday();
            double nowMinute = getCurrentMinutePrecise();
            String todayKey = getTodayKey();

            String stateDay = safe(prefs.getString(KEY_CLASS_DAY, ""));
            String stateSent = safe(prefs.getString(KEY_CLASS_SENT_IDS, ""));
            List<String> sentIds = new ArrayList<>();
            if (todayKey.equals(stateDay) && !stateSent.isEmpty()) {
                try {
                    JSONArray arr = new JSONArray(stateSent);
                    for (int i = 0; i < arr.length(); i++) {
                        String id = safe(arr.optString(i));
                        if (!id.isEmpty()) sentIds.add(id);
                    }
                } catch (Exception ignored) {
                    // ignore parse error
                }
            }

            int triggered = 0;
            for (int i = 0; i < courses.length(); i++) {
                JSONObject course = courses.optJSONObject(i);
                if (course == null) continue;

                int courseWeekday = parseIntSafe(course.opt("weekday"), 0);
                if (courseWeekday != weekday) continue;
                if (!isCourseInWeek(course.optJSONArray("weeks"), currentWeek)) continue;

                int period = parseIntSafe(course.opt("period"), 0);
                if (period <= 0 || period >= PERIOD_START_MINUTES.length) continue;
                int startMinute = PERIOD_START_MINUTES[period];
                double minsUntil = startMinute - nowMinute;
                if (minsUntil < 0 || minsUntil > leadMinutes) continue;

                String name = safe(course.optString("name", ""));
                if (name.isEmpty()) continue;
                String room = safe(course.optString("room_code", course.optString("room", "待定教室")));
                String teacher = safe(course.optString("teacher", ""));
                String id = safe(course.optString("id", "")) + "|" + name + "|" + courseWeekday + "|" + period + "|" + room;

                if (sentIds.contains(id)) continue;

                int mins = (int) Math.max(0, Math.floor(minsUntil));
                String leadText = mins > 0 ? (mins + " 分钟后") : "即将";
                String body = leadText + "开始：" + name + "（" + toClock(startMinute) + "，" + room + "）";
                if (!teacher.isEmpty()) {
                    body = body + "，授课教师 " + teacher;
                }
                sendNotification(context, "上课提醒", body);
                sentIds.add(id);
                triggered += 1;
            }

            JSONArray sentArray = new JSONArray();
            int start = Math.max(0, sentIds.size() - 120);
            for (int i = start; i < sentIds.size(); i++) {
                sentArray.put(sentIds.get(i));
            }
            prefs.edit()
                    .putString(KEY_CLASS_DAY, todayKey)
                    .putString(KEY_CLASS_SENT_IDS, sentArray.toString())
                    .apply();
            Log.i(TAG, "checkClassReminder complete, triggered=" + triggered + ", lead=" + leadMinutes);
        } catch (Exception e) {
            Log.w(TAG, "checkClassReminder failed: " + e.getMessage());
        }
    }

    private String buildGradeSignature(JSONArray grades) {
        if (grades == null) return "0:0";
        List<String> rows = new ArrayList<>();
        for (int i = 0; i < grades.length(); i++) {
            JSONObject item = grades.optJSONObject(i);
            if (item == null) continue;
            String term = safe(item.optString("term", ""));
            String name = safe(item.optString("course_name", ""));
            String score = safe(item.optString("final_score", ""));
            String credit = safe(item.optString("course_credit", ""));
            rows.add(term + "|" + name + "|" + score + "|" + credit);
        }
        Collections.sort(rows);
        return rows.size() + ":" + Integer.toHexString(rows.toString().hashCode());
    }

    private JSONObject postJson(String url, JSONObject payload) throws Exception {
        HttpURLConnection conn = null;
        try {
            URL endpoint = new URL(url);
            conn = (HttpURLConnection) endpoint.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(15000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            conn.setRequestProperty("Accept", "application/json");

            byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = conn.getOutputStream()) {
                out.write(body);
            }

            int status = conn.getResponseCode();
            InputStream stream = status >= 200 && status < 300 ? conn.getInputStream() : conn.getErrorStream();
            String text = readText(stream);
            if (text.isEmpty()) return new JSONObject();
            return new JSONObject(text);
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private String readText(InputStream stream) throws Exception {
        if (stream == null) return "";
        StringBuilder sb = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
        }
        return sb.toString();
    }

    private void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Mini-HBUT 通知",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("后台检查与提醒通知");
        manager.createNotificationChannel(channel);
    }

    private void sendNotification(Context context, String title, String body) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                return;
            }
        }

        ensureChannel(context);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true);

        NotificationManagerCompat manager = NotificationManagerCompat.from(context);
        manager.notify((int) (System.currentTimeMillis() / 1000), builder.build());
    }

    private String safe(String value) {
        return value == null ? "" : value.trim();
    }

    private int parseIntSafe(Object value, int fallback) {
        if (value == null) return fallback;
        try {
            return Integer.parseInt(String.valueOf(value).trim());
        } catch (Exception e) {
            return fallback;
        }
    }

    private boolean isCourseInWeek(JSONArray weeks, int currentWeek) {
        if (weeks == null || weeks.length() == 0) return true;
        for (int i = 0; i < weeks.length(); i++) {
            int week = parseIntSafe(weeks.opt(i), 0);
            if (week == currentWeek) return true;
        }
        return false;
    }

    private int getTodayWeekday() {
        int raw = Calendar.getInstance().get(Calendar.DAY_OF_WEEK);
        return raw == Calendar.SUNDAY ? 7 : raw - 1;
    }

    private String getTodayKey() {
        Calendar calendar = Calendar.getInstance();
        calendar.set(Calendar.HOUR_OF_DAY, 0);
        calendar.set(Calendar.MINUTE, 0);
        calendar.set(Calendar.SECOND, 0);
        calendar.set(Calendar.MILLISECOND, 0);
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(calendar.getTime());
    }

    private double getCurrentMinutePrecise() {
        Calendar now = Calendar.getInstance();
        return now.get(Calendar.HOUR_OF_DAY) * 60
                + now.get(Calendar.MINUTE)
                + now.get(Calendar.SECOND) / 60.0;
    }

    private String toClock(int minute) {
        int h = minute / 60;
        int m = minute % 60;
        return String.format(Locale.US, "%02d:%02d", h, m);
    }

    private double parseDouble(String value) {
        try {
            return Double.parseDouble(value);
        } catch (Exception e) {
            return -1;
        }
    }

    private String getTomorrowKey() {
        Calendar calendar = Calendar.getInstance();
        calendar.set(Calendar.HOUR_OF_DAY, 0);
        calendar.set(Calendar.MINUTE, 0);
        calendar.set(Calendar.SECOND, 0);
        calendar.set(Calendar.MILLISECOND, 0);
        calendar.add(Calendar.DAY_OF_MONTH, 1);
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(calendar.getTime());
    }
}
