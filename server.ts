import { bootstrap as bootstrapAiService } from './apps/ai-service/src/main';
import { bootstrap as bootstrapAnalyticsService } from './apps/analytics-service/src/main';
import { bootstrap as bootstrapApiGateway } from './apps/api-gateway/src/main';
import { bootstrap as bootstrapAuthService } from './apps/auth-service/src/main';
import { bootstrap as bootstrapInvoiceService } from './apps/invoice-service/src/main';
import { bootstrap as bootstrapPaymentService } from './apps/payment-service/src/main';
import { bootstrap as bootstrapQuotationService } from './apps/quotation-service/src/main';
import { bootstrap as bootstrapUserService } from './apps/user-service/src/main';
import { bootstrap as bootstrapProjectService } from './apps/project-service/src/main';
import { bootstrap as bootstrapTaskService } from './apps/task-service/src/main';
import { bootstrap as bootstrapDocumentService } from './apps/document-service/src/main';
import { bootstrap as bootstrapClientService } from './apps/client-service/src/main';
import { bootstrap as bootstrapCalendarService } from './apps/calender-service/src/main';
import { bootstrap as bootstrapLeadService } from './apps/lead-service/src/main';

type DeployableApp =
  | 'api-gateway'
  | 'auth-service'
  | 'user-service'
  | 'quotation-service'
  | 'invoice-service'
  | 'payment-service'
  | 'analytics-service'
  | 'ai-service'
  | 'project-service'
  | 'task-service'
  | 'document-service'
  | 'client-service'
  | 'calendar-service'
  | 'lead-service';

type BootstrapFunction = () => Promise<void>;

const deployedApp = process.env.DEPLOY_APP ?? 'api-gateway';

const bootstraps: Record<DeployableApp, BootstrapFunction> = {
  'api-gateway': bootstrapApiGateway,
  'auth-service': bootstrapAuthService,
  'user-service': bootstrapUserService,
  'quotation-service': bootstrapQuotationService,
  'invoice-service': bootstrapInvoiceService,
  'payment-service': bootstrapPaymentService,
  'analytics-service': bootstrapAnalyticsService,
  'ai-service': bootstrapAiService,
  'project-service': bootstrapProjectService,
  'task-service': bootstrapTaskService,
  'document-service': bootstrapDocumentService,
  'client-service': bootstrapClientService,
  'calendar-service': bootstrapCalendarService,
  'lead-service': bootstrapLeadService,
};

function isDeployableApp(value: string): value is DeployableApp {
  return value in bootstraps;
}

if (!isDeployableApp(deployedApp)) {
  throw new Error(
    `Invalid DEPLOY_APP "${deployedApp}". Expected one of: ${Object.keys(
      bootstraps,
    ).join(', ')}`,
  );
}

void bootstraps[deployedApp]();
