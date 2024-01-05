export function extractBooleanEnvVar(key: keyof NodeJS.ProcessEnv): boolean {
  switch ((process.env[key] ?? "").toLowerCase()) {
    case "1":
    case "on":
    case "enabled":
    case "true":
    case "yes": {
      return true;
    }
  }

  return false;
}
