import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import * as fs from "fs";
import * as path from "path";
import { Readable } from "stream";
import { EPHEMERAL_UPLOAD_ROOT, hasEphemeralFilesystem } from "../config/storage-guard";
import { currentRequestContext } from "../common/logging/request-context";
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

/**
 * Where the local driver writes.
 *
 * The two questions this used to ask `process.env.VERCEL` are now one question asked of
 * `hasEphemeralFilesystem()`, which an operator can answer for any host. The behaviour is
 * unchanged on Vercel, deliberately: previews resolve to staging rather than production and still
 * upload through this driver, so the redirect had to survive the decoupling rather than be dropped
 * along with the vendor check.
 *
 * An absolute configured path is honoured even on an ephemeral filesystem. Naming `/mnt/…` or
 * `/tmp/…` outright is an operator saying where the bytes go, and second-guessing that would be
 * this function deciding it knows the host better than the person who configured it.
 */
function resolveLocalRoot(config: ConfigService, env: NodeJS.ProcessEnv = process.env): string {
  const configured =
    config.get<string>("STORAGE_LOCAL_PATH")?.trim() || config.get<string>("UPLOAD_DIR")?.trim();
  const ephemeral = hasEphemeralFilesystem(env);
  if (configured) {
    // A relative path such as ./uploads resolves under the deployment bundle, which on an ephemeral
    // filesystem is either read-only or discarded with the process.
    if (ephemeral && !path.isAbsolute(configured)) return EPHEMERAL_UPLOAD_ROOT;
    return path.resolve(configured);
  }
  return ephemeral ? EPHEMERAL_UPLOAD_ROOT : path.resolve("./uploads");
}

/** S3 answers a missing key with NoSuchKey, and a missing key under a HEAD-style call with 404. */
function isS3NotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
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

    // Same requirement getS3() enforces, checked before a request depends on it.
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

  /**
   * Runs one driver call and turns anything the driver throws into a 502 (E3-S2 criterion 6).
   *
   * Before this, an S3 outage, a DNS failure, an expired credential and a full disk all arrived at
   * `HttpExceptionFilter` as bare `Error`s and left as `500 INTERNAL_ERROR`, which reads as a bug in
   * this application. They are not: they are a dependency being unavailable, and 502 is the status
   * that says so. The practical difference is what happens next, because a caller who is told 500
   * files a bug and a caller who is told 502 with a correlation id gets an operator looking at the
   * bucket.
   *
   * `HttpException`s pass through untouched. A `NotFoundException` from a missing key is this
   * service answering correctly and must stay a 404, not become an outage.
   *
   * The correlation id is not put in the message. `HttpExceptionFilter` already writes it into every
   * error body and the response header, so a second copy could only ever disagree with the first;
   * what is added here is the same id on the log line that holds the underlying error, which is the
   * end of the thread the caller is quoting.
   */
  private async throughDriver<T>(
    operation: string,
    key: string,
    run: () => Promise<T>,
  ): Promise<T> {
    try {
      return await run();
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw this.storageUnavailable(operation, key, err);
    }
  }

  /**
   * The 502, with the detail logged and withheld from the response.
   *
   * The caller is told that storage is unavailable and nothing else. An S3 error message names the
   * bucket, and often the endpoint and the key, and this exception is raised on paths that
   * unauthenticated callers can reach.
   */
  private storageUnavailable(operation: string, key: string, cause: unknown): BadGatewayException {
    const correlationId = currentRequestContext()?.correlationId;
    const tail = correlationId ? ` (correlationId ${correlationId})` : "";
    const detail = cause instanceof Error ? cause.message : String(cause);
    this.logger.error(
      `storage ${operation} failed on the ${this.driver} driver for key ${key}${tail}: ${detail}`,
      cause instanceof Error ? cause.stack : undefined,
    );
    return new BadGatewayException("Document storage is currently unavailable", { cause });
  }

  /**
   * Encryption at rest for every object written (E3-S2 criterion 3, the half that is code).
   *
   * The other half of that criterion is object versioning, which is bucket configuration and cannot
   * be set by a client on its own writes. It stays open against EXT-2 rather than being ticked here.
   *
   * `AES256` is the default because it is the mode every S3 implementation supports, including the
   * S3-compatible endpoints a Nigerian region is likely to mean. `AWS_S3_SSE=aws:kms` with
   * `AWS_S3_SSE_KMS_KEY_ID` selects a managed key instead. `AWS_S3_SSE=none` sends no header at all,
   * for a provider that rejects it, and is a deliberate decision with a consequence rather than a
   * setting to reach for. Any other value falls back to `AES256`: the safe direction for a typo in
   * an encryption setting is encrypted.
   */
  private encryptionSettings(): Pick<
    PutObjectCommandInput,
    "ServerSideEncryption" | "SSEKMSKeyId"
  > {
    const mode = (this.config.get<string>("AWS_S3_SSE") ?? "AES256").trim().toLowerCase();
    if (mode === "none" || mode === "") return {};
    if (mode === "aws:kms") {
      const keyId = this.config.get<string>("AWS_S3_SSE_KMS_KEY_ID")?.trim();
      return { ServerSideEncryption: "aws:kms", ...(keyId ? { SSEKMSKeyId: keyId } : {}) };
    }
    return { ServerSideEncryption: "AES256" };
  }

  private normalizeKey(key: string): string {
    const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.includes("..")) {
      throw new BadRequestException("Invalid storage key");
    }
    return normalized;
  }

  private async uploadLocal(buffer: Buffer, key: string): Promise<void> {
    await this.throughDriver("upload", key, async () => {
      const abs = path.join(this.localRoot, key);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      await fs.promises.writeFile(abs, buffer);
    });
  }

  private async readObjectLocal(key: string): Promise<StoredObject> {
    return this.throughDriver("read", key, () => this.readObjectLocalUnwrapped(key));
  }

  private async readObjectLocalUnwrapped(key: string): Promise<StoredObject> {
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

    // A missing key is a 404 and everything else is the bucket being unreachable, which
    // throughDriver turns into a 502. Nothing reaches the caller as a bare 500 any more.
    const output = await this.throughDriver("read", key, async () => {
      try {
        return await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      } catch (err) {
        if (isS3NotFound(err)) throw new NotFoundException("Document not found");
        throw err;
      }
    });

    const body = output.Body as Readable | undefined;
    // The SDK types Body as a union covering browser streams; under Node it is a Readable.
    if (!body || typeof body.pipe !== "function") {
      throw new NotFoundException("Document not found");
    }
    return { stream: body, contentLength: output.ContentLength ?? null };
  }

  private async deleteLocal(key: string): Promise<void> {
    await this.throughDriver("delete", key, async () => {
      const abs = path.join(this.localRoot, key);
      try {
        await fs.promises.unlink(abs);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
    });
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
      // Was a 400 naming both variables, which blamed the caller for a server misconfiguration and
      // told an unauthenticated one what this deployment is missing. `assertStorageConfigured()`
      // now refuses to boot a production instance in this state, so reaching here at all means a
      // development or staging box configured halfway, and 502 is what that is.
      throw this.storageUnavailable(
        "configure",
        "-",
        new Error("S3 storage requires AWS_REGION and AWS_S3_BUCKET"),
      );
    }

    this.s3Bucket = bucket;
    this.s3Client = new S3Client({
      region,
      endpoint: endpoint || undefined,
      credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
      forcePathStyle: Boolean(endpoint),
    });

    return { client: this.s3Client, bucket: this.s3Bucket };
  }

  private async uploadS3(buffer: Buffer, key: string, mimeType: string): Promise<void> {
    const { client, bucket } = this.getS3();
    await this.throughDriver("upload", key, () =>
      client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
          ...this.encryptionSettings(),
        }),
      ),
    );
  }

  private async getSignedUrlS3(key: string, expiresInSeconds: number): Promise<string> {
    const { client, bucket } = this.getS3();
    return this.throughDriver("sign", key, () =>
      getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn: expiresInSeconds,
      }),
    );
  }

  private async deleteS3(key: string): Promise<void> {
    const { client, bucket } = this.getS3();
    await this.throughDriver("delete", key, () =>
      client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })),
    );
  }
}
