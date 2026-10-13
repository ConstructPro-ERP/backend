export function objectContaining(value: Record<string, unknown>): unknown {
  return expect.objectContaining(value) as unknown;
}

export function createPrismaMock() {
  const model = () => ({
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue({}),
    groupBy: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    upsert: jest.fn().mockResolvedValue({ id: 'chunk-1' }),
  });
  return {
    project: model(),
    customer: model(),
    invoice: model(),
    payment: model(),
    expense: model(),
    lead: model(),
    quotation: model(),
    document: model(),
    milestone: model(),
    aiKnowledgeChunk: model(),
    $transaction: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([]),
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    $executeRawUnsafe: jest.fn().mockResolvedValue(1),
  };
}
