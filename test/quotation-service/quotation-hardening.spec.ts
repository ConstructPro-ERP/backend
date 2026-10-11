import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { QuotationStatus } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { Test } from '@nestjs/testing';
import {
  calculateAmount,
  sumAmounts,
  round2,
  QuotationService,
} from '../../apps/quotation-service/src/quotation.service';
import { CreateQuotationDto } from '../../apps/quotation-service/src/dto/create-quotation.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentClient } from '../../apps/quotation-service/src/document.client';
import { ProjectClient } from '../../apps/quotation-service/src/project.client';
import { NotificationClient } from '../../apps/quotation-service/src/notification.client';

describe('Quotation monetary boundaries', () => {
  it.each([
    [1.005, 1.01],
    [10.075, 10.08],
    [100.005, 100.01],
    [0, 0],
  ])('rounds %s to %s', (input, expected) => {
    expect(round2(input)).toBe(expected);
  });
  it('multiplies and aggregates decimal amounts without drift', () => {
    expect(calculateAmount(3, 33.33)).toBe(99.99);
    expect(calculateAmount(1, 0)).toBe(0);
    expect(sumAmounts([0.1, 0.2, 99.99])).toBe(100.29);
    expect(calculateAmount(1, 9999999999.99)).toBe(9999999999.99);
  });
  it.each([
    [0, 1],
    [-1, 1],
    [1.5, 1],
    [2147483648, 0],
    [1, -1],
    [1, NaN],
    [1, Infinity],
    [2, 9999999999.99],
  ])('rejects invalid item %s x %s', (quantity, price) => {
    expect(() => calculateAmount(quantity, price)).toThrow(BadRequestException);
  });
  it('rejects aggregate overflow', () => {
    expect(() => sumAmounts([9999999999.99, 0.01])).toThrow(
      BadRequestException,
    );
  });
});

describe('Quotation hardening regressions', () => {
  let service: QuotationService;
  const prisma = {
    lead: { findUnique: jest.fn() },
    quotation: { findUnique: jest.fn(), update: jest.fn() },
  };
  const project = { createFromQuotation: jest.fn() };
  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        QuotationService,
        { provide: PrismaService, useValue: prisma },
        { provide: DocumentClient, useValue: {} },
        { provide: ProjectClient, useValue: project },
        { provide: NotificationClient, useValue: {} },
      ],
    }).compile();
    service = module.get(QuotationService);
  });
  it.each([
    QuotationStatus.APPROVED,
    QuotationStatus.REJECTED,
    QuotationStatus.CONVERTED,
  ])('rejects creation in %s before persistence', async (status) => {
    await expect(
      service.create({ leadId: 'lead', items: [], status }),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_STATUS_TRANSITION' },
    });
    expect(prisma.lead.findUnique).not.toHaveBeenCalled();
  });
  it('rejects draft conversion without mutating status', async () => {
    prisma.quotation.findUnique.mockResolvedValue({ id: 'q', status: 'DRAFT' });
    await expect(
      service.approveAndConvert('q', { targetProjectId: 'p' }),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_STATUS_TRANSITION' },
    });
    expect(prisma.quotation.update).not.toHaveBeenCalled();
    expect(project.createFromQuotation).not.toHaveBeenCalled();
  });
  it('keeps an approved quotation retryable when project-service fails', async () => {
    prisma.quotation.findUnique.mockResolvedValue({
      id: 'q',
      leadId: 'l',
      status: 'APPROVED',
      projectId: null,
    });
    project.createFromQuotation.mockRejectedValue(new BadGatewayException());
    await expect(
      service.approveAndConvert('q', { targetProjectId: 'p' }),
    ).rejects.toThrow(BadGatewayException);
    expect(prisma.quotation.update).not.toHaveBeenCalled();
  });
  it.each(['APPROVED', 'CONVERTED'])(
    'locks edits to %s quotations',
    async (status) => {
      prisma.quotation.findUnique.mockResolvedValue({ id: 'q', status });
      await expect(
        service.update('q', { notes: 'changed' }),
      ).rejects.toMatchObject({ response: { code: 'QUOTATION_LOCKED' } });
      expect(prisma.quotation.update).not.toHaveBeenCalled();
    },
  );
  it.each(Object.values(QuotationStatus))(
    'validates creation status %s at the HTTP boundary',
    async (status) => {
      const dto = plainToInstance(CreateQuotationDto, {
        leadId: '550e8400-e29b-41d4-a716-446655440000',
        items: [{ itemName: 'Concrete', quantity: 1, unitPrice: 1 }],
        status,
      });
      const errors = await validate(dto);
      expect(errors.length === 0).toBe(
        ['DRAFT', 'PENDING_APPROVAL'].includes(status),
      );
    },
  );
});
