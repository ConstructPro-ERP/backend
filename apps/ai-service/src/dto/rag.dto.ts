import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AiKnowledgeSourceType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class RagReindexPathDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  projectId!: string;
}

export class RagRetrieveQueryDto {
  @ApiPropertyOptional({
    description: 'Optional retrieval query; if omitted a project-risk default query is used.',
  })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  topK?: number;
}

export class RagChunkDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: AiKnowledgeSourceType }) sourceType!: AiKnowledgeSourceType;
  @ApiProperty() sourceId!: string;
  @ApiProperty() projectId!: string;
  @ApiProperty() chunkText!: string;
  @ApiPropertyOptional({ nullable: true }) similarityScore!: number | null;
  @ApiPropertyOptional({ nullable: true }) embeddingModel!: string | null;
  @ApiPropertyOptional({ nullable: true }) embeddingDim!: number | null;
  @ApiPropertyOptional({ type: Object, nullable: true }) metadata!: Record<string, unknown> | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class RagIndexingSummaryDto {
  @ApiProperty() projectId!: string;
  @ApiProperty() projectName!: string;
  @ApiProperty() totalChunks!: number;
  @ApiProperty() projectChunks!: number;
  @ApiProperty() milestoneChunks!: number;
  @ApiProperty() invoiceChunks!: number;
  @ApiProperty() paymentChunks!: number;
  @ApiProperty() expenseChunks!: number;
  @ApiProperty() embeddingsGenerated!: number;
  @ApiProperty() usedProviderEmbeddings!: boolean;
  @ApiProperty({ type: [String] }) warnings!: string[];
  @ApiProperty({ type: [String] }) futureAdaptations!: string[];
}

export class RagRetrievalResponseDto {
  @ApiProperty() projectId!: string;
  @ApiProperty() query!: string;
  @ApiProperty() topK!: number;
  @ApiProperty() usedVectorSearch!: boolean;
  @ApiProperty() hasEmbeddings!: boolean;
  @ApiProperty({ type: [RagChunkDto] }) items!: RagChunkDto[];
  @ApiProperty({ type: [String] }) warnings!: string[];
}
