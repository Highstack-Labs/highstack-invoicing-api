import { requireEnv, optionalEnv, resolveDir } from '../common/utils/env.utils';

export default () => ({
  // Environment
  nodeEnv: optionalEnv('NODE_ENV', 'development'),

  // Server Configuration (REQUIRED)
  port: parseInt(requireEnv('PORT'), 10),
  publicUrl: requireEnv('PUBLIC_URL'),

  // Carbone API Configuration (REQUIRED)
  carboneApi: requireEnv('CARBONE_API'),

  // PDF Render Configuration (optional with sensible defaults)
  pdfRender: {
    maxAttempts: parseInt(optionalEnv('PDF_MAX_ATTEMPTS', '2'), 10),
    retryDelay: parseInt(optionalEnv('PDF_RETRY_DELAY', '10'), 10),
    supportedFormats: ['.docx', '.odt', '.html', '.xlsx', '.ods'],
  },

  // Carbone Render Options (optional with sensible defaults)
  carboneRenderOptions: {
    complement: {},
    enum: {},
    translations: {},
    isDebugActive: optionalEnv('CARBONE_DEBUG', 'false') === 'true',
    convertTo: optionalEnv('CARBONE_CONVERT_TO', 'pdf'),
    lang: optionalEnv('CARBONE_LANG', 'en-US'),
  },

  // Signature Configuration (optional with sensible defaults)
  signature: {
    qrSize: parseInt(optionalEnv('SIGNATURE_QR_SIZE', '50'), 10),
    totalWidth: parseInt(optionalEnv('SIGNATURE_TOTAL_WIDTH', '200'), 10),
    defaultX: parseInt(optionalEnv('SIGNATURE_DEFAULT_X', '0'), 10),
    defaultY: parseInt(optionalEnv('SIGNATURE_DEFAULT_Y', '0'), 10),
    defaultPage: parseInt(optionalEnv('SIGNATURE_DEFAULT_PAGE', '-1'), 10),
  },

  // SRI Ecuador - Facturación Electrónica
  sri: {
    environment: optionalEnv('SRI_ENVIRONMENT', 'development'),
    wsdl: {
      reception: requireEnv('SRI_RECEPTION_WSDL'),
      authorization: requireEnv('SRI_AUTHORIZATION_WSDL'),
    },
    signature: {
      certPath: process.env.SRI_SIGNATURE_CERT_PATH
        ? resolveDir(process.env.SRI_SIGNATURE_CERT_PATH)
        : '',
      certPassword: optionalEnv('SRI_SIGNATURE_CERT_PASSWORD', ''),
    },
    // Rate limiting parametrizable por tipo de operación
    rateLimiting: {
      recepcion: {
        retries:   parseInt(optionalEnv('SRI_RECEPCION_RETRIES', '3'), 10),
        delayMs:   parseInt(optionalEnv('SRI_RECEPCION_DELAY_MS', '1000'), 10),
        timeoutMs: parseInt(optionalEnv('SRI_RECEPCION_TIMEOUT_MS', '30000'), 10),
      },
      autorizacion: {
        retries:           parseInt(optionalEnv('SRI_AUTORIZACION_RETRIES', '5'), 10),
        delayMs:           parseInt(optionalEnv('SRI_AUTORIZACION_DELAY_MS', '2000'), 10),
        backoffMultiplier: parseFloat(optionalEnv('SRI_AUTORIZACION_BACKOFF_MULTIPLIER', '1.5')),
        timeoutMs:         parseInt(optionalEnv('SRI_AUTORIZACION_TIMEOUT_MS', '60000'), 10),
      },
    },
  },

  // JWT Configuration (REQUIRED)
  jwt: {
    secret: requireEnv('JWT_SECRET'),
    expiresIn: optionalEnv('JWT_EXPIRATION', '8h'),
  },

  // Rate Limiting
  throttler: {
    ttl: parseInt(optionalEnv('THROTTLE_TTL', '60000'), 10),
    limit: parseInt(optionalEnv('THROTTLE_LIMIT', '100'), 10),
  },

  // CORS
  cors: {
    allowedOrigins: optionalEnv(
      'ALLOWED_ORIGINS',
      'http://localhost:3000,http://localhost:3001,http://localhost:4200',
    ),
  },

  // Encryption Configuration (REQUIRED)
  encryptionKey: requireEnv('ENCRYPTION_KEY'),
  encryptionSalt: requireEnv('ENCRYPTION_SALT'),

  // Database Configuration (PostgreSQL/Supabase)
  database: {
    host: optionalEnv('DB_HOST', 'localhost'),
    port: parseInt(optionalEnv('DB_PORT', '5432'), 10),
    name: optionalEnv('DB_NAME', 'postgres'),
    user: optionalEnv('DB_USER', 'postgres'),
    password: optionalEnv('DB_PASSWORD', ''),
    ssl: optionalEnv('DB_SSL', 'false'),
  },

  // Redis Configuration (BullMQ + Cache)
  redis: {
    host: optionalEnv('REDIS_HOST', 'localhost'),
    port: parseInt(optionalEnv('REDIS_PORT', '6379'), 10),
    password: optionalEnv('REDIS_PASSWORD', ''),
    db: parseInt(optionalEnv('REDIS_DB', '0'), 10),
  },

  // Directory Paths (REQUIRED)
  directories: {
    templates: resolveDir(requireEnv('TEMPLATES_DIR')),
    pdfs: resolveDir(requireEnv('PDFS_DIR')),
    certs: resolveDir(requireEnv('CERTS_DIR')),
    xmls: resolveDir(requireEnv('XMLS_DIR')),
  },

  // Tenants configuration
  tenants: {
    defaultPlan: optionalEnv('TENANT_DEFAULT_PLAN', 'BASICO'),
    allowDeleteWithEmisores:
      optionalEnv('TENANT_ALLOW_DELETE_WITH_EMISORES', 'false') === 'true',
    pageSize: parseInt(optionalEnv('TENANTS_PAGE_SIZE', '20'), 10),
  },

  // Health Checks thresholds
  healthChecks: {
    memoryHeapMb: parseInt(optionalEnv('HEALTH_MEMORY_HEAP_MB', '150'), 10),
    memoryRssMb: parseInt(optionalEnv('HEALTH_MEMORY_RSS_MB', '300'), 10),
  },

  // Cache Configuration
  cache: {
    emisorTtlMs: parseInt(optionalEnv('CACHE_EMISOR_TTL_MS', '300000'), 10),
  },

  // Queue options — BullMQ
  queues: {
    sriEmision: {
      attempts: parseInt(optionalEnv('QUEUE_SRI_ATTEMPTS', '3'), 10),
      backoffDelayMs: parseInt(optionalEnv('QUEUE_SRI_BACKOFF_MS', '2000'), 10),
      removeOnComplete: parseInt(optionalEnv('QUEUE_SRI_KEEP_COMPLETED', '1000'), 10),
      removeOnFail: parseInt(optionalEnv('QUEUE_SRI_KEEP_FAILED', '5000'), 10),
    },
    webhookDispatch: {
      attempts: parseInt(optionalEnv('QUEUE_WEBHOOK_ATTEMPTS', '5'), 10),
      backoffDelayMs: parseInt(optionalEnv('QUEUE_WEBHOOK_BACKOFF_MS', '3000'), 10),
      removeOnComplete: parseInt(optionalEnv('QUEUE_WEBHOOK_KEEP_COMPLETED', '500'), 10),
      removeOnFail: parseInt(optionalEnv('QUEUE_WEBHOOK_KEEP_FAILED', '2000'), 10),
    },
  },
});

export interface AppConfig {
  nodeEnv: string;
  port: number;
  publicUrl: string;
  carboneApi: string;
  pdfRender: {
    maxAttempts: number;
    retryDelay: number;
    supportedFormats: string[];
  };
  carboneRenderOptions: {
    complement: Record<string, unknown>;
    enum: Record<string, unknown>;
    translations: Record<string, unknown>;
    isDebugActive: boolean;
    convertTo: string;
    lang: string;
  };
  signature: {
    qrSize: number;
    totalWidth: number;
    defaultX: number;
    defaultY: number;
    defaultPage: number;
  };
  sri: {
    environment: string;
    wsdl: { reception: string; authorization: string };
    signature: { certPath: string; certPassword: string };
    rateLimiting: {
      recepcion: { retries: number; delayMs: number; timeoutMs: number };
      autorizacion: {
        retries: number;
        delayMs: number;
        backoffMultiplier: number;
        timeoutMs: number;
      };
    };
  };
  jwt: { secret: string; expiresIn: string };
  throttler: { ttl: number; limit: number };
  cors: { allowedOrigins: string };
  encryptionKey: string;
  encryptionSalt: string;
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    ssl: string;
  };
  redis: { host: string; port: number; password: string; db: number };
  directories: {
    templates: string;
    pdfs: string;
    certs: string;
    xmls: string;
  };
  tenants: {
    defaultPlan: string;
    allowDeleteWithEmisores: boolean;
    pageSize: number;
  };
  healthChecks: { memoryHeapMb: number; memoryRssMb: number };
  cache: {
    emisorTtlMs: number;
  };
  queues: {
    sriEmision: {
      attempts: number;
      backoffDelayMs: number;
      removeOnComplete: number;
      removeOnFail: number;
    };
    webhookDispatch: {
      attempts: number;
      backoffDelayMs: number;
      removeOnComplete: number;
      removeOnFail: number;
    };
  };
}
