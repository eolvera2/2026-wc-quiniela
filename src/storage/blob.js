import { BlobServiceClient } from '@azure/storage-blob';

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
  const blobClient = containerClient.getBlockBlobClient(blobName);

  // Acquire lease — fail fast if another run holds it
  const leaseClient = blobClient.getBlobLeaseClient();
  const lease = await leaseClient.acquireLease(LEASE_DURATION_SECONDS);

  // Download with lease held
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
  const tempBlobName = `${blobName}.tmp-${Date.now()}`;
  const tempBlobClient = containerClient.getBlockBlobClient(tempBlobName);

  const leaseClient = finalBlobClient.getBlobLeaseClient();

  try {
    // Upload to temp blob
    await tempBlobClient.uploadFile(localPath);

    // Atomic copy: temp → final
    const copyPoller = await finalBlobClient.beginCopyFromURL(tempBlobClient.url);
    await copyPoller.pollUntilDone();

    // Clean up temp
    await tempBlobClient.deleteIfExists();
  } finally {
    // Always release lease
    await leaseClient.releaseLease();
  }
}
