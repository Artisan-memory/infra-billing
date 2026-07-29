import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { API, API_SUB, CONTROLLERS_INFO } from '@infra/shared';
import { SessionOnly } from '../auth/session-only.decorator';
import { MigrationService } from './migration.service';
import {
  RemnawaveConnectionDto,
  RemnawaveImportDto,
  RemnawaveImportResultDto,
  RemnawavePreviewDto,
} from './dto/migration.dto';

// Both routes take another panel's API token in the body, so they stay off-limits to API tokens:
// those live in scripts, and a leaked one must not be able to pull a Remnawave panel through here.
@SessionOnly()
@ApiBearerAuth()
@ApiTags(CONTROLLERS_INFO.MIGRATION.TAG)
@Controller(API.MIGRATION)
export class MigrationController {
  constructor(private readonly migration: MigrationService) {}

  // Static paths, and the more specific one is declared first — no route collision.
  @Post(API_SUB.MIGRATION_REMNAWAVE_PREVIEW)
  @HttpCode(200)
  @ApiOperation({ summary: 'Preview a Remnawave import (dry run, writes nothing)' })
  @ApiOkResponse({ type: RemnawavePreviewDto })
  preview(@Body() dto: RemnawaveConnectionDto) {
    return this.migration.preview(dto);
  }

  @Post(API_SUB.MIGRATION_REMNAWAVE)
  @HttpCode(200)
  @ApiOperation({ summary: 'Import providers, nodes and billing history from a Remnawave panel' })
  @ApiOkResponse({ type: RemnawaveImportResultDto })
  import(@Body() dto: RemnawaveImportDto) {
    return this.migration.import(dto);
  }
}
