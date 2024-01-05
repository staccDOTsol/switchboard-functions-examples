import fs from "fs";

export class FsProvider {
  private constructor() {}

  static getSecret<T>(
    fileSystemPath: string | undefined = "../payer_secrets.json",
    fileParser: (fileString: string) => T
  ): T {
    if (!fileSystemPath || fileSystemPath.length === 0) {
      throw new Error(`Failed to provide a fileSystemPath`);
    }
    if (!fs.existsSync(fileSystemPath)) {
      throw new Error(`fileSystemPath does not exist`);
    }

    const fileString = fs.readFileSync(fileSystemPath, "utf8");
    if (!fileString) {
      throw new Error(`Failed to read fileSystemPath`);
    }

    return fileParser(fileString);
  }

  static getBucket<T>(
    fileName: string,
    fileParser: (fileString: string) => T
  ): T {
    if (!fs.existsSync(fileName)) {
      throw new Error(`Failed to read file ${fileName}`);
    }
    const file = fs.readFileSync(fileName, "utf-8");
    return fileParser(file);
  }
}
