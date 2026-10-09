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
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { UpdateMilestoneDto } from './dto/update-milestone.dto';
import { UpdateMilestoneProgressDto } from './dto/update-milestone-progress.dto';
import { MilestoneService } from './milestone.service';

@ApiTags('Milestones')
@ApiBadRequestResponse({ description: 'Invalid milestone request' })
@ApiUnauthorizedResponse({ description: 'Authenticated user is required' })
@ApiForbiddenResponse({ description: 'Insufficient project permissions' })
@Controller()
export class MilestoneController {
  constructor(private readonly milestones: MilestoneService) {}

  @Post('projects/:projectId/milestones')
  @ApiOperation({ summary: 'Create a milestone for a project' })
  @ApiCreatedResponse({ description: 'Milestone created successfully' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateMilestoneDto,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.milestones.create(projectId, dto, actorId);
  }

  @Get('projects/:projectId/milestones')
  @ApiOperation({ summary: 'List milestones for a project' })
  @ApiOkResponse({ description: 'Project milestones' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  findAll(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.milestones.findAll(projectId, actorId);
  }

  @Get('milestones/:id')
  @ApiOperation({ summary: 'Get a milestone by ID' })
  @ApiOkResponse({ description: 'Milestone details' })
  @ApiNotFoundResponse({ description: 'Milestone not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.milestones.findOne(id, actorId);
  }

  @Patch('milestones/:id')
  @ApiOperation({ summary: 'Update milestone details and weight' })
  @ApiOkResponse({ description: 'Milestone updated successfully' })
  @ApiNotFoundResponse({ description: 'Milestone not found' })
  @ApiConflictResponse({
    description: 'Milestone modification not allowed',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMilestoneDto,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.milestones.update(id, dto, actorId);
  }

  @Patch('milestones/:id/progress')
  @ApiOperation({ summary: 'Update milestone progress and status' })
  @ApiOkResponse({
    description: 'Milestone progress updated successfully',
  })
  @ApiNotFoundResponse({ description: 'Milestone not found' })
  @ApiConflictResponse({
    description: 'Milestone modification not allowed',
  })
  updateProgress(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMilestoneProgressDto,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.milestones.updateProgress(id, dto, actorId);
  }

  @Delete('milestones/:id')
  @ApiOperation({ summary: 'Delete a milestone' })
  @ApiOkResponse({ description: 'Milestone deleted successfully' })
  @ApiNotFoundResponse({ description: 'Milestone not found' })
  @ApiConflictResponse({
    description: 'Milestone in use or modification not allowed',
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.milestones.remove(id, actorId);
  }
}
