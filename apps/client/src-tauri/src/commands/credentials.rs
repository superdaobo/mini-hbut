use crate::credential_store;

#[tauri::command]
pub fn save_remembered_credential(account_key: String, password: String) -> Result<(), String> {
    credential_store::save_remembered_credential(&account_key, &password)
}

#[tauri::command]
pub fn load_remembered_credential(account_key: String) -> Result<Option<String>, String> {
    Ok(credential_store::load_remembered_credential(&account_key))
}

#[tauri::command]
pub fn delete_remembered_credential(account_key: String) -> Result<(), String> {
    credential_store::delete_remembered_credential(&account_key);
    if let Some(student_id) = account_key.strip_prefix("hbut:") {
        credential_store::delete_password(student_id);
        credential_store::delete_secret_key(student_id);
    }
    Ok(())
}

#[tauri::command]
pub fn load_session_password(student_id: String) -> Result<Option<String>, String> {
    Ok(credential_store::load_session_password(&student_id))
}
