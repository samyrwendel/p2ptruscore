import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ValidationPipe } from '@nestjs/common'
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
    // eslint-disable-next-line no-console
    console.warn('⚠️ Ignorando TelegramError 409 (getUpdates em outra instância). API seguirá ativa em modo degradado.')
    return
  }
  // eslint-disable-next-line no-console
  console.error('Unhandled Rejection:', reason)
})

process.on('uncaughtException', (err: any) => {
  const code = (err as any)?.response?.error_code
  const description = (err as any)?.response?.description || (err as any)?.description
  if (code === 409 || (typeof description === 'string' && description.includes('getUpdates'))) {
    // eslint-disable-next-line no-console
    console.warn('⚠️ Ignorando TelegramError 409 (getUpdates em outra instância) em uncaughtException. Mantendo API ativa.')
    return
  }
  // eslint-disable-next-line no-console
  console.error('Uncaught Exception:', err)
})

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)

  // Configurar Handlebars como engine de template
  app.setBaseViewsDir(join(__dirname, 'views'))
  app.setViewEngine('hbs')
  
  // Registrar helpers do Handlebars
  hbs.registerPartials(join(__dirname, 'views', 'partials'))
  
  // Registrar helper 'eq' para comparações
  hbs.registerHelper('eq', function(a, b) {
    return a === b;
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

  await app.listen(process.env.PORT ?? 3000)
}
void bootstrap()
