import { formatConfigSources } from "./config/index.js";
import type { LoadedConfig } from "./config/types.js";

export interface StatusOptions {
  cwd: string;
  loadedConfig: LoadedConfig;
}

export function formatStatus({ cwd, loadedConfig }: StatusOptions): string {
  const { config } = loadedConfig;
  const lines = [
    "ORX status",
    `cwd: ${cwd}`,
    `config_source: ${formatConfigSources(loadedConfig.loadedFiles)}`,
    `mode: ${config.mode}`,
    `model: ${config.model}`,
    `fusion_preset: ${config.fusionPreset ?? "none"}`,
    `api_key_present: ${loadedConfig.apiKeyPresent ? "yes" : "no"}`,
    `api_key_source: ${loadedConfig.apiKeySource}`,
    `approval_policy: ${config.permissions.approvalPolicy}`,
    `sandbox_mode: ${config.permissions.sandboxMode}`,
    "shell_access: enabled",
    "network_tools: enabled",
    "destructive_command_warnings: disabled",
  ];

  return lines.join("\n");
}
