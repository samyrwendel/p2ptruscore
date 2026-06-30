import { Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: (configService: ConfigService) => {
        const logger = new Logger('DatabaseModule');
        const uri = configService.get<string>('MONGODB_CNN');

        logger.log('Configurando conexão MongoDB com retry automático...');

        return {
          uri,
          // Retry de conexão - tenta por até 5 minutos antes de desistir
          serverSelectionTimeoutMS: 300000, // 5 minutos para encontrar servidor
          connectTimeoutMS: 30000,          // 30s para conectar
          socketTimeoutMS: 45000,           // 45s para operações

          // Reconexão automática
          retryWrites: true,
          retryReads: true,

          // Pool de conexões
          maxPoolSize: 10,
          minPoolSize: 2,

          // Heartbeat para detectar problemas
          heartbeatFrequencyMS: 10000,      // Verifica a cada 10s

          // Handlers de eventos para logging
          connectionFactory: (connection) => {
            connection.on('connected', () => {
              logger.log('✅ MongoDB conectado com sucesso');
            });
            connection.on('disconnected', () => {
              logger.warn('⚠️ MongoDB desconectado - tentando reconectar...');
            });
            connection.on('reconnected', () => {
              logger.log('✅ MongoDB reconectado com sucesso');
            });
            connection.on('error', (err) => {
              logger.error(`❌ Erro MongoDB: ${err.message}`);
            });
            return connection;
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
