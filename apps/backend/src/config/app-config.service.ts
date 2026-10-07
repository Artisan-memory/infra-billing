import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { envSchema, type Env } from './env.schema';

// The APP_VERSION build arg is only filled by a tagged CI build or `make docker-build`; a plain
// `docker compose up --build` leaves it at "dev". Fall back to the version of the package that was
// actually built, so the panel shows a real version instead of a DEV badge.
// This file compiles to dist/config/, so the package root is two levels up.
const PACKAGE_VERSION = ((): string => {
  try {
    const raw = readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8');
    return (JSON.parse(raw) as { version?: string }).version || 'dev';
  } catch {
    return 'dev';
  }
})();

/** Typed, validated access to environment configuration. */
@Injectable()
export class AppConfigService {
  readonly env: Env;

  constructor() {
    this.env = envSchema.parse(process.env);
  }

  get isProd(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  get port(): number {
    return this.env.PORT;
  }

  get encryptionKey(): string {
    return this.env.ENCRYPTION_KEY;
  }

  get docs(): boolean {
    return this.env.DOCS;
  }

  get cookieSecure(): boolean {
    return this.env.COOKIE_SECURE ?? this.isProd;
  }

  get buildInfo(): {
    version: string;
    buildTime: string;
    gitCommit: string;
    nodeVersion: string;
    docs: boolean;
  } {
    return {
      version: this.env.APP_VERSION === 'dev' ? PACKAGE_VERSION : this.env.APP_VERSION,
      buildTime: this.env.BUILD_TIME,
      gitCommit: this.env.GIT_COMMIT,
      nodeVersion: process.version,
      docs: this.env.DOCS,
    };
  }
}
