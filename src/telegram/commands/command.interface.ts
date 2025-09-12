import { Context } from 'telegraf';
import { Update } from 'telegraf/types';

export interface ICommandHandler<T extends Update = Update> {
  command: string | RegExp;
  handle(ctx: Context<T>): Promise<void>;
  handleCallback?(ctx: Context): Promise<boolean>;
  handleTextInput?(ctx: Context<T>): Promise<void>;
  hasActiveSession?(sessionKey: string): boolean;
}
