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
    // Usar upsert para evitar erro de duplicação
    const filter = {
      user: userId,
      group: groupId,
      userTelegramId,
      groupTelegramId,
    };

    const update = {
      acceptedAt: new Date(),
      termsVersion,
      ipAddress,
      userAgent,
    };

    const options = {
      upsert: true, // Cria se não existe, atualiza se existe
      new: true,    // Retorna o documento atualizado
      setDefaultsOnInsert: true,
    };

    const result = await this.termsAcceptanceModel.findOneAndUpdate(filter, update, options);
    if (!result) {
      throw new Error('Failed to record terms acceptance');
    }
    return result;
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

  /**
   * Busca todos os usuários que precisam aceitar a versão atual dos termos
   * @param groupTelegramId ID do grupo para verificar
   * @param currentVersion Versão atual dos termos
   * @returns Lista de IDs de usuários que precisam aceitar os termos atuais
   */
  async getUsersNeedingTermsUpdate(
    groupTelegramId: number,
    currentVersion: string
  ): Promise<number[]> {
    // Buscar todos os usuários únicos que já aceitaram alguma versão dos termos neste grupo
    const allAcceptances = await this.termsAcceptanceModel
      .find({ groupTelegramId })
      .select('userTelegramId termsVersion')
      .exec();

    // Agrupar por usuário e verificar se tem a versão atual
    const userVersionMap = new Map<number, string[]>();
    
    for (const acceptance of allAcceptances) {
      const userId = acceptance.userTelegramId;
      if (!userVersionMap.has(userId)) {
        userVersionMap.set(userId, []);
      }
      userVersionMap.get(userId)!.push(acceptance.termsVersion);
    }

    // Filtrar usuários que não têm a versão atual
    const usersNeedingUpdate: number[] = [];
    
    for (const [userId, versions] of userVersionMap.entries()) {
      if (!versions.includes(currentVersion)) {
        usersNeedingUpdate.push(userId);
      }
    }

    return usersNeedingUpdate;
  }

  /**
   * Busca todos os grupos distintos que têm aceitações de termos
   * @returns Lista de IDs de grupos
   */
  async getDistinctGroups(): Promise<number[]> {
    return this.termsAcceptanceModel.distinct('groupTelegramId');
  }

  /**
   * Busca TODOS os usuários de um grupo específico (independente de terem aceito os termos)
   */
  async getAllUsersInGroup(groupTelegramId: number): Promise<number[]> {
    try {
      const users = await this.termsAcceptanceModel
        .find({ groupTelegramId })
        .distinct('userTelegramId');
      
      return users;
    } catch (error) {
      this.logger.error(`Failed to get all users in group ${groupTelegramId}:`, error);
      throw error;
    }
  }
}