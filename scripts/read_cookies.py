import sqlite3
import os

db = os.path.join(os.environ['APPDATA'], 'com.hbut.mini', 'grades.db')
conn = sqlite3.connect(db)
cur = conn.cursor()
cur.execute('SELECT student_id, platform, connected, account_id, display_name, cookie_blob, sync_time FROM online_learning_platform_state')
for row in cur.fetchall():
    sid, platform, connected, aid, dname, cookie, stime = row
    print(f'--- {platform} ---')
    print(f'student_id={sid}, connected={connected}, account={aid}, name={dname}')
    blob = cookie or ''
    print(f'cookie_blob (first 300): {blob[:300]}')
    print(f'cookie_blob length: {len(blob)}')
    print(f'sync_time={stime}')
    print()
conn.close()
