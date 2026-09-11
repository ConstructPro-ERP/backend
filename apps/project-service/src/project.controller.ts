import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
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
}
