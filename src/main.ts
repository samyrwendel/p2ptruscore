import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ValidationPipe, Logger } from '@nestjs/common'
import { config } from 'dotenv'
import * as path from 'path'
import { NestExpressApplication } from '@nestjs/platform-express'
import { join } from 'path'
import * as hbs from 'hbs'

// Carregar arquivo .env padrão
config() // Carrega .env padrão

// Proteção global: não derrubar app em caso de TelegramError 409 durante polling
process.on('unhandledRejection', (reason: any) => {
  const code = (reason as any)?.response?.error_code
  const description = (reason as any)?.response?.description || (reason as any)?.description
  if (code === 409 || (typeof description === 'string' && description.includes('getUpdates'))) {
    Logger.warn('⚠️ Ignorando TelegramError 409 (getUpdates em outra instância). API seguirá ativa em modo degradado.')
    return
  }
  Logger.error('Unhandled Rejection:', reason as any)
})

process.on('uncaughtException', (err: any) => {
  const code = (err as any)?.response?.error_code
  const description = (err as any)?.response?.description || (err as any)?.description
  if (code === 409 || (typeof description === 'string' && description.includes('getUpdates'))) {
    Logger.warn('⚠️ Ignorando TelegramError 409 (getUpdates em outra instância) em uncaughtException. Mantendo API ativa.')
    return
  }
  Logger.error('Uncaught Exception:', err as any)
})

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)

  // Configurar Handlebars como engine de template
  // Em produção, __dirname aponta para dist/src; as views estão em dist/views
  app.setBaseViewsDir(join(__dirname, '..', 'views'))
  app.setViewEngine('hbs')
  
  // Registrar helpers do Handlebars
  hbs.registerPartials(join(__dirname, '..', 'views', 'partials'))
  
  // Registrar helper 'eq' para comparações
  hbs.registerHelper('eq', function(a, b) {
    return a === b;
  });

  // Registrar helper 'gt' para comparações (greater than)
  hbs.registerHelper('gt', function(a, b) {
    return a > b;
  });

  // Registrar helper 'lt' para comparações (less than)
  hbs.registerHelper('lt', function(a, b) {
    return a < b;
  });

  // Registrar helper para formatação de uptime
  hbs.registerHelper('formatUptime', function(uptime: number) {
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    return `${hours}h ${minutes}m ${seconds}s`;
  });
  
  // Registrar helper para formatação de timestamp
  hbs.registerHelper('formatTimestamp', function(timestamp: string) {
    return new Date(timestamp).toLocaleString('pt-BR');
  });

  app.enableCors()

  // app.setGlobalPrefix('api') // Removido para acesso direto
  app.useGlobalPipes(new ValidationPipe())

  const port = Number(process.env.PORT ?? 3031)
  await app.listen(port)
  // Logar URL de preview para inspeção visual
  Logger.log(`📡 Preview disponível em: http://localhost:${port}/`)
}
void bootstrap()
