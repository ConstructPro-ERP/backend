import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { DocumentFileInterceptor } from '../../../document-service/src/interceptors/document-file.interceptor';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { isAxiosError, type AxiosResponse } from 'axios';
import type { Request } from 'express';
import { firstValueFrom, type Observable } from 'rxjs';
import { CreateDocumentCategoryDto } from '../../../document-service/src/dto/create-document-category.dto';
import { DocumentQueryDto } from '../../../document-service/src/dto/document-query.dto';
import { UpdateDocumentCategoryDto } from '../../../document-service/src/dto/update-document-category.dto';
import { UploadDocumentDto } from '../../../document-service/src/dto/upload-document.dto';
import {
  MAX_DOCUMENT_FILE_SIZE_BYTES,
  type UploadedDocumentFile,
} from '../../../document-service/src/validation/document-file.validator';
import { Roles } from '../decorators/roles.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

const DOCUMENT_READ_ROLES = [
  'ADMIN',
  'PROJECT_MANAGER',
  'ACCOUNTANT',
  'SALES_MANAGER',
];
const DOCUMENT_WRITE_ROLES = ['ADMIN', 'PROJECT_MANAGER'];

interface AuthenticatedRequest extends Request {
  user?: {
    id?: string;
    sub?: string;
  };
}

@ApiTags('Documents')
@ApiBearerAuth()
@ApiBadRequestResponse({ description: 'Invalid document request' })
@ApiUnauthorizedResponse({ description: 'Authentication is required' })
@ApiForbiddenResponse({ description: 'Insufficient document permissions' })
@ApiNotFoundResponse({ description: 'Project, document or category not found' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...DOCUMENT_READ_ROLES)
@Controller()
export class DocumentsGatewayController {
  constructor(private readonly httpService: HttpService) {}

  @Post('projects/:projectId/documents')
  @Roles(...DOCUMENT_WRITE_ROLES)
  @UseInterceptors(DocumentFileInterceptor)
  @ApiOperation({ summary: 'Upload a project document' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['categoryId', 'file'],
      properties: {
        categoryId: { type: 'string', format: 'uuid' },
        description: { type: 'string', maxLength: 1000 },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiCreatedResponse({ description: 'Document uploaded successfully' })
  @ApiConflictResponse({ description: 'Document upload conflict' })
  upload(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: UploadedDocumentFile | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!file) {
      throw new BadRequestException('A document file is required.');
    }

    const form = new FormData();

    form.append('categoryId', dto.categoryId);

    if (dto.description != null) {
      form.append('description', dto.description);
    }

    form.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], {
        type: file.mimetype,
      }),
      file.originalname,
    );

    return this.forward(() =>
      this.httpService.post<unknown>(
        this.url(`/projects/${projectId}/documents`),
        form,
        {
          headers: this.forwardHeaders(req),
          maxBodyLength: MAX_DOCUMENT_FILE_SIZE_BYTES + 65536,
          timeout: 60000,
        },
      ),
    );
  }

  @Get('projects/:projectId/documents')
  @ApiOperation({ summary: 'List project documents' })
  @ApiOkResponse({ description: 'Paginated project documents' })
  findAll(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: DocumentQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.get<unknown>(
        this.url(`/projects/${projectId}/documents`),
        {
          headers: this.forwardHeaders(req),
          params: query,
        },
      ),
    );
  }

  @Get('documents/:id/download')
  @ApiOperation({ summary: 'Generate a signed document download URL' })
  @ApiOkResponse({ description: 'Temporary authenticated download URL' })
  download(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.get<unknown>(this.url(`/documents/${id}/download`), {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Get('documents/:id')
  @ApiOperation({ summary: 'Get document metadata' })
  @ApiOkResponse({ description: 'Document metadata' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.get<unknown>(this.url(`/documents/${id}`), {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Delete('documents/:id')
  @Roles(...DOCUMENT_WRITE_ROLES)
  @ApiOperation({ summary: 'Delete a project document' })
  @ApiOkResponse({ description: 'Document deleted successfully' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.delete<unknown>(this.url(`/documents/${id}`), {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Post('document-categories')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create a document category' })
  @ApiCreatedResponse({ description: 'Category created successfully' })
  @ApiConflictResponse({ description: 'Category name already exists' })
  createCategory(
    @Body() dto: CreateDocumentCategoryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.post<unknown>(this.url('/document-categories'), dto, {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Get('document-categories')
  @ApiOperation({ summary: 'List document categories' })
  @ApiOkResponse({ description: 'Active document categories' })
  listCategories(@Req() req: AuthenticatedRequest) {
    return this.forward(() =>
      this.httpService.get<unknown>(this.url('/document-categories'), {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Patch('document-categories/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update a document category' })
  @ApiOkResponse({ description: 'Category updated successfully' })
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentCategoryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.patch<unknown>(
        this.url(`/document-categories/${id}`),
        dto,
        { headers: this.forwardHeaders(req) },
      ),
    );
  }

  @Delete('document-categories/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete or disable a document category' })
  @ApiOkResponse({ description: 'Category deleted or disabled' })
  removeCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.delete<unknown>(this.url(`/document-categories/${id}`), {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  private url(path: string): string {
    const base = process.env.DOCUMENT_SERVICE_URL ?? 'http://localhost:3006';

    return `${base.replace(/\/$/, '')}${path}`;
  }

  private forwardHeaders(req: AuthenticatedRequest) {
    const actorId = req.user?.id ?? req.user?.sub;

    return {
      authorization: req.headers.authorization,
      ...(actorId ? { 'x-user-id': actorId } : {}),
    };
  }

  private async forward(
    call: () => Observable<AxiosResponse<unknown>>,
  ): Promise<unknown> {
    try {
      return (await firstValueFrom(call())).data;
    } catch (error: unknown) {
      const downstream = isAxiosError<unknown>(error)
        ? error.response
        : undefined;

      if (downstream?.status) {
        const payload: unknown = downstream.data;

        if (typeof payload === 'string') {
          throw new HttpException(payload, downstream.status);
        }

        if (
          payload !== null &&
          typeof payload === 'object' &&
          !Array.isArray(payload)
        ) {
          throw new HttpException(
            payload as Record<string, unknown>,
            downstream.status,
          );
        }
      }

      throw new HttpException(
        {
          code: 'DOCUMENT_SERVICE_UNAVAILABLE',
          message: 'Document service is unreachable.',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
