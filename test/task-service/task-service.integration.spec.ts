import { randomUUID } from 'node:crypto';
import {
  MilestoneStatus,
  ProjectStatus,
  TaskStatus,
  UserStatus,
} from '@prisma/client';
import { TaskService } from '../../apps/task-service/src/task.service';
import { TaskRepository } from '../../apps/task-service/src/repositories/task.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { ErrorCode } from '../../shared/error-codes';
import {
  TaskSortField,
  TaskSortOrder,
} from '../../apps/task-service/src/dto/task-query.dto';

jest.setTimeout(60000);

describe('Task Service — database integration', () => {
  let prisma: PrismaService;
  let tasks: TaskService;
  let managerId: string;
  let otherManagerId: string;
  let adminId: string;
  let inactiveUserId: string;

  const runId = `${Date.now()}-${process.pid}-${randomUUID()}`;
  const userIds: string[] = [];
  const projectIds: string[] = [];

  async function createProject(projectManagerId = managerId) {
    const project = await prisma.project.create({
      data: {
        projectName: `Task Integration ${runId}`,
        projectManagerId,
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T23:59:59.999Z'),
        status: ProjectStatus.PLANNING,
      },
    });

    projectIds.push(project.id);
    return project;
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const [managerRole, adminRole] = await Promise.all([
      prisma.role.findUniqueOrThrow({
        where: { roleName: 'PROJECT_MANAGER' },
      }),
      prisma.role.findUniqueOrThrow({
        where: { roleName: 'ADMIN' },
      }),
    ]);

    const makeUser = async (
      label: string,
      roleId: string,
      status: UserStatus = UserStatus.ACTIVE,
    ) => {
      const user = await prisma.user.create({
        data: {
          fullName: `Task Integration ${label}`,
          email: `task-${label}-${runId}@example.test`,
          password: 'hashed',
          roleId,
          status,
        },
      });

      userIds.push(user.id);
      return user.id;
    };

    managerId = await makeUser('manager', managerRole.id);
    otherManagerId = await makeUser('other-manager', managerRole.id);
    adminId = await makeUser('admin', adminRole.id);
    inactiveUserId = await makeUser(
      'inactive',
      managerRole.id,
      UserStatus.INACTIVE,
    );

    tasks = new TaskService(new TaskRepository(prisma), {
      baseDelayMs: 1,
      maxDelayMs: 10,
      maxJitterMs: 0,
    });
  });

  afterEach(async () => {
    if (projectIds.length === 0) return;

    // Delete children before parents to respect foreign keys.
    await prisma.task.deleteMany({
      where: { projectId: { in: projectIds } },
    });

    await prisma.milestone.deleteMany({
      where: { projectId: { in: projectIds } },
    });

    await prisma.project.deleteMany({
      where: { id: { in: projectIds } },
    });

    projectIds.length = 0;
  });

  afterAll(async () => {
    if (!prisma) return;

    if (userIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }

    await prisma.$disconnect();
  });

  it('persists project-level and milestone-linked tasks', async () => {
    const project = await createProject();

    const milestone = await prisma.milestone.create({
      data: {
        projectId: project.id,
        milestoneName: 'Foundation',
        weight: 5,
      },
    });

    const plain = await tasks.create(
      {
        projectId: project.id,
        taskName: 'Order materials',
      },
      managerId,
    );

    const linked = await tasks.create(
      {
        projectId: project.id,
        milestoneId: milestone.id,
        assignedToId: otherManagerId,
        taskName: 'Foundation preparation',
        dueDate: '2026-11-01T00:00:00.000Z',
      },
      managerId,
    );

    const persisted = await prisma.task.findMany({
      where: { projectId: project.id },
      orderBy: { taskName: 'asc' },
    });

    expect(persisted).toHaveLength(2);
    expect(plain.milestoneId).toBeNull();
    expect(linked.milestoneId).toBe(milestone.id);
    expect(linked.assignedToId).toBe(otherManagerId);

    expect(persisted.map((item) => item.taskName)).toEqual([
      'Foundation preparation',
      'Order materials',
    ]);
  });

  it('rejects invalid milestone relationships and assignees', async () => {
    const project = await createProject();
    const other = await createProject();

    const milestone = await prisma.milestone.create({
      data: {
        projectId: other.id,
        milestoneName: 'Foreign milestone',
        weight: 5,
      },
    });

    await expect(
      tasks.create(
        {
          projectId: project.id,
          taskName: 'Invalid milestone',
          milestoneId: milestone.id,
        },
        managerId,
      ),
    ).rejects.toMatchObject({
      response: {
        code: ErrorCode.TASK_MILESTONE_PROJECT_MISMATCH,
      },
    });

    for (const assignedToId of [inactiveUserId, randomUUID()]) {
      await expect(
        tasks.create(
          {
            projectId: project.id,
            taskName: 'Invalid assignment',
            assignedToId,
          },
          managerId,
        ),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.INVALID_TASK_ASSIGNEE,
        },
      });
    }

    expect(await prisma.task.count({ where: { projectId: project.id } })).toBe(
      0,
    );
  });

  it('enforces Project Manager ownership in database queries', async () => {
    const own = await createProject();
    const foreign = await createProject(otherManagerId);

    await tasks.create({ projectId: own.id, taskName: 'Own task' }, managerId);

    await tasks.create(
      { projectId: foreign.id, taskName: 'Other task' },
      otherManagerId,
    );

    const result = await tasks.findAll({ page: 1, limit: 10 }, managerId);

    expect(result.meta.total).toBe(1);
    expect(result.data.map((item) => item.taskName)).toEqual(['Own task']);

    await expect(
      tasks.findByProject(foreign.id, {}, managerId),
    ).rejects.toMatchObject({
      response: {
        code: ErrorCode.PROJECT_ACCESS_DENIED,
      },
    });

    const adminResult = await tasks.findAll(
      {
        projectId: foreign.id,
        status: TaskStatus.TODO,
      },
      adminId,
    );

    expect(adminResult.data.map((item) => item.taskName)).toContain(
      'Other task',
    );
  });

  it('does not recalculate milestone progress on task completion', async () => {
    const project = await createProject();

    const milestone = await prisma.milestone.create({
      data: {
        projectId: project.id,
        milestoneName: 'Foundation',
        weight: 5,
        progressPercentage: 40,
        status: MilestoneStatus.IN_PROGRESS,
      },
    });

    await prisma.project.update({
      where: { id: project.id },
      data: { progressPercentage: 40 },
    });

    const created = await tasks.create(
      {
        projectId: project.id,
        milestoneId: milestone.id,
        taskName: 'Prepare site',
      },
      managerId,
    );

    await tasks.updateStatus(
      created.id,
      { status: TaskStatus.COMPLETED },
      managerId,
    );

    const [storedTask, storedMilestone, storedProject] = await Promise.all([
      prisma.task.findUniqueOrThrow({
        where: { id: created.id },
      }),
      prisma.milestone.findUniqueOrThrow({
        where: { id: milestone.id },
      }),
      prisma.project.findUniqueOrThrow({
        where: { id: project.id },
      }),
    ]);

    expect(storedTask.status).toBe(TaskStatus.COMPLETED);
    expect(storedMilestone.status).toBe(MilestoneStatus.IN_PROGRESS);
    expect(storedMilestone.progressPercentage).toBe(40);
    expect(storedProject.progressPercentage).toBe(40);
  });

  it('blocks mutations after project completion', async () => {
    const project = await createProject();

    const created = await tasks.create(
      {
        projectId: project.id,
        taskName: 'Finishing',
      },
      managerId,
    );

    await prisma.project.update({
      where: { id: project.id },
      data: { status: ProjectStatus.COMPLETED },
    });

    await expect(
      tasks.updateStatus(
        created.id,
        { status: TaskStatus.COMPLETED },
        managerId,
      ),
    ).rejects.toMatchObject({
      response: {
        code: ErrorCode.TASK_MODIFICATION_NOT_ALLOWED,
      },
    });

    const stored = await prisma.task.findUniqueOrThrow({
      where: { id: created.id },
    });

    expect(stored.status).toBe(TaskStatus.TODO);
  });

  it('filters persisted tasks and returns accurate pagination', async () => {
    const project = await createProject();
    const anotherProject = await createProject();

    const milestone = await prisma.milestone.create({
      data: {
        projectId: project.id,
        milestoneName: 'Foundation',
        weight: 5,
      },
    });

    // Two tasks should match every filter.
    await tasks.create(
      {
        projectId: project.id,
        milestoneId: milestone.id,
        assignedToId: managerId,
        taskName: 'Alpha foundation',
        status: TaskStatus.TODO,
      },
      managerId,
    );

    await tasks.create(
      {
        projectId: project.id,
        milestoneId: milestone.id,
        assignedToId: managerId,
        taskName: 'Beta foundation',
        status: TaskStatus.TODO,
      },
      managerId,
    );

    // Same milestone and status, but a different assignee.
    await tasks.create(
      {
        projectId: project.id,
        milestoneId: milestone.id,
        assignedToId: otherManagerId,
        taskName: 'Gamma foundation',
        status: TaskStatus.TODO,
      },
      managerId,
    );

    // Same assignee and milestone, but a different status.
    await tasks.create(
      {
        projectId: project.id,
        milestoneId: milestone.id,
        assignedToId: managerId,
        taskName: 'Delta foundation',
        status: TaskStatus.IN_PROGRESS,
      },
      managerId,
    );

    // Same assignee and status, but no milestone.
    await tasks.create(
      {
        projectId: project.id,
        assignedToId: managerId,
        taskName: 'Epsilon project task',
        status: TaskStatus.TODO,
      },
      managerId,
    );

    // Same assignee and status, but another project.
    await tasks.create(
      {
        projectId: anotherProject.id,
        assignedToId: managerId,
        taskName: 'Foreign project task',
        status: TaskStatus.TODO,
      },
      managerId,
    );

    const filters = {
      milestoneId: milestone.id,
      assignedToId: managerId,
      status: TaskStatus.TODO,
      limit: 1,
      sortBy: TaskSortField.TASK_NAME,
      sortOrder: TaskSortOrder.ASC,
    };

    // Page 1 must return the first matching record.
    const firstPage = await tasks.findByProject(
      project.id,
      { ...filters, page: 1 },
      managerId,
    );

    expect(firstPage.data.map((task) => task.taskName)).toEqual([
      'Alpha foundation',
    ]);

    expect(firstPage.meta).toEqual({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
    });

    // Page 2 must return the next matching record.
    const secondPage = await tasks.findByProject(
      project.id,
      { ...filters, page: 2 },
      managerId,
    );

    expect(secondPage.data.map((task) => task.taskName)).toEqual([
      'Beta foundation',
    ]);

    expect(secondPage.meta).toEqual({
      page: 2,
      limit: 1,
      total: 2,
      totalPages: 2,
    });

    // Beyond the final page, no items should be returned.
    const thirdPage = await tasks.findByProject(
      project.id,
      { ...filters, page: 3 },
      managerId,
    );

    expect(thirdPage.data).toHaveLength(0);
    expect(thirdPage.meta.total).toBe(2);
    expect(thirdPage.meta.totalPages).toBe(2);

    // Verify that the assignee filter actually selects
    // different persisted records.
    const otherAssignee = await tasks.findAll(
      {
        projectId: project.id,
        milestoneId: milestone.id,
        assignedToId: otherManagerId,
        status: TaskStatus.TODO,
      },
      managerId,
    );

    expect(otherAssignee.data.map((task) => task.taskName)).toEqual([
      'Gamma foundation',
    ]);

    expect(otherAssignee.meta.total).toBe(1);

    // Verify the status filter excludes nonmatching tasks.
    const noMatches = await tasks.findAll(
      {
        projectId: project.id,
        milestoneId: milestone.id,
        assignedToId: otherManagerId,
        status: TaskStatus.COMPLETED,
      },
      managerId,
    );

    expect(noMatches.data).toHaveLength(0);
    expect(noMatches.meta.total).toBe(0);
    expect(noMatches.meta.totalPages).toBe(0);
  });
});
