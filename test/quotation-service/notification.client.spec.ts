import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { NotificationClient } from '../../apps/quotation-service/src/notification.client';

describe('Quotation NotificationClient', () => {
  let warnSpy: jest.SpyInstance;
  const post = jest.fn();
  const originalUrl = process.env.NOTIFICATION_SERVICE_URL;

  beforeEach(() => {
    jest.resetAllMocks();
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalUrl === undefined) delete process.env.NOTIFICATION_SERVICE_URL;
    else process.env.NOTIFICATION_SERVICE_URL = originalUrl;
  });

  it.each([undefined, 'http://notifications.test'])(
    'sends the conversion notification using URL %s',
    async (url) => {
      if (url === undefined) delete process.env.NOTIFICATION_SERVICE_URL;
      else process.env.NOTIFICATION_SERVICE_URL = url;
      post.mockReturnValue(of({ data: {} }));
      const client = new NotificationClient({ post } as unknown as HttpService);
      await expect(
        client.notifyProjectCreated('q-1', 'p-1'),
      ).resolves.toBeUndefined();
      expect(post).toHaveBeenCalledWith(
        `${url ?? 'http://localhost:3011'}/notifications/project-created`,
        { quotationId: 'q-1', projectId: 'p-1' },
        { timeout: 10000 },
      );
      expect(warnSpy).not.toHaveBeenCalled();
    },
  );

  it.each([new Error('offline'), 'upstream unavailable'])(
    'logs notification failure without failing conversion: %s',
    async (error) => {
      post.mockReturnValue(throwError(() => error));
      const client = new NotificationClient({ post } as unknown as HttpService);
      await expect(
        client.notifyProjectCreated('q-1', 'p-1'),
      ).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        `Notification failed for project p-1 (quotation q-1): ${error instanceof Error ? error.message : error}`,
      );
    },
  );
});
