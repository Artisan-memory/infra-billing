import { Module } from '@nestjs/common';
import { MigrationController } from './migration.controller';
import { MigrationService } from './migration.service';

// Repositories come from the global RepositoriesModule; the Remnawave client is built per request
// from the credentials in the body, so there is nothing else to wire up.
@Module({
  controllers: [MigrationController],
  providers: [MigrationService],
})
export class MigrationModule {}
