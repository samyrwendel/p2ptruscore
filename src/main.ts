import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ValidationPipe } from '@nestjs/common'
import { config } from 'dotenv'
import * as path from 'path'

// Carrega .env padrão
config() // Carrega .env padrão

process.on('unhandledRejection', (reason: any) => {
  console.error('Unhandled Rejection:', reason)
  if (reason && reason.stack) {
    console.error('Stack trace:', reason.stack)
  }
  if (reason && reason.response) {
    console.error('Response data:', reason.response.data)
    console.error('Response status:', reason.response.status)
    console.error('Response headers:', reason.response.headers)
  }
})

process.on('uncaughtException', (err: any) => {
  console.error('Uncaught Exception:', err)
  if (err && err.stack) {
    console.error('Stack trace:', err.stack)
  }
  if (err && err.response) {
    console.error('Response data:', err.response.data)
    console.error('Response status:', err.response.status)
    console.error('Response headers:', err.response.headers)
  }
})

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.enableCors()

  // app.setGlobalPrefix('api') // Removido para acesso direto
  app.useGlobalPipes(new ValidationPipe())

  await app.listen(process.env.PORT ?? 3000)
}
void bootstrap()
