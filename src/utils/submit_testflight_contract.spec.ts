import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import crypto from "node:crypto";
import {
  buildWhatsNew,
  createJwt,
  parseTestAccount,
} from "../../tools/ci/submit_testflight.mjs";

const workflowPath = resolve(
  process.cwd(),
  ".github/workflows/ios-testflight.yml",
);
const scriptPath = resolve(process.cwd(), "tools/ci/submit_testflight.mjs");

const readWorkflow = () => {
  expect(existsSync(workflowPath), "ios-testflight workflow should exist").toBe(
    true,
  );
  return readFileSync(workflowPath, "utf8");
};

const readScript = () => {
  expect(existsSync(scriptPath), "submit_testflight.mjs should exist").toBe(
    true,
  );
  return readFileSync(scriptPath, "utf8");
};

describe("TestFlight 自动化提交契约", () => {
  it("workflow 提供手动测试说明与测试组输入", () => {
    const workflow = readWorkflow();

    expect(workflow).toContain("whats_new:");
    expect(workflow).toContain("beta_group:");
    expect(workflow).toContain("inputs.whats_new");
    expect(workflow).toContain("inputs.beta_group");
  });

  it("workflow 上传 IPA 后自动填写信息并提交测试", () => {
    const workflow = readWorkflow();

    expect(workflow).toContain("Fill TestFlight info and submit for testing");
    expect(workflow).toContain("node tools/ci/submit_testflight.mjs");
    // 复用既有 App Store Connect API Key，不新增密钥
    expect(workflow).toContain("secrets.APPSTORE_KEY_ID");
    expect(workflow).toContain("secrets.APPSTORE_ISSUER_ID");
    expect(workflow).toContain("AuthKey_${APPSTORE_KEY_ID}.p8");
  });

  it("脚本使用官方 App Store Connect REST API 完成填写与提交", () => {
    const script = readScript();

    expect(script).toContain("api.appstoreconnect.apple.com");
    // 填写测试说明：PATCH /v1/builds/{id} attributes.whatsNew
    expect(script).toContain("attributes: { whatsNew }");
    expect(script).toContain("method: 'PATCH'");
    // 加入测试组：POST /v1/builds/{id}/relationships/betaGroups
    expect(script).toContain("relationships/betaGroups");
    expect(script).toContain("type: 'betaGroups'");
    // 外部测试组提交 Beta App Review
    expect(script).toContain("betaAppReviewSubmissions");
    // 测试说明留空时从源码自动提取演示测试账号
    expect(script).toContain("src/utils/test_account.js");
  });

  it("createJwt 生成可被公钥验证的 ES256 JWT", () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" });
    const now = 1_700_000_000;

    const token = createJwt({
      keyId: "KEY123",
      issuerId: "ISSUER-ABC",
      privateKeyPem: pem,
      now,
    });

    const [header, payload, signature] = token.split(".");
    expect(header).toBeDefined();
    expect(payload).toBeDefined();
    expect(signature).toBeDefined();

    expect(JSON.parse(Buffer.from(header, "base64url"))).toEqual({
      alg: "ES256",
      kid: "KEY123",
      typ: "JWT",
    });
    expect(JSON.parse(Buffer.from(payload, "base64url"))).toMatchObject({
      iss: "ISSUER-ABC",
      aud: "appstoreconnect-v1",
      iat: now,
      exp: now + 1200,
    });

    // 用公钥验签，确认签名有效
    const verified = crypto.verify(
      "sha256",
      Buffer.from(`${header}.${payload}`),
      publicKey,
      Buffer.from(signature, "base64url"),
    );
    expect(verified).toBe(true);
  });

  it("parseTestAccount 从真实源码提取演示测试账号", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/utils/test_account.js"),
      "utf8",
    );

    const account = parseTestAccount(source);

    expect(account).toEqual({
      username: "reviewer",
      password: "Test2026",
      studentId: "2026000001",
    });
  });

  it("buildWhatsNew 手动填写优先，并支持 \\n 换行", () => {
    const manual = buildWhatsNew({
      manual: "重点回归登录与课表。\\n第二行说明。",
      versionName: "1.4.3",
      buildNumber: "42",
      commits: ["abc1234 修复登录"],
      account: { username: "reviewer", password: "Test2026" },
    });

    expect(manual).toBe("重点回归登录与课表。\n第二行说明。");
  });

  it("buildWhatsNew 留空时自动生成：git 提交 + 测试账号", () => {
    const auto = buildWhatsNew({
      manual: "",
      versionName: "1.4.3",
      buildNumber: "42",
      commits: ["abc1234 修复登录", "def5678 优化课表"],
      account: {
        username: "reviewer",
        password: "Test2026",
        studentId: "2026000001",
      },
    });

    expect(auto).toContain("v1.4.3（build 42）");
    expect(auto).toContain("- abc1234 修复登录");
    expect(auto).toContain("reviewer / Test2026");
    expect(auto).toContain("学号 2026000001");
  });

  it("buildWhatsNew 无提交无账号时仍输出版本行，超长时截断", () => {
    const minimal = buildWhatsNew({
      manual: "   ",
      versionName: "1.0",
      buildNumber: "1",
      commits: [],
      account: null,
    });
    expect(minimal).toBe("v1.0（build 1）");

    const long = buildWhatsNew({
      manual: "",
      versionName: "1.0",
      buildNumber: "1",
      commits: ["x".repeat(5000)],
      account: null,
    });
    expect(long.length).toBeLessThanOrEqual(4000);
    expect(long.endsWith("…")).toBe(true);
  });
});
