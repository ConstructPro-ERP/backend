import { Injectable, BadGatewayException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface CreateProjectResponse {
  projectId: string;
  status: string;
}

/**
 * TEMPORARY STUB: When PROJECT_SERVICE_STUB=true, returns a fake projectId
 * without calling the real project service. Remove once project-service is live.
 */
@Injectable()
export class ProjectClient {
  private readonly logger = new Logger(ProjectClient.name);
  private readonly baseUrl =
    process.env.PROJECT_SERVICE_URL ?? 'http://localhost:3007';
  private readonly useStub = process.env.PROJECT_SERVICE_STUB === 'true';

  constructor(private readonly httpService: HttpService) {}

  async createFromQuotation(
    quotationId: string,
    leadId: string,
    budget: number,
  ): Promise<CreateProjectResponse> {
    if (this.useStub) {
      this.logger.warn(
        `[STUB] PROJECT_SERVICE_STUB=true — returning fake projectId for quotation ${quotationId}`,
      );
      return { projectId: `stub-project-${quotationId}`, status: 'PLANNING' };
    }

    try {
      const resp = await firstValueFrom(
        this.httpService.post<CreateProjectResponse>(
          `${this.baseUrl}/projects/from-quotation`,
          { quotationId, leadId, budget },
        ),
      );
      return resp.data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Project service call failed for quotation ${quotationId}: ${msg}`,
      );
      throw new BadGatewayException({
        code: 'PROJECT_SERVICE_UNAVAILABLE',
        message: 'Project service could not create the project.',
      });
    }
  }
}
