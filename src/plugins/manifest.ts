import { readFileSync } from "node:fs";
import { isAbsolute, posix, sep } from "node:path";

export type PluginSourceType = "local" | "git";
export type PluginComponentKey =
  | "skills"
  | "commands"
  | "commandSchemas"
  | "rules"
  | "hooks"
  | "mcpServers"
  | "bins"
  | "assets"
  | "docs";
export type PluginPermissionKey = "filesystem" | "network" | "env" | "mcp";
export type PluginTrustTier = "local" | "community" | "verified" | "experimental" | "untrusted";

export interface PluginSource {
  type: PluginSourceType;
  path?: string;
  repository?: string;
  ref?: string;
  resolvedCommit?: string;
}

export interface PluginManifest {
  schemaVersion: "1";
  name: string;
  version: string;
  description: string;
  publisher: string;
  source: PluginSource;
  metadata?: PluginManifestMetadata;
  components: Partial<Record<PluginComponentKey, string>>;
  permissions: Record<PluginPermissionKey, string[]>;
}

export interface PluginAuthMetadata {
  required?: boolean;
  methods?: string[];
  env?: string[];
  notes?: string;
}

export interface PluginPrivacyMetadata {
  dataAccess?: string[];
  networkAccess?: string[];
  notes?: string;
}

export interface PluginRuntimeMetadata {
  node?: string;
  platforms?: string[];
  tools?: string[];
  notes?: string;
}

export interface PluginManifestMetadata {
  homepage?: string;
  documentation?: string;
  license?: string;
  trustTier?: PluginTrustTier;
  auth?: PluginAuthMetadata;
  privacy?: PluginPrivacyMetadata;
  runtime?: PluginRuntimeMetadata;
}

export class PluginManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginManifestError";
  }
}

const COMPONENT_KEYS: PluginComponentKey[] = [
  "skills",
  "commands",
  "commandSchemas",
  "rules",
  "hooks",
  "mcpServers",
  "bins",
  "assets",
  "docs",
];
const PERMISSION_KEYS: PluginPermissionKey[] = ["filesystem", "network", "env", "mcp"];
const TRUST_TIERS: PluginTrustTier[] = [
  "local",
  "community",
  "verified",
  "experimental",
  "untrusted",
];
const ID_PART_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/;
const ENV_PERMISSION_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const RESOLVED_COMMIT_PATTERN = /^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/;
const SCP_LIKE_GIT_PATTERN =
  /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[A-Za-z0-9._~/-]+(?:\.git)?$/;
const SECRET_LIKE_PATTERN =
  /\b(?:bearer\s+[A-Za-z0-9._~+/=-]{8,}|authorization:\s*bearer\s+[A-Za-z0-9._~+/=-]{8,}|(?:access[_-]?token|api[_-]?key|token|key|secret)\s*[=:]\s*[A-Za-z0-9._~+/=-]{4,}|sk-or-v1-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+|xox[baprs]-[A-Za-z0-9-]+)\b/i;
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;

export function readPluginManifestFile(path: string): PluginManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    const reason = error instanceof SyntaxError ? "invalid JSON" : "unable to read file";
    throw new PluginManifestError(`Invalid plugin manifest: ${reason}.`);
  }

  return sanitizePluginManifest(parsed);
}

export function sanitizePluginManifest(value: unknown): PluginManifest {
  if (!isPlainObject(value)) {
    throw new PluginManifestError("Invalid plugin manifest: expected a JSON object.");
  }

  return {
    schemaVersion: requiredLiteral(value.schemaVersion, "schemaVersion", "1"),
    name: requiredIdPart(value.name, "name"),
    version: requiredVersion(value.version),
    description: requiredBoundedString(value.description, "description", 1, 500),
    publisher: requiredIdPart(value.publisher, "publisher"),
    source: sanitizeSource(value.source),
    metadata: sanitizePluginMetadata(value.metadata),
    components: sanitizeComponents(value.components),
    permissions: sanitizePermissions(value.permissions),
  };
}

export function pluginManifestId(manifest: PluginManifest): string {
  return `${manifest.publisher}.${manifest.name}@${manifest.version}`;
}

function sanitizeSource(value: unknown): PluginSource {
  if (!isPlainObject(value)) {
    throw new PluginManifestError("Invalid plugin manifest: source must be an object.");
  }

  const type = value.type;
  if (type !== "local" && type !== "git") {
    throw new PluginManifestError("Invalid plugin manifest: source.type must be local or git.");
  }

  const source: PluginSource = { type };

  if (type === "local") {
    source.path = optionalBoundedString(value.path, "source.path", 1, 1024);
  } else {
    const repository = requiredBoundedString(value.repository, "source.repository", 1, 2048);
    validateGitRepository(repository, "source.repository");
    source.repository = repository;
  }

  source.ref = optionalBoundedString(value.ref, "source.ref", 1, 256);
  source.resolvedCommit = optionalBoundedString(
    value.resolvedCommit,
    "source.resolvedCommit",
    1,
    128,
  );
  if (type === "git") {
    if (!source.resolvedCommit) {
      throw new PluginManifestError(
        "Invalid plugin manifest: source.resolvedCommit is required for git sources.",
      );
    }
    if (!RESOLVED_COMMIT_PATTERN.test(source.resolvedCommit)) {
      throw new PluginManifestError(
        "Invalid plugin manifest: source.resolvedCommit must be a pinned git commit hash.",
      );
    }
  }

  return source;
}

function sanitizePluginMetadata(value: unknown): PluginManifestMetadata | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }

  if (!isPlainObject(value)) {
    throw new PluginManifestError("Invalid plugin manifest: metadata must be an object.");
  }

  const metadata: PluginManifestMetadata = {};
  metadata.homepage = optionalMetadataUrl(value.homepage, "metadata.homepage");
  metadata.documentation = optionalMetadataUrl(value.documentation, "metadata.documentation");
  metadata.license = optionalBoundedString(value.license, "metadata.license", 1, 80);
  metadata.trustTier = optionalTrustTier(value.trustTier, "metadata.trustTier");
  metadata.auth = sanitizeAuthMetadata(value.auth);
  metadata.privacy = sanitizePrivacyMetadata(value.privacy);
  metadata.runtime = sanitizeRuntimeMetadata(value.runtime);

  return hasDefinedValues(metadata) ? metadata : undefined;
}

function sanitizeAuthMetadata(value: unknown): PluginAuthMetadata | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }

  if (!isPlainObject(value)) {
    throw new PluginManifestError("Invalid plugin manifest: metadata.auth must be an object.");
  }

  const auth: PluginAuthMetadata = {};
  auth.required = optionalBoolean(value.required, "metadata.auth.required");
  auth.methods = optionalStringArray(value.methods, "metadata.auth.methods", 8, 80);
  auth.env = optionalEnvArray(value.env, "metadata.auth.env", 32);
  auth.notes = optionalBoundedString(value.notes, "metadata.auth.notes", 1, 500);
  return hasDefinedValues(auth) ? auth : undefined;
}

function sanitizePrivacyMetadata(value: unknown): PluginPrivacyMetadata | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }

  if (!isPlainObject(value)) {
    throw new PluginManifestError("Invalid plugin manifest: metadata.privacy must be an object.");
  }

  const privacy: PluginPrivacyMetadata = {};
  privacy.dataAccess = optionalStringArray(
    value.dataAccess,
    "metadata.privacy.dataAccess",
    16,
    120,
  );
  privacy.networkAccess = optionalStringArray(
    value.networkAccess,
    "metadata.privacy.networkAccess",
    16,
    120,
  );
  privacy.notes = optionalBoundedString(value.notes, "metadata.privacy.notes", 1, 500);
  return hasDefinedValues(privacy) ? privacy : undefined;
}

function sanitizeRuntimeMetadata(value: unknown): PluginRuntimeMetadata | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }

  if (!isPlainObject(value)) {
    throw new PluginManifestError("Invalid plugin manifest: metadata.runtime must be an object.");
  }

  const runtime: PluginRuntimeMetadata = {};
  runtime.node = optionalBoundedString(value.node, "metadata.runtime.node", 1, 80);
  runtime.platforms = optionalStringArray(value.platforms, "metadata.runtime.platforms", 8, 80);
  runtime.tools = optionalStringArray(value.tools, "metadata.runtime.tools", 16, 80);
  runtime.notes = optionalBoundedString(value.notes, "metadata.runtime.notes", 1, 500);
  return hasDefinedValues(runtime) ? runtime : undefined;
}

function sanitizeComponents(value: unknown): Partial<Record<PluginComponentKey, string>> {
  if (typeof value === "undefined") {
    return {};
  }

  if (!isPlainObject(value)) {
    throw new PluginManifestError("Invalid plugin manifest: components must be an object.");
  }

  const components: Partial<Record<PluginComponentKey, string>> = {};
  for (const key of COMPONENT_KEYS) {
    const rawValue = value[key];
    if (typeof rawValue === "undefined") {
      continue;
    }

    components[key] = sanitizeRelativeComponentPath(rawValue, `components.${key}`);
  }

  return components;
}

function sanitizePermissions(value: unknown): Record<PluginPermissionKey, string[]> {
  const permissions: Record<PluginPermissionKey, string[]> = {
    filesystem: [],
    network: [],
    env: [],
    mcp: [],
  };

  if (typeof value === "undefined") {
    return permissions;
  }

  if (!isPlainObject(value)) {
    throw new PluginManifestError("Invalid plugin manifest: permissions must be an object.");
  }

  for (const key of PERMISSION_KEYS) {
    const rawValue = value[key];
    if (typeof rawValue === "undefined") {
      continue;
    }

    if (!Array.isArray(rawValue)) {
      throw new PluginManifestError(`Invalid plugin manifest: permissions.${key} must be an array.`);
    }

    if (rawValue.length > 64) {
      throw new PluginManifestError(
        `Invalid plugin manifest: permissions.${key} has too many entries.`,
      );
    }

    permissions[key] = rawValue.map((entry, index) => {
      const field = `permissions.${key}[${index}]`;
      const permission = requiredBoundedString(entry, field, 1, 128);
      if (key === "env") {
        return sanitizeEnvPermissionName(permission, field);
      }
      return permission;
    });
  }

  return permissions;
}

function sanitizeEnvPermissionName(value: string, field: string): string {
  if (!ENV_PERMISSION_NAME_PATTERN.test(value)) {
    throw new PluginManifestError(
      `Invalid plugin manifest: ${field} must be an environment variable name.`,
    );
  }
  return value;
}

function requiredLiteral<T extends string>(value: unknown, field: string, literal: T): T {
  if (value !== literal) {
    throw new PluginManifestError(`Invalid plugin manifest: ${field} must be "${literal}".`);
  }
  return literal;
}

function requiredIdPart(value: unknown, field: string): string {
  const text = requiredBoundedString(value, field, 1, 80);
  if (!ID_PART_PATTERN.test(text)) {
    throw new PluginManifestError(
      `Invalid plugin manifest: ${field} must use lowercase letters, numbers, dots, underscores, or dashes.`,
    );
  }
  return text;
}

function requiredVersion(value: unknown): string {
  const version = requiredBoundedString(value, "version", 1, 64);
  if (!VERSION_PATTERN.test(version)) {
    throw new PluginManifestError("Invalid plugin manifest: version contains unsupported characters.");
  }
  return version;
}

function requiredBoundedString(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): string {
  if (typeof value !== "string") {
    throw new PluginManifestError(`Invalid plugin manifest: ${field} must be a string.`);
  }

  const trimmed = value.trim();
  if (trimmed.length < minimum || trimmed.length > maximum) {
    throw new PluginManifestError(
      `Invalid plugin manifest: ${field} must be ${minimum}-${maximum} characters.`,
    );
  }

  if (CONTROL_CHAR_PATTERN.test(trimmed)) {
    throw new PluginManifestError(
      `Invalid plugin manifest: ${field} contains a control character.`,
    );
  }

  if (SECRET_LIKE_PATTERN.test(trimmed)) {
    throw new PluginManifestError(
      `Invalid plugin manifest: ${field} must not contain secret-like values.`,
    );
  }

  return trimmed;
}

function optionalBoundedString(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): string | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }

  return requiredBoundedString(value, field, minimum, maximum);
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new PluginManifestError(`Invalid plugin manifest: ${field} must be a boolean.`);
  }

  return value;
}

function optionalTrustTier(value: unknown, field: string): PluginTrustTier | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }

  if (typeof value !== "string" || !TRUST_TIERS.includes(value as PluginTrustTier)) {
    throw new PluginManifestError(
      `Invalid plugin manifest: ${field} must be one of ${TRUST_TIERS.join(", ")}.`,
    );
  }

  return value as PluginTrustTier;
}

function optionalStringArray(
  value: unknown,
  field: string,
  maximumEntries: number,
  maximumLength: number,
): string[] | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new PluginManifestError(`Invalid plugin manifest: ${field} must be an array.`);
  }

  if (value.length > maximumEntries) {
    throw new PluginManifestError(
      `Invalid plugin manifest: ${field} has too many entries.`,
    );
  }

  return value.map((entry, index) =>
    requiredBoundedString(entry, `${field}[${index}]`, 1, maximumLength),
  );
}

function optionalEnvArray(
  value: unknown,
  field: string,
  maximumEntries: number,
): string[] | undefined {
  const values = optionalStringArray(value, field, maximumEntries, 128);
  return values?.map((entry, index) => sanitizeEnvPermissionName(entry, `${field}[${index}]`));
}

function optionalMetadataUrl(value: unknown, field: string): string | undefined {
  const text = optionalBoundedString(value, field, 1, 2048);
  if (!text) {
    return undefined;
  }

  validateMetadataUrl(text, field);
  return text;
}

function validateMetadataUrl(value: string, field: string): void {
  if (value.includes("?") || value.includes("#")) {
    throw new PluginManifestError(
      `Invalid plugin manifest: ${field} must not contain query strings or fragments.`,
    );
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new PluginManifestError(
        `Invalid plugin manifest: ${field} must use http or https.`,
      );
    }
    if (url.username || url.password) {
      throw new PluginManifestError(
        `Invalid plugin manifest: ${field} must not contain credentials.`,
      );
    }
    if (url.search || url.hash) {
      throw new PluginManifestError(
        `Invalid plugin manifest: ${field} must not contain query strings or fragments.`,
      );
    }
  } catch (error) {
    if (error instanceof PluginManifestError) {
      throw error;
    }
    throw new PluginManifestError(`Invalid plugin manifest: ${field} must be a valid URL.`);
  }
}

function hasDefinedValues(value: object): boolean {
  return Object.values(value).some((entry) => typeof entry !== "undefined");
}

function sanitizeRelativeComponentPath(value: unknown, field: string): string {
  const rawPath = requiredBoundedString(value, field, 1, 512);
  if (isAbsolute(rawPath) || rawPath.includes("\\") || rawPath.includes("\0")) {
    throw new PluginManifestError(
      `Invalid plugin manifest: ${field} must be a relative POSIX-style path.`,
    );
  }

  const normalized = posix.normalize(rawPath.split(sep).join(posix.sep));
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new PluginManifestError(
      `Invalid plugin manifest: ${field} must not traverse outside the plugin directory.`,
    );
  }

  return normalized.startsWith("./") ? normalized.slice(2) : normalized;
}

function validateGitRepository(value: string, field: string): void {
  const normalized = value.toLowerCase();
  if (value.startsWith("-") || normalized.startsWith("ext::")) {
    throw new PluginManifestError(
      `Invalid plugin manifest: ${field} must not use an unsafe git transport.`,
    );
  }

  if (SECRET_LIKE_PATTERN.test(value)) {
    throw new PluginManifestError(
      `Invalid plugin manifest: ${field} must not contain secret-like values.`,
    );
  }

  if (value.includes("?") || value.includes("#")) {
    throw new PluginManifestError(
      `Invalid plugin manifest: ${field} must not contain query strings or fragments.`,
    );
  }

  try {
    const url = new URL(value);
    if (!["https:", "ssh:", "file:"].includes(url.protocol)) {
      throw new PluginManifestError(
        `Invalid plugin manifest: ${field} must use https, ssh, file, or scp-style git syntax.`,
      );
    }
    const hasDisallowedCredentials =
      url.password || (url.username && url.protocol !== "ssh:");
    if (hasDisallowedCredentials) {
      throw new PluginManifestError(
        `Invalid plugin manifest: ${field} must not contain credentials.`,
      );
    }
    if (url.search || url.hash) {
      throw new PluginManifestError(
        `Invalid plugin manifest: ${field} must not contain query strings or fragments.`,
      );
    }
  } catch (error) {
    if (error instanceof PluginManifestError) {
      throw error;
    }
    if (!SCP_LIKE_GIT_PATTERN.test(value)) {
      throw new PluginManifestError(
        `Invalid plugin manifest: ${field} must use https, ssh, file, or scp-style git syntax.`,
      );
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
