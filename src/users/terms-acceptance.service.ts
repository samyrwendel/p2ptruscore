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
  private readonly CURRENT_TERMS_VERSION = '1.0.0';

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
      // Remover registro de aceitação de termos
      await this.termsAcceptanceRepository.removeUserAcceptance(
        userTelegramId,
        groupTelegramId
      );

      this.logger.log(
        `Removed terms acceptance for user ${userTelegramId} from group ${groupTelegramId}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to remove user ${userTelegramId} from group ${groupTelegramId}:`,
        error
      );
      throw error;
    }
  }

  getCurrentTermsVersion(): string {
    return this.CURRENT_TERMS_VERSION;
  }

  getTermsText(): string {
    return (
      `📋 **TERMO DE RESPONSABILIDADE - TRUSTSCORE**\n\n` +
      `Ao utilizar a plataforma TrustScore, você declara que:\n\n` +
      `1️⃣ **Responsabilidade:** Todas as transações são de sua total responsabilidade.\n\n` +
      `2️⃣ **Veracidade:** Fornecerá informações verdadeiras e precisas.\n\n` +
      `3️⃣ **Conformidade:** Cumprirá com todos os acordos estabelecidos.\n\n` +
      `4️⃣ **Riscos:** Compreende os riscos envolvidos em transações P2P.\n\n` +
      `5️⃣ **Isenção:** A plataforma trust score é apenas um ponto de encontro, onde membros negociam livremente com seus próprios termos. Não temos responsabilidade pelas transações entre membros. Não nos responsabilizamos por perdas.\n\n` +
      `6️⃣ **Privacidade:** Seus dados serão tratados conforme nossa política de privacidade.\n\n` +
      `7️⃣ **Proibições:** Não utilizará a plataforma para atividades ilícitas.\n\n` +
      `⚠️ **IMPORTANTE:** Ao clicar em 'ACEITO OS TERMOS', você concorda integralmente com estas condições.`
    );
  }
}