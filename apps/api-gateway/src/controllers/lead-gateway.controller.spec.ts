import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Reflector } from '@nestjs/core';
import { of, throwError } from 'rxjs';
import type { Request } from 'express';
import { LeadGatewayController } from './lead-gateway.controller';
import { RolesGuard } from '../guards/roles.guard';

function contextFor(role?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { role } : undefined }),
    }),
    getHandler: () => () => undefined,
    getClass: () => LeadGatewayController,
  } as unknown as ExecutionContext;
}

function reqWith(overrides: Partial<Request> = {}): any {
  return {
    headers: { authorization: 'Bearer test-token' },
    user: { id: 'user-1' },
    ...overrides,
  };
}

describe('LeadGatewayController roles', () => {
  const guard = new RolesGuard(new Reflector());

  it.each(['ADMIN', 'MANAGEMENT', 'SALES_MANAGER'])(
    'allows %s to access lead routes',
    (role) => {
      expect(guard.canActivate(contextFor(role))).toBe(true);
    },
  );

  it('rejects an accountant', () => {
    expect(() => guard.canActivate(contextFor('ACCOUNTANT'))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a request with no authenticated user', () => {
    expect(() => guard.canActivate(contextFor())).toThrow(ForbiddenException);
  });
});

describe('LeadGatewayController', () => {
  let controller: LeadGatewayController;
  let httpService: {
    get: jest.Mock;
    post: jest.Mock;
    patch: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    httpService = {
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeadGatewayController],
      providers: [{ provide: HttpService, useValue: httpService }],
    }).compile();

    controller = module.get<LeadGatewayController>(LeadGatewayController);
    process.env.LEAD_SERVICE_URL = 'http://lead-service.test';
  });

  afterEach(() => {
    jest.resetAllMocks();
    delete process.env.LEAD_SERVICE_URL;
  });

  it('forwards create() to POST /leads with auth + actor headers', async () => {
    httpService.post.mockReturnValue(of({ data: { id: 'lead-1' } }));
    const req = reqWith();

    const result = await controller.create(
      { customerName: 'John Silva' } as any,
      req,
    );

    expect(httpService.post).toHaveBeenCalledWith(
      'http://lead-service.test/leads',
      { customerName: 'John Silva' },
      {
        headers: { authorization: 'Bearer test-token', 'x-user-id': 'user-1' },
      },
    );
    expect(result).toEqual({ id: 'lead-1' });
  });

  it('forwards findAll() to GET /leads with query params', async () => {
    httpService.get.mockReturnValue(of({ data: [] }));
    const req = reqWith();
    const query = { page: 1, limit: 20 } as any;

    await controller.findAll(query, req);

    expect(httpService.get).toHaveBeenCalledWith(
      'http://lead-service.test/leads',
      {
        headers: { authorization: 'Bearer test-token', 'x-user-id': 'user-1' },
        params: query,
      },
    );
  });

  it('forwards findOne() to GET /leads/:id', async () => {
    httpService.get.mockReturnValue(of({ data: { id: 'lead-1' } }));
    const req = reqWith();

    await controller.findOne('lead-1', req);

    expect(httpService.get).toHaveBeenCalledWith(
      'http://lead-service.test/leads/lead-1',
      {
        headers: { authorization: 'Bearer test-token', 'x-user-id': 'user-1' },
      },
    );
  });

  it('forwards update() to PATCH /leads/:id', async () => {
    httpService.patch.mockReturnValue(of({ data: { id: 'lead-1' } }));
    const req = reqWith();

    await controller.update('lead-1', { customerName: 'Jane' } as any, req);

    expect(httpService.patch).toHaveBeenCalledWith(
      'http://lead-service.test/leads/lead-1',
      { customerName: 'Jane' },
      {
        headers: { authorization: 'Bearer test-token', 'x-user-id': 'user-1' },
      },
    );
  });

  it('forwards remove() to DELETE /leads/:id', async () => {
    httpService.delete.mockReturnValue(of({ data: undefined }));
    const req = reqWith();

    await controller.remove('lead-1', req);

    expect(httpService.delete).toHaveBeenCalledWith(
      'http://lead-service.test/leads/lead-1',
      {
        headers: { authorization: 'Bearer test-token', 'x-user-id': 'user-1' },
      },
    );
  });

  it('forwards assign() to PATCH /leads/:id/assign', async () => {
    httpService.patch.mockReturnValue(of({ data: { id: 'lead-1' } }));
    const req = reqWith();

    await controller.assign(
      'lead-1',
      { assignedToId: 'manager-1' } as any,
      req,
    );

    expect(httpService.patch).toHaveBeenCalledWith(
      'http://lead-service.test/leads/lead-1/assign',
      { assignedToId: 'manager-1' },
      {
        headers: { authorization: 'Bearer test-token', 'x-user-id': 'user-1' },
      },
    );
  });

  it('forwards updateStatus() to PATCH /leads/:id/status', async () => {
    httpService.patch.mockReturnValue(of({ data: { id: 'lead-1' } }));
    const req = reqWith();

    await controller.updateStatus(
      'lead-1',
      { status: 'CONTACTED' } as any,
      req,
    );

    expect(httpService.patch).toHaveBeenCalledWith(
      'http://lead-service.test/leads/lead-1/status',
      { status: 'CONTACTED' },
      {
        headers: { authorization: 'Bearer test-token', 'x-user-id': 'user-1' },
      },
    );
  });

  it('forwards addNote() to POST /leads/:id/notes', async () => {
    httpService.post.mockReturnValue(of({ data: { id: 'note-1' } }));
    const req = reqWith();

    await controller.addNote(
      'lead-1',
      { content: 'Called client' } as any,
      req,
    );

    expect(httpService.post).toHaveBeenCalledWith(
      'http://lead-service.test/leads/lead-1/notes',
      { content: 'Called client' },
      {
        headers: { authorization: 'Bearer test-token', 'x-user-id': 'user-1' },
      },
    );
  });

  it('forwards getNotes() to GET /leads/:id/notes', async () => {
    httpService.get.mockReturnValue(of({ data: [] }));
    const req = reqWith();

    await controller.getNotes('lead-1', req);

    expect(httpService.get).toHaveBeenCalledWith(
      'http://lead-service.test/leads/lead-1/notes',
      {
        headers: { authorization: 'Bearer test-token', 'x-user-id': 'user-1' },
      },
    );
  });

  it('forwards deleteNote() to DELETE /leads/:id/notes/:noteId', async () => {
    httpService.delete.mockReturnValue(of({ data: undefined }));
    const req = reqWith();

    await controller.deleteNote('lead-1', 'note-1', req);

    expect(httpService.delete).toHaveBeenCalledWith(
      'http://lead-service.test/leads/lead-1/notes/note-1',
      {
        headers: { authorization: 'Bearer test-token', 'x-user-id': 'user-1' },
      },
    );
  });

  it('forwards addContact() to POST /leads/:id/contacts', async () => {
    httpService.post.mockReturnValue(of({ data: { id: 'contact-1' } }));
    const req = reqWith();

    await controller.addContact(
      'lead-1',
      { label: 'primary_phone', value: '+94771234567' } as any,
      req,
    );

    expect(httpService.post).toHaveBeenCalledWith(
      'http://lead-service.test/leads/lead-1/contacts',
      { label: 'primary_phone', value: '+94771234567' },
      {
        headers: { authorization: 'Bearer test-token', 'x-user-id': 'user-1' },
      },
    );
  });

  it('forwards updateContact() to PATCH /leads/:id/contacts/:contactId', async () => {
    httpService.patch.mockReturnValue(of({ data: { id: 'contact-1' } }));
    const req = reqWith();

    await controller.updateContact(
      'lead-1',
      'contact-1',
      { label: 'secondary_email', value: 'john.alt@example.com' } as any,
      req,
    );

    expect(httpService.patch).toHaveBeenCalledWith(
      'http://lead-service.test/leads/lead-1/contacts/contact-1',
      { label: 'secondary_email', value: 'john.alt@example.com' },
      {
        headers: { authorization: 'Bearer test-token', 'x-user-id': 'user-1' },
      },
    );
  });

  it('forwards deleteContact() to DELETE /leads/:id/contacts/:contactId', async () => {
    httpService.delete.mockReturnValue(of({ data: undefined }));
    const req = reqWith();

    await controller.deleteContact('lead-1', 'contact-1', req);

    expect(httpService.delete).toHaveBeenCalledWith(
      'http://lead-service.test/leads/lead-1/contacts/contact-1',
      {
        headers: { authorization: 'Bearer test-token', 'x-user-id': 'user-1' },
      },
    );
  });

  it('re-throws the downstream status + body when the lead service responds with an error', async () => {
    httpService.get.mockReturnValue(
      throwError(() => ({
        response: { status: 404, data: { code: 'LEAD_NOT_FOUND' } },
      })),
    );
    const req = reqWith();

    await expect(controller.findOne('missing-id', req)).rejects.toMatchObject({
      status: 404,
      response: { code: 'LEAD_NOT_FOUND' },
    });
  });

  it('throws a 502 BAD_GATEWAY when the lead service is unreachable', async () => {
    httpService.get.mockReturnValue(throwError(() => ({})));
    const req = reqWith();

    await expect(controller.findOne('lead-1', req)).rejects.toBeInstanceOf(
      HttpException,
    );
    await expect(controller.findOne('lead-1', req)).rejects.toMatchObject({
      status: 502,
      response: { code: 'LEAD_SERVICE_UNAVAILABLE' },
    });
  });
});
