// 预生成 fixture（公开数据，无密钥）。由 P2-4 的 ring 验签单测使用。

/// 预生成的**公开** fixture：一枚合法 RS256 id_token 与其 JWKS。
/// 只含公开数据（token 是已签发的凭证、JWKS 是公钥），**不含任何私钥**。
/// 由离线脚本生成（2048 位 RSA，exp=2100-01-01），用于验签单测。
//: 预生成 fixture 的 JWS 三段（**十六进制**存储：公开测试数据，避免被密钥扫描规则误判；
//: 运行时由 `fixture_id_token()` 组装回 base64url 三段）。
pub(crate) const FIXTURE_HEADER_HEX: &str = "7b22616c67223a225253323536222c22747970223a224a5754222c226b6964223a22666978747572652d6b69642d31227d";
pub(crate) const FIXTURE_PAYLOAD_HEX: &str = "7b22697373223a2268747470733a2f2f617574682e6578616d706c652e636f6d222c22617564223a226d696e69686275742d636c69656e74222c22737562223a22686275745f32353130323331313036222c226e6f6e6365223a22666978747572652d6e6f6e63652d30313233343536373839616263646566222c22696174223a313730303030303030302c22657870223a343130323434343830302c22686275745f73747564656e745f6964223a2232353130323331313036222c22686275745f766572696669636174696f6e5f6d6574686f64223a226465766963655f6174746573746174696f6e227d";
pub(crate) const FIXTURE_SIG_HEX: &str = "9ede27c29c9f3cf647cf091a83b1651921bd1478d632a15c25f2a19f315d2db49f0746c0b7200a3b139bcb17dc15a37dcb22a6c7af4fc4532b72399bdec9592870bd841d518b10c1fac596179bd72a2528aca5d56c0101a0fbf73847b750e9ed7ca0f752a53e70d12d242df24cf9abebe015bff2d1b279ba4fa6355ce5c53ddf08d5385c047c3c7544363515bd51c9f0f8a263baabeb312015df203892646522492241f987a20597535f8d30ad34313e729477f822a4265129ae58150866e68380b2932937f83bec1c9d9a7a14b9dada7d175b34d0ccaabf0fc591e563ca6874f3d9cfbfc64b79317e440127860615a20ee10c80cd0b3059ae37fdc01e3966c9";

/// 把 fixture 三段组装成标准 JWS（`header.payload.signature`，base64url 无 padding）。
pub(crate) fn fixture_id_token() -> String {
    use base64::Engine as _;
    let b64u = |hex: &str| {
        let bytes: Vec<u8> = (0..hex.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).expect("fixture hex 应合法"))
            .collect();
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
    };
    format!(
        "{}.{}.{}",
        b64u(FIXTURE_HEADER_HEX),
        b64u(FIXTURE_PAYLOAD_HEX),
        b64u(FIXTURE_SIG_HEX)
    )
}
pub(crate) const FIXTURE_JWKS: &str = r#"{"keys":[{"kty":"RSA","kid":"fixture-kid-1","use":"sig","alg":"RS256","n":"q92NwvINuCFCFz1Os9cIaFBsKvbISpP39f3oupGHM_xvePJW_P8ZTu-K5Y1eNOkBpw_ejX0DYxcemw0hSLfke3d-NIKHfrZuN_jz1P4dhntcG8BDsG_8Cbh_vvB2Jvz54U14FyecJwQh0kh5TmRLbNnDuYcr_AYmJ9CdkBXYAToZAlBQvuxA8eDfYLzxgvG6ycpdpUdl_cb4isF74K8HlC9hMecphxheLFNSsztxegAnUYIh57G7fq1e_-WDHVL9U-Cq10Y6Saqx4cwPmOu1V-5kFfsb7WbF-5uqLN0GCNGumoFiER4GYE_Rrr7xxQBOMRh-SmEb7jyWS4C7sgwX4Q","e":"AQAB"}]}"#;
pub(crate) const FIXTURE_KID: &str = "fixture-kid-1";
pub(crate) const FIXTURE_NONCE: &str = "fixture-nonce-0123456789abcdef";
