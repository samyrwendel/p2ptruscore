import { Logger } from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import { TextCommandContext } from '../telegram.types';

const logger = new Logger('UserUtils');

/**
 * Obtém ou cria o usuário a partir de ctx.from, centralizando o formato
 * e evitando duplicação de código nos handlers.
 */
export async function getOrCreateUserFromCtx(
  ctx: TextCommandContext | any,
  usersService: UsersService,
): Promise<any | null> {
  try {
    const from = ctx?.from || {};
    const userData = {
      id: from.id,
      username: from.username,
      first_name: from.first_name,
      last_name: from.last_name,
    };

    if (!userData.id) {
      logger.warn('getOrCreateUserFromCtx: ctx.from.id ausente');
      return null;
    }

    const user = await usersService.findOrCreate(userData);
    return user || null;
  } catch (error) {
    logger.error('Falha em getOrCreateUserFromCtx:', error);
    return null;
  }
}