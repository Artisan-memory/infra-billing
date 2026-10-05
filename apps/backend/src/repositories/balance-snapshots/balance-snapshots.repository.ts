import { Injectable } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BalanceSnapshotsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async record(accountUuid: string, balance: string, currency: string): Promise<void> {
    await this.prisma.balanceSnapshot.create({ data: { accountUuid, balance, currency } });
  }

  /** All accounts' snapshots captured since `from`, oldest first (runway burn-rate input). */
  listSince(from: Date) {
    return this.prisma.balanceSnapshot.findMany({
      where: { capturedAt: { gte: from } },
      orderBy: { capturedAt: 'asc' },
    });
  }

  listForAccount(accountUuid: string, from?: Date, to?: Date) {
    const where: Prisma.BalanceSnapshotWhereInput = { accountUuid };
    if (from || to) where.capturedAt = { gte: from, lte: to };
    return this.prisma.balanceSnapshot.findMany({ where, orderBy: { capturedAt: 'asc' } });
  }
}
