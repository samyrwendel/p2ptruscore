// Script para verificar se o grupo -1002907400287 existe no banco e testar permissões do bot
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { GroupsService } from './src/groups/groups.service';
import { Telegraf } from 'telegraf';
import { ConfigService } from '@nestjs/config';

async function checkGroupPermissions() {
  console.log('🔍 Iniciando verificação do grupo e permissões do bot...');
  
  const app = await NestFactory.createApplicationContext(AppModule);
  const groupsService = app.get(GroupsService);
  const configService = app.get(ConfigService);
  
  const targetGroupId = -1002907400287;
  
  try {
    // 1. Verificar se o grupo existe no banco de dados
    console.log(`\n📊 Verificando se o grupo ${targetGroupId} existe no banco...`);
    
    const groupInDb = await groupsService.getGroupInfo(targetGroupId);
    
    if (groupInDb) {
      console.log('✅ Grupo encontrado no banco de dados:');
      console.log(`   - ID do Grupo: ${groupInDb.groupId}`);
      console.log(`   - Nome: ${groupInDb.groupName || 'Sem nome'}`);
      console.log(`   - ObjectId: ${groupInDb._id}`);
    } else {
      console.log('❌ Grupo NÃO encontrado no banco de dados');
      console.log('   Isso pode significar que:');
      console.log('   - O bot nunca foi adicionado a este grupo');
      console.log('   - O grupo não existe');
      console.log('   - O ID do grupo está incorreto');
    }
    
    // 2. Testar permissões do bot via API do Telegram
    console.log(`\n🤖 Testando permissões do bot no grupo ${targetGroupId}...`);
    
    const botToken = configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!botToken) {
      console.log('❌ Token do bot não encontrado nas variáveis de ambiente');
      return;
    }
    
    const bot = new Telegraf(botToken);
    
    try {
      // Tentar obter informações do chat
      const chatInfo = await bot.telegram.getChat(targetGroupId);
      console.log('✅ Bot tem acesso ao grupo:');
      console.log(`   - Título: ${(chatInfo as any).title || 'Sem título'}`);
      console.log(`   - Tipo: ${chatInfo.type}`);
      console.log(`   - ID: ${chatInfo.id}`);
      
      // Tentar obter informações do bot no grupo
      try {
        const botMember = await bot.telegram.getChatMember(targetGroupId, bot.botInfo?.id || 0);
        console.log('✅ Status do bot no grupo:');
        console.log(`   - Status: ${botMember.status}`);
        
        if (botMember.status === 'administrator') {
          console.log('   - Permissões de administrador: ✅');
          // @ts-ignore
          if (botMember.can_post_messages) console.log('   - Pode enviar mensagens: ✅');
          // @ts-ignore
          if (botMember.can_edit_messages) console.log('   - Pode editar mensagens: ✅');
          // @ts-ignore
          if (botMember.can_delete_messages) console.log('   - Pode deletar mensagens: ✅');
        } else if (botMember.status === 'member') {
          console.log('   - Membro comum (sem permissões especiais)');
        }
        
      } catch (memberError: any) {
        console.log('⚠️  Não foi possível obter informações detalhadas do bot no grupo');
        console.log(`   Erro: ${memberError.message}`);
      }
      
      // Testar envio de mensagem (se possível)
      try {
        console.log('\n📤 Testando envio de mensagem...');
        const testMessage = await bot.telegram.sendMessage(
          targetGroupId, 
          '🧪 Teste de permissões do bot - Esta mensagem será deletada automaticamente',
          { disable_notification: true }
        );
        
        console.log('✅ Mensagem enviada com sucesso!');
        console.log(`   - Message ID: ${testMessage.message_id}`);
        
        // Tentar deletar a mensagem de teste
        setTimeout(async () => {
          try {
            await bot.telegram.deleteMessage(targetGroupId, testMessage.message_id);
            console.log('✅ Mensagem de teste deletada com sucesso');
          } catch (deleteError: any) {
            console.log('⚠️  Não foi possível deletar a mensagem de teste');
            console.log(`   Erro: ${deleteError.message}`);
          }
        }, 2000);
        
      } catch (sendError: any) {
        console.log('❌ Não foi possível enviar mensagem para o grupo');
        console.log(`   Erro: ${sendError.message}`);
        
        if (sendError.message.includes('chat not found')) {
          console.log('   💡 O grupo pode não existir ou o bot foi removido');
        } else if (sendError.message.includes('not enough rights')) {
          console.log('   💡 Bot não tem permissão para enviar mensagens');
        } else if (sendError.message.includes('bot was blocked')) {
          console.log('   💡 Bot foi bloqueado no grupo');
        }
      }
      
    } catch (chatError: any) {
      console.log('❌ Não foi possível acessar o grupo via API do Telegram');
      console.log(`   Erro: ${chatError.message}`);
      
      if (chatError.message.includes('chat not found')) {
        console.log('   💡 Possíveis causas:');
        console.log('      - O grupo não existe');
        console.log('      - O bot foi removido do grupo');
        console.log('      - O ID do grupo está incorreto');
        console.log('      - O grupo é privado e o bot não tem acesso');
      }
    }
    
    // 3. Verificar outros grupos no banco para comparação
    console.log('\n📋 Verificando outros grupos no banco de dados...');
    const allGroupIds = await groupsService.getDistinctGroupIds();
    console.log(`   Total de grupos no banco: ${allGroupIds.length}`);
    
    if (allGroupIds.length > 0) {
      console.log('   Primeiros 5 grupos:');
      allGroupIds.slice(0, 5).forEach((id, index) => {
        console.log(`   ${index + 1}. ${id}`);
      });
      
      // Verificar se existe algum grupo similar
      const similarGroups = allGroupIds.filter(id => 
        id.toString().includes('2907400287') || 
        Math.abs(id - targetGroupId) < 1000
      );
      
      if (similarGroups.length > 0) {
        console.log('   🔍 Grupos similares encontrados:');
        similarGroups.forEach(id => console.log(`      - ${id}`));
      }
    }
    
  } catch (error) {
    console.error('❌ Erro durante a verificação:', error);
  } finally {
    await app.close();
  }
  
  console.log('\n🏁 Verificação concluída!');
}

// Executar o script
checkGroupPermissions().catch(console.error);