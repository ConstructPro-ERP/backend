import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export enum RiskLevelDto {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum RevenueTrendDto {
  DECLINING = 'DECLINING',
  STABLE = 'STABLE',
  GROWING = 'GROWING',
}

export enum PredictionSourceDto {
  RULE_BASED = 'RULE_BASED',
  AI_PROVIDER = 'AI_PROVIDER',
  SAFE_FALLBACK = 'SAFE_FALLBACK',
}

export class RetrievedChunkDto {
  @ApiProperty() id!: string;
  @ApiProperty() sourceType!: string;
  @ApiPropertyOptional({ nullable: true }) sourceId!: string | null;
  @ApiProperty() summary!: string;
  @ApiProperty({ required: false, nullable: true }) similarityScore!:
    | number
    | null;
  @ApiPropertyOptional({ nullable: true }) relatedProjectId!: string | null;
}

export class AiForecastingContextDto {
  @ApiProperty() projectId!: string;
  @ApiProperty() projectName!: string;
  @ApiProperty() projectStatus!: string;
  @ApiProperty() milestoneCount!: number;
  @ApiProperty() completedMilestoneCount!: number;
  @ApiProperty() invoiceCount!: number;
  @ApiProperty() overdueInvoiceCount!: number;
  @ApiProperty() paymentCount!: number;
  @ApiProperty() expenseCount!: number;
  @ApiProperty({ type: [RetrievedChunkDto] })
  retrievedChunks!: RetrievedChunkDto[];
}

export class AiRiskPredictionResponseDto {
  @ApiProperty({ format: 'uuid' }) projectId!: string;
  @ApiProperty() projectName!: string;
  @ApiProperty({ enum: RiskLevelDto }) projectRiskLevel!: RiskLevelDto;
  @ApiProperty({ enum: RiskLevelDto }) paymentDelayRisk!: RiskLevelDto;
  @ApiProperty({ enum: RiskLevelDto }) milestoneDelayRisk!: RiskLevelDto;
  @ApiProperty({ enum: RevenueTrendDto }) revenueTrend!: RevenueTrendDto;
  @ApiProperty() explanation!: string;
  @ApiProperty() recommendedAction!: string;
  @ApiProperty({ enum: PredictionSourceDto })
  predictionSource!: PredictionSourceDto;
  @ApiProperty() sufficientData!: boolean;
  @ApiProperty({ minimum: 0, maximum: 1 }) confidenceScore!: number;
  @ApiProperty({ type: AiForecastingContextDto })
  context!: AiForecastingContextDto;
  @ApiProperty({ type: [String] }) warnings!: string[];
  @ApiProperty({ type: [String] }) futureAdaptations!: string[];
  @ApiProperty() generatedAt!: string;
}

export class AiRiskPredictionPathDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  projectId!: string;
}

export class AiProviderPredictionChunkDto {
  @ApiProperty() id!: string;
  @ApiProperty() sourceType!: string;
  @ApiPropertyOptional({ nullable: true }) sourceId!: string | null;
  @ApiProperty() summary!: string;
}

export class AiProviderPredictionRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  projectId!: string;

  @ApiProperty()
  @IsString()
  projectName!: string;

  @ApiProperty({ type: [AiProviderPredictionChunkDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AiProviderPredictionChunkDto)
  @ArrayMaxSize(10)
  chunks!: AiProviderPredictionChunkDto[];
}

export class AiProviderPredictionResponseDto {
  @ApiProperty({ enum: RiskLevelDto })
  @IsEnum(RiskLevelDto)
  projectRiskLevel!: RiskLevelDto;

  @ApiProperty({ enum: RiskLevelDto })
  @IsEnum(RiskLevelDto)
  paymentDelayRisk!: RiskLevelDto;

  @ApiProperty({ enum: RiskLevelDto })
  @IsEnum(RiskLevelDto)
  milestoneDelayRisk!: RiskLevelDto;

  @ApiProperty({ enum: RevenueTrendDto })
  @IsEnum(RevenueTrendDto)
  revenueTrend!: RevenueTrendDto;

  @ApiProperty()
  @IsString()
  explanation!: string;

  @ApiProperty()
  @IsString()
  recommendedAction!: string;

  @ApiProperty({ minimum: 0, maximum: 1 })
  @IsNumber()
  @Min(0)
  @Max(1)
  confidenceScore!: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  warnings?: string[];
}
