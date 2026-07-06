import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const workflowPath = resolve(
  process.cwd(),
  ".github/workflows/ios-testflight.yml",
);

const readWorkflow = () => {
  expect(existsSync(workflowPath), "ios-testflight workflow should exist").toBe(
    true,
  );
  return readFileSync(workflowPath, "utf8");
};

describe("iOS TestFlight workflow contract", () => {
  it("is manually triggered and keeps GitHub permissions minimal", () => {
    const workflow = readWorkflow();

    expect(workflow).toContain("name: iOS TestFlight Upload");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("permissions:");
    expect(workflow).toContain("contents: read");
    expect(workflow).not.toContain("contents: write");
  });

  it("uses App Store signing secrets instead of unsigned IPA packaging", () => {
    const workflow = readWorkflow();

    for (const secret of [
      "IOS_CERTIFICATE_P12_BASE64",
      "IOS_CERTIFICATE_PASSWORD",
      "IOS_KEYCHAIN_PASSWORD",
      "IOS_PROVISION_PROFILE_BASE64",
      "IOS_PROVISION_PROFILE_NAME",
      "IOS_PROVISION_PROFILE_UUID",
      "APPLE_TEAM_ID",
    ]) {
      expect(workflow).toContain(`secrets.${secret}`);
    }

    expect(workflow).toContain("security create-keychain");
    expect(workflow).toContain('security import "$CERTIFICATE_PATH"');
    expect(workflow).toContain("Provisioning Profiles");
    expect(workflow).not.toContain("CODE_SIGNING_ALLOWED=NO");
    expect(workflow).not.toContain("CODE_SIGNING_REQUIRED=NO");
  });

  it("archives, exports, validates, and uploads the signed IPA to TestFlight", () => {
    const workflow = readWorkflow();

    expect(workflow).toContain("xcodebuild archive");
    expect(workflow).toContain("xcodebuild -exportArchive");
    expect(workflow).toContain("<string>app-store-connect</string>");
    expect(workflow).toContain(
      'PROVISIONING_PROFILE_SPECIFIER="${IOS_PROVISION_PROFILE_NAME}"',
    );
    expect(workflow).toContain('CODE_SIGN_IDENTITY="Apple Distribution"');
    expect(workflow).toContain('CURRENT_PROJECT_VERSION="$BUILD_NUMBER"');
    expect(workflow).toContain('MARKETING_VERSION="$VERSION_NAME"');
    expect(workflow).toContain("xcrun altool --validate-app");
    expect(workflow).toContain("xcrun altool --upload-app");
    expect(workflow).toContain("secrets.APPSTORE_KEY_ID");
    expect(workflow).toContain("secrets.APPSTORE_ISSUER_ID");
    expect(workflow).toContain("secrets.APPSTORE_PRIVATE_KEY");
  });
});
