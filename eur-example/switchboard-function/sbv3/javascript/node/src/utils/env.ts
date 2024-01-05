// article: https://levelup.gitconnected.com/all-you-need-to-know-about-environment-variables-in-typescript-2e7042edfac7
// source: https://github.com/grzpab/ts-envvar/blob/master/src/index.ts

export function assertNonNullable<T>(
  name: string,
  value: T | null | undefined
): asserts value is NonNullable<T> {
  if (value === null || value === undefined) {
    const message = `Variable "${name}" cannot be "${String(value)}".`;

    throw new Error(message);
  }
}

export function extractStringEnvVar(
  key: keyof NodeJS.ProcessEnv,
  defaultValue?: string
): string | undefined {
  const value = process.env[key];
  return value ?? defaultValue;
}

/** Attempt to extract an env var from multiple options */
export function extractStringEnvVars(
  ...keys: Array<keyof NodeJS.ProcessEnv>
): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value) {
      return value;
    }
  }

  return "";
}

/** Attempt to extract an env var from multiple options */
export function extractNonNullableStringEnvVars(
  ...keys: Array<keyof NodeJS.ProcessEnv>
): string {
  const value = extractStringEnvVars(...keys);
  if (value) {
    return value;
  }

  const message = `The environment variable "${
    keys[0] ?? "Unknown"
  }" cannot be "undefined".`;

  throw new Error(message);
}

export function extractNonNullableStringEnvVar(
  key: keyof NodeJS.ProcessEnv
): string {
  const value = process.env[key];

  if (value === undefined) {
    const message = `The environment variable "${key}" cannot be "undefined".`;

    throw new Error(message);
  }

  return value;
}

export function extractNumberEnvVar(
  key: keyof NodeJS.ProcessEnv,
  defaultValue?: number
): number | undefined {
  const stringValue = extractStringEnvVar(key);
  if (!stringValue) {
    return defaultValue;
  }

  const numberValue = parseFloat(stringValue);

  if (Number.isNaN(numberValue)) {
    const message = `The environment variable "${key}" has to hold a stringified number value - not ${stringValue}`;

    throw new Error(message);
  }

  return numberValue;
}

export function extractNonNullableNumberEnvVar(
  key: keyof NodeJS.ProcessEnv
): number {
  const stringValue = extractNonNullableStringEnvVar(key);

  const numberValue = parseFloat(stringValue);

  if (Number.isNaN(numberValue)) {
    const message = `The environment variable "${key}" has to hold a stringified number value - not ${stringValue}`;

    throw new Error(message);
  }

  return numberValue;
}

export function extractIntegerEnvVar(
  key: keyof NodeJS.ProcessEnv,
  defaultValue?: number
): number | undefined {
  const stringValue = extractStringEnvVar(key);
  if (!stringValue) {
    return defaultValue;
  }

  const numberValue = parseInt(stringValue, 10);

  if (Number.isNaN(numberValue)) {
    const message = `The environment variable "${key}" has to hold a stringified integer value - not ${stringValue}`;

    throw new Error(message);
  }

  return numberValue;
}

export function extractNonNullableIntegerEnvVar(
  key: keyof NodeJS.ProcessEnv
): number {
  const stringValue = extractNonNullableStringEnvVar(key);

  const numberValue = parseInt(stringValue, 10);

  if (Number.isNaN(numberValue)) {
    const message = `The environment variable "${key}" has to hold a stringified integer value - not ${stringValue}`;

    throw new Error(message);
  }

  return numberValue;
}

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
