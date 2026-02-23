import os
import re

file_path = os.path.join(os.path.dirname(__file__), 'src-tauri', 'src', 'http_client.rs')
print(f"Reading file: {file_path}")

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

print(f"File size: {len(content)}")
print(f"Contains PLACEHOLDER: {'PLACEHOLDER_COMMENT_1' in content}")

# Define the old and new code blocks
old_block = '''        // PLACEHOLDER_COMMENT_1
        // PLACEHOLDER_COMMENT_2


        // PLACEHOLDER_COMMENT_3
        println!("[DEBUG] relogin_for_code_service: Logging into Portal...");
        let portal_service = "https://e.hbut.edu.cn/login";
        let _ = self.login_for_service(&username, &password, portal_service).await?;

        println!("[DEBUG] relogin_for_code_service: Logging into Code Service...");
        let service_url = "https://code.hbut.edu.cn/server/auth/host/open?host=28&org=2";
        let _ = self.login_for_service(&username, &password, service_url).await?;'''

new_block = '''        if username.is_empty() || password.is_empty() {
            println!("[WARN] relogin_for_code_service: No cached credentials available");
            return Ok(false);
        }

        let portal_service = "https://e.hbut.edu.cn/login";
        let portal_sso_url = format!("{}/login?service={}", AUTH_BASE_URL, portal_service);
        
        println!("[DEBUG] relogin_for_code_service: Checking if CAS session is still valid...");
        let check_resp = self.client.get(&portal_sso_url).send().await?;
        let check_url = check_resp.url().to_string();
        
        let needs_login = check_url.contains("authserver/login") && !check_url.contains("ticket=");
        
        if needs_login {
            println!("[DEBUG] relogin_for_code_service: CAS session expired, need to login...");
            let _ = self.login_for_service(&username, &password, portal_service).await?;
        } else {
            println!("[DEBUG] relogin_for_code_service: CAS session still valid, skipping portal login");
        }

        println!("[DEBUG] relogin_for_code_service: Establishing code.hbut.edu.cn session...");
        let code_sso_url = "https://code.hbut.edu.cn/server/auth/host/open?host=28&org=2";
        let _ = self.client.get(code_sso_url).send().await;'''

if old_block in content:
    content = content.replace(old_block, new_block)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('Replacement successful!')
else:
    print('Old block not found in file')
    # Debug
    if 'PLACEHOLDER_COMMENT_1' in content:
        idx = content.find('PLACEHOLDER_COMMENT_1')
        print(f'Found PLACEHOLDER at index: {idx}')
        print('Context:')
        print(repr(content[idx-50:idx+200]))
