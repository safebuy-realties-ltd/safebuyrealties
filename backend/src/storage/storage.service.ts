import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
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
import { Readable } from "stream";
import { isPrivateDocumentKey, privateDocumentUrl } from "./private-documents";

type StorageDriver = "local" | "s3";

/** An open object, ready to stream. The caller owns the stream and must consume or destroy it. */
export type StoredObject = {
  stream: Readable;
  /** Byte length when the driver reports one, so the response can set Content-Length. */
  contentLength: number | null;
};

/** Outcome of StorageService.configStatus(). Reasons are fixed literals, never config values. */
export type StorageConfigStatus =
  | { ok: true }
  | { ok: false; reason: "s3_missing_region_or_bucket" | "s3_partial_credentials" };

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

/** S3 answers a missing key with NoSuchKey, and a missing key under a HEAD-style call with 404. */
function isS3NotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
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

  /**
   * Configuration-only inspection of the driver, for the readiness probe.
   *
   * Reads configuration and contacts nothing, so it cannot hang and cannot be used as an
   * unauthenticated probe of the bucket. The reasons are fixed literals rather than the
   * offending values: a caller that forwards one still cannot learn the bucket or endpoint.
   */
  configStatus(): StorageConfigStatus {
    if (this.driver !== "s3") return { ok: true };

    // Same requirement getS3() enforces at :109, checked before a request depends on it.
    const region = this.config.get<string>("AWS_REGION");
    const bucket = this.config.get<string>("AWS_S3_BUCKET");
    if (!region || !bucket) return { ok: false, reason: "s3_missing_region_or_bucket" };

    // Half a credential pair is dropped by getS3(), silently falling back to ambient
    // credentials. That is a misconfiguration whichever half is missing.
    const accessKeyId = this.config.get<string>("AWS_ACCESS_KEY_ID");
    const secretAccessKey = this.config.get<string>("AWS_SECRET_ACCESS_KEY");
    if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
      return { ok: false, reason: "s3_partial_credentials" };
    }

    return { ok: true };
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

  /**
   * The URL a caller should be given for this object.
   *
   * Routed families are checked before the driver branch, because no URL can express
   * "the owner and platform operators only". A presigned S3 URL is a bearer capability: an
   * hour of access to whoever holds it, with no session and no role. So both drivers point
   * those keys at PrivateDocumentController, which authorizes each request instead
   * (E3-S1c, private-documents.ts).
   *
   * **As of E3-S1d-3 the two branches below are unreachable for every key this application
   * writes.** `PRIVATE_DOCUMENT_POLICIES` now covers all five prefixes the upload paths produce,
   * so `isPrivateDocumentKey()` is true for all of them and nothing falls through. They are kept
   * rather than deleted because they are also the failure mode: a prefix added later without a
   * policy entry would land here, and it should be obvious what went wrong. On the local driver
   * that means a `/uploads/` URL for a mount that no longer exists — a 404, which is the right
   * way for a missing policy to fail. `private-document.controller.spec.ts` asserts the
   * invariant over every key shape the writers build, so a new family cannot reach here quietly.
   */
  async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const normalizedKey = this.normalizeKey(key);
    if (isPrivateDocumentKey(normalizedKey)) {
      return privateDocumentUrl(normalizedKey);
    }
    if (this.driver === "s3") {
      return this.getSignedUrlS3(normalizedKey, expiresInSeconds);
    }
    return `/uploads/${normalizedKey}`;
  }

  /**
   * Open a stored object for reading. Authorization is the caller's job and must happen first —
   * this method knows nothing about who is asking.
   */
  async readObject(key: string): Promise<StoredObject> {
    const normalizedKey = this.normalizeKey(key);
    if (this.driver === "s3") {
      return this.readObjectS3(normalizedKey);
    }
    return this.readObjectLocal(normalizedKey);
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
    const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.includes("..")) {
      throw new BadRequestException("Invalid storage key");
    }
    return normalized;
  }

  private async uploadLocal(buffer: Buffer, key: string): Promise<void> {
    const abs = path.join(this.localRoot, key);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    await fs.promises.writeFile(abs, buffer);
  }

  private async readObjectLocal(key: string): Promise<StoredObject> {
    const abs = path.resolve(this.localRoot, key);
    // normalizeKey() already rejects "..", and resolvePrivateDocumentTarget() rejects it again
    // before this is ever called. This is the last line: whatever the key was, the file it
    // resolved to has to sit inside the storage root.
    if (abs !== this.localRoot && !abs.startsWith(this.localRoot + path.sep)) {
      throw new NotFoundException("Document not found");
    }

    let stats: fs.Stats;
    try {
      stats = await fs.promises.stat(abs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new NotFoundException("Document not found");
      }
      throw err;
    }
    if (!stats.isFile()) throw new NotFoundException("Document not found");

    return { stream: fs.createReadStream(abs), contentLength: stats.size };
  }

  private async readObjectS3(key: string): Promise<StoredObject> {
    const { client, bucket } = this.getS3();

    let output;
    try {
      output = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    } catch (err) {
      if (isS3NotFound(err)) throw new NotFoundException("Document not found");
      throw err;
    }

    const body = output.Body as Readable | undefined;
    // The SDK types Body as a union covering browser streams; under Node it is a Readable.
    if (!body || typeof body.pipe !== "function") {
      throw new NotFoundException("Document not found");
    }
    return { stream: body, contentLength: output.ContentLength ?? null };
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
