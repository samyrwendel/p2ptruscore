import { Injectable, Logger } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import { AbstractRepository } from '../database/abstract.repository';
import { TermsAcceptance } from './schemas/terms-acceptance.schema';

@Injectable()
export class TermsAcceptanceRepository extends AbstractRepository<TermsAcceptance> {
  protected readonly logger = new Logger(TermsAcceptanceRepository.name);

  constructor(
    @InjectModel(TermsAcceptance.name)
    private readonly termsAcceptanceModel: Model<TermsAcceptance>,
    @InjectConnection() connection: Connection,
  ) {
    super(termsAcceptanceModel, connection);
  }

  async hasUserAcceptedTerms(
    userTelegramId: number,
    groupTelegramId: number,
    termsVersion?: string
  ): Promise<boolean> {
    const query: any = {
      userTelegramId,
      groupTelegramId,
    };

    if (termsVersion) {
      query.termsVersion = termsVersion;
    }

    const acceptance = await this.termsAcceptanceModel.findOne(query);
    return !!acceptance;
  }

  async recordTermsAcceptance(
    userId: Types.ObjectId,
    groupId: Types.ObjectId,
    userTelegramId: number,
    groupTelegramId: number,
    termsVersion: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<TermsAcceptance> {
    return this.create({
      user: userId,
      group: groupId,
      userTelegramId,
      groupTelegramId,
      acceptedAt: new Date(),
      termsVersion,
      ipAddress,
      userAgent,
    });
  }

  async getUserAcceptanceHistory(
    userTelegramId: number
  ): Promise<TermsAcceptance[]> {
    return this.termsAcceptanceModel
      .find({ userTelegramId })
      .populate('user')
      .populate('group')
      .sort({ acceptedAt: -1 })
      .exec();
  }

  async getGroupAcceptanceStats(
    groupTelegramId: number,
    termsVersion?: string
  ): Promise<{ total: number; byVersion: Record<string, number> }> {
    const query: any = { groupTelegramId };
    if (termsVersion) {
      query.termsVersion = termsVersion;
    }

    const total = await this.termsAcceptanceModel.countDocuments(query);
    
    const byVersionPipeline = [
      { $match: { groupTelegramId } },
      { $group: { _id: '$termsVersion', count: { $sum: 1 } } },
    ];

    const byVersionResult = await this.termsAcceptanceModel.aggregate(byVersionPipeline);
    const byVersion = byVersionResult.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    return { total, byVersion };
  }

  async removeUserAcceptance(
    userTelegramId: number,
    groupTelegramId: number
  ): Promise<void> {
    await this.termsAcceptanceModel.deleteMany({
      userTelegramId,
      groupTelegramId,
    });
  }
}