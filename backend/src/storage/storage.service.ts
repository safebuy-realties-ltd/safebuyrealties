import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import * as fs from "fs";
import * as path from "path";

type StorageDriver = "local" | "s3";

function resolveLocalRoot(config: ConfigService): string {
  const configured =
    config.get<string>("STORAGE_LOCAL_PATH")?.trim() ||
    config.get<string>("UPLOAD_DIR")?.trim();
  if (configured) {
    // Relative UPLOAD_DIR (e.g. ./uploads) is not writable on Vercel serverless
    if (process.env.VERCEL && !path.isAbsolute(configured)) {
      return path.join("/tmp", "safebuyrealties-uploads");
    }
    return path.resolve(configured);
  }
  if (process.env.VERCEL) {
    return path.join("/tmp", "safebuyrealties-uploads");
  }
  return path.resolve("./uploads");
}

@Injectable()
export class StorageService {
  private readonly driver: StorageDriver;
  private readonly localRoot: string;
  private s3Client: S3Client | null = null;
  private s3Bucket: string | null = null;

  constructor(private config: ConfigService) {
    const raw = (this.config.get<string>("STORAGE_DRIVER") ?? "local").toLowerCase();
    if (raw !== "local" && raw !== "s3") {
      throw new BadRequestException(`Unsupported STORAGE_DRIVER: ${raw}`);
    }
    this.driver = raw;
    this.localRoot = resolveLocalRoot(this.config);
  }

  async upload(buffer: Buffer, key: string, mimeType: string): Promise<string> {
    const normalizedKey = this.normalizeKey(key);
    if (this.driver === "s3") {
      await this.uploadS3(buffer, normalizedKey, mimeType);
    } else {
      await this.uploadLocal(buffer, normalizedKey);
    }
    return normalizedKey;
  }

  async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const normalizedKey = this.normalizeKey(key);
    if (this.driver === "s3") {
      return this.getSignedUrlS3(normalizedKey, expiresInSeconds);
    }
    return `/uploads/${normalizedKey}`;
  }

  async delete(key: string): Promise<void> {
    const normalizedKey = this.normalizeKey(key);
    if (this.driver === "s3") {
      await this.deleteS3(normalizedKey);
    } else {
      await this.deleteLocal(normalizedKey);
    }
  }

  private normalizeKey(key: string): string {
    return key.replace(/\\/g, "/").replace(/^\/+/, "");
  }

  private async uploadLocal(buffer: Buffer, key: string): Promise<void> {
    const abs = path.join(this.localRoot, key);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    await fs.promises.writeFile(abs, buffer);
  }

  private async deleteLocal(key: string): Promise<void> {
    const abs = path.join(this.localRoot, key);
    try {
      await fs.promises.unlink(abs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  private getS3(): { client: S3Client; bucket: string } {
    if (this.s3Client && this.s3Bucket) {
      return { client: this.s3Client, bucket: this.s3Bucket };
    }

    const region = this.config.get<string>("AWS_REGION");
    const bucket = this.config.get<string>("AWS_S3_BUCKET");
    const accessKeyId = this.config.get<string>("AWS_ACCESS_KEY_ID");
    const secretAccessKey = this.config.get<string>("AWS_SECRET_ACCESS_KEY");
    const endpoint = this.config.get<string>("AWS_S3_ENDPOINT");

    if (!region || !bucket) {
      throw new BadRequestException(
        "S3 storage requires AWS_REGION and AWS_S3_BUCKET",
      );
    }

    this.s3Bucket = bucket;
    this.s3Client = new S3Client({
      region,
      endpoint: endpoint || undefined,
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
      forcePathStyle: Boolean(endpoint),
    });

    return { client: this.s3Client, bucket: this.s3Bucket };
  }

  private async uploadS3(buffer: Buffer, key: string, mimeType: string): Promise<void> {
    const { client, bucket } = this.getS3();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );
  }

  private async getSignedUrlS3(key: string, expiresInSeconds: number): Promise<string> {
    const { client, bucket } = this.getS3();
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  private async deleteS3(key: string): Promise<void> {
    const { client, bucket } = this.getS3();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
}
