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
  private readonly CURRENT_TERMS_VERSION = '1.1.0';

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
      `📋 **TERMO DE RESPONSABILIDADE - TRUSTSCORE P2P**\n\n` +
      `🎯 **OBJETIVO:** Este grupo facilita transações P2P de criptomoedas sem KYC, priorizando privacidade e segurança entre membros verificados.\n\n` +
      `📜 **REGRAS E RESPONSABILIDADES:**\n\n` +
      `1️⃣ **Responsabilidade Total:** Todas as negociações são de sua exclusiva responsabilidade. O TrustScore é apenas uma ferramenta de reputação.\n\n` +
      `2️⃣ **Limite Inicial:** Para começar, operações limitadas a R$ 600,00. Construa reputação gradualmente.\n\n` +
      `3️⃣ **Prioridade de Envio:** Quem tem MENOR reputação no TrustScore deve enviar primeiro (critério de segurança).\n\n` +
      `4️⃣ **Contas Próprias:** Pagamentos devem ser feitos exclusivamente de contas próprias (CPF ou CNPJ próprio).\n\n` +
      `5️⃣ **Execução Imediata:** Boletos devem ser pagos no mesmo dia. Evite agendamentos.\n\n` +
      `6️⃣ **Verificação de Membros:** Sempre confirme se a pessoa está no mesmo grupo antes de negociar.\n\n` +
      `7️⃣ **Cautela com Feriados:** Seja cauteloso com valores altos em vésperas de feriados e finais de semana.\n\n` +
      `8️⃣ **Conduta Ética:** Tentativas de fraude resultam em banimento permanente da comunidade.\n\n` +
      `9️⃣ **Negociações Privadas:** Todas as tratativas devem ser feitas no privado entre os interessados.\n\n` +
      `🔟 **Isenção de Responsabilidade:** A comunidade e o bot não se responsabilizam por perdas ou problemas nas negociações.\n\n` +
      `⚠️ **ACEITAR OS TERMOS significa concordar com todas essas condições e assumir total responsabilidade por suas ações.**`
    );
  }
}