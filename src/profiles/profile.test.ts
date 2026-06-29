import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OrxConfig } from "../config/types.js";
import {
  applySavedProfile,
  deleteSavedProfile,
  findSavedProfile,
  getProfileStatusSummary,
  loadProfileRegistry,
  parseProfileSaveArgs,
  resolveProfileConfigPath,
  saveCurrentProfile,
} from "./index.js";

test("profile registry saves sanitized config snapshots without API keys", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-profiles-"));
  const configPath = join(cwd, "profiles", "profiles.json");

  try {
    const result = saveCurrentProfile("Deep-Review", profileConfig(), {
      configPath,
      now: () => new Date("2026-06-27T12:00:00.000Z"),
    });

    assert.equal(result.ok, true);
    assert.equal(result.profile?.id, "deep-review");
    assert.equal(result.profile?.config.mode, "fusion");
    assert.equal(result.profile?.config.model, "openrouter/fusion");
    assert.equal(result.profile?.config.fusionPreset, "general-budget");
    assert.equal(result.profile?.config.theme, "vivid");
    assert.match(result.message, /API keys are not stored/);

    const raw = readFileSync(configPath, "utf8");
    assert.doesNotMatch(raw, /runtime-key/);
    assert.equal(statSync(join(cwd, "profiles")).mode & 0o777, 0o700);
    assert.equal(statSync(configPath).mode & 0o777, 0o600);

    const profile = findSavedProfile("deep-review", { configPath });
    assert.ok(profile);

    const applied = applySavedProfile(
      {
        ...profileConfig(),
        apiKey: "runtime-key",
        mode: "auto",
        model: "openrouter/auto",
        fusionPreset: undefined,
        theme: "default",
      },
      profile,
    );

    assert.equal(applied.apiKey, "runtime-key");
    assert.equal(applied.activeProfile, "deep-review");
    assert.equal(applied.mode, "fusion");
    assert.equal(applied.model, "openrouter/fusion");
    assert.equal(applied.fusionPreset, "general-budget");
    assert.equal(applied.theme, "vivid");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("profile registry lists and deletes profiles", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-profiles-"));
  const configPath = join(cwd, "profiles.json");

  try {
    assert.equal(getProfileStatusSummary({ configPath }).count, 0);
    assert.equal(saveCurrentProfile("daily", profileConfig(), { configPath }).ok, true);
    assert.equal(getProfileStatusSummary({ configPath }).count, 1);

    const deleted = deleteSavedProfile("daily", { configPath });
    assert.equal(deleted.ok, true);
    assert.equal(deleted.profile?.id, "daily");
    assert.equal(getProfileStatusSummary({ configPath }).count, 0);
    assert.equal(deleteSavedProfile("daily", { configPath }).ok, false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("profile save args reject missing flag values and raw control characters", () => {
  const flagAsValue = parseProfileSaveArgs(["daily", "--model", "--mode"]);
  assert.equal(typeof flagAsValue, "string");
  assert.match(typeof flagAsValue === "string" ? flagAsValue : "", /Missing value for --model/);

  const controlCharacterValue = parseProfileSaveArgs(["daily", "--model", "openrouter/auto\n"]);
  assert.equal(typeof controlCharacterValue, "string");
  assert.match(
    typeof controlCharacterValue === "string" ? controlCharacterValue : "",
    /Unsafe value for --model/,
  );
  assert.doesNotMatch(
    typeof controlCharacterValue === "string" ? controlCharacterValue : "",
    /openrouter\/auto/,
  );
});

test("profile registry preserves existing override parent permissions", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-profiles-"));
  const absoluteParent = join(cwd, "absolute-parent");
  const repoLikeParent = join(cwd, "repo");

  try {
    chmodSync(cwd, 0o755);
    writeFileSync(join(cwd, ".keep"), "");
    chmodSync(cwd, 0o755);

    saveCurrentProfile("absolute", profileConfig(), {
      configPath: join(cwd, "absolute-profile.json"),
    });
    assert.equal(statSync(cwd).mode & 0o777, 0o755);
    assert.equal(statSync(join(cwd, "absolute-profile.json")).mode & 0o777, 0o600);

    saveCurrentProfile("new-parent", profileConfig(), {
      configPath: join(absoluteParent, "profiles.json"),
    });
    assert.equal(statSync(absoluteParent).mode & 0o777, 0o700);

    mkdirSync(repoLikeParent);
    chmodSync(repoLikeParent, 0o755);
    saveCurrentProfile("repo-relative", profileConfig(), {
      configPath: join(repoLikeParent, "profiles.json"),
    });
    assert.equal(statSync(repoLikeParent).mode & 0o777, 0o755);
    assert.equal(statSync(join(repoLikeParent, "profiles.json")).mode & 0o777, 0o600);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("profile registry sanitizes malformed stored records", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-profiles-"));
  const configPath = join(cwd, "profiles.json");

  try {
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          version: 1,
          profiles: {
            safe: {
              id: "safe",
              config: {
                model: "anthropic/claude-sonnet-4.5",
                mode: "exact",
                theme: "mono",
                permissions: {
                  approvalPolicy: "never",
                  sandboxMode: "danger-full-access",
                },
              },
              createdAt: "2026-06-27T12:00:00.000Z",
              updatedAt: "2026-06-27T12:00:00.000Z",
            },
            invalid_mode: {
              id: "invalid-mode",
              config: {
                model: "sk-or-v1-SECRET",
                mode: "invalid",
              },
              createdAt: "2026-06-27T12:00:00.000Z",
              updatedAt: "2026-06-27T12:00:00.000Z",
            },
            "bad id": {
              config: {
                model: "openrouter/auto",
                mode: "auto",
              },
              createdAt: "2026-06-27T12:00:00.000Z",
              updatedAt: "2026-06-27T12:00:00.000Z",
            },
          },
        },
        null,
        2,
      ),
    );

    const loaded = loadProfileRegistry({ configPath });
    assert.deepEqual(Object.keys(loaded.profiles), ["safe"]);
    assert.equal(loaded.profiles.safe.config.theme, "mono");
    assert.doesNotMatch(JSON.stringify(loaded), /SECRET/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("profile paths support environment overrides", () => {
  assert.equal(
    resolveProfileConfigPath({
      cwd: "/tmp/work",
      env: {
        ORX_PROFILE_CONFIG_PATH: "profiles.json",
      },
    }),
    "/tmp/work/profiles.json",
  );
});

function profileConfig(): OrxConfig {
  return {
    mode: "fusion",
    model: "openrouter/fusion",
    fusionPreset: "general-budget",
    theme: "vivid",
    activeProfile: "old-profile",
    apiKey: "runtime-key",
    permissions: {
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
    },
  };
}
