import { NodeLogger } from "../logging/NodeLogger.js";

import { secrets } from "docker-secret";

export class DockerProvider {
  private constructor() {}

  static getSecret<T>(
    dockerSecretName: string | undefined = "PAYER_SECRETS",
    fileParser: (fileString: string) => T
  ): T {
    try {
      if (!dockerSecretName || dockerSecretName.length === 0) {
        throw new Error(`Failed to provide a dockerSecret`);
      }

      if (!(dockerSecretName in secrets)) {
        throw new Error("Docker Secret not found.");
      }

      const dockerSecret = secrets[dockerSecretName];
      if (!dockerSecret) {
        throw new Error("Docker Secret not found.");
      }

      return fileParser(dockerSecret);
    } catch (error) {
      NodeLogger.getInstance().error(
        `Failed to read Docker Secret ${dockerSecretName}: ${error}`
      );
      throw error;
    }
  }
}
