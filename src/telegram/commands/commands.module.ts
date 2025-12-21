import { Module, forwardRef } from '@nestjs/common';
import { StartCommandHandler } from './handlers/start.command.handler';
import { MeCommandHandler } from './handlers/me.command.handler';
import { TopCommandHandler } from './handlers/top.command.handler';
import { HateCommandHandler } from './handlers/hate.command.handler';
import { MostGiversCommandHandler } from './handlers/mostgivers.command.handler';
import { HelpCommandHandler } from './handlers/help.command.handler';
import { GetKarmaCommandHandler } from './handlers/getkarma.command.handler';
import { SendCommandHandler } from './handlers/send.command.handler';
import { HistoryCommandHandler } from './handlers/history.command.handler';
import { GetHistoryCommandHandler } from './handlers/gethistory.command.handler';
import { TopReceivedCommandHandler } from './handlers/top-received.command.handler';
import { AvaliarCommandHandler } from './handlers/avaliar.command.handler';
import { ReputacaoCommandHandler } from './handlers/reputacao.command.handler';
import { ConfiancaCommandHandler } from './handlers/confianca.command.handler';
import { CriarOperacaoCommandHandler } from './handlers/criar-operacao.command.handler';
import { AceitarOperacaoCommandHandler } from './handlers/aceitar-operacao.command.handler';
import { ConfirmAcceptOperationCommandHandler } from './handlers/confirm-accept-operation.command.handler';
import { MinhasOperacoesCommandHandler } from './handlers/minhas-operacoes.command.handler';
import { CancelarOperacaoCommandHandler } from './handlers/cancelar-operacao.command.handler';
import { CancelarOrdemCommandHandler } from './handlers/cancelar-ordem.command.handler';
import { ReverterOperacaoCommandHandler } from './handlers/reverter-operacao.command.handler';
import { ConcluirOperacaoCommandHandler } from './handlers/concluir-operacao.command.handler';
import { OperacoesDisponiveisCommandHandler } from './handlers/operacoes-disponiveis.command.handler';
import { HelloCommandHandler } from './handlers/hello.command.handler';
import { ApagarOperacoesPendentesCommandHandler } from './handlers/apagar-operacoes-pendentes.command.handler';
import { FecharOperacaoCommandHandler } from './handlers/fechar-operacao.command.handler';
import { CotacoesCommandHandler } from './handlers/cotacoes.command.handler';
import { TermosCommandHandler } from './handlers/termos.command.handler';
import { AdminCommandHandler } from './handlers/admin.command.handler';
import { ContestarOperacaoCommandHandler } from './handlers/contestar-operacao.command.handler';
import { DisputarOperacaoCallbackCommandHandler } from './handlers/disputar-operacao-callback.command.handler';
import { AdminDisputeCommandHandler } from './handlers/admin-dispute.command.handler';
import { NotificarTermosCommandHandler } from './handlers/notificar-termos.command.handler';
import { DesbloquearUsuarioCommandHandler } from './handlers/desbloquear-usuario.command.handler';
import { JoinRequestHandler } from '../handlers/join-request.handler';
import { OperationsModule } from '../../operations/operations.module';
import { UsersModule } from '../../users/users.module';
import { GroupsModule } from '../../groups/groups.module';
import { KarmaModule } from '../../karma/karma.module';
import { TelegramSharedModule } from '../shared/telegram-shared.module';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { SharedModule } from '../../shared/shared.module';

const commandHandlers = [
  StartCommandHandler,
  MeCommandHandler,
  TopCommandHandler,
  HateCommandHandler,
  MostGiversCommandHandler,
  HelpCommandHandler,
  GetKarmaCommandHandler,
  SendCommandHandler,
  HistoryCommandHandler,
  GetHistoryCommandHandler,
  TopReceivedCommandHandler,
  AvaliarCommandHandler,
  ReputacaoCommandHandler,
  ConfiancaCommandHandler,
  CriarOperacaoCommandHandler,
  AceitarOperacaoCommandHandler,
  ConfirmAcceptOperationCommandHandler,
  MinhasOperacoesCommandHandler,
  CancelarOperacaoCommandHandler,
  CancelarOrdemCommandHandler,
  ReverterOperacaoCommandHandler,
  ConcluirOperacaoCommandHandler,
  OperacoesDisponiveisCommandHandler,
  HelloCommandHandler,
  ApagarOperacoesPendentesCommandHandler,
  FecharOperacaoCommandHandler,
  CotacoesCommandHandler,
  TermosCommandHandler,
  AdminCommandHandler,
  ContestarOperacaoCommandHandler,
  DisputarOperacaoCallbackCommandHandler,
  AdminDisputeCommandHandler,
  NotificarTermosCommandHandler,
  DesbloquearUsuarioCommandHandler,
];

@Module({
  imports: [OperationsModule, UsersModule, GroupsModule, KarmaModule, TelegramSharedModule, IntegrationsModule, SharedModule],
  providers: [...commandHandlers, JoinRequestHandler],
  exports: [...commandHandlers, JoinRequestHandler],
})
export class CommandsModule {}

export { commandHandlers };
