import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import type {
  CreateProjectFromQuotationPayload,
  CreateProjectFromQuotationResponse,
} from '../../../libs/contracts/src/payloads/project.payload';

interface DownstreamProjectError {
  code?: string;
  message?: string;
  details?: unknown;
}

interface AxiosErrorShape {
  response?: {
    status?: number;
    data?: DownstreamProjectError;
  };
}

/**
 * TEMPORARY STUB: When PROJECT_SERVICE_STUB=true, returns a fake projectId
 * without calling the real project service. Remove once project-service is live.
 */
@Injectable()
export class ProjectClient {
  private readonly logger = new Logger(ProjectClient.name);
  private readonly baseUrl =
    process.env.PROJECT_SERVICE_URL ?? 'http://localhost:3003';
  private readonly useStub = process.env.PROJECT_SERVICE_STUB === 'true';

  constructor(private readonly httpService: HttpService) {}

  async createFromQuotation(
    payload: CreateProjectFromQuotationPayload,
  ): Promise<CreateProjectFromQuotationResponse> {
    if (this.useStub) {
      this.logger.warn(
        `[STUB] PROJECT_SERVICE_STUB=true — returning fake projectId for quotation ${payload.quotationId}`,
      );

      return {
        projectId:
          payload.targetProjectId ?? `stub-project-${payload.quotationId}`,
        status: 'ACTIVE',
      };
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post<CreateProjectFromQuotationResponse>(
          `${this.baseUrl}/projects/from-quotation`,
          payload,
        ),
      );

      return response.data;
    } catch (err: unknown) {
      const axiosError = err as AxiosErrorShape;
      const status = axiosError.response?.status;
      const downstream = axiosError.response?.data;

      if (status && downstream) {
        throw new HttpException(
          {
            code: downstream.code ?? 'PROJECT_SERVICE_ERROR',
            message:
              downstream.message ??
              'Project service rejected the quotation conversion.',
            details: downstream.details,
          },
          status,
        );
      }

      const message = err instanceof Error ? err.message : String(err);

      this.logger.error(
        `Project service call failed for quotation ${payload.quotationId}: ${message}`,
      );

      throw new BadGatewayException({
        code: 'PROJECT_SERVICE_UNAVAILABLE',
        message: 'Project service could not process the quotation conversion.',
      });
    }
  }
}
