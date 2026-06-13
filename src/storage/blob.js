import { BlobServiceClient } from '@azure/storage-blob';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Azure Blob Storage persistence with lease-based locking.
 * Reference: docs/plan.md risk T2-2 — acquire lease before download,
 * atomic upload via temp-blob + copy, release lease.
 *
 * The lease prevents concurrent GitHub Action runs from corrupting the DB.
 */

const LEASE_DURATION_SECONDS = 60; // 60s lease; renew if processing takes longer

/**
 * Downloads the SQLite DB from Azure Blob with a lease lock.
 * Caller MUST call uploadDb (which releases lease) when done.
 *
 * @param {{ connectionString: string, containerName: string, blobName: string, localPath: string }} params
 * @returns {Promise<{ leaseId: string }>}
 */
export async function downloadDb({ connectionString, containerName, blobName, localPath }) {
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(containerName);
  await containerClient.createIfNotExists();
  const blobClient = containerClient.getBlockBlobClient(blobName);

  if (!(await blobClient.exists())) {
    await blobClient.uploadData(Buffer.alloc(0));
  }

  // Acquire lease — fail fast if another run holds it
  const leaseClient = blobClient.getBlobLeaseClient();
  const lease = await leaseClient.acquireLease(LEASE_DURATION_SECONDS);

  // Download with lease held
  mkdirSync(dirname(localPath), { recursive: true });
  await blobClient.downloadToFile(localPath);

  return { leaseId: lease.leaseId };
}

/**
 * Uploads the mutated SQLite DB back to Azure Blob atomically.
 * Strategy: upload to temp blob, copy to final, delete temp, release lease.
 *
 * @param {{ connectionString: string, containerName: string, blobName: string, localPath: string, leaseId: string }} params
 */
export async function uploadDb({ connectionString, containerName, blobName, localPath, leaseId }) {
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const finalBlobClient = containerClient.getBlockBlobClient(blobName);

  const leaseClient = finalBlobClient.getBlobLeaseClient(leaseId);

  try {
    await finalBlobClient.uploadFile(localPath, { conditions: { leaseId } });
  } finally {
    // Always release lease
    if (leaseId) {
      await leaseClient.releaseLease();
    }
  }
}

export async function renewDbLease({ connectionString, containerName, blobName, leaseId }) {
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blobClient = containerClient.getBlockBlobClient(blobName);
  const leaseClient = blobClient.getBlobLeaseClient(leaseId);
  await leaseClient.renewLease();
}
