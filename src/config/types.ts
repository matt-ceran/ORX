export type OrxMode = "exact" | "auto" | "fusion";
export type OrxTheme = "default" | "mono" | "vivid";

export interface PermissionConfig {
  approvalPolicy: string;
  sandboxMode: string;
}

export interface OrxConfig {
  model: string;
  mode: OrxMode;
  fusionPreset?: string;
  theme?: OrxTheme;
  apiKey?: string;
  permissions: PermissionConfig;
}

export interface LoadedConfig {
  config: OrxConfig;
  loadedFiles: string[];
  apiKeyPresent: boolean;
  apiKeySource: "OPENROUTER_API_KEY" | "config" | "missing";
}
