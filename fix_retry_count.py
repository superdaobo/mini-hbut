import os

file_path = os.path.join(os.path.dirname(__file__), 'src-tauri', 'src', 'http_client.rs')
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 1: Change retry count from 4 to 1
content = content.replace('for attempt in 0..4 {', 'for attempt in 0..1 {')

# Fix 2: Remove captcha retry logic (since we only try once)
old_block = '''            if html.contains("验证码错误") || html.contains("验证码无效") {
                println!("[DEBUG] Captcha error on attempt {}, will retry...", attempt);
                if attempt < 3 {
                    continue;
                }
                return Err("验证码错误，请重试".into());
            }'''

new_block = '''            if html.contains("验证码错误") || html.contains("验证码无效") {
                return Err("验证码错误，请重新登录".into());
            }'''

content = content.replace(old_block, new_block)

# Fix 3: Remove retry check for auth page
old_block2 = '''            if is_on_auth_page {
                if attempt < 3 {
                    println!("[DEBUG] Still on auth page after attempt {}, retrying...", attempt);
                    continue;
                }
                return Err("登录失败，请检查账号密码或验证码".into());
            }'''

new_block2 = '''            if is_on_auth_page {
                return Err("登录失败，请检查账号密码或验证码".into());
            }'''

content = content.replace(old_block2, new_block2)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Done - retry count set to 1')
