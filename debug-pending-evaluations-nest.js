// Diagnóstico de avaliações pendentes usando o contexto Nest (sem precisar da URI manual)
// Uso: node debug-pending-evaluations-nest.js [telegramUserId|@username] [fix|force]

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/src/app.module');
// Importar classes reais para tokens corretos
const { UsersService } = require('./dist/src/users/users.service');
const { PendingEvaluationService } = require('./dist/src/operations/pending-evaluation.service');
const { OperationsService } = require('./dist/src/operations/operations.service');

async function main() {
  const rawArg = process.argv[2] || '30289486';
  const isUsername = String(rawArg).startsWith('@');
  const telegramUserId = isUsername ? null : parseInt(rawArg, 10);
  const arg = String(process.argv[3] || '').toLowerCase();
  const shouldFix = arg === 'fix' || arg === 'force';
  const forceAll = arg === 'force';

  console.log(`🔎 Diagnosticando pendências para usuário ${telegramUserId} (fix=${shouldFix})...`);

  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const usersService = app.get(UsersService);
    const pendingEvaluationService = app.get(PendingEvaluationService);
    const operationsService = app.get(OperationsService);

    const user = isUsername
      ? await usersService.findOneByUsernameOrName(rawArg)
      : await usersService.findOneByUserId(telegramUserId);
    if (!user) {
      console.log('❌ Usuário não encontrado no banco de dados.');
      return;
    }

    console.log('👤 Usuário:', {
      userId: user.userId,
      userName: user.userName,
      firstName: user.firstName,
      _id: user._id.toString()
    });

    const pendings = await pendingEvaluationService.getPendingEvaluations(user._id);
    console.log(`\n📌 Avaliações pendentes (completed=false): ${pendings.length}`);

    if (pendings.length === 0) {
      console.log('\n✅ Nenhuma avaliação pendente encontrada.');
      return;
    }

    let orphanCount = 0;
    for (const p of pendings) {
      const opId = p.operation;
      let op = null;
      try {
        op = await operationsService.getOperationById(opId);
      } catch (e) {
        // continuar
      }
      const status = op?.status || 'unknown';
      const target = p.target?.toString?.() || p.target;
      console.log(`  • pendingEval=${p._id.toString()} op=${opId} status=${status} target=${target} createdAt=${p.createdAt}`);

      const statusUpper = String(status).toUpperCase();
      const isOrphan = ['COMPLETED', 'CANCELLED', 'CANCELED', 'EXPIRED'].includes(statusUpper);
      if (isOrphan) orphanCount++;

      if (shouldFix && (forceAll || isOrphan)) {
        try {
          await pendingEvaluationService.completePendingEvaluation(opId, user._id);
          console.log(`    ✅ Marcado como completed: pendingEval=${p._id.toString()} (op=${opId})`);
        } catch (fixErr) {
          console.log(`    ❌ Falha ao finalizar pendência ${p._id.toString()}:`, fixErr?.message || fixErr);
        }
      }
    }

    console.log(`\n🧹 Suspeitas de pendências órfãs: ${orphanCount}`);
    if (orphanCount > 0 && !shouldFix) {
      console.log('   ➜ Para marcar como concluídas automaticamente, rode com argumento "fix".');
      console.log('   ➜ Para limpar TODAS as pendências, rode com argumento "force".');
    }
  } catch (err) {
    console.error('❌ Erro durante diagnóstico:', err?.message || err);
  } finally {
    await app.close();
  }
}

main().catch(err => {
  console.error('❌ Erro inesperado:', err);
});