import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("Android signing workflow boundaries", () => {
  it("keeps durable credentials out of automatic pull-request builds", () => {
    const pr = read(".github/workflows/android-apk.yml");
    expect(pr).not.toContain("secrets.");
    expect(pr).not.toContain("upload-artifact");
    expect(pr).toContain("ORG_GRADLE_PROJECT_itemlyDurableSigning: 'true'");
    const signed = read(".github/workflows/android-signed-apk.yml");
    expect(signed).toContain("workflow_dispatch:");
    expect(signed).not.toMatch(/^\s+pull_request(?:_target)?:/m);
    expect(signed).not.toMatch(/^\s+push:/m);
    expect(signed).toContain("persist-credentials: false");
    expect(signed).toContain("ITEMLY_ANDROID_KEYSTORE_BASE64");
    expect(signed).toContain("ORG_GRADLE_PROJECT_itemlyDurableSigning: 'true'");
    expect(signed).toContain("if: always()");
  });
  it("refuses fallback signing and preserves the standalone preview app ID", () => {
    const gradle = read("android/app/build.gradle");
    expect(gradle).toContain("No temporary-key fallback is allowed.");
    expect(gradle).toContain("applicationIdSuffix '.preview'");
    expect(gradle).toContain("if (durableSigning) signingConfig signingConfigs.durablePreview");
    expect(gradle).toContain("itemlyVersionCode");
    expect(gradle).toContain("def previewVersionCode = (project.findProperty('itemlyVersionCode') ?: '1').toString().toInteger()");
    expect(gradle).toContain("versionCode previewVersionCode");
    expect(gradle).toContain("versionName previewVersionName");
    expect(read(".gitignore")).toContain(".local/");
    expect(read("scripts/setup-android-signing.ps1")).toContain("Refusing to overwrite");
  });
});
