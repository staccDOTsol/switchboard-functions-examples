import { ManagedIdentityCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";

export class AzureProvider {
  private constructor() {}

  static async getSecret<T>(
    azureSecretPath: string | undefined,
    fileParser: (fileString: string) => T
  ): Promise<T> {
    if (!azureSecretPath || azureSecretPath.length === 0) {
      throw new Error(`Failed to provide a azureSecretPath`);
    }
    const [keyVaultName, secretName] = azureSecretPath.split("/");
    const url = "https://" + keyVaultName + ".vault.azure.net";
    const credential = new ManagedIdentityCredential();
    const client = new SecretClient(url, credential);
    const secret = await client.getSecret(secretName);

    if (!secret) {
      throw new Error("Azure Secret not found.");
    }
    return fileParser(secret.toString());
  }
}
