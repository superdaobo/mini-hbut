import os

file_path = os.path.join(os.path.dirname(__file__), 'src-tauri', 'src', 'http_client.rs')
print(f"Reading file: {file_path}")

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

print(f"File size: {len(content)}")

old_block = '''        println!("[DEBUG] Token invalid or missing, forcing relogin...");

        // 过期时主动重新登录，确保 SSO 续期
        let relogin_result = self.relogin_for_code_service().await;
        if let Err(e) = relogin_result {
             println!("[DEBUG] Relogin failed: {}, attempting to continue...", e);
        }

        let token_result = self.get_electricity_token().await;
        let (token, _) = match token_result {
            Ok(res) => res,
            Err(err) => {
                println!("[DEBUG] Electricity token failed, trying relogin again: {}", err);
                let _ = self.relogin_for_code_service().await;
                self.get_electricity_token().await?
            }
        };'''

new_block = '''        println!("[DEBUG] Token invalid or missing, attempting SSO flow...");

        let token_result = self.get_electricity_token().await;
        let (token, _) = match token_result {
            Ok(res) => res,
            Err(err) => {
                let err_msg = err.to_string();
                println!("[DEBUG] Electricity token failed: {}", err_msg);
                
                if err_msg.contains("tid=") && err_msg.contains("ticket=") {
                    return Err(format!("无法获取电费授权，请重新登录后再试。{}", err_msg).into());
                }
                
                println!("[DEBUG] Trying to relogin and retry...");
                match self.relogin_for_code_service().await {
                    Ok(true) => {
                        self.get_electricity_token().await?
                    },
                    Ok(false) => {
                        return Err("无法获取电费授权：未找到登录凭据，请重新登录".into());
                    },
                    Err(e) => {
                        return Err(format!("无法获取电费授权：登录失败 - {}", e).into());
                    }
                }
            }
        };'''

if old_block in content:
    content = content.replace(old_block, new_block)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('Replacement successful!')
else:
    print('Old block not found in file')
    # Debug: show context
    if 'Token invalid or missing' in content:
        idx = content.find('Token invalid or missing')
        print(f'Found at index: {idx}')
        print('Context:')
        print(content[idx:idx+600])
