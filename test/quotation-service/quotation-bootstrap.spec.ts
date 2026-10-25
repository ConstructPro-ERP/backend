import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { bootstrap } from '../../apps/quotation-service/src/main';
import { QuotationModule } from '../../apps/quotation-service/src/quotation.module';
import { HttpExceptionFilter } from '../../apps/quotation-service/src/filters/http-exception.filter';

describe('Quotation service bootstrap', () => {
  let createSpy: jest.SpyInstance;
  const originalPort = process.env.PORT;
  const app = {
    useGlobalPipes: jest.fn<void, [ValidationPipe]>(),
    useGlobalFilters: jest.fn(),
    enableCors: jest.fn(),
    listen: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    createSpy = jest
      .spyOn(NestFactory, 'create')
      .mockResolvedValue(app as unknown as INestApplication);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalPort === undefined) delete process.env.PORT;
    else process.env.PORT = originalPort;
  });

  it.each([undefined, '4019'])(
    'starts with port configuration %s and global request protections',
    async (port) => {
      if (port === undefined) delete process.env.PORT;
      else process.env.PORT = port;
      await bootstrap();
      expect(createSpy).toHaveBeenCalledWith(QuotationModule);
      expect(app.listen).toHaveBeenCalledWith(port === undefined ? 4009 : 4019);
      expect(app.useGlobalPipes).toHaveBeenCalledWith(
        expect.any(ValidationPipe),
      );
      const pipe = app.useGlobalPipes.mock.calls[0][0];
      await expect(
        pipe.transform(
          { unexpected: 'field' },
          { type: 'body', metatype: class EmptyDto {} },
        ),
      ).rejects.toThrow();
      expect(app.useGlobalFilters).toHaveBeenCalledWith(
        expect.any(HttpExceptionFilter),
      );
      expect(app.enableCors).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects an invalid configured port before listening', async () => {
    process.env.PORT = 'invalid';
    await expect(bootstrap()).rejects.toThrow('Invalid PORT: invalid');
    expect(app.listen).not.toHaveBeenCalled();
  });

  it('propagates startup failures', async () => {
    delete process.env.PORT;
    app.listen.mockRejectedValue(new Error('port in use'));
    await expect(bootstrap()).rejects.toThrow('port in use');
    expect(console.log).not.toHaveBeenCalled();
  });
});
