import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LeadStatus } from '@prisma/client';
import { LeadService } from './lead.service';
import { LeadRepository } from './repository/lead.repository';

const mockLeadRepository = {
  create: jest.fn(),
  findManyAndCount: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findUser: jest.fn(),
  createNote: jest.fn(),
  findNotes: jest.fn(),
  deleteNote: jest.fn(),
  createContact: jest.fn(),
  updateContact: jest.fn(),
  deleteContact: jest.fn(),
};

describe('LeadService', () => {
  let service: LeadService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadService,
        {
          provide: LeadRepository,
          useValue: mockLeadRepository,
        },
      ],
    }).compile();

    service = module.get<LeadService>(LeadService);
  });

  describe('create()', () => {
    it('creates a lead without assigned user', async () => {
      const dto = {
        customerName: 'John Silva',
        phone: '+94771234567',
        email: 'john@example.com',
        status: LeadStatus.NEW,
      };

      const createdLead = {
        id: 'lead-1',
        ...dto,
      };

      mockLeadRepository.create.mockResolvedValue(createdLead);

      const result = await service.create(dto);

      expect(result).toEqual(createdLead);
      expect(mockLeadRepository.create).toHaveBeenCalledWith({
        customerName: dto.customerName,
        phone: dto.phone,
        email: dto.email,
        assignedToId: undefined,
        status: dto.status,
      });
      expect(mockLeadRepository.findUser).not.toHaveBeenCalled();
    });

    it('validates assigned user before creating lead', async () => {
      const dto = {
        customerName: 'John Silva',
        assignedToId: 'user-1',
      };

      mockLeadRepository.findUser.mockResolvedValue({ id: 'user-1' });
      mockLeadRepository.create.mockResolvedValue({
        id: 'lead-1',
        ...dto,
      });

      await service.create(dto);

      expect(mockLeadRepository.findUser).toHaveBeenCalledWith('user-1');
      expect(mockLeadRepository.create).toHaveBeenCalledWith({
        customerName: dto.customerName,
        phone: undefined,
        email: undefined,
        assignedToId: dto.assignedToId,
        status: undefined,
      });
    });

    it('throws BadRequestException when assigned user does not exist', async () => {
      mockLeadRepository.findUser.mockResolvedValue(null);

      await expect(
        service.create({
          customerName: 'John Silva',
          assignedToId: 'missing-user',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mockLeadRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('findOne()', () => {
    it('returns lead when found', async () => {
      const lead = {
        id: 'lead-1',
        customerName: 'John Silva',
      };

      mockLeadRepository.findById.mockResolvedValue(lead);

      const result = await service.findOne('lead-1');

      expect(result).toEqual(lead);
      expect(mockLeadRepository.findById).toHaveBeenCalledWith('lead-1');
    });

    it('throws NotFoundException when lead does not exist', async () => {
      mockLeadRepository.findById.mockResolvedValue(null);

      await expect(service.findOne('missing-lead')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('findAll()', () => {
    it('returns paginated leads', async () => {
      const leads = [
        {
          id: 'lead-1',
          customerName: 'John Silva',
        },
      ];

      mockLeadRepository.findManyAndCount.mockResolvedValue([leads, 1]);

      const result = await service.findAll({
        page: 1,
        limit: 20,
        sortBy: 'createdAt' as any,
        sortOrder: 'desc' as any,
      });

      expect(result).toEqual({
        data: leads,
        meta: {
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        },
      });

      expect(mockLeadRepository.findManyAndCount).toHaveBeenCalledWith({
        where: {
          status: undefined,
          assignedToId: undefined,
        },
        skip: 0,
        take: 20,
        orderBy: {
          createdAt: 'desc',
        },
      });
    });
  });

  describe('assign()', () => {
    it('assigns a lead to a valid user', async () => {
      mockLeadRepository.findById.mockResolvedValue({
        id: 'lead-1',
      });
      mockLeadRepository.findUser.mockResolvedValue({
        id: 'user-1',
      });
      mockLeadRepository.update.mockResolvedValue({
        id: 'lead-1',
        assignedToId: 'user-1',
      });

      const result = await service.assign('lead-1', 'user-1');

      expect(result).toEqual({
        id: 'lead-1',
        assignedToId: 'user-1',
      });
      expect(mockLeadRepository.update).toHaveBeenCalledWith('lead-1', {
        assignedToId: 'user-1',
      });
    });

    it('throws NotFoundException when lead does not exist', async () => {
      mockLeadRepository.findById.mockResolvedValue(null);

      await expect(service.assign('missing-lead', 'user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(mockLeadRepository.findUser).not.toHaveBeenCalled();
      expect(mockLeadRepository.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when assigned user does not exist', async () => {
      mockLeadRepository.findById.mockResolvedValue({
        id: 'lead-1',
      });
      mockLeadRepository.findUser.mockResolvedValue(null);

      await expect(service.assign('lead-1', 'missing-user')).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(mockLeadRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('notes', () => {
    it('adds a note after validating lead exists', async () => {
      mockLeadRepository.findById.mockResolvedValue({
        id: 'lead-1',
      });
      mockLeadRepository.createNote.mockResolvedValue({
        id: 'note-1',
        leadId: 'lead-1',
        content: 'Customer is interested.',
        authorId: 'user-1',
      });

      const result = await service.addNote(
        'lead-1',
        {
          content: 'Customer is interested.',
        },
        'user-1',
      );

      expect(result).toEqual({
        id: 'note-1',
        leadId: 'lead-1',
        content: 'Customer is interested.',
        authorId: 'user-1',
      });

      expect(mockLeadRepository.createNote).toHaveBeenCalledWith({
        leadId: 'lead-1',
        content: 'Customer is interested.',
        authorId: 'user-1',
      });
    });

    it('gets notes after validating lead exists', async () => {
      const notes = [
        {
          id: 'note-1',
          leadId: 'lead-1',
          content: 'Follow up tomorrow.',
        },
      ];

      mockLeadRepository.findById.mockResolvedValue({
        id: 'lead-1',
      });
      mockLeadRepository.findNotes.mockResolvedValue(notes);

      const result = await service.getNotes('lead-1');

      expect(result).toEqual(notes);
      expect(mockLeadRepository.findNotes).toHaveBeenCalledWith('lead-1');
    });

    it('throws NotFoundException when deleting missing note', async () => {
      mockLeadRepository.findById.mockResolvedValue({
        id: 'lead-1',
      });
      mockLeadRepository.deleteNote.mockRejectedValue(new Error('Not found'));

      await expect(service.deleteNote('lead-1', 'missing-note')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('contacts', () => {
    it('adds a contact after validating lead exists', async () => {
      mockLeadRepository.findById.mockResolvedValue({
        id: 'lead-1',
      });
      mockLeadRepository.createContact.mockResolvedValue({
        id: 'contact-1',
        leadId: 'lead-1',
        label: 'whatsapp',
        value: '+94771234567',
      });

      const result = await service.addContact('lead-1', {
        label: 'whatsapp',
        value: '+94771234567',
      });

      expect(result).toEqual({
        id: 'contact-1',
        leadId: 'lead-1',
        label: 'whatsapp',
        value: '+94771234567',
      });

      expect(mockLeadRepository.createContact).toHaveBeenCalledWith({
        leadId: 'lead-1',
        label: 'whatsapp',
        value: '+94771234567',
      });
    });

    it('throws NotFoundException when updating missing contact', async () => {
      mockLeadRepository.findById.mockResolvedValue({
        id: 'lead-1',
      });
      mockLeadRepository.updateContact.mockRejectedValue(new Error('Not found'));

      await expect(
        service.updateContact('lead-1', 'missing-contact', {
          label: 'email',
          value: 'test@example.com',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when deleting missing contact', async () => {
      mockLeadRepository.findById.mockResolvedValue({
        id: 'lead-1',
      });
      mockLeadRepository.deleteContact.mockRejectedValue(new Error('Not found'));

      await expect(
        service.deleteContact('lead-1', 'missing-contact'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});