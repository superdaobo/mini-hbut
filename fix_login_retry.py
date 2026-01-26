import os

file_path = os.path.join(os.path.dirname(__file__), 'src-tauri', 'src', 'http_client.rs')
print(f"Reading file: {file_path}")

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

print(f"File size: {len(content)}")

# Fix 1: Increase login retry attempts from 2 to 4
old_block1 = '''        for attempt in 0..2 {
            // 获取登录页面参数（execution 一次性）
            let page_info = self.get_login_page_with_service(service_url).await?;'''

new_block1 = '''        for attempt in 0..4 {
            // 获取登录页面参数（execution 一次性），增加重试次数以应对验证码识别错误
            let page_info = self.get_login_page_with_service(service_url).await?;'''

if old_block1 in content:
    content = content.replace(old_block1, new_block1)
    print('Fix 1: Increased login retry attempts')
else:
    print('Fix 1: Pattern not found')

# Fix 2: Update the retry logic to continue on captcha errors
old_block2 = '''            if html.contains("验证码错误") || html.contains("验证码无效") {
                return Err("验证码错误".into());
            }'''

new_block2 = '''            if html.contains("验证码错误") || html.contains("验证码无效") {
                println!("[DEBUG] Captcha error on attempt {}, will retry...", attempt);
                if attempt < 3 {
                    continue;
                }
                return Err("验证码错误，请重试".into());
            }'''

if old_block2 in content:
    content = content.replace(old_block2, new_block2)
    print('Fix 2: Added captcha retry logic')
else:
    print('Fix 2: Pattern not found')

# Fix 3: Update the final retry check
old_block3 = '''            if is_on_auth_page {
                if attempt == 0 {
                    continue;
                }
                return Err("登录失败，请检查账号密码或验证码".into());
            }'''

new_block3 = '''            if is_on_auth_page {
                if attempt < 3 {
                    println!("[DEBUG] Still on auth page after attempt {}, retrying...", attempt);
                    continue;
                }
                return Err("登录失败，请检查账号密码或验证码".into());
            }'''

if old_block3 in content:
    content = content.replace(old_block3, new_block3)
    print('Fix 3: Updated retry check')
else:
    print('Fix 3: Pattern not found')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('All fixes applied!')
