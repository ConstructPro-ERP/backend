import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor', () => {
  const interceptor = new ResponseInterceptor();

  it('preserves pagination metadata for valid paginated responses', async () => {
    const paginatedResponse = {
      items: [
        { id: 'project-1', projectName: 'Project A' },
        { id: 'project-2', projectName: 'Project B' },
      ],
      total: 25,
      page: 2,
      limit: 10,
      totalPages: 3,
    };

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          url: '/api/projects?page=2&limit=10',
        }),
        getResponse: () => ({
          statusCode: 200,
        }),
      }),
    } as unknown as ExecutionContext;

    const next: CallHandler = {
      handle: () => of(paginatedResponse),
    };

    const result: unknown = await lastValueFrom(
      interceptor.intercept(context, next),
    );

    expect(result).toMatchObject({
      success: true,
      statusCode: 200,
      path: '/api/projects?page=2&limit=10',
      data: paginatedResponse.items,
      meta: {
        total: 25,
        page: 2,
        limit: 10,
        totalPages: 3,
      },
    });
  });
});
