import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { Storage } from "@google-cloud/storage";

export class GcpProvider {
  private constructor() {}

  static async getBucket<T>(
    googleBucketPath: string,
    fileParser: (fileString: string) => T
  ): Promise<T> {
    const [bucket, path] = googleBucketPath.split(":");

    const file = await new Storage().bucket(bucket).file(path).download();
    if (!file || file.length !== 1 || file[0].byteLength === 0) {
      throw new Error(`Failed to read GCP Storage Bucket ${bucket}:${path}`);
    }
    return fileParser(file[0].toString("utf-8"));
  }

  static async getSecret<T>(
    googleSecretPath: string | undefined,
    fileParser: (fileString: string) => T
  ): Promise<T> {
    if (!googleSecretPath || googleSecretPath.length === 0) {
      throw new Error(`Failed to provide a googleSecretPath`);
    }

    const client = new SecretManagerServiceClient();

    const [accessResponse] = await client.accessSecretVersion({
      name: googleSecretPath,
    });

    const secrets = accessResponse?.payload?.data;
    if (!secrets) {
      throw new Error("GCP Secret not found.");
    }

    return fileParser(secrets.toString());
  }
}
