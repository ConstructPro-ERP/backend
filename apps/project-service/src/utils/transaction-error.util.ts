import { Prisma } from '@prisma/client';

const SERIALIZATION_FAILURE_CODE = '40001';
export const MAX_TRANSACTION_ATTEMPTS = 4;

/**
 * Checks whether a value is a non-null object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Identifies PostgreSQL serialization failures exposed
 * through Prisma or its database driver.
 */
function isSerializationConflict(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.originalCode === SERIALIZATION_FAILURE_CODE ||
    value.code === SERIALIZATION_FAILURE_CODE ||
    value.kind === 'TransactionWriteConflict'
  );
}

/**
 * Determines whether a failed transaction can safely be retried.
 *
 * Handles:
 * - Prisma P2034 transaction conflicts
 * - Prisma P2010 errors containing SQLSTATE 40001
 * - Unwrapped Neon driver adapter serialization failures
 *
 * Other errors are not considered retryable.
 */
export function isRetryableTransactionError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2034') {
      return true;
    }

    if (error.code !== 'P2010') {
      return false;
    }

    const meta = error.meta;

    if (!isRecord(meta)) {
      return false;
    }

    if (isSerializationConflict(meta)) {
      return true;
    }

    const adapterError = meta.driverAdapterError;

    return (
      isRecord(adapterError) && isSerializationConflict(adapterError.cause)
    );
  }

  // Neon may throw DriverAdapterError directly, including
  // when an interactive transaction fails during commit.
  return isRecord(error) && isSerializationConflict(error.cause);
}

/**
 * Waits before retrying a failed transaction.
 *
 * Uses exponential backoff with random jitter to reduce
 * repeated collisions between concurrent transactions.
 */
export async function waitBeforeTransactionRetry(
  attempt: number,
): Promise<void> {
  const BASE_DELAY_MS = 500;
  const MAX_DELAY_MS = 10000;
  const MAX_JITTER_MS = 2500;

  const backoffMs = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 3 ** (attempt - 1));

  const jitterMs = Math.floor(Math.random() * MAX_JITTER_MS);

  await new Promise<void>((resolve) => {
    setTimeout(resolve, backoffMs + jitterMs);
  });
}
