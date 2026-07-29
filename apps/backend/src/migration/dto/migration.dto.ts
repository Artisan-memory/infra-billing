import { createZodDto } from 'nestjs-zod';
import {
  remnawaveConnectionSchema,
  remnawaveImportResultSchema,
  remnawaveImportSchema,
  remnawavePreviewSchema,
} from '@infra/shared';

export class RemnawaveConnectionDto extends createZodDto(remnawaveConnectionSchema) {}
export class RemnawaveImportDto extends createZodDto(remnawaveImportSchema) {}

export class RemnawavePreviewDto extends createZodDto(remnawavePreviewSchema) {}
export class RemnawaveImportResultDto extends createZodDto(remnawaveImportResultSchema) {}
