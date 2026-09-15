import { BadGatewayException, HttpException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { ProjectClient } from '../../apps/quotation-service/src/project.client';

const mockHttpService = {
  post: jest.fn(),
};

describe('ProjectClient', () => {
  let client: ProjectClient;

  const originalProjectServiceUrl = process.env.PROJECT_SERVICE_URL;
  const originalProjectServiceStub = process.env.PROJECT_SERVICE_STUB;

  beforeEach(async () => {
    jest.clearAllMocks();

    process.env.PROJECT_SERVICE_URL = 'http://project-service.test';
    process.env.PROJECT_SERVICE_STUB = 'false';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectClient,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
      ],
    }).compile();

    client = module.get<ProjectClient>(ProjectClient);
  });

  afterAll(() => {
    if (originalProjectServiceUrl === undefined) {
      delete process.env.PROJECT_SERVICE_URL;
    } else {
      process.env.PROJECT_SERVICE_URL = originalProjectServiceUrl;
    }

    if (originalProjectServiceStub === undefined) {
      delete process.env.PROJECT_SERVICE_STUB;
    } else {
      process.env.PROJECT_SERVICE_STUB = originalProjectServiceStub;
    }
  });

  it('forwards the quotation conversion payload to project-service', async () => {
    const payload = {
      quotationId: 'quotation-1',
      leadId: 'lead-1',
      targetProjectId: 'project-1',
    };

    mockHttpService.post.mockReturnValue(
      of({
        data: {
          projectId: 'project-1',
          status: 'ACTIVE',
        },
      }),
    );

    const result = await client.createFromQuotation(payload);

    expect(mockHttpService.post).toHaveBeenCalledWith(
      'http://project-service.test/projects/from-quotation',
      payload,
    );

    expect(result).toEqual({
      projectId: 'project-1',
      status: 'ACTIVE',
    });
  });

  it('preserves domain errors returned by project-service', async () => {
    mockHttpService.post.mockReturnValue(
      throwError(() => ({
        response: {
          status: 404,
          data: {
            code: 'PROJECT_NOT_FOUND',
            message: 'Target project not found.',
          },
        },
      })),
    );

    let caughtError: unknown;

    try {
      await client.createFromQuotation({
        quotationId: 'quotation-1',
        leadId: 'lead-1',
        targetProjectId: 'project-1',
      });
    } catch (error: unknown) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(HttpException);

    const httpError = caughtError as HttpException;

    expect(httpError.getStatus()).toBe(404);
    expect(httpError.getResponse()).toMatchObject({
      code: 'PROJECT_NOT_FOUND',
      message: 'Target project not found.',
    });
  });

  it('throws BadGatewayException when project-service fails', async () => {
    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    try {
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('service unavailable')),
      );

      await expect(
        client.createFromQuotation({
          quotationId: 'quotation-1',
          leadId: 'lead-1',
          targetProjectId: 'project-1',
        }),
      ).rejects.toBeInstanceOf(BadGatewayException);
    } finally {
      loggerSpy.mockRestore();
    }
  });
});
