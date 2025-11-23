// Diagnóstico de avaliações pendentes por usuário (Telegram userId)
// Uso: node debug-pending-evaluations.js [telegramUserId]

const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');
const fs = require('fs');

// Carregar .env se existir
try {
  const dotenvPath = path.join(__dirname, '.env');
  if (fs.existsSync(dotenvPath)) {
    require('dotenv').config({ path: dotenvPath });
  } else {
    // Tentar .env.development se existir
    const devEnv = path.join(__dirname, '.env.development');
    if (fs.existsSync(devEnv)) {
      require('dotenv').config({ path: devEnv });
    }
  }
} catch (e) {
  // segue sem .env
}

async function main() {
  const telegramUserId = parseInt(process.argv[2] || '30289486', 10);
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/trustscore';
  const client = new MongoClient(uri);
  console.log('🔗 Conectando ao MongoDB:', uri.replace(/\/\/.*@/, '//***:***@'));
  try {
    await client.connect();
    const db = client.db();

    // Atenção: nomes de coleções conforme Mongoose pluralização padrão
    const usersCol = db.collection('users');
    const opsCol = db.collection('operations');
    const pendCol = db.collection('pendingevaluations');

    const user = await usersCol.findOne({ userId: telegramUserId });
    if (!user) {
      console.log('❌ Usuário não encontrado em "users" com userId =', telegramUserId);
      return;
    }
    console.log('👤 Usuário encontrado:', {
      userId: user.userId,
      userName: user.userName,
      firstName: user.firstName,
      _id: user._id.toString()
    });

    const evaluatorId = user._id;
    const pendings = await pendCol.find({ evaluator: evaluatorId, completed: false }).sort({ createdAt: -1 }).toArray();
    console.log(`\n📌 Avaliações pendentes (completed=false) para evaluator=${evaluatorId}: ${pendings.length}`);

    if (pendings.length === 0) {
      console.log('\n✅ Nenhuma avaliação pendente encontrada.');
      return;
    }

    let orphanCount = 0;
    for (const p of pendings) {
      const opId = p.operation;
      let op = null;
      try {
        op = await opsCol.findOne({ _id: new ObjectId(opId) });
      } catch (e) {
        console.log(`  ⚠️ Operação inválida ou não encontrada: ${opId}`);
      }

      const status = op?.status || 'unknown';
      const createdAt = p.createdAt || null;
      const target = p.target?.toString?.() || p.target;
      console.log(`  • pendingEval=${p._id.toString()} op=${opId} status=${status} target=${target} createdAt=${createdAt}`);

      // Considerar órfão se operação não está mais em fluxo que requer avaliação
      // Fluxos que não requerem avaliação futura: completed, cancelled, expired
      if (['completed', 'cancelled', 'canceled', 'expired'].includes(String(status).toLowerCase())) {
        orphanCount++;
      }
    }

    console.log(`\n🧹 Suspeitas de pendências órfãs: ${orphanCount}`);
    if (orphanCount > 0) {
      console.log('   ➜ Se desejar, podemos marcar como completed essas pendências ligadas a operações concluídas/canceladas.');
    }
  } catch (err) {
    console.error('❌ Erro ao consultar pendências:', err);
  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error('❌ Erro inesperado:', err);
});