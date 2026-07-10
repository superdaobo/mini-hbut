# 校园地图 / 导览缓存策略

## 原则

- **全部本地存储**（localStorage / 应用缓存），不新增 CDN 依赖。
- 首次打开从网络拉取业务数据（buildings/config/spots），写入本地后二次打开优先读缓存。
- **版本后缀** bump 后旧键自动失效。

## Legacy（CampusMapView）

| 项 | 值 |
|----|-----|
| 键 | `static_resource:campus_map_bundle:v2`（见 `CAMPUS_MAP_CACHE_KEY`） |
| TTL | 30 天（`CAMPUS_MAP_CACHE_TTL_MS`） |
| 失效 | 修改 `CAMPUS_MAP_CACHE_VERSION` |
| 兜底 | `src/features/campus-map/fixtures/*` |

实现：`fetchCampusMapDataset`（`campus_map_repository.ts`）。

## 腾讯导览（CampusGuide）

| 项 | 值 |
|----|-----|
| spots | `campus_guide_spots_v2_{category}` |
| meta | `campus_guide_offline_meta_v2` |
| scenic | `campus_guide_scenic_cache_v1`（store） |
| 失效 | 修改 `offline-cache.ts` 前缀版本 |

## 调试

1. 清缓存：导览设置或 `clearCampusGuideOfflineCaches()`；legacy 删除 `cache:static_resource:campus_map_bundle:*`。
2. 强制刷新：`fetchCampusMapDataset({ forceRefresh: true })`。
3. Android API：勿用 `127.0.0.1`；配置 `VITE_CAMPUS_GUIDE_HTTPS_BASE` 或 `localStorage.campus_guide_https_base`。
