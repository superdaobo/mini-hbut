import sqlite3, os

db = os.path.join(os.environ['APPDATA'], 'com.hbut.mini', 'grades.db')
conn = sqlite3.connect(db)
cur = conn.cursor()

# List all tables
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cur.fetchall()]
print("Tables:", tables)

# Check cache entries
if 'app_cache' in tables:
    cur.execute("SELECT cache_type, cache_key, length(cache_value), sync_time FROM app_cache ORDER BY sync_time DESC LIMIT 10")
    for row in cur.fetchall():
        print(f"  cache: type={row[0]}, key={row[1]}, val_len={row[2]}, sync={row[3]}")

# Check platform state
if 'online_learning_platform_state' in tables:
    cur.execute("SELECT count(*) FROM online_learning_platform_state")
    print(f"  platform_state rows: {cur.fetchone()[0]}")

conn.close()
