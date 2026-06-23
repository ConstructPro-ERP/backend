import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RagReindexPathDto, RagRetrievalResponseDto, RagRetrieveQueryDto, RagIndexingSummaryDto } from './dto/rag.dto';
import { RagService } from './rag.service';

@ApiTags('RAG')
@ApiBearerAuth()
@Controller('analytics/ai-forecasting/rag')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Post('projects/:projectId/reindex')
  @ApiOperation({ summary: 'Build or refresh RAG chunks for a project' })
  @ApiOkResponse({ type: RagIndexingSummaryDto })
  reindex(@Param() params: RagReindexPathDto) {
    return this.ragService.reindexProject(params.projectId);
  }

  @Get('projects/:projectId/chunks')
  @ApiOperation({ summary: 'Retrieve the most relevant RAG chunks for a project' })
  @ApiOkResponse({ type: RagRetrievalResponseDto })
  retrieve(
    @Param() params: RagReindexPathDto,
    @Query() query: RagRetrieveQueryDto,
  ) {
    return this.ragService.retrieveProjectContext(
      params.projectId,
      query.query,
      query.topK,
    );
  }
}
