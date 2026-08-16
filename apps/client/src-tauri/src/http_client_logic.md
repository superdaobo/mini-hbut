# http_client.rs Logic Documentation

## 1. Overview
This file (`http_client.rs`) is the core HTTP engine for the Tauri desktop application. It implements the `HbutClient` struct, which manages the entire lifecycle of network interactions with the university's servers (HBUT). It is designed to mirror the logic of the Python backend but optimized for a desktop environment using Rust's async ecosystem.

## 2. Key Components

### 2.1 Struct `HbutClient`
*   **State**: Holds a persistent `reqwest::Client` with a shared `CookieJar`.
*   **Session**: Manages `user_info` (student details) and `is_logged_in` flag.
*   **Caching**: Stores `electricity_token` and its timestamp to avoid frequent re-logins for the electricity service.
*   **Credentials**: Caches `last_username` and `last_password` in memory (optional) to support auto-relogin or token refreshing.

### 2.2 detailed Login Flow (CAS)
The `login` method implements the complex Central Authentication Service (CAS) flow:
1.  **Page Fetch**: Calls `get_login_page_with_service` to GET the login HTML.
2.  **Parameter Extraction**: Parses `execution`, `lt`, and most importantly, the AES `salt` (pwdEncryptSalt) from the DOM.
3.  **Encryption**: Uses `encrypt_password_aes` (AES-128-CBC) to encrypt the user's password using a random 64-byte prefix + IV, identical to the JavaScript frontend logic.
4.  **CAPTCHA**: If required, downloads the CAPTCHA image and sends it to a backend OCR service (or handles it locally if configured).
5.  **Submission**: POSTs the form data (username, encrypted password, params) to `/authserver/login`.
6.  **Validation**: Checks for success indicators (redirects to `ticket=` or `jwxt`) or specific error messages from the HTML (e.g., "Invalid Password").
7.  **SSO Handling**: If successful, visits the target service (e.g., JWXT) to establish session cookies.

### 2.3 Electricity Service Logic
The electricity system uses a separate authentication provider (Code/Fusion Portal).
*   **`get_electricity_token`**: Triggers an SSO flow starting from `e.hbut.edu.cn`.
*   **Redirect Tracing**: Manually follows 302 redirects to capture `tid` (Transaction ID) or `ticket` parameters from the URL.
*   **Token Exchange**: Calls an API provided by `code.hbut.edu.cn` to exchange the `tid` for a JWT `Authorization` token.
*   **API Proxying**: Authenticated requests (`query_electricity_location`, `query_electricity_account`) use this JWT.

### 2.4 Academic Data Fetching
*   **`fetch_grades`**: POSTs to the legacy JQGrid endpoint. Requires session cookies.
*   **`fetch_schedule`**: Obtains an encrypted student ID (`xhid`) first, then queries the schedule API.
*   **`fetch_exams`**: Queries the exam management system.
*   **`get_current_semester`**: A utility that calculates the current academic term (e.g., "2024-2025-1") based on the current system date, mirroring the Python `calendar.py` logic.

## 3. Mind Map

```mermaid
graph TD
    Client[HbutClient]
    
    subgraph "Auth Core"
        Client --> Login[login()]
        Login --> GetPage[get_login_page]
        Login --> Encrypt[encrypt_password_aes]
        Login --> OCR[fetch_and_recognize_captcha]
        Login --> Post[POST /authserver/login]
        Post --> Check[Error Checking]
    end
    
    subgraph "Academic Services"
        Client --> Grades[fetch_grades]
        Client --> Schedule[fetch_schedule]
        Client --> Exams[fetch_exams]
        Client --> UserInfo[fetch_user_info]
        Client --> Training[fetch_training_plan]
        
        Schedule --> GetSem[get_current_semester]
        Exams --> GetSem
    end
    
    subgraph "Electricity System"
        Client --> ElecToken[ensure_electricity_token]
        ElecToken --> SSOLoop[SSO Redirect Loop]
        SSOLoop --> GetTID[Extract TID/Ticket]
        GetTID --> Exchange[Exchange for JWT]
        
        Client --> ElecLoc[query_electricity_location]
        Client --> ElecAcc[query_electricity_account]
        ElecLoc --> ElecToken
        ElecAcc --> ElecToken
    end
    
    subgraph "Utils"
        Client --> Cookies[get_cookies]
        Client --> Restore[restore_session]
    end
```

## 4. Logical Relationships
*   **Dependency on Python Logic**: This file is a direct port of `fast_auth.py` (login/electricity), `grades.py`, `schedule.py`, and `electricity.py`.
*   **State Management**: Unlike the stateless Python backend (which relies on DB sessions), this Rust client maintains a persistent connection state in memory (`self.cookie_jar`), making it suitable for a desktop app where the user stays logged in.
*   **Error Handling**: Returns `Result<T, Box<dyn Error>>` to propagate errors up to the Tauri frontend command handlers.
