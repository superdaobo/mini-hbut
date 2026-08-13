## Default Permission

Default permissions for the hbut-background plugin

#### This default permission set includes the following:

- `allow-bg-configure`
- `allow-bg-disable`
- `allow-bg-sync-context`
- `allow-bg-get-state`
- `allow-bg-run-now`
- `allow-bg-peek-events`
- `allow-bg-consume-events`
- `allow-bg-clear-context`

## Permission Table

<table>
<tr>
<th>Identifier</th>
<th>Description</th>
</tr>


<tr>
<td>

`hbut-background:allow-bg-clear-context`

</td>
<td>

Enables the bg_clear_context command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`hbut-background:deny-bg-clear-context`

</td>
<td>

Denies the bg_clear_context command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`hbut-background:allow-bg-configure`

</td>
<td>

Enables the bg_configure command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`hbut-background:deny-bg-configure`

</td>
<td>

Denies the bg_configure command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`hbut-background:allow-bg-consume-events`

</td>
<td>

Enables the bg_consume_events command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`hbut-background:deny-bg-consume-events`

</td>
<td>

Denies the bg_consume_events command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`hbut-background:allow-bg-disable`

</td>
<td>

Enables the bg_disable command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`hbut-background:deny-bg-disable`

</td>
<td>

Denies the bg_disable command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`hbut-background:allow-bg-get-state`

</td>
<td>

Enables the bg_get_state command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`hbut-background:deny-bg-get-state`

</td>
<td>

Denies the bg_get_state command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`hbut-background:allow-bg-peek-events`

</td>
<td>

Enables the bg_peek_events command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`hbut-background:deny-bg-peek-events`

</td>
<td>

Denies the bg_peek_events command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`hbut-background:allow-bg-run-now`

</td>
<td>

Enables the bg_run_now command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`hbut-background:deny-bg-run-now`

</td>
<td>

Denies the bg_run_now command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`hbut-background:allow-bg-sync-context`

</td>
<td>

Enables the bg_sync_context command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`hbut-background:deny-bg-sync-context`

</td>
<td>

Denies the bg_sync_context command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`hbut-background:allow-bg-configure`

</td>
<td>

Allows invoking the bg_configure command (保存用户后台配置并更新系统调度)

</td>
</tr>

<tr>
<td>

`hbut-background:allow-bg-disable`

</td>
<td>

Allows invoking the bg_disable command (关闭系统调度并保留诊断状态)

</td>
</tr>

<tr>
<td>

`hbut-background:allow-bg-sync-context`

</td>
<td>

Allows invoking the bg_sync_context command (更新非敏感后台执行上下文)

</td>
</tr>

<tr>
<td>

`hbut-background:allow-bg-get-state`

</td>
<td>

Allows invoking the bg_get_state command (读取统一 BackgroundCheckState)

</td>
</tr>

<tr>
<td>

`hbut-background:allow-bg-run-now`

</td>
<td>

Allows invoking the bg_run_now command (开发/调试一次性执行入口)

</td>
</tr>

<tr>
<td>

`hbut-background:allow-bg-peek-events`

</td>
<td>

Allows invoking the bg_peek_events command (只读 event inbox，#614 at-least-once 消费)

</td>
</tr>

<tr>
<td>

`hbut-background:allow-bg-consume-events`

</td>
<td>

Allows invoking the bg_consume_events command (按 id 精确 ack / limit FIFO 消费并清理 inbox)

</td>
</tr>

<tr>
<td>

`hbut-background:allow-bg-clear-context`

</td>
<td>

Allows invoking the bg_clear_context command (账号退出/切换时清理后台上下文)

</td>
</tr>
</table>
