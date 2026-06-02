import { describe, it, expect, vi, beforeEach } from 'vitest';
import { downloadDb, uploadDb } from './blob.js';

// Mock @azure/storage-blob
vi.mock('@azure/storage-blob', () => {
  const mockLeaseClient = {
    acquireLease: vi.fn().mockResolvedValue({ leaseId: 'lease-123' }),
    releaseLease: vi.fn().mockResolvedValue({}),
  };

  const mockBlockBlobClient = {
    downloadToFile: vi.fn().mockResolvedValue({}),
    uploadFile: vi.fn().mockResolvedValue({}),
    getBlobLeaseClient: vi.fn().mockReturnValue(mockLeaseClient),
    beginCopyFromURL: vi.fn().mockResolvedValue({ pollUntilDone: vi.fn().mockResolvedValue({}) }),
    url: 'https://account.blob.core.windows.net/container/wc26.sqlite',
    deleteIfExists: vi.fn().mockResolvedValue({}),
  };

  const mockContainerClient = {
    getBlockBlobClient: vi.fn().mockReturnValue(mockBlockBlobClient),
  };

  const mockBlobServiceClient = {
    getContainerClient: vi.fn().mockReturnValue(mockContainerClient),
  };

  return {
    BlobServiceClient: {
      fromConnectionString: vi.fn().mockReturnValue(mockBlobServiceClient),
    },
    __mockLeaseClient: mockLeaseClient,
    __mockBlockBlobClient: mockBlockBlobClient,
    __mockContainerClient: mockContainerClient,
  };
});

import { BlobServiceClient, __mockLeaseClient, __mockBlockBlobClient } from '@azure/storage-blob';

describe('storage/blob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('downloads the DB file with a lease acquired', async () => {
    const result = await downloadDb({
      connectionString: 'DefaultEndpointsProtocol=https;AccountName=test',
      containerName: 'wc26',
      blobName: 'wc26.sqlite',
      localPath: '/tmp/wc26.sqlite',
    });

    expect(__mockLeaseClient.acquireLease).toHaveBeenCalledWith(60);
    expect(__mockBlockBlobClient.downloadToFile).toHaveBeenCalledWith('/tmp/wc26.sqlite');
    expect(result.leaseId).toBe('lease-123');
  });

  it('uploads the DB atomically (temp blob + copy) then releases lease', async () => {
    await uploadDb({
      connectionString: 'DefaultEndpointsProtocol=https;AccountName=test',
      containerName: 'wc26',
      blobName: 'wc26.sqlite',
      localPath: '/tmp/wc26.sqlite',
      leaseId: 'lease-123',
    });

    // Should upload to a temp blob first
    expect(__mockBlockBlobClient.uploadFile).toHaveBeenCalledWith('/tmp/wc26.sqlite');
    // Should copy from temp to final
    expect(__mockBlockBlobClient.beginCopyFromURL).toHaveBeenCalled();
    // Should release lease
    expect(__mockLeaseClient.releaseLease).toHaveBeenCalled();
  });

  it('releases lease even if upload fails', async () => {
    __mockBlockBlobClient.uploadFile.mockRejectedValueOnce(new Error('Upload failed'));

    await expect(
      uploadDb({
        connectionString: 'DefaultEndpointsProtocol=https;AccountName=test',
        containerName: 'wc26',
        blobName: 'wc26.sqlite',
        localPath: '/tmp/wc26.sqlite',
        leaseId: 'lease-123',
      })
    ).rejects.toThrow('Upload failed');

    // Lease should still be released
    expect(__mockLeaseClient.releaseLease).toHaveBeenCalled();
  });

  it('fails fast if lease cannot be acquired', async () => {
    __mockLeaseClient.acquireLease.mockRejectedValueOnce(new Error('Lease already held'));

    await expect(
      downloadDb({
        connectionString: 'DefaultEndpointsProtocol=https;AccountName=test',
        containerName: 'wc26',
        blobName: 'wc26.sqlite',
        localPath: '/tmp/wc26.sqlite',
      })
    ).rejects.toThrow('Lease already held');

    // Should NOT attempt download
    expect(__mockBlockBlobClient.downloadToFile).not.toHaveBeenCalled();
  });
});
