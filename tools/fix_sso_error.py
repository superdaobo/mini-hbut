import os

file_path = os.path.join(os.path.dirname(__file__), 'src-tauri', 'src', 'http_client.rs')
print(f"Reading file: {file_path}")

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

print(f"File size: {len(content)}")

# Fix: When relogin fails, return error instead of continuing with empty tid/ticket
old_block = '''            if needs_login && attempt == 0 {
                println!("[DEBUG] Electricity SSO requires login, re-login and retrying...");
                match self.relogin_for_code_service().await {
                    Ok(true) => {
                        println!("[DEBUG] Relogin successful, retrying SSO...");
                        continue;
                    },
                    Ok(false) => {
                        println!("[WARN] Relogin returned false (no credentials?)");
                    },
                    Err(e) => {
                        println!("[WARN] Relogin failed: {}, attempting to continue...", e);
                    }
                }
            }

            break;'''

new_block = '''            if needs_login && attempt == 0 {
                println!("[DEBUG] Electricity SSO requires login, re-login and retrying...");
                match self.relogin_for_code_service().await {
                    Ok(true) => {
                        println!("[DEBUG] Relogin successful, retrying SSO...");
                        continue;
                    },
                    Ok(false) => {
                        println!("[WARN] Relogin returned false (no credentials available)");
                        return Err("无法获取电费授权：未找到登录凭据，请重新登录后再试".into());
                    },
                    Err(e) => {
                        println!("[WARN] Relogin failed: {}", e);
                        return Err(format!("无法获取电费授权：登录失败 - {}", e).into());
                    }
                }
            }

            break;'''

if old_block in content:
    content = content.replace(old_block, new_block)
    print('Fix applied: Improved error handling in get_electricity_token')
else:
    print('Pattern not found')
    # Debug
    if 'needs_login && attempt == 0' in content:
        idx = content.find('needs_login && attempt == 0')
        print('Found at:', idx)
        print('Context:')
        print(content[idx:idx+800])

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Done!')
