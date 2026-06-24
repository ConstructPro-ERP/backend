import { RagController } from '../../apps/ai-service/src/rag.controller';
import { RagService } from '../../apps/ai-service/src/rag.service';

describe('RagController', () => {
  const ragService = {
    reindexProject: jest.fn(),
    retrieveProjectContext: jest.fn(),
  };

  let controller: RagController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new RagController(ragService as unknown as RagService);
  });

  it('delegates reindex requests to the RAG service', async () => {
    const response = { projectId: 'b994b0bf-b09f-42fd-989f-25152a677cff' };
    ragService.reindexProject.mockResolvedValue(response);

    await expect(
      controller.reindex({
        projectId: 'b994b0bf-b09f-42fd-989f-25152a677cff',
      }),
    ).resolves.toBe(response);

    expect(ragService.reindexProject).toHaveBeenCalledWith(
      'b994b0bf-b09f-42fd-989f-25152a677cff',
    );
  });

  it('delegates retrieval requests including the optional query arguments', async () => {
    const response = { projectId: 'b994b0bf-b09f-42fd-989f-25152a677cff', items: [] };
    ragService.retrieveProjectContext.mockResolvedValue(response);

    await expect(
      controller.retrieve(
        { projectId: 'b994b0bf-b09f-42fd-989f-25152a677cff' },
        { query: 'delay risk', topK: 3 },
      ),
    ).resolves.toBe(response);

    expect(ragService.retrieveProjectContext).toHaveBeenCalledWith(
      'b994b0bf-b09f-42fd-989f-25152a677cff',
      'delay risk',
      3,
    );
  });
});
