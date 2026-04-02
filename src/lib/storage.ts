import "server-only";

import { createHash } from "crypto";
import { mkdir, readFile, rm, stat, writeFile } from "fs/promises";
import path from "path";

export type PutObjectInput = {
  key: string;
  body: Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
};

export type PutObjectResult = {
  key: string;
  sizeBytes: number;
  checksumSha256: string;
};

export type GetObjectInput = {
  key: string;
};

export type GetObjectResult = {
  key: string;
  body: Buffer;
  sizeBytes: number;
  contentType?: string;
  metadata?: Record<string, string>;
};

export type DeleteObjectInput = {
  key: string;
};

export type SignedDownloadUrlInput = {
  key: string;
  expiresInSeconds?: number;
};

export interface StorageProvider {
  putObject(input: PutObjectInput): Promise<PutObjectResult>;
  getObject(input: GetObjectInput): Promise<GetObjectResult>;
  deleteObject(input: DeleteObjectInput): Promise<void>;
  getSignedDownloadUrl(input: SignedDownloadUrlInput): Promise<string>;
}

type LocalObjectMeta = {
  contentType?: string;
  metadata?: Record<string, string>;
};

function normalizeStorageKey(key: string) {
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!normalized) {
    throw new Error("Storage key must not be empty.");
  }
  if (normalized.includes("..")) {
    throw new Error("Storage key cannot contain path traversal segments.");
  }
  return normalized;
}

function checksumSha256(body: Buffer) {
  return createHash("sha256").update(body).digest("hex");
}

export class LocalFileStorageProvider implements StorageProvider {
  private readonly rootDir: string;

  constructor(rootDir = path.join(process.cwd(), ".local-storage")) {
    this.rootDir = rootDir;
  }

  private objectPath(key: string) {
    return path.join(this.rootDir, normalizeStorageKey(key));
  }

  private metaPath(key: string) {
    return `${this.objectPath(key)}.meta.json`;
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const key = normalizeStorageKey(input.key);
    const objectPath = this.objectPath(key);
    const metaPath = this.metaPath(key);

    await mkdir(path.dirname(objectPath), { recursive: true });
    await writeFile(objectPath, input.body);

    const meta: LocalObjectMeta = {
      contentType: input.contentType,
      metadata: input.metadata,
    };
    await writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");

    return {
      key,
      sizeBytes: input.body.byteLength,
      checksumSha256: checksumSha256(input.body),
    };
  }

  async getObject(input: GetObjectInput): Promise<GetObjectResult> {
    const key = normalizeStorageKey(input.key);
    const objectPath = this.objectPath(key);
    const metaPath = this.metaPath(key);

    const [body, objectStat] = await Promise.all([readFile(objectPath), stat(objectPath)]);

    let parsedMeta: LocalObjectMeta | undefined;
    try {
      parsedMeta = JSON.parse(await readFile(metaPath, "utf8")) as LocalObjectMeta;
    } catch {
      parsedMeta = undefined;
    }

    return {
      key,
      body,
      sizeBytes: objectStat.size,
      contentType: parsedMeta?.contentType,
      metadata: parsedMeta?.metadata,
    };
  }

  async deleteObject(input: DeleteObjectInput): Promise<void> {
    const key = normalizeStorageKey(input.key);
    await Promise.all([
      rm(this.objectPath(key), { force: true }),
      rm(this.metaPath(key), { force: true }),
    ]);
  }

  async getSignedDownloadUrl(input: SignedDownloadUrlInput): Promise<string> {
    const key = normalizeStorageKey(input.key);
    const expires = input.expiresInSeconds ?? 3600;

    // Placeholder for S3/Supabase pre-signed URLs. For local dev, return a descriptive URL-like locator.
    return `local-file://${this.objectPath(key)}?expiresInSeconds=${expires}`;
  }
}

// Singleton storage client for backend usage.
export const storage: StorageProvider = new LocalFileStorageProvider();

// Key conventions keep source uploads, derived versions, and exports separated.
export const storageKeys = {
  originalUpload(projectId: string, filename: string) {
    const safeName = filename.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "");
    return `projects/${projectId}/originals/${Date.now()}-${safeName}`;
  },
  documentVersionArtifact(params: {
    projectId: string;
    documentId: string;
    versionNumber: number;
    extension: "docx" | "json" | "txt";
  }) {
    return `projects/${params.projectId}/documents/${params.documentId}/versions/v${params.versionNumber}.${params.extension}`;
  },
  exportArtifact(params: {
    projectId: string;
    documentId: string;
    exportJobId: string;
    extension: "docx" | "pdf" | "txt";
  }) {
    return `projects/${params.projectId}/documents/${params.documentId}/exports/${params.exportJobId}.${params.extension}`;
  },
  compiledArtifact(params: {
    projectId: string;
    timestamp: number;
    extension: "docx";
  }) {
    return `projects/${params.projectId}/compiled/${params.timestamp}.${params.extension}`;
  },
};
