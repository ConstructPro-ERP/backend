import { Injectable } from '@nestjs/common';

@Injectable()
export class ProjectService {
  getHealth() {
    return {
      service: 'project-service',
      status: 'ok',
    };
  }
}
