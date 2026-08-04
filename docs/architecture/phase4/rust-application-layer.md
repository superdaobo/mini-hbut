# 阶段 4B：Rust Application Layer 与锁粒度治理

## 分层

- transport：Tauri command 与 localhost HTTP bridge，只做鉴权、参数解析和响应映射。
- application：承载会话摘要、Cookie 导出、考试、排名、学籍信息等用例。
- domain/infrastructure：HbutClient、GradeService、SQLite 与具体模块实现。

`ApplicationContext` 保存共享客户端句柄和数据库路径。只读网络用例通过 `client_snapshot` 在极短的读锁内克隆 HbutClient，随后释放 guard，再执行外部网络 await。客户端中的 reqwest Client 与 Cookie Jar 均为共享句柄，因此保留会话 Cookie 语义；只读用例不得修改快照中的登录标志。

## 已收敛用例

Tauri 与 HTTP 共用：

- SessionService：健康状态、Cookie 快照导出。
- AcademicReadService：考试安排、绩点排名、学籍信息，包含一致的缓存与离线回退。

登录、二维码、会改变会话状态的操作仍使用独占写锁，不能为了缩短锁而把状态更新丢在临时副本中。

## 并发守卫

`application::context` 包含并发回归测试，验证取得快照后写锁可在网络等待窗口内立即获得。后续新增只读网络用例必须优先进入 Application Layer，禁止在 transport 中持有 RwLock guard 跨 await。

## 回滚

该阶段不改变 HTTP/Tauri 协议和数据库格式。回滚时恢复对应 transport handler 并删除 application 模块即可。
