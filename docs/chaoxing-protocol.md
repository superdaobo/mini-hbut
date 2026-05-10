# Chaoxing Checkin Protocol Notes

## Scope

仅记录本仓库实际用到的签到协议流程；其他 course_helper 端点（雨课堂、作业、视频进度等）不在本文档范围。

## Endpoints

### mobilelearn.chaoxing.com/v2/apis/active/student/activelist

- upstream ref: course_helper @<commit-hash>/<dart-file>:<line>
- params: TODO
- response shape: TODO

### mobilelearn.chaoxing.com/newsign/preSign

- upstream ref: TODO
- params: TODO
- response shape: TODO

### mobilelearn.chaoxing.com/pptSign

- upstream ref: TODO
- params: TODO
- response shape: TODO

### mooc1-api.chaoxing.com/mycourse/backclazzdata

- upstream ref: TODO
- params: TODO
- response shape: TODO

### pan-yz.chaoxing.com/upload

- upstream ref: TODO
- params: TODO
- response shape: TODO

## Upstream Sync Log

| Date | course_helper commit | Diff summary | Reviewer |
|------|---------------------|--------------|----------|
| 2025-06-10 | HEAD | 初始移植：签到五类端点（preSign/pptSign/activelist/backclazzdata/upload） | Mini-HBUT Team |
