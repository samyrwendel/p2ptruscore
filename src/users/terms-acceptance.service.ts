import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { TermsAcceptanceRepository } from './terms-acceptance.repository';
import { UsersService } from './users.service';
import { GroupsService } from '../groups/groups.service';

export interface TermsAcceptanceData {
  userId: Types.ObjectId;
  groupId: Types.ObjectId;
  userTelegramId: number;
  groupTelegramId: number;
  termsVersion: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class TermsAcceptanceService {
  private readonly logger = new Logger(TermsAcceptanceService.name);
  private readonly CURRENT_TERMS_VERSION = '1.3.0';

  constructor(
    private readonly termsAcceptanceRepository: TermsAcceptanceRepository,
    private readonly usersService: UsersService,
    private readonly groupsService: GroupsService,
  ) {}

  async hasUserAcceptedCurrentTerms(
    userTelegramId: number,
    groupTelegramId: number
  ): Promise<boolean> {
    return this.termsAcceptanceRepository.hasUserAcceptedTerms(
      userTelegramId,
      groupTelegramId,
      this.CURRENT_TERMS_VERSION
    );
  }

  async recordUserAcceptance(
    userTelegramId: number,
    groupTelegramId: number,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    try {
      // Buscar ou criar usuário
      const user = await this.usersService.findOrCreate({
        id: userTelegramId,
        first_name: 'Usuário',
      });

      // Buscar ou criar grupo
      const group = await this.groupsService.findOrCreate({
        id: groupTelegramId,
        title: `Grupo ${groupTelegramId}`,
      });

      // Verificar se já aceitou os termos atuais
      const alreadyAccepted = await this.hasUserAcceptedCurrentTerms(
        userTelegramId,
        groupTelegramId
      );

      if (alreadyAccepted) {
        this.logger.warn(
          `User ${userTelegramId} already accepted current terms for group ${groupTelegramId}`
        );
        return;
      }

      // Registrar aceitação
      await this.termsAcceptanceRepository.recordTermsAcceptance(
        user._id,
        group._id,
        userTelegramId,
        groupTelegramId,
        this.CURRENT_TERMS_VERSION,
        ipAddress,
        userAgent
      );

      this.logger.log(
        `Terms acceptance recorded for user ${userTelegramId} in group ${groupTelegramId}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to record terms acceptance for user ${userTelegramId}:`,
        error
      );
      throw error;
    }
  }

  async getUserAcceptanceHistory(userTelegramId: number) {
    return this.termsAcceptanceRepository.getUserAcceptanceHistory(userTelegramId);
  }

  async getGroupStats(groupTelegramId: number) {
    return this.termsAcceptanceRepository.getGroupAcceptanceStats(groupTelegramId);
  }

  async removeUserFromGroup(
    userTelegramId: number,
    groupTelegramId: number
  ): Promise<void> {
    try {
      await this.termsAcceptanceRepository.removeUserAcceptance(
        userTelegramId,
        groupTelegramId
      );

      this.logger.log(
        `Terms acceptance removed for user ${userTelegramId} from group ${groupTelegramId}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to remove terms acceptance for user ${userTelegramId} from group ${groupTelegramId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Busca todos os usuários que precisam aceitar a versão atual dos termos
   * @param groupTelegramId ID do grupo para verificar
   * @returns Lista de IDs de usuários que precisam aceitar os termos atuais
   */
  async getUsersNeedingCurrentTermsAcceptance(groupTelegramId: number): Promise<number[]> {
    try {
      const usersNeedingUpdate = await this.termsAcceptanceRepository.getUsersNeedingTermsUpdate(
        groupTelegramId,
        this.CURRENT_TERMS_VERSION
      );

      this.logger.log(
        `Found ${usersNeedingUpdate.length} users needing terms update in group ${groupTelegramId}`
      );

      return usersNeedingUpdate;
    } catch (error) {
      this.logger.error(
        `Failed to get users needing terms acceptance for group ${groupTelegramId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Busca todos os usuários de todos os grupos que precisam aceitar a versão atual
   * @returns Mapa com groupId -> array de userIds que precisam aceitar
   */
  async getAllUsersNeedingCurrentTermsAcceptance(): Promise<Map<number, number[]>> {
    try {
      // Buscar todos os grupos distintos que têm aceitações de termos
      const distinctGroups = await this.termsAcceptanceRepository.getDistinctGroups();

      const result = new Map<number, number[]>();

      // Para cada grupo, buscar usuários que precisam aceitar a versão atual
      for (const groupId of distinctGroups) {
        const usersNeedingUpdate = await this.getUsersNeedingCurrentTermsAcceptance(groupId);
        if (usersNeedingUpdate.length > 0) {
          result.set(groupId, usersNeedingUpdate);
        }
      }

      const totalUsers = Array.from(result.values()).reduce((sum, users) => sum + users.length, 0);
      this.logger.log(
        `Found ${totalUsers} users across ${result.size} groups needing terms update`
      );

      return result;
    } catch (error) {
      this.logger.error('Failed to get all users needing terms acceptance:', error);
      throw error;
    }
  }

  /**
   * Busca todos os grupos distintos que têm usuários registrados
   */
  async getAllDistinctGroups(): Promise<number[]> {
    try {
      return await this.termsAcceptanceRepository.getDistinctGroups();
    } catch (error) {
      this.logger.error('Failed to get distinct groups:', error);
      throw error;
    }
  }

  /**
   * Busca TODOS os usuários de um grupo específico (independente de terem aceito os termos)
   * Para cenário de atualização de termos onde todos devem ser notificados
   */
  async getAllUsersInGroup(groupTelegramId: number): Promise<number[]> {
    try {
      return await this.termsAcceptanceRepository.getAllUsersInGroup(groupTelegramId);
    } catch (error) {
      this.logger.error(`Failed to get all users in group ${groupTelegramId}:`, error);
      throw error;
    }
  }

  getCurrentTermsVersion(): string {
    return this.CURRENT_TERMS_VERSION;
  }

  getTermsText(): string {
    return (
      `📋 **TERMO DE RESPONSABILIDADE - TRUSTSCORE P2P**\n\n` +
      `🔑 **PONTOS IMPORTANTES:**\n` +
      `• Este é um grupo INFORMAL entre amigos\n` +
      `• NÃO é P2P profissional/comercial\n` +
      `• NÃO deve haver reporte\n` +
      `• Você assume total responsabilidade\n\n` +
      `📜 **REGRAS:**\n\n` +
      `1️⃣ **Limite Inicial:** Operações limitadas a R$ 600,00. Construa reputação gradualmente.\n\n` +
      `2️⃣ **Prioridade de Envio:** Quem tem MENOR reputação no TrustScore deve enviar primeiro.\n\n` +
      `3️⃣ **Contas Próprias:** Pagamentos exclusivamente de contas próprias (CPF ou CNPJ próprio).\n\n` +
      `4️⃣ **Execução Imediata:** Boletos devem ser pagos no mesmo dia. Evite agendamentos.\n\n` +
      `5️⃣ **Verificação:** Sempre confirme se a pessoa está no mesmo grupo antes de negociar.\n\n` +
      `6️⃣ **Cautela com Feriados:** Cuidado com valores altos em vésperas de feriados e finais de semana.\n\n` +
      `7️⃣ **Conduta Ética:** Tentativas de fraude resultam em banimento permanente.\n\n` +
      `8️⃣ **Negociações Privadas:** Todas as tratativas devem ser feitas no privado.\n\n` +
      `9️⃣ **Ativos Ilícitos:** Priorize stablecoins, BTC e ETH de corretoras conhecidas. Evite ativos de mixers.\n\n` +
      `🔟 **PIX Noturno:** Entre 20h e 6h, o limite de PIX é R$ 1.000. Valores maiores podem não ser processados.\n\n` +
      `⚠️ **ACEITAR OS TERMOS significa concordar com todas essas condições e assumir total responsabilidade por suas ações.**`
    );
  }
}