import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AssignProjectManagerDto } from './dto/assign-project-manager.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectQueryDto } from './dto/project-query.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UpdateProjectStatusDto } from './dto/project-status.dto';
import { ProjectService } from './project.service';

@ApiTags('Projects')
@Controller('projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Get('health')
  @ApiOperation({ summary: 'Check project service health' })
  @ApiOkResponse({ description: 'Project service is available' })
  getHealth() {
    return this.projectService.getHealth();
  }

  @Post()
  @ApiOperation({ summary: 'Create a project' })
  @ApiCreatedResponse({ description: 'Project created successfully' })
  @ApiBadRequestResponse({ description: 'Invalid project data' })
  create(@Body() dto: CreateProjectDto) {
    return this.projectService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List projects' })
  @ApiOkResponse({ description: 'Paginated list of projects' })
  findAll(@Query() query: ProjectQueryDto) {
    return this.projectService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a project by ID' })
  @ApiOkResponse({ description: 'Project details' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a project' })
  @ApiOkResponse({ description: 'Project updated successfully' })
  @ApiBadRequestResponse({ description: 'Invalid project data' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectService.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update project status' })
  @ApiOkResponse({ description: 'Project status updated successfully' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectStatusDto,
  ) {
    return this.projectService.updateStatus(id, dto);
  }

  @Patch(':id/manager')
  @ApiOperation({ summary: 'Assign a project manager' })
  @ApiOkResponse({ description: 'Project manager assigned successfully' })
  @ApiBadRequestResponse({ description: 'Invalid project manager' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  assignManager(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignProjectManagerDto,
  ) {
    return this.projectService.assignManager(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a project' })
  @ApiOkResponse({ description: 'Project deleted successfully' })
  @ApiConflictResponse({
    description: 'Project has related records and cannot be deleted',
  })
  @ApiNotFoundResponse({ description: 'Project not found' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectService.remove(id);
  }
}
