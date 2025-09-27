const { MongoClient } = require('mongodb');

async function checkUserTerms() {
  const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017/trustp2pbot');
  
  try {
    await client.connect();
    const db = client.db();
    
    console.log('🔍 VERIFICANDO TERMOS DO USUÁRIO samyralmeida (30289486)\n');
    
    // Verificar se o usuário aceitou termos
    const termsAcceptance = await db.collection('termsacceptances').findOne({
      userId: 30289486
    });
    
    console.log('📋 RESULTADO DA CONSULTA:');
    if (termsAcceptance) {
      console.log('✅ Usuário ENCONTRADO na coleção de termos aceitos');
      console.log(`   - User ID: ${termsAcceptance.userId}`);
      console.log(`   - Group ID: ${termsAcceptance.groupId}`);
      console.log(`   - Data de aceitação: ${termsAcceptance.acceptedAt}`);
      console.log(`   - Versão dos termos: ${termsAcceptance.termsVersion || 'N/A'}`);
    } else {
      console.log('❌ Usuário NÃO ENCONTRADO na coleção de termos aceitos');
      console.log('   - Isso explica por que está sendo bloqueado!');
    }
    
    // Verificar também na coleção de usuários
    const user = await db.collection('users').findOne({
      id: 30289486
    });
    
    console.log('\n👤 DADOS DO USUÁRIO:');
    if (user) {
      console.log('✅ Usuário encontrado na coleção users');
      console.log(`   - ID: ${user.id}`);
      console.log(`   - Username: ${user.username || 'N/A'}`);
      console.log(`   - Nome: ${user.first_name || 'N/A'}`);
    } else {
      console.log('❌ Usuário não encontrado na coleção users');
    }
    
    console.log('\n💡 SOLUÇÃO:');
    console.log('Se o usuário não aceitou termos, ele precisa:');
    console.log('1. Usar o comando /termos');
    console.log('2. Clicar no botão "Aceitar Termos"');
    console.log('3. Depois poderá usar comandos P2P normalmente');
    
  } catch (error) {
    console.error('❌ Erro ao verificar termos:', error);
  } finally {
    await client.close();
  }
}

checkUserTerms();
