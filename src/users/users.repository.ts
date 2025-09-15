import { Injectable, Logger } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, FilterQuery, UpdateQuery } from 'mongoose';
import { AbstractRepository } from '../database/abstract.repository';
import { User } from './schemas/user.schema';

interface ITelegramUserData {
  id: number;
  username?: string;
  first_name: string;
  last_name?: string;
}

@Injectable()
export class UsersRepository extends AbstractRepository<User> {
  protected readonly logger = new Logger(UsersRepository.name);

  constructor(
    @InjectModel(User.name) userModel: Model<User>,
    @InjectConnection() connection: Connection,
  ) {
    super(userModel, connection);
  }

  async findOrCreate(userData: ITelegramUserData): Promise<User | null> {
    const filterQuery: FilterQuery<User> = { userId: userData.id };
    const documentToUpsert: UpdateQuery<User> = {
      $set: {
        firstName: userData.first_name,
        lastName: userData.last_name,
        userName: userData.username,
      },
      $setOnInsert: { userId: userData.id },
    };
    return this.upsert(filterQuery, documentToUpsert);
  }

  async findOneByUserId(userId: number): Promise<User | null> {
    return this.findOne({ userId }).catch(() => null);
  }

  async findOneByUsernameOrName(input: string): Promise<User | null> {
    const isUsername = input.startsWith('@');
    const queryValue = isUsername ? input.substring(1) : input;

    // Primeiro tentar busca exata
    let filterQuery = {
      $or: [
        { userName: new RegExp(`^${queryValue}$`, 'i') },
        { firstName: new RegExp(`^${queryValue}$`, 'i') },
        { lastName: new RegExp(`^${queryValue}$`, 'i') },
      ],
    };

    let user = await this.findOne(filterQuery).catch(() => null);
    
    // Se não encontrou, tentar busca parcial (contém)
    if (!user) {
      filterQuery = {
        $or: [
          { userName: new RegExp(queryValue, 'i') },
          { firstName: new RegExp(queryValue, 'i') },
          { lastName: new RegExp(queryValue, 'i') },
        ],
      };
      user = await this.findOne(filterQuery).catch(() => null);
    }
    
    // Se ainda não encontrou e o input tem mais de 4 caracteres, tentar busca por prefixo
    if (!user && queryValue.length > 4) {
      const prefix = queryValue.substring(0, Math.min(queryValue.length - 2, 6)); // Pegar primeiros caracteres
      filterQuery = {
        $or: [
          { userName: new RegExp(`^${prefix}`, 'i') },
          { firstName: new RegExp(`^${prefix}`, 'i') },
        ],
      };
      user = await this.findOne(filterQuery).catch(() => null);
    }

    return user;
  }

  async countDocuments(filterQuery: FilterQuery<User> = {}): Promise<number> {
    return this.model.countDocuments(filterQuery);
  }
}
