import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import crypto from "node:crypto";
import {
  buildWhatsNew,
  createBetaBuildLocalizationBody,
  createJwt,
  createPrereleaseBuildsPath,
  createPrereleaseLookupPath,
  parseTestAccount,
} from "../../tools/ci/submit_testflight.mjs";

const workflowPath = resolve(
  process.cwd(),
  ".github/workflows/ios-testflight.yml",
);
const scriptPath = resolve(process.cwd(), "tools/ci/submit_testflight.mjs");
const finalizeWorkflowPath = resolve(
  process.cwd(),
  ".github/workflows/ios-testflight-finalize.yml",
);

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
    // 营销版本和 build 号按 Apple 的 prerelease/build 资源模型定位。
    expect(script).toContain("/preReleaseVersions?");
    expect(script).toContain("/preReleaseVersions/${encodeURIComponent(preReleaseVersionId)}/builds");
    expect(script).not.toContain("filter[buildNumber]");
    // What to Test 属于 betaBuildLocalizations，不是 Build.attributes。
    expect(script).toContain("/betaBuildLocalizations");
    expect(script).toContain("type: 'betaBuildLocalizations'");
    expect(script).toContain("method: 'PATCH'");
    expect(script).toContain("method: 'POST'");
    // 加入测试组：POST /v1/builds/{id}/relationships/betaGroups
    expect(script).toContain("relationships/betaGroups");
    expect(script).toContain("type: 'betaGroups'");
    // 外部测试组提交 Beta App Review
    expect(script).toContain("betaAppReviewSubmissions");
    // 测试说明留空时从源码自动提取演示测试账号
    expect(script).toContain("src/utils/test_account.js");
  });

  it("构建定位路径区分营销版本与 CFBundleVersion", () => {
    const prereleasePath = createPrereleaseLookupPath({
      appId: "6787857278",
      versionName: "1.4.5",
    });
    const prereleaseUrl = new URL(`https://example.test${prereleasePath}`);
    expect(prereleaseUrl.pathname).toBe("/preReleaseVersions");
    expect(prereleaseUrl.searchParams.get("filter[app]")).toBe("6787857278");
    expect(prereleaseUrl.searchParams.get("filter[version]")).toBe("1.4.5");
    expect(prereleaseUrl.searchParams.get("filter[platform]")).toBe("IOS");
    expect(prereleaseUrl.searchParams.has("filter[buildNumber]")).toBe(false);

    const buildsPath = createPrereleaseBuildsPath("pre release/id");
    const buildsUrl = new URL(`https://example.test${buildsPath}`);
    expect(buildsUrl.pathname).toBe("/preReleaseVersions/pre%20release%2Fid/builds");
    expect(buildsUrl.searchParams.get("fields[builds]")).toContain("version");
    expect(buildsUrl.searchParams.get("limit")).toBe("200");
  });

  it("What to Test 创建体使用 betaBuildLocalizations 与 build 关系", () => {
    expect(
      createBetaBuildLocalizationBody({
        buildId: "build-25",
        locale: "zh-Hans",
        whatsNew: "重点测试课程中心",
      }),
    ).toEqual({
      data: {
        type: "betaBuildLocalizations",
        attributes: { locale: "zh-Hans", whatsNew: "重点测试课程中心" },
        relationships: {
          build: { data: { type: "builds", id: "build-25" } },
        },
      },
    });
  });

  it("仅后处理 workflow 不重新构建或上传 IPA", () => {
    expect(existsSync(finalizeWorkflowPath)).toBe(true);
    const workflow = readFileSync(finalizeWorkflowPath, "utf8");
    expect(workflow).toContain("version_name:");
    expect(workflow).toContain("build_number:");
    expect(workflow).toContain("node tools/ci/submit_testflight.mjs");
    expect(workflow).toContain("secrets.APPSTORE_PRIVATE_KEY");
    expect(workflow).not.toMatch(/tauri build|xcodebuild|altool|upload-app/);
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

    // JWS ES256 必须使用固定 64 字节的 IEEE-P1363 R || S 编码，而不是 DER。
    const signatureBytes = Buffer.from(signature, "base64url");
    expect(signatureBytes).toHaveLength(64);
    const verified = crypto.verify(
      "sha256",
      Buffer.from(`${header}.${payload}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      signatureBytes,
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

    // 手动输入超长时同样截断到 4000 字符，避免 PATCH 被拒
    const tooLong = buildWhatsNew({
      manual: "y".repeat(5000),
      versionName: "1.4.3",
      buildNumber: "42",
      commits: [],
      account: null,
    });
    expect(tooLong.length).toBeLessThanOrEqual(4000);
    expect(tooLong.endsWith("…")).toBe(true);
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
