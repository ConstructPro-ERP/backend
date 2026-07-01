import { bootstrap as bootstrapAiService } from './apps/ai-service/src/main.js';
import { bootstrap as bootstrapAnalyticsService } from './apps/analytics-service/src/main.js';
import { bootstrap as bootstrapApiGateway } from './apps/api-gateway/src/main.js';
import { bootstrap as bootstrapAuthService } from './apps/auth-service/src/main.js';
import { bootstrap as bootstrapInvoiceService } from './apps/invoice-service/src/main.js';
import { bootstrap as bootstrapPaymentService } from './apps/payment-service/src/main.js';
import { bootstrap as bootstrapQuotationService } from './apps/quotation-service/src/main.js';
import { bootstrap as bootstrapUserService } from './apps/user-service/src/main.js';

type DeployableApp =
  | 'api-gateway'
  | 'auth-service'
  | 'user-service'
  | 'quotation-service'
  | 'invoice-service'
  | 'payment-service'
  | 'analytics-service'
  | 'ai-service';

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
