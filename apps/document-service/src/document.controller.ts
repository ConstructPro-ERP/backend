import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
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
import { DocumentFileInterceptor } from './interceptors/document-file.interceptor';
import { DocumentService } from './document.service';
import { CreateDocumentCategoryDto } from './dto/create-document-category.dto';
import { DocumentQueryDto } from './dto/document-query.dto';
import { UpdateDocumentCategoryDto } from './dto/update-document-category.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { type UploadedDocumentFile } from './validation/document-file.validator';

@ApiTags('Documents')
@ApiBadRequestResponse({ description: 'Invalid document request' })
@ApiUnauthorizedResponse({ description: 'Authentication is required' })
@ApiForbiddenResponse({ description: 'Insufficient project permissions' })
@ApiNotFoundResponse({ description: 'Project, document or category not found' })
@Controller()
export class DocumentController {
  constructor(private readonly documents: DocumentService) {}

  @Post('projects/:projectId/documents')
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
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.documents.upload(projectId, dto, file, actorId);
  }

  @Get('projects/:projectId/documents')
  @ApiOperation({ summary: 'List project documents' })
  @ApiOkResponse({ description: 'Paginated project documents' })
  findAll(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: DocumentQueryDto,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.documents.findAll(projectId, query, actorId);
  }

  @Get('documents/:id')
  @ApiOperation({ summary: 'Get document metadata' })
  @ApiOkResponse({ description: 'Document metadata' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.documents.findOne(id, actorId);
  }

  @Get('documents/:id/download')
  @ApiOperation({ summary: 'Generate a signed document download URL' })
  @ApiOkResponse({ description: 'Temporary authenticated download URL' })
  download(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.documents.download(id, actorId);
  }

  @Get('client-portal/documents/:id/download')
  @ApiOperation({
    summary: 'Generate a signed download URL for an owned client document',
  })
  @ApiOkResponse({
    description: 'Temporary authenticated download URL',
  })
  downloadForClient(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.documents.downloadForClient(id, actorId);
  }

  @Delete('documents/:id')
  @ApiOperation({ summary: 'Delete a project document' })
  @ApiOkResponse({ description: 'Document deleted successfully' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.documents.remove(id, actorId);
  }

  @Post('document-categories')
  @ApiOperation({ summary: 'Create a document category' })
  @ApiCreatedResponse({ description: 'Category created successfully' })
  @ApiConflictResponse({ description: 'Category name already exists' })
  createCategory(
    @Body() dto: CreateDocumentCategoryDto,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.documents.createCategory(dto, actorId);
  }

  @Get('document-categories')
  @ApiOperation({ summary: 'List active document categories' })
  @ApiOkResponse({ description: 'Active document categories' })
  listCategories(@Headers('x-user-id') actorId?: string) {
    return this.documents.listCategories(actorId);
  }

  @Patch('document-categories/:id')
  @ApiOperation({ summary: 'Update a document category' })
  @ApiOkResponse({ description: 'Category updated successfully' })
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentCategoryDto,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.documents.updateCategory(id, dto, actorId);
  }

  @Delete('document-categories/:id')
  @ApiOperation({ summary: 'Delete or disable a document category' })
  @ApiOkResponse({ description: 'Category deleted or disabled' })
  removeCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.documents.deleteCategory(id, actorId);
  }
}
